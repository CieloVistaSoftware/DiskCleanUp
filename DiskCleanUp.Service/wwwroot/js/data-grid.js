// ═══════════════════════════════════════════════════════════════════════════
//  DATA-GRID — Reusable CSS-grid component for non-scan data views
//  Mirrors scan-grid.js visual style: resizable columns, sortable,
//  fragment batching, skeleton loading. NO scan-specific features
//  (no extension colors, no trash queue, no scan-filter integration).
//
//  One-time-one-place: this is the single grid system for recycle-bin,
//  savings, task-manager, error-viewer, and any future data views.
//  Scan sections use scan-grid.js instead.
//
//  Usage:
//    import * as DG from './data-grid.js';
//    const grid = DG.create('myGrid', 'containerId', [
//      { key: 'name', label: 'Name',  flex: 1 },
//      { key: 'size', label: 'Size',  width: 80, type: 'size' },
//    ]);
//    DG.addRow('myGrid', { name: 'hello', size: 1234 });
// ═══════════════════════════════════════════════════════════════════════════
import { fmtBytes } from '/lib/wb-core/utils/format.js';
import { ErrLog } from './error-logger.js';
const _grids = {};
function _dgErr(err) {
    ErrLog.log('[data-grid]', err?.message || String(err), err?.stack || null, 'DATA_GRID_ERROR');
}
// ── Public API ───────────────────────────────────────────────────────────
/**
 * Create (or recreate) a grid in a container.
 * @param {string} id        - Unique grid identifier
 * @param {string} containerId - DOM element id to mount into
 * @param {Array}  columns   - Column definitions
 * @param {Object} opts      - Options: { rowClass, onRowClick, actions }
 *   actions: Array of { icon, title, className, onClick(rowData, rowEl) }
 */
export function create(id, containerId, columns, opts = {}) {
    try {
        const container = document.getElementById(containerId);
        if (!container)
            return;
        // Auto-prepend line-number column unless opted out
        const allColumns = [];
        if (opts.lineNumbers !== false) {
            allColumns.push({ key: '_lineNo', label: '#', width: 36, type: 'lineNo' });
        }
        allColumns.push(...columns);
        // Auto-append actions column if actions provided
        if (opts.actions?.length) {
            const actWidth = Math.max(40, opts.actions.length * 36);
            allColumns.push({ key: '_actions', label: '', width: actWidth, type: 'actions' });
        }
        const cols = allColumns.map((c, i) => ({
            ...c, _idx: i,
            _template: c.flex
                ? `minmax(${c.minWidth || 80}px, ${c.flex}fr)`
                : `${c.width || 80}px`,
        }));
        const gridTemplate = cols.map(c => c._template).join(' ');
        container.innerHTML = '';
        // Header
        const header = document.createElement('div');
        header.className = 'sg-header';
        header.style.gridTemplateColumns = gridTemplate;
        cols.forEach((c, i) => {
            const cell = document.createElement('div');
            cell.className = 'sg-hcell';
            cell.textContent = c.label || '';
            cell.title = c.label || '';
            cell.dataset.colIdx = String(i);
            // Sortable (skip checkbox, lineNo, actions)
            if (c.type !== 'checkbox' && c.type !== 'lineNo' && c.type !== 'actions') {
                cell.classList.add('sg-sortable');
                cell.addEventListener('click', (e) => {
                    if (e.target.classList.contains('sg-resize-handle'))
                        return;
                    _sortColumn(id, i);
                });
            }
            // Resize handle (all but last)
            if (i < cols.length - 1) {
                const handle = document.createElement('div');
                handle.className = 'sg-resize-handle';
                handle.addEventListener('mousedown', (e) => _startResize(e, id, i));
                cell.appendChild(handle);
            }
            header.appendChild(cell);
        });
        // Body
        const body = document.createElement('div');
        body.className = 'sg-body';
        body.id = `dg-body-${id}`;
        container.appendChild(header);
        container.appendChild(body);
        _grids[id] = {
            containerId, columns: cols, gridTemplate, body, header,
            rows: [], rowData: [], sortCol: -1, sortDir: 0,
            opts, _frag: null, _flushScheduled: false,
        };
        return _grids[id];
    }
    catch (err) {
        _dgErr(err);
    }
}
/**
 * Add a data row. Uses DocumentFragment batching (same as scan-grid).
 * @param {string} id   - Grid identifier
 * @param {Object} data - Row data keyed by column keys
 * @returns {HTMLElement} The row element
 */
