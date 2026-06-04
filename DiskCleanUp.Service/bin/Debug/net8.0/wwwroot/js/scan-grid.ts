// ═══════════════════════════════════════════════════════════════════════════
//  SCAN-GRID — Universal CSS-grid list for all scan sections
//  Replaces all <table> usage. Resizable columns, extension colors,
//  filter integration, skeleton loading.
//
//  AUTO-COLUMNS: Every grid gets a # (line number) column prepended
//  and a File|Folder actions column appended automatically.
//
//  FRAGMENT BATCHING: addRow accumulates DOM nodes in a DocumentFragment
//  and flushes via microtask — eliminates layout thrashing that caused
//  1-second freezes during cache restore of 1,270+ rows.
//
//  Usage:
//    import * as SG from './scan-grid.js';
//    SG.create('stale', 'staleResult', [
//      { key: 'check', width: 28, type: 'checkbox' },
//      { key: 'path',  label: 'File', flex: 1, type: 'path' },
//      { key: 'size',  label: 'Size', width: 80, type: 'size' },
//    ]);
//    SG.addRow('stale', { path: '...', size: 1234 });
// ═══════════════════════════════════════════════════════════════════════════

import { colorFor, bgFor, extOf, dot } from './ext-colors.js';
import { fmtBytes, escHtml as _esc } from '/lib/wb-core/utils/format.js';
import * as SF from './scan-filter.js';
import { crumb } from './breadcrumb.js';
import { ErrLog } from './error-logger.js';

const _grids = {};

// ── Media preview — lazy-loaded thumbnails via IntersectionObserver ──────
// Only these extensions get a thumbnail. Video gets a poster-style thumb
// by loading into a hidden <video> and capturing a canvas frame.
const _PREVIEW_IMG_EXTS = new Set(['.jpg','.jpeg','.png','.gif','.webp','.bmp','.svg','.ico']);
const _PREVIEW_VID_EXTS = new Set(['.mp4','.webm','.mov','.avi','.mkv']);

// One shared observer for ALL grids — fires when thumbnail enters viewport
const _previewObserver = new IntersectionObserver((entries) => {
  for (const entry of entries) {
    if (!entry.isIntersecting) continue;
    const el = entry.target as HTMLElement & { src?: string; currentTime?: number };
    _previewObserver.unobserve(el);
    const src = (el as any).dataset.lazySrc;
    if (!src) continue;
    if (el.tagName === 'IMG') {
      (el as HTMLImageElement).src = src;
    } else if (el.tagName === 'VIDEO') {
      (el as HTMLVideoElement).src = src;
      (el as HTMLVideoElement).currentTime = 0.5;  // seek past first frame
    }
  }
}, { rootMargin: '200px 0px', threshold: 0 }); // 200px pre-load buffer

function _isPreviewable(ext) {
  return _PREVIEW_IMG_EXTS.has(ext) || _PREVIEW_VID_EXTS.has(ext);
}

function _makeThumb(path, ext) {
  const url = `/api/file?path=${encodeURIComponent(path)}`;
  if (_PREVIEW_VID_EXTS.has(ext)) {
    const vid = document.createElement('video');
    vid.className = 'sg-thumb sg-thumb-vid';
    vid.muted = true;
    vid.preload = 'none';
    vid.playsInline = true;
    vid.dataset.lazySrc = url;
    vid.addEventListener('loadeddata', () => { vid.classList.add('loaded'); }, { once: true });
    _previewObserver.observe(vid);
    return vid;
  }
  const img = document.createElement('img');
  img.className = 'sg-thumb';
  img.alt = '';
  img.dataset.lazySrc = url;
  img.onload  = () => { img.classList.add('loaded'); };
  img.onerror = () => { img.style.display = 'none'; };
  _previewObserver.observe(img);
  return img;
}

