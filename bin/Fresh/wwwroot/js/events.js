// ═══════════════════════════════════════════════════════════════════════════
//  EVENT DELEGATION — replaces all inline onclick/oninput handlers
//  Uses data-action attributes on buttons + single document listener.
//  Routes grid-based sections through scan-grid.js, tables through ui-utils.
// ═══════════════════════════════════════════════════════════════════════════

import { startScan, cancelScan, trashSelected, applySmartDedup, deleteNMSelected, deleteEmpty, trashAllImageCopies } from './actions.js';
import { selectAllTable, showSection } from './ui-utils.js';
import { loadSavings, exportSavings, newSession } from './savings.js';
import { saveSettings } from './settings.js';
import { DuplicatesSection } from '../sections/duplicates.js';
import * as SG from './scan-grid.js';

// ── Grid-aware select / trash ────────────────────────────────────────────
function _selectAll(el, val) {
  const grid = el.dataset.grid;
  if (grid) { SG.selectAll(grid, val); return; }
  selectAllTable(el.dataset.table, val);
}

function _trashSelectedGrid(el) {
  const grid = el.dataset.grid;
  if (grid) {
    const paths = SG.getChecked(grid);
    if (!paths.length) return;
    trashSelected(null, paths);   // pass paths directly
    return;
  }
  trashSelected(el.dataset.table);
}

// ── Action dispatch map ──────────────────────────────────────────────────
const ACTIONS = {
  'scan':              (el) => startScan(el.dataset.section),
  'cancel':            (el) => cancelScan(el.dataset.section),
  'select-all':        (el) => _selectAll(el, true),
  'select-none':       (el) => _selectAll(el, false),
  'trash-selected':    (el) => _trashSelectedGrid(el),
  'trash-all-copies':  ()   => DuplicatesSection.deleteAllCopies(),
  'trash-all-image-copies': () => trashAllImageCopies(),
  'apply-smart-dedup': ()   => applySmartDedup(),
  'delete-nm-selected':()   => deleteNMSelected(),
  'delete-empty':      ()   => deleteEmpty(),
  'load-savings':      ()   => loadSavings(),
  'export-savings':    ()   => exportSavings(),
  'new-session':       ()   => newSession(),
  'save-settings':     ()   => saveSettings(),
};

// ── Click delegation on document ─────────────────────────────────────────
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;

  const handler = ACTIONS[el.dataset.action];
  if (handler) {
    e.preventDefault();
    handler(el);
  }
});

// ── Nav section switching ────────────────────────────────────────────────
document.getElementById('mainNav')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-section]');
  if (!btn) return;
  showSection(btn.dataset.section, btn);
});

// ── Input delegation (filter) ────────────────────────────────────────────
document.addEventListener('input', (e) => {
  const el = e.target.closest('[data-action="filter-duplicates"]');
  if (el) DuplicatesSection.filter(el.value);
});

export { ACTIONS };
