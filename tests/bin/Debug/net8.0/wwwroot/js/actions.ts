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
    const rootInput = document.getElementById('extSearchRootInput') as HTMLInputElement | null;
    const root = (rootInput?.value || '').trim();
    (msg as any).extensions = root ? [query, root] : [query];
  } else if (SF && _extSections.has(section)) {
    const mode = SF.getMode(section);
    const included = SF.getIncluded(section);
    if (mode === 'include' && included) {
      (msg as any).extensions = [included];
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

export function trashSelected(tableId, directPaths?) {
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
    paths = checked.map(cb => (cb as HTMLInputElement).dataset.path).filter(Boolean);
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
  const total = data.reduce((n, d: any) => n + (d.delete?.length || 0), 0);
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

export async function deleteAllDevCaches() {
  crumb('actions', 'deleteAllDevCaches');
  const paths = SG.getChecked('dev-cache');
  if (!paths.length) { alert('Scan for Dev Caches first, then click Delete All Caches.'); return; }
  if (!confirm(
    `Permanently delete ${paths.length} dev cache folder(s)?\n\n` +
    `These are always safe to delete — they regenerate automatically.\n\n` +
    paths.slice(0, 5).join('\n') + (paths.length > 5 ? `\n… and ${paths.length - 5} more` : '')
  )) return;
  window._T?.('TRASH', `DEV-CACHE delete ${paths.length} folders`);
  await _postAndRescan({
    endpoint:    '/api/delete-permanent',
    body:        { paths },
    section:     'dev-cache',
    timeout:     120000,
    label:       `DEV-CACHE (${paths.length} folders)`,
    formatAlert: res => `Freed ${fmt(res?.freed ?? 0)}`,
    trackSavings: true,
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
        .map(cb => (cb as HTMLInputElement).dataset.path)
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

export async function runCssMergeAnalyze(section: string) {
  crumb('actions', 'runCssMergeAnalyze', { section });
  let paths = SG.getChecked('css-files');
  if (!paths.length) {
    const container = document.getElementById('cssResult');
    if (container) {
      paths = [...container.querySelectorAll('input[type=checkbox]:checked[data-path]')]
        .map(cb => (cb as HTMLInputElement).dataset.path)
        .filter(Boolean) as string[];
    }
  }
  if (!paths.length) {
    // Use all visible rows if nothing is selected
    const container = document.getElementById('cssResult');
    if (container) {
      paths = [...container.querySelectorAll('.sg-row[data-path]')]
        .filter(r => (r as HTMLElement).style.display !== 'none')
        .map(r => (r as HTMLElement).dataset.path)
        .filter(Boolean) as string[];
    }
  }
  if (!paths.length) {
    alert('Run a CSS Files scan first, then click Analyze Merge.');
    return;
  }

  let folderScope: string | null = null;
  const filterInput = document.querySelector<HTMLInputElement>(`[data-section="css-files"] .sf-folder-scope`);
  if (filterInput?.value.trim()) folderScope = filterInput.value.trim();
  const excludeInput = document.querySelector<HTMLInputElement>('.css-merge-exclude-input');
  const excludePatterns = (excludeInput?.value || '').split(',').map(s => s.trim()).filter(Boolean);

  const btn = document.querySelector<HTMLButtonElement>('[data-section="css-files"] .btn-css-merge-analyze, .btn-css-merge-analyze');

  const _setError = (msg: string) => {
    if (btn) { btn.classList.add('btn-error'); btn.title = msg; }
    _showCssMergeError(msg);
    ErrLog.log('[actions]', `CSS merge analyze failed: ${msg}`, null, 'CSS_MERGE_FAIL');
  };

  if (btn) { btn.classList.remove('btn-error'); btn.title = ''; }
  const _origLabel = (btn as HTMLButtonElement | null)?.textContent;
  const _setAnalyzing = (secs: number) => {
    if (!btn) return;
    (btn as HTMLButtonElement).disabled = true;
    btn.innerHTML = `<span class="css-spin">⟳</span> Analyzing${secs > 0 ? ` ${secs}s` : '…'}`;
  };
  _setAnalyzing(0);

  // Tick the button label every 5s so users know it is still working on large sets
  let _tick = 0;
  const _tickId = btn ? setInterval(() => {
    _tick += 5;
    _setAnalyzing(_tick);
  }, 5000) : null;

  try {
    const res = await apiFetch('/api/css/merge-analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths, folderScope, excludePatterns }),
    }, { timeout: 300000 }); // 5 min — analysis can be slow on large folder sets (#85)

    if (res === null) {
      _setError('Server returned an error — check the Errors panel for details.');
      return;
    }
    _showCssMergeViewer(res);
  } catch (e: any) {
    _setError(e.message || 'Unknown error');
  } finally {
    if (_tickId) { clearInterval(_tickId); }
    if (btn) { (btn as HTMLButtonElement).disabled = false; btn.textContent = _origLabel ?? 'Analyze Merge'; }
  }
}

async function _showCssMergeGuide() {
  const existing = document.getElementById('css-merge-guide-overlay');
  if (existing) { existing.remove(); return; }
  let md = '';
  try {
    const r = await fetch('/css-merge-guide.md');
    md = r.ok ? await r.text() : '(guide not found)';
  } catch { md = '(could not load guide)'; }
  const html = md
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/```([\s\S]*?)```/g, (_,c)=>`<pre style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:10px 14px;overflow-x:auto;font-size:11px;line-height:1.6;margin:8px 0"><code>${c.trim()}</code></pre>`)
    .replace(/`([^`]+)`/g, '<code style="background:#161b22;padding:1px 5px;border-radius:3px;font-size:11px">$1</code>')
    .replace(/^## (.+)$/gm, '<h2 style="font-size:15px;margin:18px 0 6px;color:#58a6ff;border-bottom:1px solid #21262d;padding-bottom:4px">$1</h2>')
    .replace(/^### (.+)$/gm, '<h3 style="font-size:13px;margin:14px 0 4px;color:#79c0ff">$1</h3>')
    .replace(/^# (.+)$/gm, '<h1 style="font-size:18px;margin:0 0 12px;color:#e6edf3">$1</h1>')
    .replace(/^---$/gm, '<hr style="border:none;border-top:1px solid #21262d;margin:14px 0">')
    .replace(/^> (.+)$/gm, '<blockquote style="border-left:3px solid #388bfd;margin:8px 0;padding:6px 12px;background:#0d1117;color:#8b949e;font-size:12px">$1</blockquote>')
    .replace(/^- (.+)$/gm, '<li style="margin:2px 0;font-size:12px">$1</li>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(<li[\s\S]*?<\/li>)/g, m => `<ul style="padding-left:18px;margin:6px 0">${m}</ul>`)
    .replace(/\n\n/g, '</p><p style="margin:6px 0;font-size:13px;line-height:1.7">')
    .replace(/\n/g, '<br>');
  const overlay = document.createElement('div');
  overlay.id = 'css-merge-guide-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:10000;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
  <div style="background:#0d1117;border:1px solid #30363d;border-radius:8px;width:min(800px,94vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.95)">
    <div style="padding:10px 16px;border-bottom:1px solid #21262d;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
      <strong style="font-size:14px;color:#e6edf3">📖 CSS Merge Guide</strong>
      <button id="css-guide-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#8b949e;line-height:1">✕</button>
    </div>
    <div style="overflow-y:auto;padding:16px 20px;color:#c9d1d9;line-height:1.6"><p style="margin:6px 0;font-size:13px;line-height:1.7">${html}</p></div>
  </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('css-guide-close')!.addEventListener('click', () => overlay.remove());
}

function _showCssMergeError(message: string) {
  const existing = document.getElementById('css-merge-report-overlay');
  if (existing) existing.remove();
  const overlay = document.createElement('div');
  overlay.id = 'css-merge-report-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--surface,#1e1e1e);border:2px solid #e74c3c;border-radius:8px;padding:24px 28px;max-width:560px;width:90vw">
      <div style="font-size:1rem;font-weight:700;color:#e74c3c;margin-bottom:10px">⚠ CSS Merge Analysis — Error</div>
      <div style="color:var(--text,#d4d4d4);font-size:.9rem;margin-bottom:16px;word-break:break-word">${message}</div>
      <button id="css-merge-err-close" style="background:#333;color:#fff;border:none;padding:6px 18px;border-radius:4px;cursor:pointer">Close</button>
    </div>`;
  document.body.appendChild(overlay);
  document.getElementById('css-merge-err-close')!.onclick = () => overlay.remove();
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function _showCssMergeViewer(res: any) {
  const existing = document.getElementById('css-merge-report-overlay');
  if (existing) existing.remove();

  const groups: any[] = res?.mergeGroups ?? [];
  const refs: any[]   = res?.refs ?? [];
  const errors: any[] = res?.errorFiles ?? [];

  const kb = (chars: number) => chars >= 1024 ? `${(chars / 1024).toFixed(1)} KB` : `${chars} B`;
  const riskColor = (r: string) => r === 'high' ? '#e74c3c' : r === 'medium' ? '#f39c12' : '#2ecc71';
  const riskBadge = (r: string) => `<span style="background:${riskColor(r)};color:#000;font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px">${r.toUpperCase()}</span>`;

  const groupCards = groups.map((g: any, i: number) => {
    const totalBytes = (g.files ?? []).reduce((s: number, f: any) => s + (f.sizeChars || 0), 0);
    const filesHtml = (g.files ?? []).map((f: any) => {
      const name = (f.path || f.Path || '').split(/[\\/]/).pop();
      const filePath = f.path || f.Path || '';
      return `<span style="background:var(--surface2,#2a2a2a);padding:2px 8px;border-radius:3px;margin-right:4px;margin-bottom:3px;font-size:11px;display:inline-flex;align-items:center;gap:5px">
        <a href="#" class="css-open-file" data-path="${filePath}" title="Open in Explorer" style="color:#58a6ff;text-decoration:none;font-size:10px">📂</a>
        ${name}
        <span style="color:var(--muted,#888)">${kb(f.sizeChars || 0)} · ${f.selectorCount} sel</span>
      </span>`;
    }).join('');
    const conflictsHtml = g.conflictCount > 0
      ? `<details style="margin-top:5px"><summary style="cursor:pointer;color:#f39c12;font-size:11px">⚠ ${g.conflictCount} selector conflict${g.conflictCount !== 1 ? 's' : ''} — click to expand</summary>
         <div style="background:#1a0f00;border:1px solid #f39c12;border-radius:4px;padding:6px 10px;margin-top:4px;font-size:11px;max-height:120px;overflow-y:auto">
           ${(g.conflicts ?? []).map((c: any) => `<div style="padding:1px 0"><code style="color:#e3b341">${c.selector}</code> <span style="color:var(--muted,#888)">in: ${c.files.join(', ')}</span></div>`).join('')}
         </div></details>`
      : `<span style="font-size:11px;color:#2ecc71">✓ No conflicts</span>`;
    return `<div class="css-merge-card" data-idx="${i}" style="border:1px solid var(--border,#333);border-radius:6px;margin-bottom:8px;overflow:hidden">
      <div style="display:flex;align-items:flex-start;gap:8px;padding:10px 12px;background:var(--surface,#1e1e1e)">
        <input type="checkbox" class="css-merge-group-chk" data-idx="${i}" style="margin-top:4px;flex-shrink:0" checked>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">
            <span style="font-weight:600;font-size:13px;word-break:break-all">📁 ${g.folder}</span>
            ${riskBadge(g.risk)}
            <span style="font-size:11px;color:var(--muted,#888)">${kb(totalBytes)} total</span>
          </div>
          <div style="display:flex;align-items:flex-start;gap:6px;flex-wrap:wrap;margin-bottom:6px;font-size:11px">
            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center">
              ${(g.files ?? []).map((f: any) => {
                const name = (f.path || f.Path || '').split(/[\\/]/).pop();
                const filePath = f.path || f.Path || '';
                return `<span style="background:var(--surface2,#2a2a2a);padding:2px 8px;border-radius:3px;display:inline-flex;align-items:center;gap:4px">
                  <a href="#" class="css-open-file" data-path="${filePath}" title="Open in Explorer" style="color:#58a6ff;text-decoration:none">📂</a>
                  <span style="color:var(--fg,#ddd)">${name}</span>
                  <span style="color:var(--muted,#888)">${kb(f.sizeChars || 0)} · ${f.selectorCount} sel</span>
                </span>`;
              }).join('<span style="color:var(--muted,#666);padding:0 2px">+</span>')}
            </div>
            <span style="color:#3fb950;font-size:13px;font-weight:700;align-self:center">→</span>
            <span style="background:#1a2a1a;border:1px solid #3fb950;padding:2px 10px;border-radius:3px;color:#3fb950;font-family:monospace;align-self:center" title="${g.mergedName || ''}">${(g.mergedName || '').split(/[\\/]/).pop()}</span>
          </div>
          <div style="font-size:10px;color:var(--muted,#555);font-family:monospace;margin-bottom:5px;word-break:break-all">${g.mergedName || ''}</div>
          ${conflictsHtml}
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;flex-shrink:0">
          <button class="css-preview-btn" data-idx="${i}" style="background:#1f3a5f;color:#58a6ff;border:1px solid #58a6ff;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap">👁 Preview</button>
          <button class="css-dry-run-btn" data-idx="${i}" style="background:#2a2a1a;color:#e3b341;border:1px solid #e3b341;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap" title="Write merged.PREVIEW.css — originals untouched. Open it, test it, then Apply or Discard.">🧪 Dry Run</button>
          <button class="css-merge-one-btn" data-idx="${i}" style="background:#1a3a1a;color:#3fb950;border:1px solid #3fb950;padding:4px 12px;border-radius:4px;font-size:11px;cursor:pointer;white-space:nowrap" title="Merge just this group — originals saved as .bak">▶ Merge This</button>
        </div>
      </div>
      <div class="css-preview-panel" data-idx="${i}" style="display:none;border-top:1px solid var(--border,#333)">
        <div style="padding:6px 12px;background:#0d1117;display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:11px;color:var(--muted,#888)">Merged preview (read-only)</span>
          <button class="css-preview-close" data-idx="${i}" style="background:none;border:none;color:var(--muted,#888);cursor:pointer;font-size:13px">✕ Close</button>
        </div>
        <div class="css-preview-content" data-idx="${i}" style="margin:0;font:12px/1.6 'Cascadia Code','Consolas',monospace;background:#0d1117;overflow:auto;max-height:340px">
          <div style="padding:6px 14px;color:#8b949e;font-style:italic">Loading preview…</div>
        </div>
      </div>
    </div>`;
  });

  const refsHtml = refs.length === 0
    ? '<p style="color:var(--muted,#666);font-size:12px">No referencing HTML/JS files found in the same or parent folder (search limited to 1 level up to avoid cross-project noise).</p>'
    : refs.map((r: any) => `
      <div style="margin-bottom:8px;font-size:12px;border-left:2px solid var(--border,#333);padding-left:8px">
        <div style="font-weight:600">${r.cssFile.split(/[\\/]/).pop()} <span style="font-weight:400;color:var(--muted,#666);font-size:10px">${r.cssFile}</span></div>
        ${(r.referencedBy ?? []).length === 0
          ? '<div style="color:var(--muted,#666);font-size:11px">No references found nearby</div>'
          : (r.referencedBy as string[]).map(f => `<div style="color:var(--muted,#888);font-size:11px">→ ${f}</div>`).join('')}
      </div>`).join('');

  const errHtml = errors.length === 0 ? '' : `
      <h4 style="margin:10px 0 4px;color:#e74c3c">⚠ Parse Errors</h4>
      ${errors.map((e: any) => `<div style="font-size:11px;color:#e74c3c">${e.path || e.Path}: ${e.error || e.Error}</div>`).join('')}`;

  const overlay = document.createElement('div');
  overlay.id = 'css-merge-report-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center';
  overlay.innerHTML = `
    <div style="background:var(--bg,#121212);border:1px solid var(--border,#333);border-radius:8px;width:min(960px,96vw);max-height:90vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,.9)">
      <div style="padding:11px 16px;border-bottom:1px solid var(--border,#333);display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
        <strong style="font-size:14px">🔬 CSS Merge Viewer — ${res?.analyzedCount ?? 0} files analyzed · <span id="css-mv-gcount">${groups.length}</span> group${groups.length !== 1 ? 's' : ''}${res?.scopeApplied ? ` · scope: ${res.scopeApplied}` : ''}</strong>
        <div style="display:flex;gap:8px;align-items:center">
          <button id="css-merge-guide-btn" style="background:none;border:1px solid var(--border,#444);border-radius:4px;font-size:11px;cursor:pointer;color:var(--muted,#aaa);padding:2px 9px" title="How CSS merging works">📖 Guide</button>
          <button id="css-merge-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:var(--fg,#eee);line-height:1">✕</button>
        </div>
      </div>
      <div style="overflow-y:auto;padding:12px 14px;flex:1">
        ${groups.length === 0
          ? '<p style="color:var(--muted,#666)">No merge candidates found — each scanned folder contains only one CSS file.</p>'
          : `<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
               <label style="font-size:12px;color:var(--muted,#888);cursor:pointer"><input type="checkbox" id="css-chk-all" checked style="margin-right:5px">Select all</label>
               <span style="font-size:11px;color:var(--muted,#666)">— uncheck groups you want to skip</span>
             </div>
             ${groupCards.join('')}`}
        ${refs.length > 0 || errors.length > 0 ? `
        <h4 style="margin:14px 0 6px;font-size:12px;text-transform:uppercase;color:var(--muted,#888);letter-spacing:.05em">CSS References in HTML/JS</h4>
        ${refsHtml}${errHtml}` : ''}
      </div>
      <div style="padding:10px 16px;border-top:1px solid var(--border,#333);display:flex;align-items:center;gap:10px;flex-shrink:0">
        ${groups.length > 0 ? `<button id="css-merge-exec-btn" style="background:#2a5c2a;color:#3fb950;border:1px solid #3fb950;padding:7px 22px;border-radius:5px;font-size:.85rem;font-weight:600;cursor:pointer" title="Merge all checked groups at once">▶ Merge All Checked</button>` : ''}
        <span id="css-merge-sel-count" style="font-size:12px;color:var(--muted,#888)">${groups.length} of ${groups.length} selected</span>
        <span style="flex:1"></span>
        <span style="font-size:11px;color:var(--muted,#555)">No files modified until you click Merge. Originals backed up as .bak.</span>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.getElementById('css-merge-close')!.addEventListener('click', () => overlay.remove());
  document.getElementById('css-merge-guide-btn')!.addEventListener('click', () => _showCssMergeGuide());

  const chkAll = document.getElementById('css-chk-all') as HTMLInputElement | null;
  const selCountEl = document.getElementById('css-merge-sel-count');
  const _updateSelCount = () => {
    const n = overlay.querySelectorAll('.css-merge-group-chk:checked').length;
    if (selCountEl) selCountEl.textContent = `${n} of ${groups.length} selected`;
  };
  if (chkAll) {
    chkAll.addEventListener('change', () => {
      overlay.querySelectorAll('.css-merge-group-chk').forEach((c: any) => c.checked = chkAll.checked);
      _updateSelCount();
    });
  }
  overlay.querySelectorAll('.css-merge-group-chk').forEach(chk => chk.addEventListener('change', _updateSelCount));

  overlay.querySelectorAll('.css-open-file').forEach(a => {
    a.addEventListener('click', e => {
      e.preventDefault();
      const p = (a as HTMLElement).dataset.path;
      if (p) fetch(`/api/open-in-explorer?path=${encodeURIComponent(p)}`).catch(() => {});
    });
  });

  overlay.querySelectorAll('.css-preview-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = Number((btn as HTMLElement).dataset.idx);
      const panel = overlay.querySelector(`.css-preview-panel[data-idx="${i}"]`) as HTMLElement | null;
      const pre   = overlay.querySelector(`.css-preview-content[data-idx="${i}"]`) as HTMLElement | null;
      if (!panel || !pre) return;
      const isOpen = panel.style.display !== 'none';
      if (isOpen) { panel.style.display = 'none'; btn.textContent = '👁 Preview'; return; }
      panel.style.display = 'block';
      btn.textContent = '⟳ Loading…';
      (btn as HTMLButtonElement).disabled = true;
      try {
        const r = await apiFetch('/api/css/merge-preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(groups[i]),
        }, { timeout: 30000 });
        if (r === null) { pre.innerHTML = '<div style="padding:8px 14px;color:#e74c3c">Preview failed — check Errors panel.</div>'; return; }
        const conflictSelectors = new Set<string>((groups[i].conflicts ?? []).map((c: any) => c.selector as string));
        const conflictMap: Record<string, string[]> = {};
        (groups[i].conflicts ?? []).forEach((c: any) => { conflictMap[c.selector] = c.files; });
        const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const totalSel = (groups[i].files ?? []).reduce((n: number, f: any) => n + (f.selectorCount || 0), 0);
        const conflictCount: number = groups[i].conflictCount || 0;
        let html = `<div style="padding:8px 14px;background:#0a1a0a;border-bottom:1px solid #333;font-size:11px;color:#8b949e">
          Combining <strong style="color:#eee">${r.sections?.length ?? 0} files</strong> →
          <strong style="color:#3fb950">${(groups[i].mergedName || '').split(/[\\/]/).pop()}</strong>
          &nbsp;·&nbsp; ${kb(r.sourceBytes)} source &nbsp;·&nbsp; ~${totalSel} selectors total
          ${conflictCount > 0
            ? `&nbsp;·&nbsp; <span style="color:#f39c12">⚠ ${conflictCount} conflict${conflictCount!==1?'s':''} highlighted — last definition wins</span>`
            : `&nbsp;·&nbsp; <span style="color:#2ecc71">✓ No conflicts</span>`}
        </div>`;
        if (conflictCount > 0) {
          html += `<div style="padding:5px 14px;background:#1a1000;border-bottom:1px solid #f39c12;font-size:10px;color:#f39c12">
            🔴 Red lines = selector defined in multiple files. The <em>last</em> file's version takes effect in the merged output.
          </div>`;
        }
        for (const sec of (r.sections ?? [])) {
          html += `<div style="border-top:2px solid #1f3a5f">
            <div style="padding:4px 14px;background:#0d1a2a;font-size:11px;color:#58a6ff;display:flex;gap:12px">
              <strong>${esc(sec.fileName)}</strong>
              <span style="color:#8b949e">${kb(sec.sizeChars)}</span>
              <span style="color:#8b949e">${sec.lines.length} lines</span>
            </div>
            <pre style="margin:0;padding:8px 14px;color:#e3b341;background:#0d1117;white-space:pre-wrap;word-break:break-all;font:12px/1.6 'Cascadia Code','Consolas',monospace">`;
          for (const line of sec.lines) {
            const trimmed = line.trim();
            let isConflict = false; let conflictFiles: string[] | null = null;
            for (const sel of conflictSelectors) {
              if (trimmed === sel || trimmed.startsWith(sel+' ') || trimmed.startsWith(sel+'{') || trimmed.startsWith(sel+',')) {
                isConflict = true; conflictFiles = conflictMap[sel]; break;
              }
            }
            if (isConflict) {
              const tip = conflictFiles ? `title="Also in: ${conflictFiles.filter((f:string)=>f!==sec.fileName).join(', ')}"` : '';
              html += `<span style="display:block;background:#3d0000;color:#ff6b6b;border-left:3px solid #e74c3c;padding-left:4px" ${tip}>${esc(line)}</span>`;
            } else {
              html += esc(line) + '\n';
            }
          }
          html += `</pre></div>`;
        }
        pre.innerHTML = html;
        btn.textContent = '👁 Hide';
      } catch(e: any) {
        pre.innerHTML = `<div style="padding:8px 14px;color:#e74c3c">Error: ${(e as Error).message}</div>`;
      } finally {
        (btn as HTMLButtonElement).disabled = false;
      }
    });
  });

  overlay.querySelectorAll('.css-preview-close').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = (btn as HTMLElement).dataset.idx;
      const panel = overlay.querySelector(`.css-preview-panel[data-idx="${i}"]`) as HTMLElement | null;
      const pb    = overlay.querySelector(`.css-preview-btn[data-idx="${i}"]`);
      if (panel) panel.style.display = 'none';
      if (pb) pb.textContent = '👁 Preview';
    });
  });

  overlay.querySelectorAll('.css-dry-run-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = Number((btn as HTMLElement).dataset.idx);
      const group = groups[i];
      if (!group) return;
      (btn as HTMLButtonElement).disabled = true;
      btn.textContent = '⟳ Writing…';
      try {
        const r = await apiFetch('/api/css/merge-dry-run', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(group),
        }, { timeout: 30000 });
        if (r === null) { btn.textContent = '✗ Failed'; (btn as HTMLButtonElement).disabled = false; return; }
        btn.textContent = '🧪 Dry Run';
        (btn as HTMLButtonElement).disabled = false;
        const card = overlay.querySelector(`.css-merge-card[data-idx="${i}"]`);
        let dryBar = card?.querySelector('.css-dry-run-bar');
        if (dryBar) dryBar.remove();
        dryBar = document.createElement('div');
        (dryBar as HTMLElement).className = 'css-dry-run-bar';
        (dryBar as HTMLElement).style.cssText = 'border-top:1px solid #e3b341;background:#1a1500;padding:8px 12px;display:flex;align-items:center;gap:10px;flex-wrap:wrap';
        (dryBar as HTMLElement).innerHTML = `
          <span style="font-size:11px;color:#e3b341;font-weight:600">🧪 Preview file written:</span>
          <code style="font-size:10px;color:#e3b341;word-break:break-all;flex:1">${r.dryRunPath}</code>
          <button class="css-dryrun-open" style="background:none;border:1px solid #58a6ff;color:#58a6ff;padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer">📂 Open Folder</button>
          <button class="css-dryrun-apply" style="background:#1a3a1a;color:#3fb950;border:1px solid #3fb950;padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer;font-weight:600">▶ Apply — Replace Originals</button>
          <button class="css-dryrun-discard" style="background:none;border:1px solid #e74c3c;color:#e74c3c;padding:3px 10px;border-radius:4px;font-size:11px;cursor:pointer">🗑 Discard</button>`;
        card?.appendChild(dryBar);

        (dryBar as HTMLElement).querySelector('.css-dryrun-open')!.addEventListener('click', () => {
          fetch(`/api/open-in-explorer?path=${encodeURIComponent(r.dryRunPath)}`).catch(() => {});
        });
        (dryBar as HTMLElement).querySelector('.css-dryrun-discard')!.addEventListener('click', async () => {
          await fetch('/api/css/merge-dry-run/discard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: r.dryRunPath }) });
          (dryBar as HTMLElement).remove();
        });
        (dryBar as HTMLElement).querySelector('.css-dryrun-apply')!.addEventListener('click', async () => {
          const applyBtn = (dryBar as HTMLElement).querySelector('.css-dryrun-apply') as HTMLButtonElement;
          applyBtn.disabled = true;
          applyBtn.textContent = '⟳ Applying…';
          await fetch('/api/css/merge-dry-run/discard', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path: r.dryRunPath }) });
          try {
            const mr = await apiFetch('/api/css/merge-execute', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ groups: [group] }),
            }, { timeout: 60000 });
            if (mr === null) { applyBtn.textContent = '✗ Failed'; applyBtn.disabled = false; return; }
            (dryBar as HTMLElement).remove();
            const card2 = overlay.querySelector(`.css-merge-card[data-idx="${i}"]`) as HTMLElement | null;
            if (card2) card2.style.opacity = '0.5';
            const mergeOneBtn = overlay.querySelector(`.css-merge-one-btn[data-idx="${i}"]`) as HTMLButtonElement | null;
            if (mergeOneBtn) { mergeOneBtn.textContent = '✅ Merged'; mergeOneBtn.disabled = true; }
            _showMergeUndoBar([group], 1);
          } catch(e: any) {
            applyBtn.textContent = '✗ Failed';
            applyBtn.disabled = false;
          }
        });
      } catch(e: any) {
        btn.textContent = '✗ Failed';
        (btn as HTMLButtonElement).disabled = false;
      }
    });
  });

  overlay.querySelectorAll('.css-merge-one-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const i = Number((btn as HTMLElement).dataset.idx);
      const group = groups[i];
      if (!group) return;
      if (group.risk === 'high' && !confirm(`HIGH RISK: ${group.conflictCount} selector conflicts in this group.\n\nThe last matching selector wins in CSS — some styles may change.\n\nOriginals are saved as .bak so you can undo.\n\nMerge anyway?`)) return;
      (btn as HTMLButtonElement).disabled = true;
      btn.textContent = '⟳ Merging…';
      const card = overlay.querySelector(`.css-merge-card[data-idx="${i}"]`) as HTMLElement | null;
      try {
        const r = await apiFetch('/api/css/merge-execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groups: [group] }),
        }, { timeout: 60000 });
        if (r === null) { btn.textContent = '✗ Failed'; (btn as HTMLElement).style.borderColor = '#e74c3c'; (btn as HTMLElement).style.color = '#e74c3c'; return; }
        btn.textContent = '✅ Merged';
        (btn as HTMLButtonElement).disabled = true;
        if (card) card.style.opacity = '0.5';
        _showMergeUndoBar([group], 1);
      } catch(e: any) {
        btn.textContent = '✗ Failed';
        (btn as HTMLElement).style.borderColor = '#e74c3c';
        (btn as HTMLElement).style.color = '#e74c3c';
        (btn as HTMLButtonElement).disabled = false;
      }
    });
  });

  const execBtn = document.getElementById('css-merge-exec-btn') as HTMLButtonElement | null;
  if (execBtn) {
    execBtn.addEventListener('click', async () => {
      const selected = [...overlay.querySelectorAll('.css-merge-group-chk:checked')]
        .map(chk => groups[Number((chk as HTMLInputElement).dataset.idx)]).filter(Boolean);
      if (!selected.length) { alert('Select at least one group.'); return; }
      const highRisk = selected.filter((g: any) => g.risk === 'high');
      if (highRisk.length && !confirm(`${highRisk.length} HIGH-RISK group(s) have many selector conflicts.\n\nConflicting selectors will appear in the merged file — the last one wins in CSS cascade.\n\nProceed anyway?`)) return;
      execBtn.disabled = true;
      execBtn.textContent = '⟳ Merging…';
      try {
        const r = await apiFetch('/api/css/merge-execute', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groups: selected }),
        }, { timeout: 60000 });
        if (r === null) { alert('Merge failed — check the Errors panel.'); return; }
        overlay.remove();
        _showMergeUndoBar(selected, r.merged ?? selected.length);
      } catch(e: any) {
        alert(`Merge failed: ${e.message}`);
      } finally {
        execBtn.disabled = false;
        execBtn.textContent = '▶ Merge All Checked';
      }
    });
  }
}

function _showMergeUndoBar(mergedGroups: any[], count: number) {
  const bar = document.createElement('div');
  bar.id = 'css-merge-undo-bar';
  bar.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:10000;background:#1a3a2a;border:1px solid #3fb950;border-radius:8px;padding:10px 18px;display:flex;align-items:center;gap:14px;box-shadow:0 8px 32px rgba(0,0,0,.7);min-width:320px';
  bar.innerHTML = `
    <span style="font-size:13px;color:#3fb950;font-weight:600">✅ Merged ${count} group${count !== 1 ? 's' : ''}</span>
    <span style="font-size:12px;color:var(--muted,#888)">Originals saved as .bak</span>
    <span style="flex:1"></span>
    <button id="css-undo-btn" style="background:#e74c3c;color:#fff;border:none;padding:5px 16px;border-radius:4px;font-size:12px;font-weight:700;cursor:pointer">↩ Undo Merge</button>
    <button id="css-undo-dismiss" style="background:none;border:none;color:var(--muted,#888);cursor:pointer;font-size:16px;line-height:1">✕</button>`;
  document.body.appendChild(bar);

  let _timer = setTimeout(() => bar.remove(), 30000);

  document.getElementById('css-undo-dismiss')!.addEventListener('click', () => { clearTimeout(_timer); bar.remove(); });

  document.getElementById('css-undo-btn')!.addEventListener('click', async () => {
    clearTimeout(_timer);
    const btn = document.getElementById('css-undo-btn') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = '⟳ Restoring…';
    try {
      for (const group of mergedGroups) {
        const sourcePaths = (group.files ?? []).map((f: any) => f.path || f.Path).filter(Boolean);
        await apiFetch('/api/css/merge-restore', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mergedName: group.mergedName, sourcePaths }),
        }, { timeout: 30000 });
      }
      bar.remove();
      const ok = document.createElement('div');
      ok.style.cssText = 'position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:10000;background:#1a1a2a;border:1px solid #58a6ff;border-radius:8px;padding:10px 20px;font-size:13px;color:#58a6ff;box-shadow:0 8px 32px rgba(0,0,0,.7)';
      ok.textContent = '↩ Restore complete — original files are back.';
      document.body.appendChild(ok);
      setTimeout(() => ok.remove(), 5000);
    } catch(e: any) {
      alert(`Restore failed: ${e.message}`);
      btn.disabled = false;
      btn.textContent = '↩ Undo Merge';
    }
  });
}

export async function extractSvgFromSelectedHtml() {
  await runHtmlUtility('extract-svg');
}

export function renderImageGroups(resultEl, groups) {
  let html = '';
  Object.values(groups).forEach((files: any) => {
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
  const btn = document.getElementById('imgDeleteAllBtn') as HTMLButtonElement | null;
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
window._runHtmlUtility      = runHtmlUtility;
window._runCssMergeAnalyze   = runCssMergeAnalyze;
window._deleteAllDevCaches   = deleteAllDevCaches;