// Layout version — bump to clear stale saved column widths
const _LAYOUT_VER = 2;
try {
  if (localStorage.getItem('sg_layout_ver') !== String(_LAYOUT_VER)) {
    Object.keys(localStorage).filter(k => k.startsWith('sg_widths_')).forEach(k => localStorage.removeItem(k));
    localStorage.setItem('sg_layout_ver', String(_LAYOUT_VER));
  }
} catch (ex) {
  ErrLog.log('[SCAN_GRID]', ex.message, ex.stack, 'CAUGHT_ERROR');
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Create (or recreate) a grid for a section.
 * Auto-prepends a # column and appends a File|Folder actions column.
 */
export function create(section, containerId, columns, opts: Record<string, any> = {}) {
// FEAT-021 fix: Register filter BEFORE the early-return check.
// showSkeleton() creates the grid with filterBar:false. When real data
// arrives, create() is called again (without that flag) but returns early
// because the grid already exists. Without this, the filter is never
// registered and SF.trackExt() silently no-ops → empty dropdown.
if (opts.filterBar !== false) {
  const filterId = `sf-${section}`;
  if (document.getElementById(filterId)) {
    SF.register(section, {
      tableId: null,
      containerId: filterId,
      pathSelector: '.sg-path',
      gridBodyId: `sg-body-${section}`,
    });
  }
}

if (_grids[section]?.body && _grids[section].body.parentElement) return;
crumb('sg', 'create', { section, cols: columns.length });

const container = document.getElementById(containerId);
if (!container) return;

// Auto-prepend line-number column
const lineNoCol = { key: '_lineNo', label: '#', width: 36, type: 'lineNo' };

// Auto-append open-file / open-folder + trash actions column
const actionsCol = { key: '_actions', label: 'Actions', width: 155, type: 'actions' };

// Filter out any user-supplied 'open' column (replaced by auto-actions)
const userCols = columns.filter(c => c.type !== 'open');
const allColumns = [lineNoCol, ...userCols, actionsCol];

// Restore saved widths
const saved = _loadWidths(section);

const cols = allColumns.map((c, i) => {
  const w = saved?.[i] ?? (c.flex ? `minmax(${c.minWidth || 80}px, ${c.flex}fr)` : `${c.width || 80}px`);
  return { ...c, _idx: i, _width: w };
});

const gridTemplate = cols.map(c => {
  // Never use bare px — always minmax(0, Xpx) so columns shrink
  // instead of overflowing and causing a horizontal scrollbar.
  if (typeof c._width === 'number') return `minmax(0, ${c._width}px)`;
  if (typeof c._width === 'string' && c._width.endsWith('px')) return `minmax(0, ${c._width})`;
  return c.flex ? `minmax(0, ${c.flex}fr)` : `minmax(0, ${c._width})`;
}).join(' ');

container.innerHTML = '';

// Body must be declared BEFORE the header loop so the checkbox
// header cell can attach a 'change' listener to it for indeterminate state.
const body = document.createElement('div');
body.className = 'sg-body';
body.id = `sg-body-${section}`;

// Header
const header = document.createElement('div');
header.className = 'sg-header';
header.style.gridTemplateColumns = gridTemplate;
header.dataset.section = section;
cols.forEach((c, i) => {
  const cell = document.createElement('div');
  cell.className = 'sg-hcell';
  cell.dataset.colIdx = String(i);

  if (c.type === 'checkbox') {
    // Header checkbox — click checks/unchecks all visible rows
    const hCb = document.createElement('input');
    hCb.type  = 'checkbox';
    hCb.title = 'Select all / none';
    hCb.className = 'sg-select-all';
    hCb.addEventListener('change', () => selectAll(section, hCb.checked));
    cell.appendChild(hCb);
    // Mirror indeterminate state back to header when individual rows toggle
    body.addEventListener('change', (ev) => {
      if (!(ev.target as Element).matches('input[type=checkbox]')) return;
      const all   = [...body.querySelectorAll('input[type=checkbox]')] as HTMLInputElement[];
      const shown = all.filter(cb => (cb.closest('.sg-row') as HTMLElement)?.style.display !== 'none');
      hCb.checked       = shown.length > 0 && shown.every(cb => cb.checked);
      hCb.indeterminate = !hCb.checked && shown.some(cb => cb.checked);
    });
  } else {
    cell.textContent = c.label || '';
    cell.title       = c.label || '';
    if (c.type === 'keepBtn') cell.classList.add('sg-keep-cell');
    if (c.type === 'delBtn')  cell.classList.add('sg-del-cell');
  }

  if (c.type !== 'checkbox' && c.type !== 'keepBtn' && c.type !== 'delBtn' && c.type !== 'lineNo' && c.type !== 'actions') {
    cell.classList.add('sg-sortable');
    cell.addEventListener('click', (e) => {
      if ((e.target as Element).classList.contains('sg-resize-handle')) return;
      _sortColumn(section, i);
    });
  }

  if (i < cols.length - 1) {
    const handle = document.createElement('div');
    handle.className = 'sg-resize-handle';
    handle.addEventListener('mousedown', (e) => _startResize(e, section, i));
    cell.appendChild(handle);
  }

  header.appendChild(cell);
});

// Color legend bar (between header and body)
const legend = document.createElement('div');
legend.className = 'sg-legend';
legend.id = `sg-legend-${section}`;
legend.style.display = 'none'; // hidden until rows arrive

container.appendChild(legend);
container.appendChild(header);
container.appendChild(body);

_grids[section] = {
  containerId, columns: cols, gridTemplate, body, header, legend,
  rows: [], sortCol: -1, sortDir: 0,
  _frag: null, _flushScheduled: false, _legendExts: new Set(),
  _activeExts: new Set(),   // chip-filter: extensions user has toggled on
  lastClickRow: null as Element | null,

// Filter registration moved to top of create() — runs even when grid
// already exists from skeleton (FEAT-021 fix)
}
}

/**
 * Add a data row.
 * Uses DocumentFragment batching — multiple addRow calls within the same
 * microtask are flushed to the DOM in a single appendChild, eliminating
 * the layout thrashing that caused 1s freezes with 1,270+ rows.
 */
// ── Cell builders ────────────────────────────────────────────────────────

function _buildPathCell(cell: HTMLElement, col, data) {
  cell.classList.add('sg-path');
  const colPath = data[col.key] || '';
  const colExt  = extOf(colPath);
  cell.title = colPath;
  if (_isPreviewable(colExt)) {
    cell.appendChild(_makeThumb(colPath, colExt));
  } else {
    cell.innerHTML = dot(colExt);
  }
  const span = document.createElement('span');
  span.className = 'sg-path-text';
  span.style.color = colorFor(colExt) || 'inherit';
  span.textContent = colPath;
  cell.appendChild(span);
}

function _buildSubpathCell(cell: HTMLElement, arr: string[], section, row: HTMLElement) {
  cell.classList.add('sg-paths');
  arr.forEach(p => {
    const e   = extOf(p);
    const sub = document.createElement('div');
    sub.className = 'sg-subpath';
    sub.title = p;
    const pathSpan = document.createElement('span');
    pathSpan.className = 'sg-subpath-text';
    pathSpan.style.color = colorFor(e) || 'inherit';
    pathSpan.innerHTML = dot(e) + _esc(p);
    sub.appendChild(pathSpan);
    const acts = document.createElement('span');
    acts.className = 'sg-subpath-actions';
    const tb = document.createElement('button');
    tb.className = 'btn muted btn-xxs sg-trash-btn';
    tb.textContent = '🗑';
    tb.title = 'Delete this file (Recycle Bin)';
    tb.onclick = (ev) => { ev.stopPropagation(); _trashSubPath(section, p, sub, row); };
    acts.appendChild(tb);
    const fb = document.createElement('button');
    fb.className = 'btn muted btn-xxs';
    fb.textContent = '📄';
    fb.title = 'Open file in VS Code';
    fb.onclick = (ev) => { ev.stopPropagation(); window.openInVSCode ? window.openInVSCode(p) : window.openFileInVSCode?.(p); };
    acts.appendChild(fb);
    const ob = document.createElement('button');
    ob.className = 'btn muted btn-xxs';
    ob.textContent = '📂';
    ob.title = 'Open containing folder';
    ob.onclick = (ev) => { ev.stopPropagation(); _openFolder(p, ob); };
    acts.appendChild(ob);
    sub.appendChild(acts);
    cell.appendChild(sub);
  });
}

async function _fileIssueForRow(path: string, section: string, row: HTMLElement) {
  const sizeBytes = parseInt(row.dataset.size || '0', 10) || undefined;
  const modified  = row.dataset.modified || undefined;
  try {
    const res = await fetch('/api/issue/file', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, section, sizeBytes, modified }),
    });
    const json = await res.json();
    if (!res.ok) { ErrLog.log('[sg]', `File-issue failed: ${json.detail || json.error || res.status}`, null, 'FILE_ISSUE_FAIL'); return; }
    const url = json.issueUrl || '';
    const toast = document.createElement('div');
    toast.style.cssText = 'position:fixed;bottom:16px;right:16px;background:#2d333b;color:#cae8ff;border:1px solid #58a6ff;border-radius:4px;padding:8px 14px;font-size:12px;z-index:9999';
    toast.innerHTML = url ? `Issue filed: <a href="${url}" target="_blank" style="color:#58a6ff">${url}</a>` : 'Issue filed.';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
  } catch (e: any) {
    ErrLog.log('[sg]', `File-issue error: ${e.message}`, null, 'FILE_ISSUE_ERROR');
  }
}

