// ═══════════════════════════════════════════════════════════════════════════
//  COLUMN CONTROLS — powered by @cielovista/wb-core table behaviors
//  Auto-wires resizable + sortable columns on any table added to the DOM.
// ═══════════════════════════════════════════════════════════════════════════

import { tableResize } from '/lib/wb-core/behaviors/table-resize.js';
import { tableSort } from '/lib/wb-core/behaviors/table-sort.js';
import { ErrLog } from './error-logger.js';

// Re-export for direct use by other modules (e.g. table-utils.js)
export { tableResize as makeColumnsResizable, tableSort as makeColumnsSortable };

// ── MutationObserver REMOVED ─────────────────────────────────────────
// Was causing infinite RAF loop: tableResize adds DOM nodes → observer
// fires → tableResize again → infinite. Tables are now wired explicitly
// via wireTable() called from table-utils.js ensureTable().

/**
 * Explicitly wire resize + sort on a table. Called by ensureTable().
 */
export function wireTable(table) {
  try {
    if (!table || !table.id) return;
    if (!table.dataset.wbResizable) tableResize(table);
    if (!table.dataset.wbSortable)  tableSort(table);
  } catch (ex) {
    ErrLog.log('[COLUMN_CONTROLS]', ex.message, ex.stack, 'UNHANDLED_ERROR');
  }
}
