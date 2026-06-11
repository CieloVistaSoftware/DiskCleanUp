import { logError } from '../utils/error-logger.js';
/**
 * GridShell — Core Grid Engine
 *
 * Unified grid system that replaces:
 * - scan-grid.js (12 sections)
 * - data-grid.js (savings, tasks)
 * - GridView MVVM renderer (duplicates)
 *
 * Architecture:
 * - CSS Grid (not <table>)
 * - Fragment batching via queueMicrotask (zero layout thrash)
 * - Column type registry (lineNo, checkbox, text, size, badge, html, actions, path, paths)
 * - Sortable, resizable headers
 * - Row animations (live-row fade-in, keep-flash removal)
 * - Skeleton loading state
 *
 * API:
 * - create(id, containerId, columns, opts)
 * - addRow(id, data), addRows(id, dataArray)
 * - clear(id), destroy(id)
 * - getChecked(id, dataKey?), selectAll(id, checked)
 * - removeByPath(path, id?), removeByPaths(paths)
 * - filter(id, predicate) → { shown, total }
 * - showSkeleton(id), removeSkeleton(id)
 * - hasRows(id), rowCount(id)
 */
// ─── Grid Instance Registry ────────────────────────────────────────────────────
const grids = new Map();
// ─── Column Type Definitions ───────────────────────────────────────────────────
const ColumnTypes = {
    lineNo: {
        width: '36px',
        render: (value, data) => `<div class="sg-cell-lineNo">${value}</div>`
    },
    checkbox: {
        width: '56px',
        render: (value, data) => `<input type="checkbox" class="sg-checkbox" data-path="${data.path || ''}" />`
    },
    text: {
        width: 'auto',
        render: (value) => `<div class="sg-cell-text">${escapeHtml(String(value || ''))}</div>`
    },
    size: {
        width: '90px',
        render: (value) => {
            const bytes = Number(value) || 0;
            const formatted = formatBytes(bytes);
            return `<div class="sg-cell-size" data-sortVal="${bytes}">${formatted}</div>`;
        }
    },
    badge: {
        width: 'auto',
        render: (value) => `<span class="sg-badge ${value.color || ''}">${escapeHtml(value.label || '')}</span>`
    },
    html: {
        width: 'auto',
        render: (value) => `<div class="sg-cell-html">${value}</div>` // TRUSTED SOURCE ONLY
    },
    actions: {
        width: 'auto',
        render: (value, data) => `<div class="sg-actions"></div>` // Populated by RowActions
    },
    path: {
        width: 'flex(3, min 150px)',
        render: (value, data, colorFn) => {
            const color = colorFn ? colorFn(value) : '#999';
            const dot = `<span class="sg-dot" style="background-color:${color}"></span>`;
            return `<div class="sg-cell-path">${dot} <span>${escapeHtml(value)}</span></div>`;
        }
    },
    paths: {
        width: 'flex(3, min 150px)',
        render: (items, data) => {
            // Array of sub-items with inline actions
            return `<div class="sg-cell-paths">${items.map(item => `<div class="sg-subitem">${escapeHtml(item)}</div>`).join('')}</div>`;
        }
    }
};
// ─── Utility Functions ─────────────────────────────────────────────────────────
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
function formatBytes(bytes) {
    if (!bytes)
        return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
// ─── Fragment Batching System ──────────────────────────────────────────────────
class FragmentBatcher {
    constructor() {
        this.pending = [];
        this.scheduled = false;
        this.batchedFragment = null;
        this.pending = [];
        this.scheduled = false;
    }
    add(element) {
        this.pending.push(element);
        if (!this.scheduled) {
            this.scheduled = true;
            queueMicrotask(() => this.flush());
        }
    }
    flush() {
        if (!this.pending.length)
            return;
        const fragment = document.createDocumentFragment();
        this.pending.forEach(el => fragment.appendChild(el));
        // Caller will append fragment to grid body
        this.batchedFragment = fragment;
        this.pending = [];
        this.scheduled = false;
    }
    getFragment() {
        return this.batchedFragment;
    }
}
// ─── GridShell API ────────────────────────────────────────────────────────────
export const GridShell = {
    /**
     * Create a new grid
     * @param {string} id - Grid identifier
     * @param {string} containerId - ID of container element
     * @param {Array} columns - Column definitions [{ key, label, width, type }]
     * @param {Object} opts - Options
     */
    create(id, containerOrOpts, columns, opts = {}) {
        try {
            // Support both calling conventions:
            //   create(id, containerId, columns, opts)   — positional
            //   create(id, { container, columns, ... })   — options object
            let containerId, container;
            if (typeof containerOrOpts === 'object' && containerOrOpts !== null && !Array.isArray(containerOrOpts)) {
                // Options-object form
                const o = containerOrOpts;
                containerId = typeof o.container === 'string' ? o.container : null;
                container = typeof o.container === 'string' ? document.getElementById(o.container) : o.container;
                columns = o.columns || columns || [];
                opts = o;
            }
            else {
                containerId = containerOrOpts;
                container = document.getElementById(containerId);
            }
            if (!container) {
                console.error(`GridShell.create(): Container not found: ${containerId}`);
                return;
            }
            // Apply defaults
            const options = {
                lineNumbers: opts.lineNumbers !== false,
                rowClass: opts.rowClass || null,
                onRowClick: opts.onRowClick || null,
                onRowDblClick: opts.onRowDblClick || null,
                actions: opts.actions || [],
                colorFn: opts.colorFn || null,
                legendEnabled: opts.legendEnabled || false,
                persistWidths: opts.persistWidths !== false,
                skeletonRows: opts.skeletonRows || 5
            };
            // Create grid DOM structure
            const gridEl = document.createElement('div');
            gridEl.id = `sg-${id}`;
            gridEl.className = 'sg-grid';
            const headerEl = document.createElement('div');
            headerEl.className = 'sg-header';
            const bodyEl = document.createElement('div');
            bodyEl.className = 'sg-body';
            gridEl.appendChild(headerEl);
            gridEl.appendChild(bodyEl);
            container.appendChild(gridEl);
            // Build CSS Grid template
            const colWidths = columns
                .map(col => col.width || 'auto')
                .join(' ');
            gridEl.style.gridTemplateColumns = colWidths;
            // Render header cells
            columns.forEach((col, idx) => {
                const headerCell = document.createElement('div');
                headerCell.className = 'sg-header-cell';
                headerCell.textContent = col.label || '';
                headerCell.dataset.sortable = col.sortable !== false ? 'true' : 'false';
                headerEl.appendChild(headerCell);
            });
            // Store grid state
            const grid = {
                id,
                container,
                gridEl,
                headerEl,
                bodyEl,
                columns,
                options,
                rows: [],
                rowMap: new Map(), // For quick lookups
                batcher: new FragmentBatcher(),
                skeletonShown: false,
                sortState: { column: null, direction: 'asc' } // asc, desc, original
            };
            grids.set(id, grid);
            // Auto-enable column resizing on all grids
            this.enableResize(id);
            this.restoreWidths(id);
            console.log(`GridShell: Created grid "${id}"`);
        }
        catch (err) {
            logError('[GridShell]', err, { context: `create(${id})` });
            return null;
        }
    },
    /**
     * Add a single row (fragment-batched)
     */
    addRow(id, data) {
        const grid = grids.get(id);
        if (!grid) {
            console.warn(`GridShell.addRow(): Grid not found: ${id}`);
            return;
        }
        const rowEl = this._createRowElement(grid, data);
        grid.rows.push(data);
        grid.rowMap.set(data.path || data.id, data);
        // Add to batch for non-thrashing insertion
        grid.batcher.add(rowEl);
        queueMicrotask(() => {
            const fragment = grid.batcher.getFragment();
            if (fragment) {
                grid.bodyEl.appendChild(fragment);
            }
        });
    },
    /**
     * Add multiple rows (bulk)
     */
    addRows(id, dataArray) {
        const grid = grids.get(id);
        if (!grid) {
            console.warn(`GridShell.addRows(): Grid not found: ${id}`);
            return;
        }
        const fragment = document.createDocumentFragment();
        dataArray.forEach(data => {
            const rowEl = this._createRowElement(grid, data);
            fragment.appendChild(rowEl);
            grid.rows.push(data);
            grid.rowMap.set(data.path || data.id, data);
        });
        grid.bodyEl.appendChild(fragment);
    },
    /**
     * Clear all rows in grid
     */
    clear(id) {
        const grid = grids.get(id);
        if (!grid)
            return;
        grid.bodyEl.innerHTML = '';
        grid.rows = [];
        grid.rowMap.clear();
    },
    /**
     * Remove grid entirely
     */
    destroy(id) {
        const grid = grids.get(id);
        if (!grid)
            return;
        grid.gridEl.remove();
        grids.delete(id);
    },
    /**
     * Get checked checkbox values
     */
    getChecked(id, dataKey = 'path') {
        const grid = grids.get(id);
        if (!grid)
            return [];
        const checkboxes = grid.gridEl.querySelectorAll('.sg-checkbox:checked');
        return Array.from(checkboxes).map(cb => {
            const path = cb.dataset.path;
            const data = grid.rowMap.get(path);
            return data ? data[dataKey] : path;
        });
    },
    /**
     * Toggle all visible checkboxes
     */
    selectAll(id, checked = true) {
        const grid = grids.get(id);
        if (!grid)
            return;
        const checkboxes = grid.gridEl.querySelectorAll('.sg-checkbox');
        checkboxes.forEach(cb => {
            cb.checked = checked;
        });
    },
    /**
     * Remove row(s) by path with animation
     */
    removeByPath(path, id) {
        const grid = grids.get(id);
        if (!grid)
            return;
        const data = grid.rowMap.get(path);
        if (!data)
            return;
        const rows = grid.gridEl.querySelectorAll('.sg-row');
        // Find and animate out the row with matching path
        rows.forEach(row => {
            if (row.dataset.path === path) {
                row.classList.add('sg-removing');
                setTimeout(() => {
                    row.remove();
                    grid.rows = grid.rows.filter(r => (r.path || r.id) !== path);
                    grid.rowMap.delete(path);
                }, 400);
            }
        });
    },
    /**
     * Bulk remove multiple rows
     */
    removeByPaths(paths) {
        paths.forEach(path => {
            // Find which grid contains this path
            grids.forEach((grid, id) => {
                if (grid.rowMap.has(path)) {
                    this.removeByPath(path, id);
                }
            });
        });
    },
    /**
     * Filter rows by predicate
     */
    filter(id, predicate) {
        const grid = grids.get(id);
        if (!grid)
            return { shown: 0, total: 0 };
        let shown = 0;
        const rows = grid.gridEl.querySelectorAll('.sg-row');
        rows.forEach(rowEl => {
            const path = rowEl.dataset.path;
            const data = grid.rowMap.get(path);
            if (data && predicate(data)) {
                rowEl.style.display = '';
                shown++;
            }
            else {
                rowEl.style.display = 'none';
            }
        });
        return { shown, total: grid.rows.length };
    },
    /**
     * Show skeleton loading state
     */
    showSkeleton(id, rows = 5) {
        const grid = grids.get(id);
        if (!grid || grid.skeletonShown)
            return;
        grid.bodyEl.innerHTML = '';
        for (let i = 0; i < rows; i++) {
            const skeletonRow = document.createElement('div');
            skeletonRow.className = 'sg-skeleton-row';
            grid.columns.forEach(() => {
                const skeletonCell = document.createElement('div');
                skeletonCell.className = 'sg-skeleton-cell';
                skeletonRow.appendChild(skeletonCell);
            });
            grid.bodyEl.appendChild(skeletonRow);
        }
        grid.skeletonShown = true;
    },
    /**
     * Remove skeleton loading state
     */
    removeSkeleton(id) {
        const grid = grids.get(id);
        if (!grid || !grid.skeletonShown)
            return;
        const skeletons = grid.bodyEl.querySelectorAll('.sg-skeleton-row');
        skeletons.forEach(skel => skel.remove());
        grid.skeletonShown = false;
    },
    /**
     * Query: does grid have rows?
     */
    hasRows(id) {
        const grid = grids.get(id);
        return grid ? grid.rows.length > 0 : false;
    },
    /**
     * Query: how many rows in grid?
     */
    rowCount(id) {
        const grid = grids.get(id);
        return grid ? grid.rows.length : 0;
    },
    // ─── Private Helpers ──────────────────────────────────────────────────────
    /**
     * Enable sorting on a column
     */
    enableSort(id, columnKey, compareFn) {
        const grid = grids.get(id);
        if (!grid)
            return;
        const headerCell = Array.from(grid.headerEl.children).find(cell => cell.dataset.columnKey === columnKey);
        if (!headerCell)
            return;
        headerCell.addEventListener('click', () => {
            this._handleSort(grid, columnKey, compareFn);
        });
    },
    /**
     * Enable column resizing
     */
    enableResize(id) {
        const grid = grids.get(id);
        if (!grid)
            return;
        const headerCells = Array.from(grid.headerEl.children);
        headerCells.forEach((cell, idx) => {
            const handle = document.createElement('div');
            handle.className = 'sg-resize-handle';
            handle.style.position = 'absolute';
            handle.style.right = '0';
            handle.style.top = '0';
            handle.style.height = '100%';
            handle.style.width = '4px';
            handle.style.cursor = 'col-resize';
            handle.style.userSelect = 'none';
            handle.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this._handleResizeStart(grid, idx, e);
            });
            cell.style.position = 'relative';
            cell.appendChild(handle);
        });
    },
    /**
     * Persist column widths to localStorage
     */
    saveWidths(id) {
        const grid = grids.get(id);
        if (!grid)
            return;
        const widths = Array.from(grid.headerEl.children).map(cell => cell.offsetWidth);
        localStorage.setItem(`sg-widths-${id}`, JSON.stringify(widths));
    },
    /**
     * Restore column widths from localStorage
     */
    restoreWidths(id) {
        const grid = grids.get(id);
        if (!grid)
            return;
        const stored = localStorage.getItem(`sg-widths-${id}`);
        if (!stored)
            return;
        try {
            const widths = JSON.parse(stored);
            grid.gridEl.style.gridTemplateColumns = widths
                .map(w => `${w}px`)
                .join(' ');
        }
        catch (e) {
            console.warn(`GridShell: Failed to restore widths for "${id}":`, e);
        }
    },
    // ─── Private Helpers ──────────────────────────────────────────────────────
    /**
     * Create a row DOM element
     */
    _createRowElement(grid, data) {
        const rowEl = document.createElement('div');
        rowEl.className = 'sg-row sg-live-row';
        rowEl.dataset.path = data.path || data.id || '';
        if (grid.options.rowClass) {
            rowEl.className += ' ' + grid.options.rowClass(data);
        }
        // Add line number column if enabled
        let colIndex = 0;
        if (grid.options.lineNumbers) {
            const lineCell = document.createElement('div');
            lineCell.className = 'sg-cell sg-cell-lineNo';
            lineCell.textContent = String(grid.rows.length + 1);
            rowEl.appendChild(lineCell);
            colIndex++;
        }
        // Render each column
        grid.columns.forEach((col) => {
            const cellEl = document.createElement('div');
            cellEl.className = `sg-cell sg-cell-${col.type}`;
            const value = data[col.key];
            const typeRenderer = ColumnTypes[col.type]?.render;
            if (typeRenderer) {
                cellEl.innerHTML = typeRenderer(value, data, grid.options.colorFn);
            }
            else {
                cellEl.textContent = String(value || '');
            }
            rowEl.appendChild(cellEl);
        });
        // Add click handlers
        if (grid.options.onRowClick || grid.options.onRowDblClick) {
            rowEl.addEventListener('click', () => {
                if (grid.options.onRowClick)
                    grid.options.onRowClick(data, rowEl);
            });
            rowEl.addEventListener('dblclick', () => {
                if (grid.options.onRowDblClick)
                    grid.options.onRowDblClick(data, rowEl);
            });
        }
        return rowEl;
    },
    /**
     * Handle column sort
     */
    _handleSort(grid, columnKey, compareFn) {
        const state = grid.sortState;
        const headerCells = Array.from(grid.headerEl.children);
        // Clear previous sort indicators
        headerCells.forEach(cell => {
            cell.classList.remove('sg-sort-asc', 'sg-sort-desc');
        });
        // Rotate sort direction: asc → desc → original
        if (state.column === columnKey) {
            state.direction = state.direction === 'asc' ? 'desc' : 'original';
        }
        else {
            state.column = columnKey;
            state.direction = 'asc';
        }
        // Apply sort indicator
        if (state.direction !== 'original') {
            const headerCell = headerCells.find(cell => cell.dataset.columnKey === columnKey);
            if (headerCell) {
                headerCell.classList.add(`sg-sort-${state.direction}`);
            }
            // Sort rows
            const sorted = [...grid.rows].sort((a, b) => {
                const aVal = a[columnKey];
                const bVal = b[columnKey];
                const comparison = compareFn ? compareFn(aVal, bVal) :
                    (aVal < bVal ? -1 : aVal > bVal ? 1 : 0);
                return state.direction === 'desc' ? -comparison : comparison;
            });
            // Re-render with sorted order
            this.clear(grid.id);
            this.addRows(grid.id, sorted);
        }
        else {
            // Restore original order
            this.clear(grid.id);
            grid.rows = grid.rows; // Already in original order in storage
            // Re-render
        }
    },
    /**
     * Handle resize start — updates CSS Grid template columns
     */
    _handleResizeStart(grid, colIndex, e) {
        const startX = e.clientX;
        const cells = Array.from(grid.headerEl.children);
        // Snapshot current pixel widths for all columns
        const widths = cells.map(cell => cell.offsetWidth);
        const handleMouseMove = (moveEvent) => {
            const deltaX = moveEvent.clientX - startX;
            widths[colIndex] = Math.max(40, widths[colIndex] + (moveEvent.clientX - (this._lastX || startX)));
            this._lastX = moveEvent.clientX;
            grid.gridEl.style.gridTemplateColumns = widths.map(w => `${w}px`).join(' ');
        };
        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            delete this._lastX;
            if (grid.options.persistWidths) {
                this.saveWidths(grid.id);
            }
        };
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
    }
};
//# sourceMappingURL=grid-shell.js.map