function _buildActionsCell(cell: HTMLElement, path: string, section, row: HTMLElement) {
  cell.classList.add('sg-actions');

  // 🗑 Delete → Recycle Bin
  const trashBtn = document.createElement('button');
  trashBtn.className = 'btn muted btn-xs sg-trash-btn';
  trashBtn.textContent = '🗑';
  trashBtn.title = 'Delete (Recycle Bin)';
  trashBtn.onclick = () => _trashRow(section, path, row);
  cell.appendChild(trashBtn);

  // 📋 Copy path → clipboard
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn muted btn-xs';
  copyBtn.textContent = '📋';
  copyBtn.title = 'Copy path to clipboard';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(path)
      .then(() => _btnFeedback(copyBtn, true))
      .catch(() => _btnFeedback(copyBtn, false));
  };
  cell.appendChild(copyBtn);

  // 📂 Open containing folder in Explorer
  const folderBtn = document.createElement('button');
  folderBtn.className = 'btn muted btn-xs';
  folderBtn.textContent = '📂';
  folderBtn.title = 'Open containing folder in Explorer';
  folderBtn.onclick = () => _openFolder(path, folderBtn);
  cell.appendChild(folderBtn);

  // </> Open file in VS Code
  const vscBtn = document.createElement('button');
  vscBtn.className = 'btn muted btn-xs btn-vscode';
  vscBtn.textContent = '</>';
  vscBtn.title = 'Open file in VS Code';
  vscBtn.onclick = () => _openFileInVSCode(path, vscBtn);
  cell.appendChild(vscBtn);

  // 🚩 File a GitHub issue
  const issueBtn = document.createElement('button');
  issueBtn.className = 'btn muted btn-xs btn-file-issue';
  issueBtn.textContent = '🚩';
  issueBtn.title = 'File a GitHub issue for this file';
  issueBtn.onclick = (ev) => { ev.stopPropagation(); _fileIssueForRow(path, section, row); };
  cell.appendChild(issueBtn);
}

