// ═══════════════════════════════════════════════════════════════════════════
//  ACTIONS — trash, delete, smart-dedup apply, image groups
// ═══════════════════════════════════════════════════════════════════════════

import { ErrLog }         from './error-logger.js';
import { TrashQ }         from './trash-queue.js';
import { apiFetch, fmt, getCheckedPaths } from './ui-utils.js';
import { updateTotalSaved } from './savings.js';
import { wsSend }         from './websocket.js';
import { clearSection }   from './table-utils.js';
import { SB }             from './status-bar.js';
import { DuplicatesSection } from '../sections/duplicates.js';
import * as SG from './scan-grid.js';
import { crumb } from './breadcrumb.js';

const sectionContainers = {
  'duplicates':   'dupResult',
  'smart-dedup':  'smartResult',
  'stale':        'staleResult',
  'large':        'largeResult',
  'node-modules': 'nmResult',
  'empty':        'emptyResult',
  'venvs':        'venvResult',
  'images':       'imageResult',
  'backups':      'backupsResult',
  'ext-search':   'extResult',
};

// ── Shared POST → alert → rescan pattern (CR-009) ───────────────────────
// Used by all trash/delete actions: POST JSON, trace, alert, update savings, rescan.
async function _postAndRescan({ endpoint, body, section, timeout = 30000,
                                 label, formatAlert, trackSavings = true }) {
  try {
    const t0  = performance.now();
    const res = await apiFetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, { timeout });
    const ms = (performance.now() - t0).toFixed(0);
    window._T?.('TRASH', `${label} done ${ms}ms`);
    if (formatAlert) alert(formatAlert(res));
    if (trackSavings) updateTotalSaved();
    startScan(section);
  } catch (e) {
    window._T?.('TRASH', `${label} FAIL — ${e.message}`);
    ErrLog.log('[actions]', `${label} failed: ${e.message}`, e);
  }
}

export function startScan(section) {
  crumb('actions', 'startScan', { section });

  // Capture extension filter BEFORE reset — reset clears the dropdown.
  // We send the extension to the backend ONLY when the user deliberately
  // chose one (mode=include + a specific ext selected). This lets the backend
  // skip entire file types during enumeration, speeding up large-folder scans.
  // Supported sections: tiny-files, smart-dedup (FEAT-018/020)
  const msg = { type: 'start', section };

  const SF = window._scanFilter;
  const _extSections = new Set(['tiny-files', 'smart-dedup']);
  if (section === 'ext-search') {
    const input = document.getElementById('extSearchInput') as HTMLInputElement | null;
    const query = (input?.value || '').trim().replace(/^\.+/, '');
    if (!query) return;
    // Root comes from header #rootDisplay (global config root) — no per-scan override
    msg.extensions = [query];
  } else if (SF && _extSections.has(section)) {
    const mode = SF.getMode(section);
    const included = SF.getIncluded(section);
    if (mode === 'include' && included) {
      msg.extensions = [included];
    }
    // Exclude mode: don't pass to backend, filter client-side only
  }

  // Now reset the filter UI (clears dropdown, chips, text)
  if (SF?.reset) SF.reset(section);

  clearSection(section);

  if (section === 'duplicates') {
    DuplicatesSection.reset();
  } else {
    const c = sectionContainers[section];
    const el = c ? document.getElementById(c) : null;
    if (el) el.innerHTML = '';
  }

  if (section === 'smart-dedup') window._smartData = [];
  if (section === 'images')      window._imageGroups = {};
  SB.begin(section);

  wsSend(msg);
}

export function cancelScan(section) {
  crumb('actions', 'cancelScan', { section });
  wsSend({ type: 'cancel', section });
  SB.done(section, 'Cancelled');
}

export function trashSelected(tableId, directPaths) {
  crumb('actions', 'trashSelected', { tableId, directCount: directPaths?.length });
  let paths;
  if (directPaths && directPaths.length) {
    paths = directPaths;
    // Remove from scan-grid rows (.sg-row)
    document.querySelectorAll('.sg-body input[type=checkbox]:checked').forEach(cb => {
      cb.closest('.sg-row')?.remove();
    });
    // Remove from grid-view rows (.dup-row — duplicates section uses grid-view.js)
    document.querySelectorAll('.dup-copy input[type=checkbox]:checked').forEach(cb => {
      cb.closest('.dup-row')?.remove();
    });
  } else {
    // Legacy table-based fallback
    const tbl = document.getElementById(tableId);
    if (!tbl) return;
    const checked = [...tbl.querySelectorAll('input[type=checkbox]:checked')];
    if (!checked.length) { alert('Select files first.'); return; }
    paths = checked.map(cb => cb.dataset.path).filter(Boolean);
    checked.forEach(cb => cb.closest('tr')?.remove());
  }
  if (!paths.length) { alert('Select files first.'); return; }
  TrashQ.enqueue(paths);
}