export function addRow(id, data) {
    try {
        const g = _grids[id];
        if (!g)
            return null;
        const row = document.createElement('div');
        row.className = `sg-row ${g.opts.rowClass || ''}`.trim();
        row.style.gridTemplateColumns = g.header.style.gridTemplateColumns;
        const rowNum = g.rows.length + 1;
        // Store raw data for sorting + callbacks
        row._dgData = data;
        // Copy data-* attributes from data object
        if (data._dataAttrs) {
            for (const [k, v] of Object.entries(data._dataAttrs)) {
                row.dataset[k] = String(v);
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
                    if (data[col.key] !== undefined)
                        cb.dataset.value = data[col.key];
                    if (col.dataKey)
                        cb.dataset[col.dataKey] = data[col.dataKey] || '';
                    if (data._disabled)
                        cb.disabled = true;
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
                        if (data._disabled && action.disableOnRow)
                            btn.disabled = true;
                        btn.onclick = (e) => {
                            e.stopPropagation();
                            action.onClick?.(data, row);
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
        // Row click handler
        if (g.opts.onRowClick) {
            row.style.cursor = 'pointer';
            row.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('input'))
                    return;
                g.opts.onRowClick(data, row);
            });
        }
        g.rows.push(row);
        g.rowData.push(data);
        // Fragment batching — same pattern as scan-grid
        if (!g._frag)
            g._frag = document.createDocumentFragment();
        g._frag.appendChild(row);
        if (!g._flushScheduled) {
            g._flushScheduled = true;
            queueMicrotask(() => {
                if (g._frag) {
                    g.body.appendChild(g._frag);
                    g._frag = null;
                }
                g._flushScheduled = false;
            });
        }
        return row;
    }
    catch (err) {
        _dgErr(err);
        return null;
    }
}
/**
 * Add multiple rows at once (convenience wrapper).
 */
export function addRows(id, dataArray) {
    try {
        for (const data of dataArray)
            addRow(id, data);
    }
    catch (err) {
        _dgErr(err);
    }
}
/**
 * Clear all rows from a grid.
 */
export function clear(id) {
    try {
        const g = _grids[id];
        if (!g)
            return;
        g.body.innerHTML = '';
        g.rows = [];
        g.rowData = [];
        g._frag = null;
        g._flushScheduled = false;
    }
    catch (err) {
        _dgErr(err);
    }
}
/**
 * Destroy grid entirely (remove from DOM + registry).
 */
export function destroy(id) {
    try {
        const g = _grids[id];
        if (!g)
            return;
        const container = document.getElementById(g.containerId);
        if (container)
            container.innerHTML = '';
        delete _grids[id];
    }
    catch (err) {
        _dgErr(err);
    }
}
/**
 * Show skeleton loading rows.
 */
export function showSkeleton(id, containerId, columns, opts = {}) {
    try {
        create(id, containerId, columns, opts);
        const g = _grids[id];
        if (!g)
            return;
        for (let i = 0; i < 5; i++) {
            const row = document.createElement('div');
            row.className = 'sg-row sg-skel-row';
            row.style.gridTemplateColumns = g.header.style.gridTemplateColumns;
            g.columns.forEach(() => {
                const cell = document.createElement('div');
                cell.className = 'sg-cell';
                cell.innerHTML = `<span class="skel-bar skel-w-${i % 6}"></span>`;
                row.appendChild(cell);
            });
            g.body.appendChild(row);
        }
    }
    catch (err) {
        _dgErr(err);
    }
}
export function removeSkeleton(id) {
    try {
        const g = _grids[id];
        if (!g)
            return;
        g.body.querySelectorAll('.sg-skel-row').forEach(r => r.remove());
    }
    catch (err) {
        _dgErr(err);
    }
}
/**
 * Get checked checkbox values from a grid.
 * @param {string} id - Grid identifier
 * @param {string} dataKey - Dataset key to read from checkboxes (default: 'value')
 * @returns {string[]}
 */
export function getChecked(id, dataKey = 'value') {
    try {
        const g = _grids[id];
        if (!g)
            return [];
        return [...g.body.querySelectorAll('input[type=checkbox]:checked')]
            .map(cb => cb.dataset[dataKey])
            .filter(Boolean);
    }
    catch (err) {
        _dgErr(err);
        return [];
    }
}
/**
 * Select/deselect all visible checkboxes.
 */