function _buildCell(col, data, path: string, rowNum: number, section, row: HTMLElement): HTMLElement {
  const cell = document.createElement('div');
  cell.className = 'sg-cell';
  switch (col.type) {
    case 'lineNo':   { cell.classList.add('sg-lineno'); cell.textContent = rowNum; break; }
    case 'checkbox': { cell.innerHTML = `<input type="checkbox" data-path="${_esc(path)}">`; break; }
    case 'delBtn': {
      cell.classList.add('sg-del-cell');
      const db = document.createElement('button');
      db.className = 'btn-del'; db.textContent = '🗑'; db.title = 'Delete this file';
      db.onclick = () => (window as any)._trashSelected?.(null, [path]);
      cell.appendChild(db); break;
    }
    case 'keepBtn': {
      cell.classList.add('sg-keep-cell');
      const kb = document.createElement('button');
      kb.className = 'btn-keep'; kb.textContent = '🔒'; kb.title = 'Keep — exclude from future scans';
      kb.onclick = () => (window.keepPaths as ((p: string[]) => void) | undefined)?.([path]);
      cell.appendChild(kb); break;
    }
    case 'path':    { _buildPathCell(cell, col, data); break; }
    case 'size':    { cell.textContent = fmtBytes(data[col.key] || 0); cell.dataset.sortVal = data[col.key] || 0; break; }
    case 'paths':   { _buildSubpathCell(cell, Array.isArray(data[col.key]) ? data[col.key] : [], section, row); break; }
    case 'badge':   { cell.innerHTML = `<span class="badge orange">${_esc(data[col.key] || '')}</span>`; break; }
    case 'actions': { _buildActionsCell(cell, path, section, row); break; }
    case 'open': {
      cell.classList.add('sg-actions');
      const btn = document.createElement('button');
      btn.className = 'btn muted btn-xs'; btn.textContent = '📄'; btn.title = 'Open file';
      btn.onclick = () => { window.openInVSCode ? window.openInVSCode(path) : window.openFileInVSCode?.(path); };
      cell.appendChild(btn); break;
    }
    default: { cell.textContent = data[col.key] ?? ''; break; }
  }
  return cell;
}

function _wireRowDblClick(row: HTMLElement, path: string, section) {
  const inBrowser = new Set(['html-files', 'css-files']).has(section);
  row.addEventListener('dblclick', (e) => {
    if ((e.target as Element).closest('button') || (e.target as Element).closest('input')) return;
    fetch(inBrowser ? '/api/open-default' : '/api/open', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ path })
    }).catch(() => {});
  });
  row.style.cursor = 'pointer';
  row.title = row.title || `Double-click to open${inBrowser ? ' in browser' : ''}`;
}

function _scheduleFlush(section, g) {
  if (!g._frag) g._frag = document.createDocumentFragment();
  g._frag.appendChild(g.rows[g.rows.length - 1]);
  if (g._flushScheduled) return;
  g._flushScheduled = true;
  queueMicrotask(() => {
    crumb('sg', 'flush', { section, total: g.rows.length });
    if (g._frag) { g.body.appendChild(g._frag); g._frag = null; }
    g._flushScheduled = false;
    _updateRowCount(section, g);
    _rebuildLegend(section, g);
    if (g._activeExts.size > 0) requestAnimationFrame(() => applyFilter(section));
  });
}

function _trackExts(g, path: string, ext: string, data, section) {
  if (ext) { SF.trackExt(section, path); g._legendExts.add(ext); }
  g.columns.forEach(col => {
    if (col.type === 'paths') {
      (Array.isArray(data[col.key]) ? data[col.key] : []).forEach((p: string) => { const e = extOf(p); if (e) g._legendExts.add(e); });
    }
  });
}

// ── Public API ────────────────────────────────────────────────────────────

