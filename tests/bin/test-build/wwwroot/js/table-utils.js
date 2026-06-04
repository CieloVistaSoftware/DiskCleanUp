import { makeColumnsResizable, makeColumnsSortable } from './column-controls.js';
import { ErrLog } from '/js/error-logger.js';

const _sectionTbodies = {};
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
    try {
        if (_sectionTbodies[section])
            return _sectionTbodies[section];
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
            requestAnimationFrame(() => { 
                try {
                    makeColumnsResizable(tbl); 
                    makeColumnsSortable(tbl); 
                } catch (err) {
                    ErrLog.log('[table-utils.js]', err?.message || String(err), err?.stack || null, 'TABLE_UTILS_ERROR');
                }
            });
        return _sectionTbodies[section];
    } catch (err) {
        ErrLog.log('[table-utils.js]', err?.message || String(err), err?.stack || null, 'TABLE_UTILS_ERROR');
    }
}

export function appendRow(tbody, html) {
    try {
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
                openBtn.onclick = () => {
                    try {
                        window.openInVSCode(path);
                    } catch (err) {
                        ErrLog.log('[table-utils.js]', err?.message || String(err), err?.stack || null, 'TABLE_UTILS_ERROR');
                    }
                };
                if (cells.length)
                    cells[cells.length - 1].appendChild(openBtn);
            }
            tbody.appendChild(tr);
        });
    } catch (err) {
        ErrLog.log('[table-utils.js]', err?.message || String(err), err?.stack || null, 'TABLE_UTILS_ERROR');
    }
}

export function removeSkeletons(containerId) {
    try {
        const c = document.getElementById(containerId);
        if (!c)
            return;
        c.querySelectorAll('.skel-row').forEach(r => r.remove());
        c.querySelectorAll('.skel-grid').forEach(r => r.remove());
        c.querySelectorAll('.skel-card').forEach(r => r.remove());
        c.querySelectorAll('.skel-bar').forEach(r => r.remove());
    } catch (err) {
        ErrLog.log('[table-utils.js]', err?.message || String(err), err?.stack || null, 'TABLE_UTILS_ERROR');
    }
}

export function showSkeleton(section, containerId, tableId, headerHTML, colCount) {
    try {
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
            requestAnimationFrame(() => { 
                try {
                    makeColumnsResizable(tbl); 
                    makeColumnsSortable(tbl); 
                } catch (err) {
                    ErrLog.log('[table-utils.js]', err?.message || String(err), err?.stack || null, 'TABLE_UTILS_ERROR');
                }
            });
    } catch (err) {
        ErrLog.log('[table-utils.js]', err?.message || String(err), err?.stack || null, 'TABLE_UTILS_ERROR');
    }
}