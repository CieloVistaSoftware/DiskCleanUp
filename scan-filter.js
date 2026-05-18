// ═══════════════════════════════════════════════════════════════════════════
//  SCAN-FILTER — Universal filter module for all scan sections
//  ONE-TIME-ONE-PLACE: type dropdown, text search, include/exclude modes
//  Works with scan-grid.js (CSS grid rows, not <table> rows)
//  Filter state persists per section via localStorage (key: dcu_sf_{section})
// ═══════════════════════════════════════════════════════════════════════════
const _filters = {};
const _LS_PREFIX = 'dcu_sf_';
/**
 * Register a section for filtering.
 * Idempotent: calling register() again for an already-registered section
 * is a no-op. This is critical because SG.showSkeleton() creates the grid
 * with filterBar:false, and the subsequent SG.create() call (with filterBar
 * enabled) must register the filter without re-initializing state. (FEAT-021)
 *
 * @param {string} section  — section key (e.g. 'stale', 'tiny-files')
 * @param {object} opts
 *   containerId  — ID of a placeholder div in the toolbar
 *   gridBodyId   — ID of the sg-body div (for direct row manipulation)
 *   onApply      — optional callback after filter applied
 */
export function register(section, opts = {}) {
    if (_filters[section])
        return; // Already registered — idempotent
    _filters[section] = {
        exts: new Set(),
        excluded: new Set(),
        mode: 'include', // 'include' | 'exclude'
        containerId: opts.containerId || `sf-${section}`,
        gridBodyId: opts.gridBodyId || `sg-body-${section}`,
        textFilter: '',
        selectedExt: '', // include-mode dropdown value
        onApply: opts.onApply || null,
    };
    _injectUI(section);
    _restore(section);
}
/** Call on scan started — clears tracked extensions + excluded set + saved state */
export function reset(section) {
    const f = _filters[section];
    if (!f)
        return;
    f.exts.clear();
    f.excluded.clear();
    f.textFilter = '';
    f.selectedExt = '';
    f.mode = 'include';
    _clearSaved(section);
    _rebuildDropdown(section);
    // Force dropdown to "All Types" regardless of what live rows say.
    // Without this, _rebuildDropdown reads stale DOM rows (not yet cleared)
    // and keeps the old extension selected — causing the next scan to send
    // the wrong extension filter to the backend (e.g. '.html' in an SVG folder).
    const dd = _el(`sf-dd-${section}`);
    if (dd)
        dd.value = '';
    _rebuildChips(section);
    _updateStatus(section);
    _syncModeBtn(section);
    const box = _el(f.containerId);
    if (box) {
        const inp = box.querySelector('.sf-text');
        if (inp)
            inp.value = '';
    }
}
/** Track an extension from a file path. Call for every result row. */
export function trackExt(section, path) {
    const f = _filters[section];
    if (!f || !path)
        return;
    const ext = _extOf(path);
    if (!ext)
        return;
    if (!f.exts.has(ext)) {
        f.exts.add(ext);
        if (!f._rebuildQueued) {
            f._rebuildQueued = true;
            requestAnimationFrame(() => { f._rebuildQueued = false; _rebuildDropdown(section); });
        }
    }
}
/** Final rebuild after scan done or cache restore. Re-applies saved filter state. */
export function rebuild(section) {
    _rebuildDropdown(section);
    // Re-apply saved dropdown selection now that extensions are populated
    const f = _filters[section];
    if (!f)
        return;
    if (f.mode === 'include' && f.selectedExt) {
        const dd = _el(`sf-dd-${section}`);
        if (dd && f.exts.has(f.selectedExt)) {
            dd.value = f.selectedExt;
        }
    }
    // Apply filter to reflect restored state
    apply(section);
}
/** Apply filter: hides/shows grid rows based on current state. */
export function apply(section) {
    const f = _filters[section];
    if (!f)
        return;
    // Rebuild dropdown from live rows so it never shows stale extensions
    _rebuildDropdown(section);
    // Delegate to scan-grid if it has an applyFilter
    if (window._scanGrid?.applyFilter) {
        window._scanGrid.applyFilter(section);
        return;
    }
    // Fallback: direct DOM manipulation on grid body
    const body = _el(f.gridBodyId);
    if (!body)
        return;
    const text = f.textFilter.toLowerCase();
    let shown = 0, total = 0;
    for (const row of body.querySelectorAll('.sg-row:not(.sg-skel-row)')) {
        total++;
        const path = row.dataset.path || '';
        const ext = row.dataset.ext || '';
        let visible = true;
        if (text) {
            const extShorthand = _parseExtShorthand(text);
            if (extShorthand) {
                if (ext !== extShorthand)
                    visible = false;
            }
            else {
                if (!path.toLowerCase().includes(text))
                    visible = false;
            }
        }
        if (visible && f.mode === 'include') {
            const sel = _getDropdownValue(section);
            if (sel && ext !== sel)
                visible = false;
        }
        else if (visible && f.mode === 'exclude') {
            if (f.excluded.has(ext))
                visible = false;
        }
        row.style.display = visible ? '' : 'none';
        if (visible)
            shown++;
    }
    _updateStatus(section, shown, total);
    if (f.onApply)
        f.onApply(section, shown, total);
}
/** Get the set of currently excluded extensions. */
export function getExcluded(section) {
    const f = _filters[section];
    return f ? new Set(f.excluded) : new Set();
}
/** Get the include-mode selected extension (or '' for all). */
export function getIncluded(section) {
    return _getDropdownValue(section);
}
/** Get the current filter mode. */
export function getMode(section) {
    return _filters[section]?.mode || 'include';
}
// ═══════════════════════════════════════════════════════════════════════════
//  PERSISTENCE — localStorage save/restore per section
// ═══════════════════════════════════════════════════════════════════════════
function _save(section) {
    const f = _filters[section];
    if (!f)
        return;
    try {
        const state = {
            mode: f.mode,
            textFilter: f.textFilter,
            excluded: [...f.excluded],
            selectedExt: f.mode === 'include' ? (_getDropdownValue(section) || '') : '',
        };
        localStorage.setItem(_LS_PREFIX + section, JSON.stringify(state));
    }
    catch { /* quota exceeded — silently ignore */ }
}
function _restore(section) {
    const f = _filters[section];
    if (!f)
        return;
    try {
        const raw = localStorage.getItem(_LS_PREFIX + section);
        if (!raw)
            return;
        const state = JSON.parse(raw);
        // Restore mode
        if (state.mode === 'exclude' || state.mode === 'include') {
            f.mode = state.mode;
        }
        // Restore text filter
        if (state.textFilter) {
            f.textFilter = state.textFilter;
            const inp = _el(`sf-text-${section}`);
            if (inp)
                inp.value = state.textFilter;
        }
        // Restore excluded set
        if (Array.isArray(state.excluded)) {
            f.excluded = new Set(state.excluded);
        }
        // Store selectedExt — will be applied in rebuild() once extensions are populated
        if (state.selectedExt) {
            f.selectedExt = state.selectedExt;
        }
        // Sync UI to restored state
        _syncModeBtn(section);
        _rebuildChips(section);
        // Don't call apply() here — no rows exist yet. rebuild() handles it after cache restore.
    }
    catch { /* corrupt data — ignore */ }
}
function _clearSaved(section) {
    try {
        localStorage.removeItem(_LS_PREFIX + section);
    }
    catch { /* ignore */ }
}
// ═══════════════════════════════════════════════════════════════════════════
//  INTERNAL
// ═══════════════════════════════════════════════════════════════════════════
function _el(id) { return document.getElementById(id); }
/**
 * If text looks like a bare extension shorthand (e.g. "exe", ".exe", "*.exe"),
 * returns the normalised extension with dot (e.g. ".exe").
 * Returns '' if the text looks like a path fragment or contains spaces.
 */