export function addRow(section, data) {
const g = _grids[section];
if (!g) return;

const path   = data.path || data.keep || '';
const ext    = extOf(path);
const rowNum = g.rows.length + 1;

const row = document.createElement('div');
row.className = 'sg-row live-row';
row.style.gridTemplateColumns = g.header.style.gridTemplateColumns;
if (ext) row.style.background = bgFor(ext);
row.dataset.path     = path;
row.dataset.ext      = ext;
row.dataset.size     = String(data.size || data.sizeBytes || 0);
row.dataset.modified = data.modified || data.lastModified || '';

g.columns.forEach(col => row.appendChild(_buildCell(col, data, path, rowNum, section, row)));
if (path) _wireRowDblClick(row, path, section);

g.rows.push(row);
if (rowNum % 50 === 0 || rowNum === 1) crumb('sg', 'addRow', { section, row: rowNum });

_scheduleFlush(section, g);
_trackExts(g, path, ext, data, section);
}
export function showSkeleton(section, containerId, columns) {
create(section, containerId, columns, { filterBar: false });
const g = _grids[section];
if (!g) return;

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

export function removeSkeleton(section) {
const g = _grids[section];
if (!g) return;
g.body.querySelectorAll('.sg-skel-row').forEach(r => r.remove());
}

export function clear(section) {
const g = _grids[section];
if (!g) return;
crumb('sg', 'clear', { section });
g.body.innerHTML = '';
g.rows = [];
g._frag = null;
g._flushScheduled = false;
g._legendExts.clear();
if (g.legend) { g.legend.innerHTML = ''; g.legend.style.display = 'none'; }
_updateRowCount(section, g);
}

export function getChecked(section) {
const g = _grids[section];
if (!g) return [];
return [...g.body.querySelectorAll('input[type=checkbox]:checked')]
  .map(cb => cb.dataset.path).filter(Boolean);
}

/**
 * Remove rows matching a path from a specific section (or ALL sections).
 * Returns number of rows removed.
 */
export function removeByPath(path, section?) {
let removed = 0;
const sections = section ? [section] : Object.keys(_grids);
for (const sec of sections) {
  const g = _grids[sec];
  if (!g) continue;
  const before = g.rows.length;
  g.rows = g.rows.filter(row => {
    if (row.dataset.path === path) {
      row.classList.add('keep-flash');
      setTimeout(() => row.remove(), 400);
      return false;
    }
    return true;
  });
  const delta = before - g.rows.length;
  if (delta > 0) {
    removed += delta;
    _updateRowCount(sec, g);
  }
}
return removed;
}

/** Remove rows matching ANY of the given paths from ALL sections. */
export function removeByPaths(paths) {
if (!paths.length) return 0;
const pathSet = new Set(paths.map(p => p.toLowerCase()));
let removed = 0;
for (const sec of Object.keys(_grids)) {
  const g = _grids[sec];
  if (!g) continue;
  const before = g.rows.length;
  g.rows = g.rows.filter(row => {
    if (pathSet.has((row.dataset.path || '').toLowerCase())) {
      row.classList.add('keep-flash');
      setTimeout(() => row.remove(), 400);
      return false;
    }
    return true;
  });
  const delta = before - g.rows.length;
  if (delta > 0) {
    removed += delta;
    _updateRowCount(sec, g);
  }
}
return removed;
}

/** Check if any section grid has rows. */
export function hasRows(section) {
const g = _grids[section];
return g ? g.rows.length > 0 : false;
}

/** Get row count for a section. */
export function rowCount(section) {
const g = _grids[section];
return g ? g.rows.length : 0;
}

export function selectAll(section, val) {
const g = _grids[section];
if (!g) return;
g.body.querySelectorAll('input[type=checkbox]').forEach(cb => {
  if (val && cb.closest('.sg-row')?.style.display === 'none') return;
  cb.checked = val;
});
}

export function applyFilter(section) {
const g = _grids[section];
if (!g) return;
crumb('sg', 'applyFilter', { section, rows: g.rows.length });

const mode     = SF.getMode(section);
const included = SF.getIncluded(section);
const excluded = SF.getExcluded(section);
const textEl   = document.getElementById(`sf-text-${section}`);
const text     = ((textEl as HTMLInputElement | null)?.value || '').toLowerCase();

let shown = 0;
for (const row of g.rows) {
  const ext  = row.dataset.ext || '';
  const path = row.dataset.path || '';
  let vis = true;

  if (text) {
    const extShorthand = _parseExtShorthand(text);
    if (extShorthand) {
      if (ext !== extShorthand) vis = false;
    } else {
      if (!path.toLowerCase().includes(text)) vis = false;
    }
  }
  if (vis && mode === 'include' && included && ext !== included) vis = false;
  if (vis && mode === 'exclude' && excluded.has(ext)) vis = false;
  // Chip-filter: if any legend chips are active, row must match one of them
  if (vis && g._activeExts.size > 0 && !g._activeExts.has(ext)) vis = false;

  row.style.display = vis ? '' : 'none';
  if (vis) shown++;
}

const statusEl = document.getElementById(`sf-status-${section}`);
if (statusEl) {
  if (shown === g.rows.length) statusEl.textContent = `${g.rows.length.toLocaleString()} rows`;
  else statusEl.textContent = `Showing ${shown.toLocaleString()} of ${g.rows.length.toLocaleString()}`;
}
_rebuildLegendFiltered(section, g, shown < g.rows.length);
}

// ═══════════════════════════════════════════════════════════════════════════
//  INTERNAL
// ═══════════════════════════════════════════════════════════════════════════

function _updateRowCount(section, g) {
const el = document.getElementById(`sbv-${section}-rows`);
if (el) el.textContent = g.rows.length.toLocaleString();

// Enable/disable Keep Selected + Delete Selected toolbar buttons
const hasData = g.rows.length > 0;
document.querySelectorAll(`[data-grid-section="${section}"]`).forEach(btn => {
  (btn as HTMLButtonElement).disabled = !hasData;
});
}

/** After applyFilter, show only the extensions that appear in visible rows. */
function _rebuildLegendFiltered(section, g, anyFiltered: boolean) {
  if (!g.legend) return;
  if (!anyFiltered) {
    // No active filter — restore full legend
    if (g._legendLastCount !== g._legendExts.size) _rebuildLegend(section, g);
    else _syncLegendActive(section, g);
    return;
  }
  const visExts = new Set<string>();
  for (const row of g.rows) {
    if ((row as HTMLElement).style.display !== 'none') {
      const ext = (row as HTMLElement).dataset.ext;
      if (ext) visExts.add(ext);
    }
  }
  const sorted = [...visExts].sort();
  // Always rebuild since count or content may differ from last full render
  g._legendLastCount = -1; // force rebuild next full call
  if (sorted.length === 0) {
    g.legend.style.display = 'none';
    g.legend.innerHTML = '';
    return;
  }
  g.legend.style.display = '';
  g.legend.innerHTML =
    `<span class="sg-legend-label">File types (${sorted.length}):</span>` +
    sorted.map(ext =>
      `<span class="sg-legend-chip" data-ext="${ext}" title="Click to filter" style="cursor:pointer">${dot(ext)}<span style="color:${colorFor(ext)}">${ext}</span></span>`
    ).join('') +
    `<button class="sg-legend-clear" title="Clear chip filters" style="display:none">✕ Clear</button>`;
  g.legend.querySelectorAll('.sg-legend-chip').forEach((chip: Element) => {
    chip.addEventListener('click', () => {
      const ext = (chip as HTMLElement).dataset.ext || '';
      if (g._activeExts.has(ext)) g._activeExts.delete(ext); else g._activeExts.add(ext);
      _syncLegendActive(section, g);
      applyFilter(section);
    });
  });
  const clearBtn = g.legend.querySelector('.sg-legend-clear') as HTMLElement | null;
  if (clearBtn) {
    clearBtn.addEventListener('click', () => { g._activeExts.clear(); _syncLegendActive(section, g); applyFilter(section); });
  }
  _syncLegendActive(section, g);
}

/** Rebuild the color legend bar from tracked extensions */
function _rebuildLegend(section, g) {
if (!g.legend || g._legendExts.size === 0) return;
const sorted = [...g._legendExts].sort();
// Only rebuild HTML when count changes; always sync active states
if (g._legendLastCount !== sorted.length) {
  g._legendLastCount = sorted.length;
  g.legend.style.display = '';
  g.legend.innerHTML =
    `<span class="sg-legend-label">File types (${sorted.length}):</span>` +
    sorted.map(ext =>
      `<span class="sg-legend-chip" data-ext="${ext}" title="Click to filter" style="cursor:pointer">${dot(ext)}<span style="color:${colorFor(ext)}">${ext}</span></span>`
    ).join('') +
    `<button class="sg-legend-clear" title="Clear chip filters" style="display:none">✕ Clear</button>`;

  // Wire chip clicks — toggle state + visual immediately, defer heavy filter pass
  g.legend.querySelectorAll('.sg-legend-chip').forEach((chip: Element) => {
    chip.addEventListener('click', () => {
      const ext = (chip as HTMLElement).dataset.ext || '';
      if (g._activeExts.has(ext)) { g._activeExts.delete(ext); }
      else { g._activeExts.add(ext); }
      _syncLegendActive(section, g);           // instant chip highlight (same frame)
      requestAnimationFrame(() => applyFilter(section)); // async row-filter (non-blocking)
    });
  });

  // Wire clear button
  const clearBtn = g.legend.querySelector('.sg-legend-clear') as HTMLElement | null;
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      g._activeExts.clear();
      _syncLegendActive(section, g);
      requestAnimationFrame(() => applyFilter(section));
    });
  }
}
// Always re-sync active highlight states (survives count-unchanged re-calls)
_syncLegendActive(section, g);
}

