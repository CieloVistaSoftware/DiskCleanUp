// ═══════════════════════════════════════════════════════════════════════════
//  KEEP-LIST — Mark files/folders as "keep" so scanners skip them
// ═══════════════════════════════════════════════════════════════════════════
//
//  Flow:
//    1. User clicks 🔒 Keep on a row  →  keepPaths([path])
//    2. POST /api/keep-list/add       →  backend adds to keep-list.json
//    3. Row gets green flash + removed from DOM
//    4. Next scan skips those paths   →  they never reappear
//
//  Integration points:
//    - section-handlers.js  →  adds 🔒 button to every result row
//    - actions.js           →  "Keep Selected" toolbar button calls keepSelected()
//    - settings.js          →  keep-list management panel (view/remove/clear)
import { apiFetch } from './ui-utils.js';
import { ErrLog } from '/js/error-logger.js';
// ── Cached count for badge ──────────────────────────────────────────────
let _keepCount = 0;
/** Initialize — fetch current count for badge + wire click handler */
export async function initKeepList() {
    try {
        const res = await apiFetch('/api/keep-list');
        _keepCount = res?.paths?.length ?? 0;
        _updateBadge();
    }
    catch { /* server might not be up yet */ }
    // Wire badge click → open keep-list viewer
    const btn = document.getElementById('keepBadgeBtn');
    if (btn)
        btn.addEventListener('click', _openKeepListModal);
}
/** Keep one or more paths. Removes matching rows from ALL section grids + backend caches. */
export async function keepPaths(paths) {
    if (!paths.length)
        return;
    try {
        const res = await apiFetch('/api/keep-list/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths })
        });
        _keepCount = res?.count ?? (_keepCount + paths.length);
        _updateBadge();
        // Remove matching rows from ALL scan-grid sections (cross-section)
        if (window._scanGrid?.removeByPaths) {
            window._scanGrid.removeByPaths(paths);
        }
        // Also remove from legacy DOM (duplicate tables, image cards)
        for (const p of paths) {
            _removeRowByPath(p);
        }
        // Remove from ALL backend scan caches so they don't reappear on Load More
        const cacheSections = ['stale', 'large', 'empty', 'node-modules', 'venvs',
            'backups', 'tiny-files', 'html-files', 'css-files', 'duplicates', 'images'];
        for (const sec of cacheSections) {
            fetch(`/api/cache/${sec}/remove`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paths, trash: false })
            }).catch(() => { }); // fire-and-forget, best-effort
        }
    }
    catch (e) {
        ErrLog.log('[keep-list]', `keepPaths failed: ${e.message}`, e);
    }
}
/** Keep all checked rows in a table */
export async function keepSelected(tableId) {
    // Try scan-grid first, then fall back to table
    let paths = [];
    if (window._scanGrid) {
        // Map table IDs to section names for grid lookup
        const map = { staleTable: 'stale', largeTable: 'large', nmTable: 'node-modules',
            venvTable: 'venvs', emptyTable: 'empty', backupsTable: 'backups',
            tinyTable: 'tiny-files', htmlTable: 'html-files', cssTable: 'css-files' };
        const sec = map[tableId];
        if (sec)
            paths = window._scanGrid.getChecked(sec);
    }
    if (!paths.length) {
        const tbl = document.getElementById(tableId);
        if (!tbl)
            return;
        const checked = [...tbl.querySelectorAll('input[type=checkbox]:checked')];
        paths = checked.map(cb => cb.dataset.path).filter(Boolean);
    }
    if (!paths.length) {
        alert('Select files first.');
        return;
    }
    await keepPaths(paths);
}
/** Un-keep paths (restore to scannable) */
export async function unkeepPaths(paths) {
    if (!paths.length)
        return;
    try {
        const res = await apiFetch('/api/keep-list/remove', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paths })
        });
        _keepCount = res?.count ?? Math.max(0, _keepCount - paths.length);
        _updateBadge();
    }
    catch (e) {
        ErrLog.log('[keep-list]', `unkeepPaths failed: ${e.message}`, e);
    }
}
/** Clear entire keep list */
export async function clearKeepList() {
    if (!confirm('Remove all kept files? They will appear in scans again.'))
        return;
    try {
        await apiFetch('/api/keep-list', { method: 'DELETE' });
        _keepCount = 0;
        _updateBadge();
    }
    catch (e) {
        ErrLog.log('[keep-list]', `clearKeepList failed: ${e.message}`, e);
    }
}
/** Get full keep list for management UI */
export async function getKeepList() {
    try {
        const res = await apiFetch('/api/keep-list');
        return res?.paths ?? [];
    }
    catch (e) {
        ErrLog.log('[keep-list]', `getKeepList failed: ${e.message}`, e);
        return [];
    }
}
/** Get current count */
export function getKeepCount() { return _keepCount; }
// ── DOM helpers ─────────────────────────────────────────────────────────
/** Remove a row from any section table by its data-path */
function _removeRowByPath(path) {
    // Table rows: checkbox has data-path
    const cbs = document.querySelectorAll(`input[data-path="${CSS.escape(path)}"]`);
    for (const cb of cbs) {
        const row = cb.closest('tr');
        if (row) {
            row.classList.add('keep-flash');
            setTimeout(() => row.remove(), 400);
        }
    }
    // Image cards: check paragraphs for path text
    const cards = document.querySelectorAll('.img-card');
    for (const card of cards) {
        const p = card.querySelector('p');
        if (p && p.textContent === path) {
            card.classList.add('keep-flash');
            setTimeout(() => card.remove(), 400);
        }
    }
    // Duplicate groups: check for data-path on rows
    const dupRows = document.querySelectorAll(`tr[data-path="${CSS.escape(path)}"]`);
    for (const row of dupRows) {
        row.classList.add('keep-flash');
        setTimeout(() => row.remove(), 400);
    }
}
/** Update the keep count badge in the toolbar */
function _updateBadge() {
    const badge = document.getElementById('keepCountBadge');
    if (badge) {
        badge.textContent = _keepCount.toLocaleString();
        badge.classList.toggle('hidden', _keepCount === 0);
    }
}
// ── Keep-List Viewer Modal ──────────────────────────────────────────────
async function _openKeepListModal() {
    const modal = document.getElementById('keepListModal');
    const body = document.getElementById('keepListBody');
    if (!modal || !body)
        return;
    body.innerHTML = '<p class="muted">Loading…</p>';
    modal.classList.remove('hidden');
    const paths = await getKeepList();
    if (!paths.length) {
        body.innerHTML = '<p class="kl-empty">No files in the keep list.</p>';
        return;
    }
    // Sort alphabetically for easy scanning
    paths.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    body.innerHTML = paths.map((p, i) => `
    <div class="kl-row">
      <input type="checkbox" class="kl-cb" data-path="${p.replace(/"/g, '&quot;')}" id="kl_${i}">
      <label class="kl-path" for="kl_${i}" title="${p.replace(/"/g, '&quot;')}">${p}</label>
      <button class="kl-open" title="Open containing folder"
              onclick="fetch('/api/open-folder',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path:'${p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'})})"
      >📂</button>
    </div>
  `).join('');
}
async function _keepListRemoveChecked() {
    const body = document.getElementById('keepListBody');
    if (!body)
        return;
    const checked = [...body.querySelectorAll('.kl-cb:checked')];
    if (!checked.length) {
        alert('Select files to un-keep first.');
        return;
    }
    const paths = checked.map(cb => cb.dataset.path);
    await unkeepPaths(paths);
    // Refresh the modal
    await _openKeepListModal();
}
async function _keepListClearAll() {
    await clearKeepList();
    // Refresh the modal
    const body = document.getElementById('keepListBody');
    if (body)
        body.innerHTML = '<p class="kl-empty">Keep list cleared.</p>';
}
// Expose for inline onclick handlers
window.keepPaths = keepPaths;
window.keepSelected = keepSelected;
window._keepListClearAll = _keepListClearAll;
window._keepListRemoveChecked = _keepListRemoveChecked;
//# sourceMappingURL=keep-list.js.map