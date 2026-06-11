// ═══════════════════════════════════════════════════════════════════════════
//  LARGE FILES SECTION — Using Unified Grid Components (Phase 6.2)
//
//  Wires together:
//    GridShell    (wb-core)    — CSS Grid renderer
//    StatusBar    (wb-core)    — Status display with timer
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
import { LargeModel }                         from '../models/large-model.js';
import { ErrLog } from '../js/error-logger.js';

// ── Section state ──────────────────────────────────────────────────────────

let _visible        = false;
let _gridCreated    = false;
let _selectedPaths  = new Set();
const _allData      = new Map();  // path → full record for queued operations
let _sortKey        = 'size';      // default sort by size descending
let _sortDir        = 'desc';

// ── Component instances ────────────────────────────────────────────────────

const _grid:      any = (GridShell as any).create('large', [], { container: 'large-grid-container' });
const _statusBar: any = (StatusBar as any).create('large', {
  container: 'large-status-container',
  segments: ['FILES', 'RESULTS', 'ROWS'],
  onStop: () => fetch('/api/task/cancel', { method: 'POST' }).catch(() => {}),
});
const _filterBar: any = (FilterBar as any).create('large', {
  container: 'large-filter-container',
  onApply: (state: any) => _applyFilter(state),
});
const _toolbar: any = (Toolbar as any).create('large', {
  container: 'large-toolbar-container',
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
const _rowActions: any = (RowActions as any).create({
  actions: [
    { label: '📂', tooltip: 'Open in Explorer', onClick: (data) => _openPath(data.path) },
    { label: '🗑', tooltip: 'Delete', className: 'danger', onClick: (data) => _deleteOne(data.path) },
    { label: '🔒', tooltip: 'Keep', className: 'success', onClick: (data) => _keepOne(data.path) },
  ],
});

// ── Visibility ─────────────────────────────────────────────────────────────

function onShow() {
  window._T?.('LARGE', `onShow visible=${_visible}`);
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
      _statusBar.begin('large');
      _toolbar.setLoadMoreState(false);
      _toolbar.setKeepEnabled(false);
      _filterBar.reset('large');
      window._T?.('LARGE', 'scan started');
      return;

    case 'progress':
      _statusBar.progress('large', {
        FILES: msg.files || 0,
        RESULTS: msg.results || 0,
        folder: msg.folder || '',
      });
      return;

    case 'done':
      _statusBar.done('large', { RESULTS: msg.results || 0 });
      _rebuildFilterOptions();
      _updateToolbarState();
      window._T?.('LARGE', `scan done: ${msg.results} large files`);
      return;

    case 'error':
      _statusBar.error('large', msg.message || 'Unknown error');
      window._T?.('LARGE', `error: ${msg.message}`);
      return;

    case 'result':
      _onResult(msg);
      return;
  }
}

// ── Result handling ────────────────────────────────────────────────────────

function _onResult(msg) {
  const parsed = LargeModel.parse(msg);
  if (!parsed) return;

  _allData.set(parsed.path, parsed);

  // Create grid on first result
  if (!_gridCreated) {
    _gridCreated = true;
    _grid.create(LargeModel.columns, { 
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
  _statusBar.progress('large', { ROWS: _allData.size });
}

// ── Filter bar ─────────────────────────────────────────────────────────────

function _rebuildFilterOptions() {
  // Extract unique extensions for filtering
  const exts = new Set();
  _allData.forEach((record) => {
    const match = record.path.match(/\.([a-z0-9]+)$/i);
    if (match) exts.add(match[1].toLowerCase());
  });

  const sorted = Array.from(exts).sort();
  sorted.forEach(ext => {
    _filterBar.addOption(ext.toUpperCase());
  });
}

function _applyFilter(state) {
  // For now, simple text filter on path
  const text = state.text?.toLowerCase() || '';
  const visible = 0;
  const total = _allData.size;

  _filterBar.setRowCount(
    text ? `Showing ${visible} of ${total}` : `${total} rows`
  );

  // TODO: implement actual filtering in grid
  window._T?.('LARGE', `filter: ${JSON.stringify(state)}`);
}

// ── Selection ──────────────────────────────────────────────────────────────

function _selectAll() {
  _selectedPaths.clear();
  _allData.forEach((record) => {
    _selectedPaths.add(record.path);
  });
  _grid.selectAll();
  _updateToolbarState();
  window._T?.('LARGE', `select all: ${_selectedPaths.size} files`);
}

function _selectNone() {
  _selectedPaths.clear();
  _grid.selectNone();
  _updateToolbarState();
  window._T?.('LARGE', 'select none');
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
    body: JSON.stringify({ section: 'large' }),
  }).catch(e => window._T?.('LARGE', `scan error: ${e.message}`));
}

function _onCancel() {
  fetch('/api/task/cancel', { method: 'POST' }).catch(() => {});
}

async function _onDeleteSelected() {
  if (!_selectedPaths.size) return;

  const paths = Array.from(_selectedPaths);
  const confirmed = confirm(`Delete ${paths.length} large file(s)?\nFiles go to Recycle Bin.`);
  if (!confirmed) return;

  window._T?.('LARGE', `deleting ${paths.length} files`);
  _statusBar.progress('large', { folder: 'Deleting files…' });

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

    _statusBar.done('large', { RESULTS: _allData.size });
    _updateToolbarState();
    window._T?.('LARGE', `deleted ${paths.length} files`);
  } catch (e) {
    _statusBar.error('large', e.message);
    ErrLog.log('[LARGE_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    window._T?.('LARGE', `delete failed: ${e.message}`);
  }
}

async function _onKeepSelected() {
  if (!_selectedPaths.size) return;

  const paths = Array.from(_selectedPaths);
  window._T?.('LARGE', `keeping ${paths.length} files`);

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
    window._T?.('LARGE', `kept ${paths.length} files`);
  } catch (e) {
    _statusBar.error('large', e.message);
    ErrLog.log('[LARGE_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    window._T?.('LARGE', `keep failed: ${e.message}`);
  }
}

function _openPath(path) {
  fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  }).catch(() => {});
  window._T?.('LARGE', `open: ${path}`);
}

