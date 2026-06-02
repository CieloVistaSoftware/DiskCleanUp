// ═══════════════════════════════════════════════════════════════════════════
//  DUPLICATES SECTION — MVVM Controller
//
//  Wires together:
//    Model    (duplicates-model.js)  — data shape, parsing, column defs
//    ViewModel (section-vm.js)       — JSONL ↔ data Map ↔ view notification
//    View     (grid-view.js)         — pure DOM renderer
//
//  This file is the thin glue: handles scan events, user actions,
//  visibility, and preview loading. No data logic, no DOM building.
// ═══════════════════════════════════════════════════════════════════════════

import { SB }               from '../js/status-bar.js';
import { DuplicatesModel }  from '../models/duplicates-model.js';
import { SectionVM }        from '../viewmodels/section-vm.js';
import { GridView }         from '../views/grid-view.js';
import { ErrLog } from '../js/error-logger.js';

// -- File type detection (for previews) --------------------------------------
const _imgExts  = new Set(['.svg','.png','.jpg','.jpeg','.gif','.webp','.bmp','.ico']);
const _codeExts = new Set(['.js','.ts','.jsx','.tsx','.css','.html','.htm','.json',
                           '.xml','.md','.txt','.cs','.py','.ps1','.yaml','.yml',
                           '.toml','.ini','.cfg','.sh','.bat','.cmd','.sql','.csv']);

function _extOf(path) {
  const m = String(path).match(/\.[^.\\/]+$/);
  return m ? m[0].toLowerCase() : '';
}