export function trashGroup(btn, hash, paths) {
  if (!paths.length) return;
  document.querySelectorAll(`[data-hash="${hash}"]`).forEach(tr => {
    if (!tr.classList.contains('group-sep') && tr.querySelector('input[type=checkbox]'))
      tr.remove();
  });
  btn.textContent = `⏳ ${paths.length} queued for delete`;
  btn.disabled = true;
  btn.classList.add('btn-queued');
  ErrLog.log('[UI]', `${paths.length} files queued for delete.`, null, 'INFO');
  TrashQ.enqueue(paths);
}

export async function applySmartDedup() {
  const data = window._smartData || [];
  crumb('actions', 'applySmartDedup', { groups: data.length });
  if (!data.length) { alert('Scan first.'); return; }
  if (!confirm(`Delete numbered copies in ${data.length} groups? Files go to Recycle Bin.`)) return;
  const total = data.reduce((n, d) => n + (d.delete?.length || 0), 0);
  window._T?.('TRASH', `SMART-DEDUP apply ${data.length} groups (${total} files)`);
  await _postAndRescan({
    endpoint: '/api/smart-dedup/apply',
    body:     { items: data },
    section:  'smart-dedup',
    timeout:  60000,
    label:    `SMART-DEDUP (${data.length} groups, ${total} files)`,
    formatAlert: res => `Freed ${fmt(res?.freed ?? 0)}`
  });
}

export async function deleteNMSelected() {
  crumb('actions', 'deleteNMSelected');
  let paths = SG.getChecked('node-modules');
  if (!paths.length) paths = getCheckedPaths('nmTable');
  if (!paths.length) { alert('Select folders first.'); return; }
  if (!confirm(`Permanently delete ${paths.length} node_modules folder(s)?\nRestore with: npm install`)) return;
  window._T?.('TRASH', `NODE_MODULES delete ${paths.length} folders`);
  paths.slice(0, 10).forEach(p => window._T?.('TRASH', `  → ${p}`));
  if (paths.length > 10) window._T?.('TRASH', `  ... and ${paths.length - 10} more`);
  await _postAndRescan({
    endpoint: '/api/delete-permanent',
    body:     { paths },
    section:  'node-modules',
    timeout:  60000,
    label:    `NODE_MODULES (${paths.length} folders)`,
    formatAlert: res => `Freed ${fmt(res?.freed ?? 0)}`
  });
}

export async function deleteEmpty() {
  crumb('actions', 'deleteEmpty');
  let paths = SG.getChecked('empty');
  if (!paths.length) paths = getCheckedPaths('emptyTable');
  if (!paths.length) { alert('Select folders first.'); return; }
  if (!confirm(`Delete ${paths.length} empty folder(s)?`)) return;
  await _postAndRescan({
    endpoint: '/api/empty-folders/delete',
    body:     { paths },
    section:  'empty',
    label:    `EMPTY (${paths.length} folders)`,
    formatAlert:  res => `Deleted ${res?.deleted?.length || 0} folders.`,
    trackSavings: false
  });
}

function _selectedHtmlPaths() {
  let paths = SG.getChecked('html-files');
  if (!paths.length) {
    const container = document.getElementById('htmlResult');
    if (container) {
      paths = [...container.querySelectorAll('input[type=checkbox]:checked[data-path]')]
        .map(cb => cb.dataset.path)
        .filter(Boolean);
    }
  }
  return paths;
}

