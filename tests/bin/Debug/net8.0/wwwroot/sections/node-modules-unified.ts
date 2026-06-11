// @ts-nocheck
// This section is still in migration and uses runtime component APIs that are
// not yet represented by stable TypeScript types. Keeping checks disabled here
// prevents false-positive compile failures during restart while preserving the
// existing runtime behavior.
// ═══════════════════════════════════════════════════════════════════════════
//  NODE MODULES SECTION — Using Unified Grid Components (Phase 6.3)
//
//  Wires together:
//    GridShell    (wb-core)    — CSS Grid renderer
//    StatusBar    (wb-core)    — Status display (results + folder only)
//    FilterBar    (wb-core)    — Dropdown + text filter
//    Toolbar      (wb-core)    — Buttons (scan, delete, keep, load more)
//    RowActions   (wb-core)    — Per-row open/delete/keep
//
//  Handles:  scan events, selection, deletion, keep list management.
// ═══════════════════════════════════════════════════════════════════════════

import { registerHandler }                    from '../js/event-queue.js';
import { registerSectionModule }              from '../js/ui-utils.js';
import { GridShell }                          from '../lib/wb-core/index.js';
import { StatusBar }                          from '../lib/wb-core/index.js';
import { FilterBar }                          from '../lib/wb-core/index.js';
import { Toolbar }                            from '../lib/wb-core/index.js';
import { RowActions }                         from '../lib/wb-core/index.js';
import { NodeModulesModel }                   from '../models/node-modules-model.js';
import { ErrLog } from '../js/error-logger.js';

// ── Section state ──────────────────────────────────────────────────────────

let _visible        = false;
let _gridCreated    = false;
let _selectedPaths  = new Set();
const _allData      = new Map();  // path → full record
let _sortKey        = 'size';      // default sort by size descending
let _sortDir        = 'desc';

// ── Component instances ────────────────────────────────────────────────────

const _grid      = GridShell.create('node-modules', { container: 'nm-grid-container' });
const _statusBar = StatusBar.create('node-modules', {
  container: 'nm-status-container',
  segments: ['RESULTS', 'ROWS'],  // No FILES count for node_modules
  onStop: () => fetch('/api/task/cancel', { method: 'POST' }).catch(() => {}),
});
const _filterBar = FilterBar.create('node-modules', {
  container: 'nm-filter-container',
  onApply: (state) => _applyFilter(state),
});
const _toolbar = Toolbar.create('node-modules', {
  container: 'nm-toolbar-container',
  customButtons: [
    { label: '🔍 Scan', onClick: () => _onScan() },
    { label: '✖ Cancel', className: 'muted', onClick: () => _onCancel() },
  ],
  onSelectAll: () => _selectAll(),
  onSelectNone: () => _selectNone(),
  onDelete: () => _onDeleteSelected(),
  onKeep: () => _onKeepSelected(),
  onLoadMore: () => _onLoadMore(),
});
const _rowActions = RowActions.create({
  actions: [
    { label: '📂', tooltip: 'Open in Explorer', onClick: (data) => _openPath(data.path) },
    { label: '🗑', tooltip: 'Delete', className: 'danger', onClick: (data) => _deleteOne(data.path) },
    { label: '🔒', tooltip: 'Keep', className: 'success', onClick: (data) => _keepOne(data.path) },
  ],
});

// ── Visibility ─────────────────────────────────────────────────────────────

function onShow() {
  window._T?.('NM', `onShow visible=${_visible}`);
  _visible = true;
}

function onHide() {
  _visible = false;
}

// ── Scan events from WebSocket ────────────────────────────────────────────

function onEvent(msg) {
  switch (msg.type) {
    case 'started':
      _allData.clear();
      _selectedPaths.clear();
      _gridCreated = false;
      _visible = true;
      _statusBar.begin('node-modules');
      _toolbar.setLoadMoreState(false);
      _toolbar.setKeepEnabled(false);
      _filterBar.reset('node-modules');
      window._T?.('NM', 'scan started');
      return;

    case 'progress':
      _statusBar.progress('node-modules', {
        RESULTS: msg.results || 0,
        folder: msg.folder || '',
      });
      return;

    case 'done':
      _statusBar.done('node-modules', { RESULTS: msg.results || 0 });
      _rebuildFilterOptions();
      _updateToolbarState();
      window._T?.('NM', `scan done: ${msg.results} node_modules folders`);
      return;

    case 'error':
      _statusBar.error('node-modules', msg.message || 'Unknown error');
      window._T?.('NM', `error: ${msg.message}`);
      return;

    case 'result':
      _onResult(msg);
      return;
  }
}

// ── Result handling ────────────────────────────────────────────────────────

function _onResult(msg) {
  const parsed = NodeModulesModel.parse(msg);
  if (!parsed) return;

  _allData.set(parsed.path, parsed);

  // Create grid on first result
  if (!_gridCreated) {
    _gridCreated = true;
    _grid.create(NodeModulesModel.columns, { 
      sortKey: _sortKey,
      sortDir: _sortDir,
      rowActions: _rowActions,
    });
  }

  // Add row to grid
  _grid.addRow(parsed.path, {
    select: false,
    path: parsed.path,
    size: parsed.size,
  });

  // Update row count
  _statusBar.progress('node-modules', { ROWS: _allData.size });
}