export function selectAll(id, checked) {
    try {
        const g = _grids[id];
        if (!g)
            return;
        g.body.querySelectorAll('input[type=checkbox]:not(:disabled)').forEach(cb => {
            if (checked && cb.closest('.sg-row')?.style.display === 'none')
                return;
            cb.checked = checked;
        });
    }
    catch (err) {
        _dgErr(err);
    }
}
/**
 * Get row count.
 */
export function rowCount(id) {
    try {
        const g = _grids[id];
        return g ? g.rows.length : 0;
    }
    catch (err) {
        _dgErr(err);
        return 0;
    }
}
/**
 * Filter rows by a predicate function.
 * @param {string} id - Grid identifier
 * @param {Function} predicate - (rowData) => boolean
 * @returns {{ shown: number, total: number }}
 */
export function filter(id, predicate) {
    try {
        const g = _grids[id];
        if (!g)
            return { shown: 0, total: 0 };
        let shown = 0;
        g.rows.forEach((row, i) => {
            const vis = predicate(g.rowData[i]);
            row.style.display = vis ? '' : 'none';
            if (vis)
                shown++;
        });
        return { shown, total: g.rows.length };
    }
    catch (err) {
        _dgErr(err);
        return { shown: 0, total: 0 };
    }
}
/**
 * Remove a specific row by index.
 */
export function removeRow(id, index) {
    try {
        const g = _grids[id];
        if (!g || index < 0 || index >= g.rows.length)
            return;
        g.rows[index].remove();
        g.rows.splice(index, 1);
        g.rowData.splice(index, 1);
    }
    catch (err) {
        _dgErr(err);
    }
}
// ═══════════════════════════════════════════════════════════════════════════
//  INTERNAL
// ═══════════════════════════════════════════════════════════════════════════
function _esc(s) {
    if (!s)
        return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
// ── Column Resize (mirrors scan-grid) ────────────────────────────────────
let _resizeState = null;
function _startResize(e, id, colIdx) {
    e.preventDefault();
    e.stopPropagation();
    const g = _grids[id];
    if (!g)
        return;
    const handle = e.target;
    handle.classList.add('sg-dragging');
    const hCells = g.header.children;
    const widths = Array.from(hCells).map(c => c.getBoundingClientRect().width);
    _resizeState = { id, colIdx, startX: e.clientX, widths: [...widths], handle };
    document.addEventListener('mousemove', _onResizeMove);
    document.addEventListener('mouseup', _onResizeEnd);
}
function _onResizeMove(e) {
    if (!_resizeState)
        return;
    const { id, colIdx, startX, widths } = _resizeState;
    const g = _grids[id];
    if (!g)
        return;
    const delta = e.clientX - startX;
    const newW = Math.max(50, widths[colIdx] + delta);
    const updated = [...widths];
    updated[colIdx] = newW;
    const template = updated.map(w => `${Math.round(w)}px`).join(' ');
    g.header.style.gridTemplateColumns = template;
    for (const row of g.body.children) {
        row.style.gridTemplateColumns = template;
    }
}
function _onResizeEnd() {
    if (!_resizeState)
        return;
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
}
// ── Column Sort ──────────────────────────────────────────────────────────
function _sortColumn(id, colIdx) {
    const g = _grids[id];
    if (!g)
        return;
    if (g.sortCol === colIdx) {
        g.sortDir = g.sortDir === 1 ? -1 : (g.sortDir === -1 ? 0 : 1);
    }
    else {
        g.sortCol = colIdx;
        g.sortDir = 1;
    }
    // Update header sort indicators
    g.header.querySelectorAll('.sg-hcell').forEach((c, i) => {
        c.classList.remove('sg-sort-asc', 'sg-sort-desc');
        if (i === colIdx) {
            if (g.sortDir === 1)
                c.classList.add('sg-sort-asc');
            else if (g.sortDir === -1)
                c.classList.add('sg-sort-desc');
        }
    });
    // Reset to original order
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
        }
        else {
            va = (cellA.textContent || '').toLowerCase();
            vb = (cellB.textContent || '').toLowerCase();
        }
        if (va < vb)
            return -1 * g.sortDir;
        if (va > vb)
            return 1 * g.sortDir;
        return 0;
    });
    sorted.forEach(r => g.body.appendChild(r));
}
//# sourceMappingURL=data-grid.js.map