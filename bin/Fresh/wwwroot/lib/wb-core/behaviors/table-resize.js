/**
 * Table Resize — draggable column widths with localStorage persistence
 * ====================================================================
 * Usage:
 *   import { tableResize } from '@cielovista/wb-core';
 *   tableResize(document.getElementById('myTable'));
 *
 * Features:
 *   - Drag handles on column headers
 *   - Columns grow/shrink independently (table can exceed container)
 *   - Container scrolls horizontally when table overflows
 *   - Persists widths per table ID to localStorage
 *   - Min column width: 40px
 *
 * CSS required:
 *   th { position: relative; }
 *   th .col-resize-handle {
 *     position: absolute; right: 0; top: 0; bottom: 0;
 *     width: 5px; cursor: col-resize; background: transparent;
 *     transition: background .15s; z-index: 2;
 *   }
 *   th .col-resize-handle:hover,
 *   th .col-resize-handle.dragging { background: var(--accent, #58a6ff); }
 */

const STORAGE_KEY = 'wb_col_widths';

function _load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function _save(tableId, widths) {
  const all = _load();
  all[tableId] = widths;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

function _lockLayout(table, ths) {
  // Snapshot current computed widths → explicit px on each th
  const widths = ths.map(t => t.getBoundingClientRect().width);
  ths.forEach((t, i) => { t.style.width = widths[i] + 'px'; });

  // Fixed layout so browser respects our explicit widths exactly
  table.style.tableLayout = 'fixed';
  // Total width = sum of columns (not 100%) so growing one column grows the table
  table.style.width = widths.reduce((a, b) => a + b, 0) + 'px';

  // Scroll container if table overflows
  const parent = table.parentElement;
  if (parent) parent.style.overflowX = 'auto';
}

function _recalcTableWidth(table, ths) {
  let total = 0;
  ths.forEach(t => { total += parseFloat(t.style.width) || t.getBoundingClientRect().width; });
  table.style.width = total + 'px';
}

/**
 * Make table columns resizable via drag handles.
 * @param {HTMLTableElement} table
 * @param {Object} [opts]
 * @param {number} [opts.minWidth=40] — minimum column width in px
 * @returns {() => void} cleanup function
 */
export function tableResize(table, opts = {}) {
  if (!table || table.dataset.wbResizable) return () => {};
  table.dataset.wbResizable = '1';

  const minWidth = opts.minWidth || 40;
  const ths = [...table.querySelectorAll('thead th')];
  const handles = [];
  let locked = false;

  // Restore saved widths
  const saved = _load()[table.id];
  if (saved && Object.keys(saved).length) {
    ths.forEach((th, i) => { if (saved[i]) th.style.width = saved[i] + 'px'; });
    table.style.tableLayout = 'fixed';
    let total = 0;
    ths.forEach(t => { total += parseFloat(t.style.width) || 0; });
    if (total > 0) table.style.width = total + 'px';
    const parent = table.parentElement;
    if (parent) parent.style.overflowX = 'auto';
    locked = true;
  }

  ths.forEach((th, colIndex) => {
    if (th.getBoundingClientRect().width < 20) return;

    const handle = document.createElement('div');
    handle.className = 'col-resize-handle';
    th.appendChild(handle);
    handles.push({ th, handle });

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      // First drag? Lock layout with explicit pixel widths
      if (!locked) {
        _lockLayout(table, ths);
        locked = true;
      }

      const startX = e.clientX;
      const startW = th.getBoundingClientRect().width;
      handle.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';

      const onMove = (ev) => {
        const newWidth = Math.max(minWidth, startW + (ev.clientX - startX));
        th.style.width = newWidth + 'px';
        // Recalc total table width so it actually grows
        _recalcTableWidth(table, ths);
      };

      const onUp = () => {
        handle.classList.remove('dragging');
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        // Save all widths (as numbers)
        const widths = {};
        ths.forEach((t, i) => { widths[i] = Math.round(parseFloat(t.style.width)); });
        _save(table.id, widths);
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });

  return () => {
    handles.forEach(({ th, handle }) => handle.remove());
    delete table.dataset.wbResizable;
  };
}

export default tableResize;
