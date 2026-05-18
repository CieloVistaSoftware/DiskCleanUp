import { fmtBytes } from '/lib/wb-core/utils/format.js';
import { ErrLog } from '/js/error-logger.js';

const _grids = {};

// ── Public API ───────────────────────────────────────────────────────────
export function create(id, containerId, columns, opts = {}) {
    try {
        const container = document.getElementById(containerId);
        if (!container) return;

        const allColumns = [];
        if (opts.lineNumbers !== false) {
            allColumns.push({ key: '_lineNo', label: '#', width: 36, type: 'lineNo' });
        }
        allColumns.push(...columns);

        if (opts.actions?.length) {
            const actWidth = Math.max(40, opts.actions.length * 36);
            allColumns.push({ key: '_actions', label: '', width: actWidth, type: 'actions' });
        }

        const cols = allColumns.map((c, i) => ({
            ...c,
            _idx: i,
            _template: c.flex
                ? `minmax(${c.minWidth || 80}px, ${c.flex}fr)`
                : `${c.width || 80}px`,
        }));
        const gridTemplate = cols.map(c => c._template).join(' ');

        container.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'sg-header';
        header.style.gridTemplateColumns = gridTemplate;
        cols.forEach((c, i) => {
            const cell = document.createElement('div');
            cell.className = 'sg-hcell';
            cell.textContent = c.label || '';
            cell.title = c.label || '';
            cell.dataset.colIdx = i;

            if (c.type !== 'checkbox' && c.type !== 'lineNo' && c.type !== 'actions') {
                cell.classList.add('sg-sortable');
                cell.addEventListener('click', (e) => {
                    if (e.target.classList.contains('sg-resize-handle')) return;
                    try {
                        _sortColumn(id, i);
                    } catch (err) {
                        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
                    }
                });
            }

            if (i < cols.length - 1) {
                const handle = document.createElement('div');
                handle.className = 'sg-resize-handle';
                handle.addEventListener('mousedown', (e) => {
                    try {
                        _startResize(e, id, i);
                    } catch (err) {
                        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
                    }
                });
                cell.appendChild(handle);
            }
            header.appendChild(cell);
        });

        const body = document.createElement('div');
        body.className = 'sg-body';
        body.id = `dg-body-${id}`;
        container.appendChild(header);
        container.appendChild(body);

        _grids[id] = {
            containerId,
            columns: cols,
            gridTemplate,
            body,
            header,
            rows: [],
            rowData: [],
            sortCol: -1,
            sortDir: 0,
            opts,
            _frag: null,
            _flushScheduled: false,
        };
        return _grids[id];
    } catch (err) {
        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
    }
}

export function addRow(id, data) {
    try {
        const g = _grids[id];
        if (!g) return null;

        const row = document.createElement('div');
        row.className = `sg-row ${g.opts.rowClass || ''}`.trim();
        row.style.gridTemplateColumns = g.header.style.gridTemplateColumns;
        const rowNum = g.rows.length + 1;

        row._dgData = data;

        if (data._dataAttrs) {
            for (const [k, v] of Object.entries(data._dataAttrs)) {
                row.dataset[k] = v;
            }
        }

        g.columns.forEach(col => {
            const cell = document.createElement('div');
            cell.className = 'sg-cell';
            switch (col.type) {
                case 'lineNo':
                    cell.classList.add('sg-lineno');
                    cell.textContent = rowNum;
                    break;
                case 'checkbox': {
                    const cb = document.createElement('input');
                    cb.type = 'checkbox';
                    if (data[col.key] !== undefined) cb.dataset.value = data[col.key];
                    if (col.dataKey) cb.dataset[col.dataKey] = data[col.dataKey] || '';
                    if (data._disabled) cb.disabled = true;
                    cell.appendChild(cb);
                    break;
                }
                case 'size':
                    cell.textContent = fmtBytes(data[col.key] || 0);
                    cell.dataset.sortVal = data[col.key] || 0;
                    break;
                case 'badge': {
                    const val = data[col.key] || '';
                    const cls = col.badgeClass || data._badgeClass || 'orange';
                    cell.innerHTML = `<span class="badge ${_esc(cls)}">${_esc(val)}</span>`;
                    break;
                }
                case 'html':
                    cell.innerHTML = data[col.key] || '';
                    break;
                case 'actions': {
                    cell.classList.add('sg-actions');
                    for (const action of (g.opts.actions || [])) {
                        const btn = document.createElement('button');
                        btn.className = action.className || 'btn muted btn-xs';
                        btn.textContent = action.icon || '';
                        btn.title = action.title || '';
                        if (data._disabled && action.disableOnRow) btn.disabled = true;
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            try {
                                action.onClick?.(data, row);
                            } catch (err) {
                                ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
                            }
                        };
                        cell.appendChild(btn);
                    }
                    break;
                }
                default:
                    cell.textContent = data[col.key] ?? '';
                    cell.title = data[col.key] ?? '';
                    break;
            }
            row.appendChild(cell);
        });

        if (g.opts.onRowClick) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('input')) return;
                try {
                    g.opts.onRowClick(data, row);
                } catch (err) {
                    ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
                }
            });
        }

        g.rows.push(row);
        g.rowData.push(data);

        if (!g._frag) g._frag = document.createDocumentFragment();
        g._frag.appendChild(row);
        if (!g._flushScheduled) {
            g._flushScheduled = true;
            queueMicrotask(() => {
                try {
                    if (g._frag) {
                        g.body.appendChild(g._frag);
                        g._frag = null;
                    }
                    g._flushScheduled = false;
                } catch (err) {
                    ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
                }
            });
        }
        return row;
    } catch (err) {
        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
    }
}

