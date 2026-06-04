// ═══════════════════════════════════════════════════════════════════════════
//  TABLE UTILITIES — skeleton, ensure, append, row index, clear
// ═══════════════════════════════════════════════════════════════════════════
import { makeColumnsResizable, makeColumnsSortable } from './column-controls.js';
const _sectionTbodies = {};
// Per-section row index maps: section → hash → [tr elements]
// Eliminates querySelectorAll('[data-hash=...]') on every result_update (O(n²) otherwise)
const _rowIndex = {};
export function indexRows(section, hash, rows) {
    if (!_rowIndex[section])
        _rowIndex[section] = new Map();
    _rowIndex[section].set(hash, rows);
}
export function removeIndexedRows(section, hash) {
    const map = _rowIndex[section];
    if (!map)
        return;
    const rows = map.get(hash);
    if (rows) {
        rows.forEach(r => r.remove());
        map.delete(hash);
    }
}
export function clearIndex(section) {
    delete _rowIndex[section];
}
export function clearSection(section) {
    delete _sectionTbodies[section];
    clearIndex(section);
}
export function ensureTable(section, containerId, tableId, headerHTML) {
    if (_sectionTbodies[section])
        return _sectionTbodies[section];
    // Skeleton may already have built the table shell — reuse it, strip skeleton rows
    let tbl = document.getElementById(tableId);
    if (tbl) {
        const tbody = tbl.querySelector('tbody');
        tbody.querySelectorAll('.skel-row').forEach(r => r.remove());
        _sectionTbodies[section] = tbody;
        return tbody;
    }
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<table id="${tableId}">${headerHTML}<tbody></tbody></table>`;
    }
    _sectionTbodies[section] = document.querySelector(`#${tableId} tbody`);
    tbl = document.getElementById(tableId);
    if (tbl)
        requestAnimationFrame(() => { makeColumnsResizable(tbl); makeColumnsSortable(tbl); });
    return _sectionTbodies[section];
}
export function appendRow(tbody, html) {
    const tmp = document.createElement('tbody');
    tmp.innerHTML = html;
    [...tmp.children].forEach(tr => {
        tr.classList.add('live-row');
        const cells = tr.querySelectorAll('td');
        let path = '';
        for (let i = 0; i < cells.length; i++) {
            const text = cells[i].textContent || '';
            if (text.match(/\\|\//) && text.length > 3) {
                path = text.trim();
                break;
            }
        }
        if (path) {
            const openBtn = document.createElement('button');
            openBtn.textContent = 'Open';
            openBtn.className = 'btn muted';
            openBtn.classList.add('btn-inline');
            openBtn.onclick = () => window.openInVSCode(path);
            if (cells.length)
                cells[cells.length - 1].appendChild(openBtn);
        }
        tbody.appendChild(tr);
    });
}
/** Remove all skeleton elements from a section container — call on 'done' */
export function removeSkeletons(containerId) {
    const c = document.getElementById(containerId);
    if (!c)
        return;
    c.querySelectorAll('.skel-row').forEach(r => r.remove());
    c.querySelectorAll('.skel-grid').forEach(r => r.remove());
    c.querySelectorAll('.skel-card').forEach(r => r.remove());
    c.querySelectorAll('.skel-bar').forEach(r => r.remove());
}
// Paints the table shell + 4 pulsing skeleton rows immediately on 'started'
export function showSkeleton(section, containerId, tableId, headerHTML, colCount) {
    if (_sectionTbodies[section])
        return;
    const skelCols = Array.from({ length: colCount }, (_, i) => `<td><span class="skel-bar skel-w-${i % 6}"></span></td>`).join('');
    const skelRows = Array.from({ length: 4 }, () => `<tr class="skel-row">${skelCols}</tr>`).join('');
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `<table id="${tableId}">${headerHTML}<tbody>${skelRows}</tbody></table>`;
    }
    const tbl = document.getElementById(tableId);
    if (tbl)
        requestAnimationFrame(() => { makeColumnsResizable(tbl); makeColumnsSortable(tbl); });
}
//# sourceMappingURL=table-utils.js.map