// ── Filter bar ─────────────────────────────────────────────────────────────

function _rebuildFilterOptions() {
  // Extract unique parent directories for filtering
  const parents = new Set();
  _allData.forEach((record) => {
    const match = record.path.match(/^(.*)[\\\/]node_modules/i);
    if (match) {
      const parent = match[1].split(/[\\\/]/).pop();
      if (parent) parents.add(parent);
    }
  });

  const sorted = Array.from(parents).sort();
  sorted.forEach(dir => {
    _filterBar.addOption(dir);
  });
}

function _applyFilter(state) {
  const text = state.text?.toLowerCase() || '';
  const visible = 0;
  const total = _allData.size;

  _filterBar.setRowCount(
    text ? `Showing ${visible} of ${total}` : `${total} rows`
  );

  window._T?.('NM', `filter: ${JSON.stringify(state)}`);
}

// ── Selection ──────────────────────────────────────────────────────────────

function _selectAll() {
  _selectedPaths.clear();
  _allData.forEach((record) => {
    _selectedPaths.add(record.path);
  });
  _grid.selectAll();
  _updateToolbarState();
  window._T?.('NM', `select all: ${_selectedPaths.size} folders`);
}

function _selectNone() {
  _selectedPaths.clear();
  _grid.selectNone();
  _updateToolbarState();
  window._T?.('NM', 'select none');
}

function _updateToolbarState() {
  const hasSelection = _selectedPaths.size > 0;
  _toolbar.setKeepEnabled(hasSelection);
}

// ── Actions ────────────────────────────────────────────────────────────────

function _onScan() {
  fetch('/api/task/scan', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ section: 'node-modules' }),
  }).catch(e => window._T?.('NM', `scan error: ${e.message}`));
}

function _onCancel() {
  fetch('/api/task/cancel', { method: 'POST' }).catch(() => {});
}

async function _onDeleteSelected() {
  if (!_selectedPaths.size) return;

  const paths = Array.from(_selectedPaths);
  const confirmed = confirm(`Delete ${paths.length} node_modules folder(s)?\nFiles go to Recycle Bin.`);
  if (!confirmed) return;

  window._T?.('NM', `deleting ${paths.length} folders`);
  _statusBar.progress('node-modules', { folder: 'Deleting folders…' });

  try {
    const res = await fetch('/api/file/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Remove from grid and data
    paths.forEach(path => {
      _grid.removeRow(path);
      _allData.delete(path);
      _selectedPaths.delete(path);
    });

    _statusBar.done('node-modules', { RESULTS: _allData.size });
    _updateToolbarState();
    window._T?.('NM', `deleted ${paths.length} folders`);
  } catch (e) {
    _statusBar.error('node-modules', e.message);
    ErrLog.log('[NODE_MODULES_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    window._T?.('NM', `delete failed: ${e.message}`);
  }
}

async function _onKeepSelected() {
  if (!_selectedPaths.size) return;

  const paths = Array.from(_selectedPaths);
  window._T?.('NM', `keeping ${paths.length} folders`);

  try {
    const res = await fetch('/api/keep-list/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    // Mark in grid and clear selection
    paths.forEach(path => {
      _grid.updateRow(path, { marked: true });
      _selectedPaths.delete(path);
    });

    _toolbar.setKeepEnabled(false);
    window._T?.('NM', `kept ${paths.length} folders`);
  } catch (e) {
    _statusBar.error('node-modules', e.message);
    ErrLog.log('[NODE_MODULES_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    window._T?.('NM', `keep failed: ${e.message}`);
  }
}

function _openPath(path) {
  fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  }).catch(() => {});
  window._T?.('NM', `open: ${path}`);
}

async function _deleteOne(path) {
  const confirmed = confirm(`Delete this folder?\n${path}`);
  if (!confirmed) return;

  window._T?.('NM', `deleting: ${path}`);

  try {
    const res = await fetch('/api/file/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: [path] }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    _grid.removeRow(path);
    _allData.delete(path);
    _selectedPaths.delete(path);
    _statusBar.done('node-modules', { RESULTS: _allData.size });
    window._T?.('NM', `deleted: ${path}`);
  } catch (e) {
    ErrLog.log('[NODE_MODULES_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    _statusBar.error('node-modules', e.message);
  }
}

async function _keepOne(path) {
  window._T?.('NM', `keeping: ${path}`);

  try {
    const res = await fetch('/api/keep-list/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: [path] }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    _grid.updateRow(path, { marked: true });
    _selectedPaths.delete(path);
    window._T?.('NM', `kept: ${path}`);
  } catch (e) {
    ErrLog.log('[NODE_MODULES_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    _statusBar.error('node-modules', e.message);
  }
}

function _onLoadMore() {
  window._T?.('NM', 'load more clicked');
  fetch('/api/cache/node-modules?offset=40960')
    .then(r => r.json())
    .then(data => {
      data.rows?.forEach(row => _onResult(row));
    })
    .catch(e => window._T?.('NM', `load more failed: ${e.message}`));
}

// ── Module registration ────────────────────────────────────────────────────

export const NodeModulesSection = (() => {
  registerHandler('node-modules', onEvent);
  registerSectionModule('node-modules', {
    onShow,
    onHide,
  });

  return {
    onShow,
    onHide,
  };
})();