function _startResize(e, id, colIdx) {
    try {
        e.preventDefault();
        e.stopPropagation();
        const g = _grids[id];
        if (!g) return;

        const handle = e.target;
        handle.classList.add('sg-dragging');
        const hCells = g.header.children;
        const widths = Array.from(hCells).map(c => c.getBoundingClientRect().width);
        _resizeState = { id, colIdx, startX: e.clientX, widths: [...widths], handle };

        document.addEventListener('mousemove', _onResizeMove);
        document.addEventListener('mouseup', _onResizeEnd);
    } catch (err) {
        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
    }
}

function _onResizeMove(e) {
    try {
        if (!_resizeState) return;
        const { id, colIdx, startX, widths } = _resizeState;
        const g = _grids[id];
        if (!g) return;

        const delta = e.clientX - startX;
        const newW = Math.max(50, widths[colIdx] + delta);
        const updated = [...widths];
        updated[colIdx] = newW;
        const template = updated.map(w => `${Math.round(w)}px`).join(' ');

        g.header.style.gridTemplateColumns = template;
        for (const row of g.body.children) {
            row.style.gridTemplateColumns = template;
        }
    } catch (err) {
        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
    }
}

function _onResizeEnd() {
    try {
        if (!_resizeState) return;
        const { id, handle } = _resizeState;
        handle.classList.remove('sg-dragging');
        const g = _grids[id];
        if (g) {
            const hCells = g.header.children;
            const widths = Array.from(hCells).map(c => `${Math.round(c.getBoundingClientRect().width)}px`);
            const template = widths.join(' ');
            g.header.style.gridTemplateColumns = template;
            g.gridTemplate = template;
        }
        _resizeState = null;
        document.removeEventListener('mousemove', _onResizeMove);
        document.removeEventListener('mouseup', _onResizeEnd);
    } catch (err) {
        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
    }
}

function _sortColumn(id, colIdx) {
    try {
        const g = _grids[id];
        if (!g) return;

        if (g.sortCol === colIdx) {
            g.sortDir = g.sortDir === 1 ? -1 : (g.sortDir === -1 ? 0 : 1);
        } else {
            g.sortCol = colIdx;
            g.sortDir = 1;
        }

        g.header.querySelectorAll('.sg-hcell').forEach((c, i) => {
            c.classList.remove('sg-sort-asc', 'sg-sort-desc');
            if (i === colIdx) {
                if (g.sortDir === 1) c.classList.add('sg-sort-asc');
                else if (g.sortDir === -1) c.classList.add('sg-sort-desc');
            }
        });

        if (g.sortDir === 0) {
            g.rows.forEach(r => g.body.appendChild(r));
            return;
        }

        const col = g.columns[colIdx];
        const sorted = [...g.rows].sort((a, b) => {
            const cellA = a.children[colIdx];
            const cellB = b.children[colIdx];
            let va, vb;
            if (col.type === 'size') {
                va = parseFloat(cellA.dataset.sortVal) || 0;
                vb = parseFloat(cellB.dataset.sortVal) || 0;
            } else {
                va = (cellA.textContent || '').toLowerCase();
                vb = (cellB.textContent || '').toLowerCase();
            }
            if (va < vb) return -1 * g.sortDir;
            if (va > vb) return 1 * g.sortDir;
            return 0;
        });
        sorted.forEach(r => g.body.appendChild(r));
    } catch (err) {
        ErrLog.log('[data-grid.js]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
    }
}