/** Sync the visual active state of legend chips + show/hide the Clear button */
function _syncLegendActive(section, g) {
if (!g.legend) return;
g.legend.querySelectorAll('.sg-legend-chip').forEach((chip: Element) => {
  const ext = (chip as HTMLElement).dataset.ext || '';
  chip.classList.toggle('active', g._activeExts.has(ext));
});
const clearBtn = g.legend.querySelector('.sg-legend-clear') as HTMLElement | null;
if (clearBtn) clearBtn.style.display = g._activeExts.size > 0 ? '' : 'none';
}

/** Trash a single sub-path inside a 'paths' column (e.g. Will Delete list) */
function _trashSubPath(section, path, subEl, row) {
if (!path) return;
crumb('sg', 'trashSubPath', { section, path });

// Flash + remove just this sub-path entry
subEl.classList.add('keep-flash');
setTimeout(() => subEl.remove(), 400);

// Send to Recycle Bin
if (window.TrashQ?.enqueue) {
  window.TrashQ.enqueue([path]);
} else {
  fetch('/api/trash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [path] })
  }).catch(() => {});
}

// Also remove from other grids where this path is the main row
removeByPath(path);
}

/** Trash a single row — Recycle Bin + remove from all grids */
function _btnFeedback(btn: HTMLButtonElement | null, ok: boolean) {
  if (!btn) return;
  const orig = btn.textContent;
  btn.textContent = ok ? '✓' : '✗';
  btn.style.opacity = ok ? '0.6' : '1';
  btn.style.color   = ok ? '' : '#e74c3c';
  setTimeout(() => { btn.textContent = orig; btn.style.opacity = ''; btn.style.color = ''; }, 1200);
}