async function _deleteOne(path) {
  const confirmed = confirm(`Delete this file?\n${path}`);
  if (!confirmed) return;

  window._T?.('LARGE', `deleting: ${path}`);

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
    _statusBar.done('large', { RESULTS: _allData.size });
    window._T?.('LARGE', `deleted: ${path}`);
  } catch (e) {
    ErrLog.log('[LARGE_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    _statusBar.error('large', e.message);
  }
}

async function _keepOne(path) {
  window._T?.('LARGE', `keeping: ${path}`);

  try {
    const res = await fetch('/api/keep-list/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: [path] }),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    _grid.updateRow(path, { marked: true });
    _selectedPaths.delete(path);
    window._T?.('LARGE', `kept: ${path}`);
  } catch (e) {
    ErrLog.log('[LARGE_UNIFIED]', e.message, e.stack, 'CAUGHT_ERROR');
    _statusBar.error('large', e.message);
  }
}

function _onLoadMore() {
  window._T?.('LARGE', 'load more clicked');
  // TODO: implement paging via API
  fetch('/api/cache/large?offset=40960')
    .then(r => r.json())
    .then(data => {
      data.rows?.forEach(row => _onResult(row));
    })
    .catch(e => window._T?.('LARGE', `load more failed: ${e.message}`));
}

// ── Module registration ────────────────────────────────────────────────────

export const LargeSection = (() => {
  registerHandler('large', onEvent);
  registerSectionModule('large', {
    onShow,
    onHide,
  });

  return {
    onShow,
    onHide,
  };
})();