function _parseExtShorthand(text) {
    if (!text)
        return '';
    const t = text.replace(/^\*/, '').toLowerCase();
    // No path separators and no spaces → treat as extension
    if (t && !t.includes('/') && !t.includes('\\') && !t.includes(' ')) {
        return t.startsWith('.') ? t : '.' + t;
    }
    return '';
}
function _extOf(path) {
    if (!path)
        return '';
    const d = path.lastIndexOf('.');
    const s = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    if (d < 0 || d < s)
        return '';
    return path.substring(d).toLowerCase();
}
function _getDropdownValue(section) {
    const dd = _el(`sf-dd-${section}`);
    return dd?.value || '';
}
function _syncModeBtn(section) {
    const f = _filters[section];
    if (!f)
        return;
    const btn = _el(`sf-mode-${section}`);
    if (btn) {
        btn.textContent = f.mode === 'include' ? 'Include' : 'Exclude';
        btn.classList.toggle('danger', f.mode === 'exclude');
        btn.classList.toggle('muted', f.mode === 'include');
    }
}
function _injectUI(section) {
    const f = _filters[section];
    const container = _el(f.containerId);
    if (!container)
        return;
    container.innerHTML = `
    <div class="sf-row">
      <select id="sf-dd-${section}" class="filter-select sf-dropdown" title="Filter by file type">
        <option value="">All Types</option>
      </select>
      <button id="sf-mode-${section}" class="btn muted sf-mode-btn" title="Toggle Include / Exclude mode">Include</button>
      <input  id="sf-text-${section}" type="text" class="filter-input sf-text" placeholder="Filter by path or ext (exe, .dll)\u2026" style="width:220px">
      <span   id="sf-status-${section}" class="sf-status"></span>
    </div>
    <div id="sf-chips-${section}" class="sf-chips" style="display:none"></div>
  `;
    _el(`sf-dd-${section}`).addEventListener('change', () => _onDropdownChange(section));
    _el(`sf-mode-${section}`).addEventListener('click', () => _toggleMode(section));
    _el(`sf-text-${section}`).addEventListener('input', (e) => {
        f.textFilter = e.target.value;
        _save(section);
        apply(section);
    });
}
function _toggleMode(section) {
    const f = _filters[section];
    if (!f)
        return;
    f.mode = f.mode === 'include' ? 'exclude' : 'include';
    f.excluded.clear();
    f.selectedExt = '';
    _syncModeBtn(section);
    const dd = _el(`sf-dd-${section}`);
    if (dd)
        dd.value = '';
    _rebuildDropdown(section);
    _rebuildChips(section);
    _save(section);
    apply(section);
}
function _onDropdownChange(section) {
    const f = _filters[section];
    if (!f)
        return;
    if (f.mode === 'exclude') {
        const dd = _el(`sf-dd-${section}`);
        const val = dd?.value || '';
        if (val) {
            f.excluded.add(val);
            dd.value = '';
        }
        _rebuildChips(section);
    }
    else {
        f.selectedExt = _getDropdownValue(section);
    }
    _save(section);
    apply(section);
}
function _removeExcluded(section, ext) {
    const f = _filters[section];
    if (!f)
        return;
    f.excluded.delete(ext);
    _rebuildChips(section);
    _save(section);
    apply(section);
}
function _rebuildDropdown(section) {
    const f = _filters[section];
    const dd = _el(`sf-dd-${section}`);
    if (!f || !dd)
        return;
    // Always derive extensions from LIVE grid rows — never stale tracked set.
    // This means the dropdown only ever shows types actually in the current results.
    const body = _el(f.gridBodyId);
    const liveExts = new Set();
    if (body) {
        for (const row of body.querySelectorAll('.sg-row:not(.sg-skel-row)')) {
            const ext = row.dataset.ext;
            if (ext)
                liveExts.add(ext);
        }
    }
    else {
        // Fallback to tracked set if body not found yet
        for (const e of f.exts)
            liveExts.add(e);
    }
    const cur = dd.value;
    const sorted = [...liveExts].sort();
    if (f.mode === 'exclude') {
        const available = sorted.filter(e => !f.excluded.has(e));
        dd.innerHTML = `<option value="">+ Exclude type (${f.excluded.size} excluded)</option>` +
            available.map(e => `<option value="${e}">${e}</option>`).join('');
    }
    else {
        dd.innerHTML = `<option value="">All Types (${sorted.length})</option>` +
            sorted.map(e => `<option value="${e}">${e}</option>`).join('');
        // Restore selection only if the ext still exists in live results
        if (liveExts.has(cur))
            dd.value = cur;
    }
}
function _rebuildChips(section) {
    const f = _filters[section];
    const container = _el(`sf-chips-${section}`);
    if (!f || !container)
        return;
    if (f.mode !== 'exclude' || f.excluded.size === 0) {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }
    container.style.display = '';
    const sorted = [...f.excluded].sort();
    container.innerHTML = sorted.map(ext => `<span class="sf-chip">${ext}<button class="sf-chip-x" data-ext="${ext}" title="Remove">&times;</button></span>`).join('');
    container.querySelectorAll('.sf-chip-x').forEach(btn => {
        btn.addEventListener('click', () => _removeExcluded(section, btn.dataset.ext));
    });
}
function _updateStatus(section, shown, total) {
    const el = _el(`sf-status-${section}`);
    if (!el)
        return;
    if (shown === undefined || total === undefined) {
        el.textContent = '';
        return;
    }
    if (shown === total) {
        el.textContent = `${total.toLocaleString()} rows`;
        return;
    }
    el.textContent = `Showing ${shown.toLocaleString()} of ${total.toLocaleString()}`;
}
window._scanFilter = { register, reset, trackExt, rebuild, apply, getExcluded, getIncluded, getMode };