function _trashRow(section, path, row) {
if (!path) return;
crumb('sg', 'trashRow', { section, path });

// Flash + remove from DOM across all sections
removeByPath(path);

// Send to Recycle Bin via TrashQ
if (window.TrashQ?.enqueue) {
  window.TrashQ.enqueue([path]);
} else {
  fetch('/api/trash', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [path] })
  }).catch((e) => {
    ErrLog.log('[sg]', `Delete failed: ${e.message}`, e, 'ACTION_FAIL');
  });
}

// Remove from backend caches so it doesn't reappear on Load More
const cacheSections = ['stale','large','empty','node-modules','venvs',
  'backups','tiny-files','html-files','css-files','duplicates','images','dev-cache'];
for (const sec of cacheSections) {
  fetch(`/api/cache/${sec}/remove`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: [path], trash: false })
  }).catch(() => {});
}
}

/** Open the file itself in VS Code */
function _openFileInVSCode(path, btn?: HTMLButtonElement) {
if (!path) return;
fetch('/api/open', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path })
}).then(() => _btnFeedback(btn ?? null, true))
  .catch((e) => {
    ErrLog.log('[sg]', `Open file in VS Code failed: ${e.message}`, e, 'ACTION_FAIL');
    _btnFeedback(btn ?? null, false);
  });
}

/** Open the containing folder in VS Code — reuses the existing /api/open endpoint */
function _openFolderInVSCode(path, btn?: HTMLButtonElement) {
if (!path) return;
const folder = path.replace(/[\\/][^\\/]+$/, '');
fetch('/api/open', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: folder })
}).then(() => _btnFeedback(btn ?? null, true))
  .catch((e) => {
    ErrLog.log('[sg]', `Open in VS Code failed: ${e.message}`, e, 'ACTION_FAIL');
    _btnFeedback(btn ?? null, false);
  });
}

/** Open the containing folder of a file path */
function _openFolder(path, btn?: HTMLButtonElement) {
if (!path) return;
const folder = path.replace(/[\\/][^\\/]+$/, '');
fetch('/api/open-folder', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: folder })
}).then(() => _btnFeedback(btn ?? null, true))
  .catch((e) => {
    ErrLog.log('[sg]', `Open folder failed: ${e.message}`, e, 'ACTION_FAIL');
    _btnFeedback(btn ?? null, false);
    window.openInVSCode?.(folder);
  });
}

// _esc is now imported from wb-core as escHtml (aliased to _esc for minimal churn)

// ── Column Resize ────────────────────────────────────────────────────────
let _resizeState = null;

function _startResize(e, section, colIdx) {
e.preventDefault();
e.stopPropagation();
const g = _grids[section];
if (!g) return;

const handle = e.target;
handle.classList.add('sg-dragging');

const hCells = g.header.children;
const widths = Array.from(hCells).map(c => (c as Element).getBoundingClientRect().width);

_resizeState = { section, colIdx, startX: e.clientX, widths: [...widths], handle };
document.addEventListener('mousemove', _onResizeMove);
document.addEventListener('mouseup', _onResizeEnd);
}

function _onResizeMove(e) {
if (!_resizeState) return;
const { section, colIdx, startX, widths } = _resizeState;
const g = _grids[section];
if (!g) return;

const delta = e.clientX - startX;
const newW = Math.max(50, widths[colIdx] + delta);
const updated = [...widths];
updated[colIdx] = newW;

const template = updated.map(w => `minmax(0, ${Math.round(w)}px)`).join(' ');
g.header.style.gridTemplateColumns = template;
for (const row of g.body.children) {
  row.style.gridTemplateColumns = template;
}
}

function _onResizeEnd() {
if (!_resizeState) return;
const { section, handle } = _resizeState;
handle.classList.remove('sg-dragging');

const g = _grids[section];
if (g) {
  const hCells = g.header.children;
  const widths = Array.from(hCells).map(c => `${Math.round((c as Element).getBoundingClientRect().width)}px`);
  _saveWidths(section, widths);
  const template = widths.map(w => `minmax(0, ${w})`).join(' ');
  g.header.style.gridTemplateColumns = template;
  g.gridTemplate = template;
}

_resizeState = null;
document.removeEventListener('mousemove', _onResizeMove);
document.removeEventListener('mouseup', _onResizeEnd);
}

function _saveWidths(section, widths) {
}