export const DuplicatesSection = (() => {

  // ── Create MVVM layers ───────────────────────────────────
  const vm   = new SectionVM(DuplicatesModel);
  const view = new GridView('dupResult', {
    onDeleteGroup:  (hash, paths, btn) => deleteGroup(btn, hash, paths),
    onLoadPreview:  (el) => _loadPreview(el),
    onMarkChanged:  (count) => _updateMarkedBar(count),
  });
  vm.bindView(view);

  let _visible        = true;
  let _allCopiesNuked = false;
  vm.visible = true;  // duplicates is the default active tab

  // ── Wire marked-bar buttons (once DOM is ready) ──────────
  document.getElementById('dup-delete-marked-btn')
    ?.addEventListener('click', () => deleteMarked());
  document.getElementById('dup-clear-marked-btn')
    ?.addEventListener('click', () => { view.clearMarked(); _updateMarkedBar(0); });

  // ── Filter bar ────────────────────────────────────────────
  const _filterInput  = document.getElementById('dup-filter-input')  as HTMLInputElement | null;
  const _filterClear  = document.getElementById('dup-filter-clear')  as HTMLButtonElement | null;
  const _selectAllBtn = document.getElementById('dup-select-all-btn') as HTMLButtonElement | null;
  const _deselectBtn  = document.getElementById('dup-deselect-all-btn') as HTMLButtonElement | null;

  function _applyFilter() {
    const raw     = _filterInput?.value.trim() ?? '';
    const exclude = raw.startsWith('!');
    const term    = exclude ? raw.slice(1).toLowerCase() : raw.toLowerCase();
    const result  = document.getElementById('dupResult');
    if (!result) return;

    if (_filterClear) _filterClear.style.display = raw ? '' : 'none';

    result.querySelectorAll<HTMLElement>('.dup-sep, .dup-cards-wrap').forEach(el => {
      if (!term) { el.style.display = ''; return; }
      // Match against path cells inside the group
      const pathsWrap = el.classList.contains('dup-cards-wrap') ? el : result.querySelector<HTMLElement>(`.dup-cards-wrap[data-group="${el.dataset.group}"]`);
      const text = (pathsWrap?.textContent ?? el.textContent ?? '').toLowerCase();
      const matches = text.includes(term);
      el.style.display = (exclude ? matches : !matches) ? 'none' : '';
    });
  }

  _filterInput?.addEventListener('input', _applyFilter);
  _filterClear?.addEventListener('click', () => {
    if (_filterInput) { _filterInput.value = ''; }
    _applyFilter();
  });

  // ── Select All / Deselect All ─────────────────────────────
  _selectAllBtn?.addEventListener('click', () => {
    const result = document.getElementById('dupResult');
    if (!result) return;
    let count = 0;
    // Click every delete button on visible copy cards that isn't the keep card
    result.querySelectorAll<HTMLElement>('.dup-cards-wrap').forEach(wrap => {
      if (wrap.style.display === 'none') return;
      wrap.querySelectorAll<HTMLElement>('.dup-card.dup-card-copy').forEach(card => {
        const markBtn = card.querySelector<HTMLButtonElement>('.dup-mark-btn');
        if (markBtn && !markBtn.classList.contains('active')) {
          markBtn.click();
          count++;
        }
      });
    });
    if (_selectAllBtn) _selectAllBtn.style.display = 'none';
    if (_deselectBtn)  _deselectBtn.style.display  = '';
    ErrLog.log('[DUP]', `Selected ${count} copy cards`, null, 'INFO');
  });

  _deselectBtn?.addEventListener('click', () => {
    view.clearMarked();
    _updateMarkedBar(0);
    if (_selectAllBtn) _selectAllBtn.style.display = '';
    if (_deselectBtn)  _deselectBtn.style.display  = 'none';
  });

  // ── Visibility ───────────────────────────────────────────

  function onShow() {
    window._T?.('DUP', `onShow data=${vm.size}`);
    _visible = true;
    vm.visible = true;
    if (vm.size === 0) {
      // Restore from JSONL on first show
      vm.loadAndBind().catch(e =>
        window._T?.('DUP', `restore failed: ${e.message}`)
      );
    }
  }

  function onHide() {
    _visible = false;
    vm.visible = false;
  }

  // ── Scan events from WebSocket ───────────────────────────

  function onEvent(msg) {
    switch (msg.type) {
      case 'started':
        reset();  // always reset — _allCopiesNuked must clear even when vm.size === 0
        vm.visible = true;   // ensure flushes render during scan
        vm.scanStarted();
        SB.begin('duplicates', msg.root);
        window._setSectionStatus?.('duplicates', 'scanning');
        return;

      case 'progress':
        SB.progress('duplicates', {
          files: msg.files, results: msg.results, folder: msg.folder
        });
        return;

      case 'done':
        vm.scanDone();
        SB.done('duplicates', `Done — ${vm.size} dupe groups`);
        window._setSectionStatus?.('duplicates', 'done');
        return;

      case 'error':
        SB.error('duplicates', msg.message);
        window._setSectionStatus?.('duplicates', 'error');
        return;

      case 'result':
      case 'result_update':
        // Suppress if user already deleted all copies
        if (_allCopiesNuked) return;
        // Delegate to ViewModel — it updates data + notifies view
        vm.onScanEvent(msg);
        _updateRows();
        return;
    }
  }

  // ── Reset (new scan starting) ────────────────────────────

  function reset() {
    _allCopiesNuked = false;
    vm.reset();
    _updateRows();
  }

  function _updateRows() {
    const el = document.getElementById('sbv-duplicates-rows');
    if (el) el.textContent = vm.size.toLocaleString();
  }

  // ── Delete actions ───────────────────────────────────────

  async function deleteGroup(btn, hash, paths) {
    if (!Array.isArray(paths) || !paths.length) return;
    window._T?.('DEL', `deleteGroup: ${paths.length} paths`);

    if (btn) { btn.textContent = '\u23f3 deleting\u2026'; btn.disabled = true; }

    // Find and immediately hide the group row \u2014 no full view refresh
    const groupSep  = document.querySelector(`.dup-sep[data-hash="${hash}"]`) as HTMLElement | null;
    const groupWrap = document.querySelector(`.dup-cards-wrap[data-group="${hash}"]`) as HTMLElement | null;
    if (groupSep)  { groupSep.style.transition  = 'opacity .25s'; groupSep.style.opacity  = '0'; }
    if (groupWrap) { groupWrap.style.transition = 'opacity .25s'; groupWrap.style.opacity = '0'; }

    try {
      await fetch('/api/trash', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths }),
      });
      // Remove from DOM after fade
      setTimeout(() => { groupSep?.remove(); groupWrap?.remove(); }, 260);
    } catch (e) {
      // Restore visibility on failure
      if (groupSep)  { groupSep.style.opacity  = '1'; }
      if (groupWrap) { groupWrap.style.opacity = '1'; }
      ErrLog.log('[DUPLICATES]', 'Delete failed', e.message, 'CAUGHT_ERROR');
      if (btn) { btn.textContent = 'Delete Copies'; btn.disabled = false; }
    }
  }

  async function deleteAllCopies() {
    const paths = DuplicatesModel.allCopyPaths(vm.data);
    if (!paths.length) { alert('No duplicate copies found.'); return; }
    if (!confirm(`Delete ALL ${paths.length} duplicate cop${paths.length === 1 ? 'y' : 'ies'}?\nOriginals are safe. Files go to Recycle Bin.`)) return;

    window._T?.('DEL', `deleteAllCopies: ${paths.length} paths`);
    _allCopiesNuked = true;
    SB.progress('duplicates', { files: 0, results: 0, folder: 'Deleting copies\u2026' });

    await vm.removeAllCopies();

    // Nuke server cache to prevent stale data on tab switch
    if (vm.size === 0) {
      fetch('/api/cache/duplicates', { method: 'DELETE' }).catch(() => {});
    }

    SB.done('duplicates', `${vm.size} dupe groups`);
  }

  // ── Delete marked paths ──────────────────────────────────

  async function deleteMarked() {
    const paths = view.getMarkedPaths();
    if (!paths.length) return;
    if (!confirm(`Move ${paths.length} marked file${paths.length === 1 ? '' : 's'} to the Recycle Bin?\n\nYou can restore them later via right-click → Restore in Windows Explorer.`)) return;

    const btn = document.getElementById('dup-delete-marked-btn') as HTMLButtonElement | null;
    if (btn) { btn.textContent = '⏳ Deleting…'; btn.disabled = true; }

    let result;
    try {
      result = await vm.removePaths(paths, { trash: true });
    } catch (e: any) {
      ErrLog.log('[DUPLICATES]', 'deleteMarked failed', e.message, 'CAUGHT_ERROR');
      if (btn) { btn.textContent = '🗑 Delete Marked'; btn.disabled = false; }
      alert('Delete failed: ' + (e.message || e));
      return;
    }

    if (result && result.deleteResults) {
      const failed = result.deleteResults.filter((r: any) => !r.ok);
      if (failed.length > 0) {
        if (btn) { btn.textContent = '🗑 Delete Marked'; btn.disabled = false; }
        alert('Some files could not be deleted:\n' + failed.map((f: any) => `${f.path}: ${f.error || 'Unknown error'}`).join('\n'));
        return;
      }
    }

    const count = paths.length;
    view.clearMarked();
    _updateMarkedBar(0);
    _showRecycleBinNotice(count);
  }

  function _updateMarkedBar(count: number) {
    const bar    = document.getElementById('dup-marked-bar');
    const btnEl  = document.getElementById('dup-delete-marked-btn') as HTMLButtonElement | null;
    const countEl = document.getElementById('dup-marked-count');
    if (!bar) return;
    if (count === 0) {
      bar.classList.add('hidden');
    } else {
      bar.classList.remove('hidden');
      if (countEl) countEl.textContent = `${count} file${count === 1 ? '' : 's'} marked for deletion`;
      if (btnEl)   btnEl.textContent  = `🗑 Delete Marked (${count})`;
    }
  }

  function _showRecycleBinNotice(count: number) {
    const notice = document.getElementById('dup-recycle-notice');
    if (!notice) return;
    notice.textContent = `✅ ${count} file${count === 1 ? '' : 's'} moved to Recycle Bin. Right-click → Restore in Windows Explorer to recover them.`;
    notice.classList.remove('hidden');
    setTimeout(() => notice.classList.add('hidden'), 8000);
  }

  // ── Filter ───────────────────────────────────────────────

  function filter(val) {
    view.filter(val);
  }

  // ── Preview loading (callback from View) ─────────────────

  async function _loadPreview(el) {
    const path = el.dataset.previewPath;
    if (!path) return;
    const ext = _extOf(path);

    if (_imgExts.has(ext)) {
      const img = document.createElement('img');
      img.className = 'dup-thumb';
      if (ext === '.svg') img.classList.add('dup-thumb-svg');
      img.alt = path.split(/[\\/]/).pop();
      img.loading = 'lazy';
      img.onerror = () => { img.remove(); el.textContent = '(preview unavailable)'; };
      img.src = `/api/file?path=${encodeURIComponent(path)}`;
      el.textContent = '';
      el.appendChild(img);
    } else if (_codeExts.has(ext)) {
      try {
        const r = await fetch(`/api/preview?path=${encodeURIComponent(path)}`);
        if (!r.ok) { el.textContent = '(preview unavailable)'; return; }
        const data = await r.json();
        if (data.type === 'text' && data.content) {
          const pre = document.createElement('pre');
          pre.className = 'dup-code';
          const lines = data.content.split('\n').slice(0, 5);
          pre.textContent = lines.join('\n');
          if (data.content.split('\n').length > 5) pre.textContent += '\n\u2026';
          el.textContent = '';
          el.appendChild(pre);
        } else {
          el.textContent = '(binary file)';
        }
      } catch {
        el.textContent = '(preview failed)';
      }
    } else {
      el.textContent = `(.${ext.slice(1) || '?'} file)`;
    }
  }

  // ── Public API ───────────────────────────────────────────

  return {
    onEvent,
    onShow,
    onHide,
    reset,
    deleteGroup,
    deleteAllCopies,
    deleteMarked,
    filter,
    get size() { return vm.size; }
  };
})();
