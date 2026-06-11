// ═══════════════════════════════════════════════════════════════════════════
//  RECYCLE BIN — enumerate, filter, select, restore
// ═══════════════════════════════════════════════════════════════════════════
import { apiFetch, fmt } from './ui-utils.js';
import { escHtml as _esc } from '/lib/wb-core/utils/format.js';
import { ErrLog } from './error-logger.js';
let _rbItems = []; // cached recycle bin items
export async function loadRecycleBin() {
    const panel = document.getElementById('recycleBinPanel');
    const result = document.getElementById('rbResult');
    const status = document.getElementById('rbStatus');
    panel.classList.remove('hidden');
    result.innerHTML = '<p style="color:var(--muted)">Loading Recycle Bin…</p>';
    status.textContent = '';
    try {
        const data = await apiFetch('/api/recycle-bin', {}, { timeout: 35000 });
        _rbItems = data.items || [];
        status.textContent = `${_rbItems.length} items`;
        _buildTypeFilter();
        _renderTable();
    }
    catch (e) {
        ErrLog.log('[RECYCLE_BIN]', e.message, e.stack, 'CAUGHT_ERROR');
        result.innerHTML = `<p style="color:var(--red)">Failed: ${e.message}</p>`;
    }
}
function _buildTypeFilter() {
    const sel = document.getElementById('rbTypeFilter');
    const types = new Set(_rbItems.map(i => i.fileType).filter(Boolean));
    const sorted = [...types].sort();
    sel.innerHTML = `<option value="">All Types (${sorted.length})</option>` +
        sorted.map(t => `<option value="${t}">${t}</option>`).join('');
}
function _renderTable() {
    const result = document.getElementById('rbResult');
    if (!_rbItems.length) {
        result.innerHTML = '<p style="color:var(--muted)">Recycle Bin is empty</p>';
        return;
    }
    const html = `<table id="rbTable">
    <thead><tr>
      <th style="width:30px"></th>
      <th>Name</th>
      <th>Original Path</th>
      <th>Size</th>
      <th>Deleted</th>
      <th>Type</th>
    </tr></thead>
    <tbody>${_rbItems.map((item, i) => `<tr data-rb-idx="${i}" data-rb-type="${_esc(item.fileType)}">
      <td><input type="checkbox" data-rb-path="${_esc(item.recyclePath)}"></td>
      <td>${_esc(item.name)}</td>
      <td class="td-sm">${_esc(item.originalPath)}</td>
      <td>${fmt(item.size)}</td>
      <td style="font-size:11px">${_esc(item.dateDeleted)}</td>
      <td style="font-size:11px">${_esc(item.fileType)}</td>
    </tr>`).join('')}
    </tbody></table>`;
    result.innerHTML = html;
}
export function filterRecycleBin() {
    const text = (document.getElementById('rbFilter')?.value || '').toLowerCase();
    const type = document.getElementById('rbTypeFilter')?.value || '';
    const rows = document.querySelectorAll('#rbTable tbody tr');
    let visible = 0;
    rows.forEach(tr => {
        const nameMatch = !text || tr.textContent.toLowerCase().includes(text);
        const typeMatch = !type || tr.dataset.rbType === type;
        const show = nameMatch && typeMatch;
        tr.style.display = show ? '' : 'none';
        if (show)
            visible++;
    });
    const status = document.getElementById('rbStatus');
    if (status)
        status.textContent = `${visible} of ${_rbItems.length} items`;
}
export function rbSelectAll() {
    document.querySelectorAll('#rbTable tbody tr').forEach(tr => {
        if (tr.style.display !== 'none') {
            const cb = tr.querySelector('input[type=checkbox]');
            if (cb)
                cb.checked = true;
        }
    });
}
export function rbSelectNone() {
    document.querySelectorAll('#rbTable input[type=checkbox]').forEach(cb => cb.checked = false);
}
export async function restoreSelected() {
    const checked = [...document.querySelectorAll('#rbTable input[type=checkbox]:checked')];
    if (!checked.length) {
        alert('No items selected');
        return;
    }
    const paths = checked.map(cb => cb.dataset.rbPath);
    if (!confirm(`Restore ${paths.length} item(s) from Recycle Bin?`))
        return;
    const status = document.getElementById('rbStatus');
    status.textContent = `Restoring ${paths.length} items…`;
    try {
        const res = await apiFetch('/api/recycle-bin/restore', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ items: paths })
        }, { timeout: 60000 });
        status.textContent = `✅ Restored ${res.restored}` +
            (res.errors?.length ? ` · ${res.errors.length} errors` : '');
        // Reload to reflect changes
        if (res.restored > 0)
            await loadRecycleBin();
    }
    catch (e) {
        ErrLog.log('[RECYCLE_BIN]', e.message, e.stack, 'CAUGHT_ERROR');
        status.textContent = `❌ ${e.message}`;
    }
}
// _esc is now imported from wb-core as escHtml
// Expose on window for inline onclick handlers
window.loadRecycleBin = loadRecycleBin;
window.filterRecycleBin = filterRecycleBin;
window.rbSelectAll = rbSelectAll;
window.rbSelectNone = rbSelectNone;
window.restoreSelected = restoreSelected;
//# sourceMappingURL=recycle-bin.js.map