export async function runHtmlUtility(utility) {
  crumb('actions', 'runHtmlUtility', { utility });

  const paths = _selectedHtmlPaths();

  if (!paths.length) {
    alert('Select one or more HTML files first.');
    return;
  }

  try {
    const res = await apiFetch('/api/html/utility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, utility }),
    }, { timeout: 120000 });

    const files = Array.isArray(res?.files) ? res.files : [];
    const outputDirs = [...new Set(files.flatMap(f => Array.isArray(f.outputs) ? f.outputs : []).map(p => {
      const i = String(p || '').lastIndexOf('\\');
      return i > 0 ? String(p).slice(0, i) : '';
    }).filter(Boolean))];
    const summary = [
      `Utility: ${utility}`,
      `Processed: ${res?.processed ?? paths.length} file(s)`,
      `Success: ${res?.okCount ?? files.filter(f => !f.error).length}`,
      `Errors: ${res?.errorCount ?? files.filter(f => f.error).length}`,
      outputDirs.length ? `Output dirs: ${outputDirs.join(', ')}` : 'Output dirs: source folder',
    ].join('\n');
    alert(summary);
  } catch (e) {
    ErrLog.log('[actions]', `run utility failed: ${e.message}`, e);
    alert(`Utility failed: ${e.message}`);
  }
}

export async function extractSvgFromSelectedHtml() {
  await runHtmlUtility('extract-svg');
}

export function renderImageGroups(resultEl, groups) {
  let html = '';
  Object.values(groups).forEach(files => {
    if (!files.length) return;
    html += `<div class="img-group">
      <span class="badge red">Duplicate Group</span>
      <div class="img-grid">`;
    files.forEach((fp, i) => {
      const escaped = (fp || '').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
      html += `<div class="img-card">
        <img src="/api/file?path=${encodeURIComponent(fp)}" onerror="this.classList.add('img-broken')" alt="">
        <p>${fp}</p>
        ${i > 0
          ? `<button class="btn danger btn-sm img-trash-btn"
              onclick="window.trashImage('${escaped}')">🗑 Delete</button>`
          : `<span class="img-keep">✅ Keep</span>`}
      </div>`;
    });
    html += '</div></div>';
  });
  resultEl.innerHTML = html || '<p class="empty-msg">No duplicate images found yet.</p>';
}

export async function trashImage(path) {
  await _postAndRescan({
    endpoint: '/api/trash',
    body:     { paths: [path] },
    section:  'images',
    label:    'IMAGE',
    formatAlert: res => `Freed ${fmt(res?.freed ?? 0)}`
  });
}

export function trashAllImageCopies() {
  crumb('actions', 'trashAllImageCopies');
  const groups = window._imageGroups || {};
  const paths = [];
  Object.values(groups).forEach(files => {
    // Skip index 0 (the "Keep"), delete the rest
    files.slice(1).forEach(fp => { if (fp) paths.push(fp); });
  });
  if (!paths.length) { alert('No duplicate image copies found.'); return; }
  if (!confirm(`Delete ALL ${paths.length} duplicate image cop${paths.length===1?'y':'ies'}?\nOriginals are safe. Files go to Recycle Bin.`)) return;

  // Show spinner on button
  const btn = document.getElementById('imgDeleteAllBtn');
  if (btn) { btn.disabled = true; btn.textContent = '\u23f3 Deleting\u2026'; }

  // Clear the UI
  const resultEl = document.getElementById('imageResult');
  if (resultEl) resultEl.innerHTML = '<p class="empty-msg">\u23f3 Deleting copies\u2026</p>';

  // DON'T kill cache here — we may need next pages

  // Enqueue all for trash
  TrashQ.enqueue(paths, async () => {
    updateTotalSaved();

    // Kill cache — we're about to rescan fresh
    fetch('/api/cache/images', { method: 'DELETE' }).catch(() => {});
    if (window._updateLoadMoreBtn) window._updateLoadMoreBtn('images');

    // Confirm deletion and auto-rescan
    if (resultEl) resultEl.innerHTML = `<p class="empty-msg">\u2705 Deleted ${paths.length} duplicate cop${paths.length===1?'y':'ies'}. Rescanning\u2026</p>`;
    if (btn) { btn.disabled = false; btn.textContent = '\ud83d\uddd1 Delete All Copies'; btn.classList.remove('btn-done', 'btn-queued'); }

    // Auto-start a fresh scan after a short delay so user sees confirmation
    setTimeout(() => startScan('images'), 800);
  });
}

// Expose for inline HTML onclick handlers
window.trashGroup         = trashGroup;
window.trashImage         = trashImage;
window._trashSelected     = trashSelected;   // used by Commands → Delete Selected
window._extractSvgFromSelectedHtml = extractSvgFromSelectedHtml;
window._runHtmlUtility    = runHtmlUtility;