function _loadWidths(section) {
  try {
    const raw = localStorage.getItem(`sg_widths_${section}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Column Sort ──────────────────────────────────────────────────────────
function _sortColumn(section, colIdx) {
  const g = _grids[section];
  if (!g) return;
  crumb('sg', 'sort', { section, col: colIdx, rows: g.rows.length });

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
    if (va > vb) return  1 * g.sortDir;
    return 0;
  });

  sorted.forEach(r => g.body.appendChild(r));
}

/**
 * If text looks like a bare extension shorthand (e.g. "exe", ".exe", "*.exe"),
 * returns the normalised extension with dot (e.g. ".exe").
 * Returns '' if the text looks like a path fragment or contains spaces.
 */
function _parseExtShorthand(text: string): string {
  if (!text) return '';
  const t = text.replace(/^\*/, '').toLowerCase();
  if (t && !t.includes('/') && !t.includes('\\') && !t.includes(' ')) {
    return t.startsWith('.') ? t : '.' + t;
  }
  return '';
}

// ── Drag-select + context menu ────────────────────────────────────────────

let _dragState: { body: Element; startRow: Element; lastRow: Element; checked: boolean } | null = null;
let _ctxMenuEl: HTMLElement | null = null;
let _ctxMenuSection: string | null = null;

function _visibleRows(body: Element): Element[] {
  return [...body.querySelectorAll('.sg-row')].filter(r => (r as HTMLElement).style.display !== 'none');
}

function _rowsBetween(body: Element, a: Element, b: Element): Element[] {
  const rows = _visibleRows(body);
  const ai = rows.indexOf(a), bi = rows.indexOf(b);
  if (ai < 0 || bi < 0) return [];
  const lo = Math.min(ai, bi), hi = Math.max(ai, bi);
  return rows.slice(lo, hi + 1);
}

function _ensureCtxMenu(): HTMLElement {
  if (_ctxMenuEl) return _ctxMenuEl;
  const menu = document.createElement('div');
  menu.className = 'sg-ctx-menu';
  menu.innerHTML =
    '<button data-action="select-all">&#9745; Select All</button>' +
    '<button data-action="deselect-all">&#9744; Deselect All</button>' +
    '<button data-action="invert">&#8597; Invert Selection</button>';
  document.body.appendChild(menu);

  menu.addEventListener('click', (e) => {
    const btn = (e.target as Element).closest('button') as HTMLElement | null;
    if (!btn || !_ctxMenuSection) { menu.style.display = 'none'; return; }
    const g = _grids[_ctxMenuSection];
    menu.style.display = 'none';
    if (!g) return;
    const action = btn.dataset.action;
    const cbs = _visibleRows(g.body)
      .map(r => r.querySelector('input[type=checkbox]') as HTMLInputElement | null)
      .filter(Boolean) as HTMLInputElement[];
    if (action === 'select-all') {
      cbs.forEach(cb => { if (!cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
    } else if (action === 'deselect-all') {
      cbs.forEach(cb => { if (cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change', { bubbles: true })); } });
    } else if (action === 'invert') {
      cbs.forEach(cb => { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change', { bubbles: true })); });
    }
  });

  document.addEventListener('click', () => { if (_ctxMenuEl) _ctxMenuEl.style.display = 'none'; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && _ctxMenuEl) _ctxMenuEl.style.display = 'none'; });
  _ctxMenuEl = menu;
  return menu;
}

function _initInteractions(section: string, body: HTMLElement): void {
  // Drag-to-select + Shift+click range + Ctrl+click toggle
  body.addEventListener('mousedown', (e: MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as Element;
    if (target.closest('button') || target.closest('input') || target.closest('.sg-resize-handle')) return;
    const row = target.closest('.sg-row');
    if (!row) return;
    const cb = row.querySelector('input[type=checkbox]') as HTMLInputElement | null;
    if (!cb) return;
    e.preventDefault();
    const g = _grids[section];

    if (e.shiftKey && g?.lastClickRow) {
      // Shift+click: check all rows in range (always selects)
      _rowsBetween(body, g.lastClickRow, row).forEach(r => {
        const rcb = r.querySelector('input[type=checkbox]') as HTMLInputElement | null;
        if (rcb && !rcb.checked) { rcb.checked = true; rcb.dispatchEvent(new Event('change', { bubbles: true })); }
      });
      return; // no drag, keep lastClickRow as shift anchor
    }

    const newChecked = !cb.checked;
    cb.checked = newChecked;
    cb.dispatchEvent(new Event('change', { bubbles: true }));
    if (g) g.lastClickRow = row;

    if (e.ctrlKey || e.metaKey) return; // Ctrl+click: toggle only, no drag

    _dragState = { body, startRow: row, lastRow: row, checked: newChecked };
  });

  // Right-click context menu
  body.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    _ctxMenuSection = section;
    const menu = _ensureCtxMenu();
    menu.style.left = `${Math.min(e.clientX, window.innerWidth  - 180)}px`;
    menu.style.top  = `${Math.min(e.clientY, window.innerHeight - 115)}px`;
    menu.style.display = 'block';
  });
}

// Module-level handlers — attached once, shared across all grid instances
document.addEventListener('mousemove', (e: MouseEvent) => {
  if (!_dragState) return;
  const row = (e.target as Element).closest?.('.sg-row');
  if (!row || !_dragState.body.contains(row)) return;
  if (row === _dragState.lastRow) return;
  _dragState.lastRow = row;
  _rowsBetween(_dragState.body, _dragState.startRow, row).forEach(r => {
    const cb = r.querySelector('input[type=checkbox]') as HTMLInputElement | null;
    if (cb && cb.checked !== _dragState!.checked) {
      cb.checked = _dragState!.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
});

document.addEventListener('mouseup', () => { _dragState = null; });

// ── Expose for window-level access ───────────────────────────────────────
window._scanGrid = {
  create, addRow, showSkeleton, removeSkeleton, clear,
  getChecked, selectAll, applyFilter,
  removeByPath, removeByPaths, hasRows, rowCount,
};
