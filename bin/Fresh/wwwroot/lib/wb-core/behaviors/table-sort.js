/**
 * Table Sort — click-to-sort columns with localStorage persistence
 * ================================================================
 * Usage:
 *   import { tableSort } from '@cielovista/wb-core';
 *   tableSort(document.getElementById('myTable'));
 *
 * Or declarative:
 *   <table x-table-sort> ... </table>
 *
 * Features:
 *   - Click header to cycle: unsorted → asc → desc → asc → ...
 *   - Auto-detects value type: bytes ("12.3 MB"), dates, numbers, text
 *   - Persists sort state per table ID to localStorage
 *   - Group-aware: keeps separator rows attached to their data rows
 *
 * CSS required:
 *   th.sortable { cursor: pointer; padding-right: 26px; user-select: none; }
 *   th.sortable::after {
 *     content: '⇕'; position: absolute; right: 8px; top: 50%;
 *     transform: translateY(-50%); color: var(--border, #30363d); font-size: 10px;
 *   }
 *   th.sort-asc::after  { content: '▲'; color: var(--accent, #58a6ff); }
 *   th.sort-desc::after { content: '▼'; color: var(--accent, #58a6ff); }
 */

const STORAGE_KEY = 'wb_col_sort';

function _load() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
  catch { return {}; }
}

function _save(tableId, colIndex, dir) {
  const all = _load();
  all[tableId] = { col: colIndex, dir };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
}

/**
 * Extract a sortable value from a table cell.
 * Recognizes: bytes ("12.3 MB"), ISO dates, comma-separated numbers, text.
 * @param {HTMLTableCellElement} td
 * @returns {number|string}
 */
export function cellValue(td) {
  const raw = (td?.textContent || '').trim();

  // Bytes: "12.3 MB", "456 KB", "1.2 GB"
  const sizeMatch = raw.match(/^([\d.]+)\s*(B|KB|MB|GB)$/i);
  if (sizeMatch) {
    const n = parseFloat(sizeMatch[1]);
    const mult = { B: 1, KB: 1024, MB: 1048576, GB: 1073741824 };
    return n * (mult[sizeMatch[2].toUpperCase()] || 1);
  }

  // ISO date: "2024-07-15"
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return new Date(raw).getTime();

  // Number (with commas)
  const n = parseFloat(raw.replace(/,/g, ''));
  if (!isNaN(n) && raw !== '') return n;

  // Text fallback
  return raw.toLowerCase();
}

/**
 * Sort table rows by column index.
 * @param {HTMLTableElement} table
 * @param {number} colIndex
 * @param {'asc'|'desc'} dir
 * @param {Object} [opts]
 * @param {string} [opts.groupSepClass='group-sep'] — class name for group separator rows
 */
export function sortTable(table, colIndex, dir, opts = {}) {
  const tbody = table.querySelector('tbody');
  if (!tbody) return;

  const groupSepClass = opts.groupSepClass || 'group-sep';
  const hasGroups = tbody.querySelector(`.${groupSepClass}`);

  if (hasGroups) {
    // Group-aware sort: keep separator rows attached to their data rows
    const groups = [];
    let current = null;
    [...tbody.children].forEach(tr => {
      if (tr.classList.contains(groupSepClass)) {
        current = { sep: tr, rows: [] };
        groups.push(current);
      } else if (current) {
        current.rows.push(tr);
      }
    });
    groups.sort((a, b) => {
      const av = cellValue(a.rows[0]?.cells[colIndex]);
      const bv = cellValue(b.rows[0]?.cells[colIndex]);
      return av < bv ? (dir === 'asc' ? -1 : 1)
           : av > bv ? (dir === 'asc' ? 1 : -1) : 0;
    });
    groups.forEach(g => {
      tbody.appendChild(g.sep);
      g.rows.forEach(r => tbody.appendChild(r));
    });
  } else {
    // Standard flat sort
    const rows = [...tbody.querySelectorAll('tr')];
    rows.sort((a, b) => {
      const av = cellValue(a.cells[colIndex]);
      const bv = cellValue(b.cells[colIndex]);
      return av < bv ? (dir === 'asc' ? -1 : 1)
           : av > bv ? (dir === 'asc' ? 1 : -1) : 0;
    });
    rows.forEach(r => tbody.appendChild(r));
  }
}

/**
 * Make table columns sortable via click.
 * @param {HTMLTableElement} table
 * @param {Object} [opts]
 * @param {string} [opts.groupSepClass] — class for group separator rows
 * @returns {() => void} cleanup function
 */
export function tableSort(table, opts = {}) {
  if (!table || table.dataset.wbSortable) return () => {};
  table.dataset.wbSortable = '1';

  const thead = table.querySelector('thead');
  if (!thead) return () => {};
  const ths = [...thead.querySelectorAll('th')];
  const listeners = [];

  // Restore saved sort
  const saved = _load()[table.id];

  ths.forEach((th, colIndex) => {
    const label = th.textContent.replace(/[⇕▲▼]/g, '').trim();
    if (!label) return; // skip empty headers (checkbox columns)

    th.classList.add('sortable');

    // Apply saved state
    if (saved?.col === colIndex) {
      th.classList.add(saved.dir === 'asc' ? 'sort-asc' : 'sort-desc');
      sortTable(table, colIndex, saved.dir, opts);
    }

    const handler = (e) => {
      // Don't trigger if clicking a resize handle
      if (e.target.classList.contains('col-resize-handle')) return;

      const wasAsc = th.classList.contains('sort-asc');
      const wasDesc = th.classList.contains('sort-desc');

      // Clear all indicators
      ths.forEach(t => t.classList.remove('sort-asc', 'sort-desc'));

      const dir = !wasAsc && !wasDesc ? 'asc' : wasAsc ? 'desc' : 'asc';
      th.classList.add(dir === 'asc' ? 'sort-asc' : 'sort-desc');

      sortTable(table, colIndex, dir, opts);
      _save(table.id, colIndex, dir);
    };

    th.addEventListener('click', handler);
    listeners.push({ th, handler });
  });

  // Cleanup
  return () => {
    listeners.forEach(({ th, handler }) => th.removeEventListener('click', handler));
    ths.forEach(t => t.classList.remove('sortable', 'sort-asc', 'sort-desc'));
    delete table.dataset.wbSortable;
  };
}

export default tableSort;
