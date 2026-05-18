---
docid: 300.9.diskcleanup-grid-specs
id: diskcleanup-dashboard-unified-grid-specification
title: DiskCleanUp Dashboard — Unified Grid Specification
project: DiskCleanUp
description: Compiled March 3, 2026 — Specification for the one-time, one-place unified grid system. Goal: All grids look the same. Reusable controls go into wb…
status: active
tags: [diskcleanup, grid, specs]
category: 300.9 — Meta
created: 2026-03-03
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: docs/DiskCleanUp-Grid-Specs.md
---
# DiskCleanUp Dashboard — Unified Grid Specification

*Compiled March 3, 2026 — Specification for the one-time, one-place unified grid system.*

**Goal:** All grids look the same. Reusable controls go into `wb-core`. One-off enhancements stay in `DiskCleanUp`. Every section composes from the same building blocks.

---

## 1. System Architecture

### 1.1 Project Structure

```text
DiskCleanUp.Service/wwwroot/
├── index.html                  # Single-page dashboard (all sections)
├── css/dashboard.css           # All styling (dark theme, grids, layouts)
├── js/                         # Application modules (ES modules)
│   ├── init.js                 # Boot sequence, imports all modules
│   ├── websocket.js            # WS connection, batch-ready handler
│   ├── event-queue.js          # PubSub-based event routing (wb-core)
│   ├── section-handlers.js     # Factory pattern for scan section handlers
│   ├── actions.js              # Trash, delete, scan start/cancel
│   ├── scan-grid.js            # CSS Grid engine for scan sections
│   ├── data-grid.js            # CSS Grid engine for non-scan views
│   ├── scan-filter.js          # Extension include/exclude filtering
│   ├── ext-colors.js           # File extension → color mapping
│   ├── column-controls.js      # wb-core table-resize/table-sort wrapper
│   ├── table-utils.js          # Legacy <table> helpers
│   ├── page-loader.js          # Paged JSONL cache reader
│   ├── data-store.js           # JSONL data store helper
│   ├── ui-utils.js             # fmt, apiFetch, section tab mgmt
│   ├── status-bar.js           # Per-section status bar updates
│   ├── settings.js             # Config load/save
│   ├── savings.js              # Savings log + recycle bin restore
│   ├── trash-queue.js          # Batched trash queue with retry
│   ├── keep-list.js            # Keep-list (exclude from scans)
│   ├── recycle-bin.js          # Recycle Bin viewer
│   ├── task-manager.js         # Windows process list
│   ├── metrics.js              # CPU/MEM graphs, GC trigger
│   ├── error-logger.js         # wb-core error logger wrapper
│   ├── breadcrumb.js           # Trace breadcrumbs → /api/trace
│   └── events.js               # DOM event wiring (toolbar clicks)
├── sections/
│   └── duplicates.js           # Duplicates section controller (MVVM)
├── models/
│   └── duplicates-model.js     # Duplicates data model
├── viewmodels/
│   └── section-vm.js           # MVVM ViewModel (RAF-batched)
├── views/
│   └── grid-view.js            # MVVM GridView renderer
├── lib/
│   ├── wb-core/                # @cielovista/wb-core component library
│   │   ├── index.js            # All exports
│   │   ├── components/         # UI components (20+)
│   │   ├── behaviors/          # Table resize/sort, copy, helpers
│   │   ├── utils/              # format, pubsub, api-fetch, config, theme, error-logger
│   │   └── css/                # Error logger styles
│   └── marked.min.js           # Markdown renderer (settings help)
└── styles/                     # (reserved)
```

### 1.2 Technology Stack

- **Frontend**: Vanilla JS (ES modules), CSS Grid, no framework
- **Backend**: .NET 8 Windows Service (`DiskCleanUp.Service`)
- **Communication**: WebSocket (signals) + REST API (data)
- **Data format**: JSONL (newline-delimited JSON) cache files on disk
- **Tray app**: WinForms (`DiskCleanUp.Tray`)
- **Component library**: `@cielovista/wb-core` v1.0.0 — Light DOM, ES modules, no dependencies

---

## 2. The Unified Grid — Design Principles

### 2.1 One Grid, Composed From Parts

Today there are **three separate grid engines** (scan-grid.js, data-grid.js, GridView MVVM) plus a custom card layout for images. The unified grid replaces all of them with a single composable system:

```text
┌─────────────────────────────────────────────────────────────┐
│  UNIFIED GRID                                                │
│                                                              │
│  ┌──────────────────────────┐  ┌──────────────────────────┐ │
│  │  wb-core (REUSABLE)       │  │  DiskCleanUp (ONE-OFF)   │ │
│  │                           │  │                           │ │
│  │  Grid Shell               │  │  Extension Colors         │ │
│  │  Status Bar               │  │  Scan Lifecycle           │ │
│  │  Filter Bar               │  │  JSONL Paging             │ │
│  │  Row Actions              │  │  Trash Queue              │ │
│  │  Column Types             │  │  Keep List                │ │
│  │  Skeleton Loading         │  │  Section Handlers         │ │
│  │  Sort / Resize            │  │  Image Card Layout        │ │
│  │  Toolbar                  │  │  Duplicates MVVM          │ │
│  │  Metrics Bar              │  │  Process Manager          │ │
│  │  Layouts                  │  │  Savings Log              │ │
│  └──────────────────────────┘  └──────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Visual Consistency Rules

Every section that shows tabular data MUST use the unified grid. Every grid MUST have:

1. A **status bar** (5 metric segments + folder ticker + stop button)
2. A **toolbar** (scan, cancel, selection, bulk actions, load more)
3. A **filter bar** (extension dropdown, include/exclude toggle, text search, chips)
4. A **grid header** (sortable, resizable columns)
5. A **grid body** (fragment-batched rows, skeleton loading, live-row animation)
6. A **row actions column** (trash, open file, open folder — auto-appended)
7. A **line number column** (auto-prepended)
8. A **legend bar** (extension color chips when applicable)

---

## 3. Component Classification — wb-core (Reusable) vs DiskCleanUp (One-Off)

### 3.1 wb-core Reusable Components (NEW or ENHANCED)

These are generic enough for any project. They go into `lib/wb-core/`.

#### 3.1.1 `GridShell` — The Core Grid Engine

**Location:** `wb-core/components/grid-shell.js`

The single grid renderer that replaces scan-grid.js, data-grid.js, and GridView.

| Feature | Description |
|---------|-------------|
| CSS Grid layout | `div` with `gridTemplateColumns`, not `<table>` |
| Fragment batching | `queueMicrotask` → DocumentFragment flush (zero layout thrash) |
| Column resize | Drag handles between columns, widths persisted to localStorage |
| Column sort | Click header → asc/desc/original cycle (numeric or text) |
| Line number column | Auto-prepended `#` column (36px) |
| Skeleton loading | 5 pulsing placeholder rows during initial load |
| Live row animation | `.live-row` fade-in from tint color (0.4s) |
| Removal animation | `.keep-flash` green flash + slide-right (0.4s) |

**Column Type Registry:**

| Type | Width | Behavior | Reusable? |
|------|-------|----------|-----------|
| `lineNo` | 36px | Auto-prepended row counter | wb-core |
| `checkbox` | 56px | Checkbox + optional action button, `data-path` tracking | wb-core |
| `text` | varies | Plain textContent, alphabetical sort | wb-core |
| `size` | 90px | Formatted bytes display, numeric sort via `data-sortVal` | wb-core |
| `badge` | varies | `<span class="badge {color}">` | wb-core |
| `html` | varies | Raw innerHTML (trusted sources only) | wb-core |
| `actions` | auto | Auto-appended action buttons from config | wb-core |
| `path` | flex (min 150px) | Colored dot + escaped text (pluggable color fn) | wb-core |
| `paths` | flex (min 150px) | Array of sub-items, each with inline actions | wb-core |

**Public API:**

| Method | Description |
|--------|-------------|
| `create(id, containerId, columns, opts)` | Create grid with column schema |
| `addRow(id, data)` | Add row (fragment-batched) |
| `addRows(id, dataArray)` | Bulk add |
| `clear(id)` | Wipe rows, reset state |
| `destroy(id)` | Remove grid entirely |
| `getChecked(id, dataKey?)` | Return checked values |
| `selectAll(id, checked)` | Toggle all visible checkboxes |
| `removeByPath(path, id?)` | Remove row(s) with animation |
| `removeByPaths(paths)` | Bulk remove across grids |
| `filter(id, predicate)` | Predicate-based filtering → `{ shown, total }` |
| `showSkeleton(id)` / `removeSkeleton(id)` | Loading state |
| `hasRows(id)` / `rowCount(id)` | Query rows |

**Options:**

```javascript
{
  lineNumbers: true,           // Auto-prepend # column (default: true)
  rowClass: null,              // Custom row class function
  onRowClick: null,            // Row click handler
  onRowDblClick: null,         // Row double-click handler
  actions: [],                 // Row-level action buttons (see RowActions)
  colorFn: null,               // Path cell color function (pluggable)
  legendEnabled: false,        // Show extension color legend bar
  persistWidths: true,         // Save column widths to localStorage
  skeletonRows: 5              // Number of skeleton rows
}
```

#### 3.1.2 `RowActions` — Row-Level Action Buttons

**Location:** `wb-core/components/row-actions.js`

Standardized action button renderer for every grid row.

**API:**

```javascript
// Define action sets
const scanActions = RowActions.create([
  { key: 'trash',  icon: '🗑', title: 'Delete (Recycle Bin)',    onClick: (data, row) => {} },
  { key: 'open',   icon: '📄', title: 'Open file',              onClick: (data, row) => {} },
  { key: 'folder', icon: '📂', title: 'Open containing folder', onClick: (data, row) => {} }
]);

// Render into a cell
RowActions.render(cell, scanActions, data, row);
```

**Features:**
- Configurable icon, title, className, onClick per action
- Consistent `.sg-actions` styling across all grids
- Actions can be conditional per row (e.g., skip trash on keep-listed items)
- Inline variant for sub-path items (`.btn-xxs`, opacity-on-hover)
- Supports both standard and compact layouts

#### 3.1.3 `StatusBar` — Section Status Display

**Location:** `wb-core/components/status-bar.js`

Generic status bar with configurable metric segments.

**Structure:**
```text
┌─────────┬─────────┬─────────┬──────┬──────┬──────────────────┬──────┐
│ STATUS  │ {SEG 1} │ {SEG 2} │ ROWS │ TIME │ {folder ticker}  │ STOP │
└─────────┴─────────┴─────────┴──────┴──────┴──────────────────┴──────┘
```

**Segments (configurable):**

| Segment | Type | Description |
|---------|------|-------------|
| `status` | built-in | "Idle" / "Scanning…" / "Done" / "Error" with color coding |
| `metric` | configurable | Custom label + value (e.g., "FILES", "DUPES", "STALE") |
| `rows` | built-in | Current row count |
| `time` | built-in | Elapsed time (updates every 200ms during active state) |
| `folder` | built-in | Current path / status message ticker |
| `stop` | built-in | Stop button (red, sends cancel callback) |

**Visual States:**
- **Idle:** Gray border (default)
- **Active:** `.scanning` → Orange border + orange status text
- **Done:** `.done` → Green border + green status text
- **Error:** Gray border + error message in folder area

**API:**

```javascript
StatusBar.create(sectionId, { segments: ['files', 'results'] });
StatusBar.begin(sectionId);
StatusBar.progress(sectionId, { files, results, folder });
StatusBar.done(sectionId, summary);
StatusBar.error(sectionId, message);
```

#### 3.1.4 `FilterBar` — Dropdown + Text + Chips Filter

**Location:** `wb-core/components/filter-bar.js`

Reusable filter bar with mode toggle, text search, and chip display.

**Structure:**
```text
┌──────────────┬─────────────────┬──────────────────────┬──────────┐
│ [Dropdown ▾] │ Include|Exclude │ [Filter by text…   ] │ X rows   │
├──────────────┴─────────────────┴──────────────────────┴──────────┤
│ [chip ×] [chip ×] [chip ×]  (exclude mode only)                  │
└──────────────────────────────────────────────────────────────────┘
```

**Features:**
- **Dropdown:** Dynamically populated, sorted alphabetically
- **Mode Toggle:** Include (show one) ↔ Exclude (hide many) with muted ↔ red styling
- **Text Input:** Real-time substring filter (case-insensitive)
- **Status Display:** "X rows" or "Showing X of Y"
- **Exclude Chips:** Removable pills in exclude mode
- **Persistence:** State saved to localStorage, restored on load
- **Callback:** `onFilter(filterState)` → grid applies visibility

**API:**

```javascript
FilterBar.create(sectionId, { onFilter, persistKey });
FilterBar.addOption(sectionId, value, label);   // Add dropdown option
FilterBar.rebuild(sectionId, options[]);         // Rebuild dropdown
FilterBar.apply(sectionId);                      // Trigger filter
FilterBar.getState(sectionId);                   // { mode, text, excluded[], selected }
```

#### 3.1.5 `Toolbar` — Button Bar With Standard Actions

**Location:** `wb-core/components/toolbar.js`

Composable toolbar that renders a standard set of action buttons.

**Button Types:**

| Button | Icon | Class | Purpose |
|--------|------|-------|---------|
| `scan` | 🔍 | `.btn` | Start scan/load |
| `cancel` | ✖ | `.btn muted` | Cancel operation |
| `selectAll` | — | `.btn muted` | Check all visible rows |
| `selectNone` | — | `.btn muted` | Uncheck all visible rows |
| `delete` | 🗑 | `.btn danger` | Delete/trash selected |
| `keep` | 🔒 | `.btn-keep` | Keep selected (protect) |
| `loadMore` | ● | `.load-more-btn-tb` | Load next page of results |
| `custom` | any | any | Custom buttons per section |

**Load More Button States:**
- `disabled` + red dot → No more data (opacity 0.45)
- Enabled + green dot (with glow) → More data available
- `.loading` → Busy state (opacity 0.6, cursor wait)

**API:**

```javascript
Toolbar.create(sectionId, {
  buttons: ['scan', 'cancel', 'selectAll', 'selectNone', 'delete', 'keep', 'loadMore'],
  custom: [{ label: '⚡ Apply All', class: 'btn danger', onClick: fn }],
  onScan, onCancel, onSelectAll, onSelectNone, onDelete, onKeep, onLoadMore
});
Toolbar.setLoadMoreState(sectionId, { hasMore, loading });
Toolbar.setKeepEnabled(sectionId, enabled);
```

#### 3.1.6 `MetricsBar` — Real-Time System Metrics

**Location:** `wb-core/components/metrics-bar.js`

Header-level system health display with mini canvas graphs.

**Widgets:**

| Widget | Element | Description |
|--------|---------|-------------|
| CPU Canvas | `<canvas>` | Real-time CPU % mini-graph + numeric value |
| Memory Canvas | `<canvas>` | Real-time memory % mini-graph + numeric value |
| Thread Counter | `<span>` | App thread count |
| Uptime Pulse Dot | `<span class="pulse-dot green">` | Green pulsing heartbeat (blinks every 500ms) |
| Uptime Display | `<span>` | Elapsed time since load |

**API:**

```javascript
MetricsBar.create(containerId, { metrics: ['cpu', 'mem', 'threads', 'uptime'] });
MetricsBar.update({ cpu, mem, threads });
```

#### 3.1.7 `ConnectionBadge` — Online/Offline Indicator

**Location:** `wb-core/components/connection-badge.js`

Simple status badge for WebSocket connection state.

**States:**
- `.connected` → Green badge, "⚡ Online"
- `.disconnected` → Red badge, "Disconnected"

#### 3.1.8 `SummaryBadges` — Header Stat Badges

**Location:** `wb-core/components/summary-badges.js`

Reusable stat badges for header-level summaries.

| Badge | Color | Content |
|-------|-------|---------|
| Total Saved | Green text | Cumulative freed space |
| Queue | Orange | "🗑 N queued" — files pending deletion |
| Keep Count | Default | "🔒 N" — protected files |

#### 3.1.9 Layout Primitives (EXISTING, currently unused)

These 18 layouts already exist in `wb-core/components/layouts.js` and should now be adopted:

| Layout | Tag | Use For |
|--------|-----|---------|
| `flex` / `cluster` | `<wb-flex>` / `<wb-cluster>` | Header bar, nav tabs, toolbars, metrics bar, status bar |
| `container` | `<wb-container>` | Main content area with max-width + padding |
| `stack` | `<wb-stack>` | Section panels (vertical: title → status → toolbar → grid) |
| `grid` | `<wb-grid>` | Stats grid (`.grid2`), image card layout |
| `sidebarlayout` | `<wb-sidebar>` | Settings split (form + help panel) |
| `cover` | `<wb-cover>` | Keep-list modal (full-height, centered principal) |
| `masonry` | `<wb-masonry>` | Image duplicate cards (alternative to grid) |
| `scrollable` | — | Grid body scroll container (max 70vh) |
| `sticky` | `<wb-sticky>` | Grid header (stick to top of scroll area) |

### 3.2 DiskCleanUp One-Off Enhancements

These are specific to DiskCleanUp and stay in the app's `js/` folder.

#### 3.2.1 Extension Color System

**Location:** `js/ext-colors.js` (existing)

| Feature | Description |
|---------|-------------|
| `colorFor(ext)` | Returns foreground color for ~100+ file extensions |
| `bgFor(ext)` | Returns translucent background tint |
| `extOf(path)` | Extracts extension from path |
| `dot(ext)` | Creates colored dot element |

Plugged into the unified grid via `opts.colorFn` — the grid doesn't know about file extensions, it just calls the function.

#### 3.2.2 Extension Legend Bar

**Location:** `js/ext-legend.js` (new, extracted from scan-grid)

Renders a row of colored extension chips between the grid header and body. Only appears when rows have mixed extensions. Consumes the `colorFn` from ext-colors.

```text
┌──────────────────────────────────────────────────────┐
│ File types (12): .js .ts .css .html .json .md ...    │
└──────────────────────────────────────────────────────┘
```

#### 3.2.3 Scan Lifecycle Manager

**Location:** `js/scan-lifecycle.js` (new, consolidates existing logic)

Orchestrates the start → progress → batch-ready → done → error flow for each section. Wires together:

- WebSocket signals (start, cancel)
- Status bar updates
- Skeleton show/remove
- Page loader (JSONL fetch on batch-ready)
- Filter rebuild on done
- Cache restore on page load

#### 3.2.4 JSONL Paging System

**Location:** `js/page-loader.js` (existing)

| Feature | Description |
|---------|-------------|
| Byte offset tracking | Resumes from last position |
| EOF detection | Knows when no more data |
| ~40KB page size | Chunked reads |
| 24h stale detection | Auto-clear old caches |
| Load More integration | Green/red dot state |

#### 3.2.5 Trash Queue

**Location:** `js/trash-queue.js` (existing)

| Feature | Description |
|---------|-------------|
| Batch collection | Collects paths before sending |
| `/api/trash` POST | Sends batch to backend |
| Retry with backoff | Exponential backoff on failure |
| UI callback | Updates queue badge + removes rows |

#### 3.2.6 Keep List Manager

**Location:** `js/keep-list.js` (existing)

| Feature | Description |
|---------|-------------|
| Add/remove paths | `/api/keep-list/add` and `/api/keep-list/remove` |
| Modal UI | Keep-list modal with checkboxes, un-keep, clear all |
| Grid integration | 🔒 button on checkbox cells, disabled rows for kept items |
| Cache filtering | Kept paths excluded during cache restore |

#### 3.2.7 Section Handler Factory

**Location:** `js/section-handlers.js` (existing, to be updated)

Registers each section with its column schema, toolbar configuration, and one-off customizations. After migration, each handler just provides a **config object** to the unified grid:

```javascript
// Example: stale section handler (after migration)
registerSection('stale', {
  columns: [COL.check, COL.path, COL.size, COL.modified],
  toolbar: ['scan', 'cancel', 'selectAll', 'selectNone', 'delete', 'keep', 'loadMore'],
  statusSegments: [{ key: 'files', label: 'FILES' }, { key: 'results', label: 'STALE' }],
  filter: true,
  actions: STANDARD_ROW_ACTIONS,
  onDblClick: (data) => openInVSCode(data.path)
});
```

#### 3.2.8 Image Card Layout

**Location:** `js/image-cards.js` (new, extracted from section-handlers)

Renders duplicate image groups as visual cards instead of grid rows. Uses wb-core `grid` or `masonry` layout for the card container.

Each card:
- Image preview (lazy-loaded, onerror fallback)
- File path (small text)
- 🗑 Delete button (copies) or ✅ Keep label (original)
- 🔒 Keep button

#### 3.2.9 Duplicates MVVM

**Location:** `sections/duplicates.js`, `models/duplicates-model.js`, `viewmodels/section-vm.js`, `views/grid-view.js` (existing)

The MVVM architecture stays as a one-off but renders into the unified grid shell:

| Component | Responsibility |
|-----------|---------------|
| DuplicatesModel | Column defs, JSONL parsing, data contract |
| SectionVM | Data Map, JSONL R/W, RAF-batched dirty key flush |
| GridView | Renders groups into unified grid rows |

Features: `MAX_RENDERED=200` groups, `GROUPS_PER_FRAME=20` per RAF, `MAX_ROWS_PER_GROUP=20` with click-to-expand.

#### 3.2.10 Process Manager (Tasks)

**Location:** `js/task-manager.js` (existing)

One-off for Windows process management. Uses unified grid with custom columns:

| Column | Description |
|--------|-------------|
| Checkbox | Selection |
| Safety Badge | 🟢 Safe / 🟡 Caution / 🔴 Critical |
| PID | Process ID |
| Name | Process name |
| Memory | Right-aligned, formatted |
| Threads | Right-aligned count |
| Company | Publisher |
| Description | Process description |
| Path | Executable path |

Custom toolbar: Refresh, Kill Selected, safety filter dropdown.

#### 3.2.11 Savings Log

**Location:** `js/savings.js` (existing)

One-off historical audit trail. Uses unified grid with custom columns:

Custom toolbar: Session badge, Refresh, Export JSON, New Session, Recycle Bin toggle.
Custom filters: Action type dropdown (trash/delete/smart-dedup).
Stats grid: Cumulative totals in `.grid2` boxes.
Recycle Bin panel: Separate toggle-able sub-view.

---

## 4. Per-Section Configuration

### 4.1 Column Schemas

**Shared COL constants** (from section-handlers.js):

| Key | Label | Width | Type |
|-----|-------|-------|------|
| `check` | (none) | 56px | checkbox |
| `path` | File | flex:3 (min 150) | path |
| `keep` | Keep (newest) | flex:2 (min 120) | path |
| `delPaths` | Will Delete | flex:3 (min 150) | paths |
| `size` | Size | 90px | size |
| `modified` | Modified | 140px | text |
| `project` | Project | flex:1 (min 100) | text |
| `dirName` | Folder Name | 140px | badge |
| `files` | Files | 70px | text |

### 4.2 Section → Full Configuration Matrix

| Section | Columns | Toolbar Buttons | Status Segments | Filter | Row Actions | DblClick | Special |
|---------|---------|-----------------|-----------------|--------|-------------|----------|---------|
| **duplicates** | MVVM (select, status, path, size, modified) | scan, cancel, selectAll, selectNone, delete, keep, **deleteAllCopies**, loadMore | FILES, DUPES | No (MVVM) | trash, open, folder | VS Code | Group separators, preview (images/code), click-to-expand |
| **smart-dedup** | keep, delPaths, size | scan, cancel, **applyAll**, loadMore | FILES, GROUPS | Yes | trash, open, folder | VS Code | Inline sub-path actions per "Will Delete" entry |
| **stale** | check, path, size, modified | scan, cancel, selectAll, selectNone, delete, keep, loadMore | FILES, STALE | Yes | trash, open, folder | VS Code | — |
| **large** | check, path, size | scan, cancel, selectAll, selectNone, delete, keep, loadMore | FILES, LARGE | Yes | trash, open, folder | VS Code | Sorted by size desc |
| **node-modules** | check, path, size | scan, cancel, selectAll, selectNone, **deletePermanent**, keep, loadMore | FILES, FOUND | Yes | trash, open, folder | VS Code | Permanent delete (not recycle) |
| **venvs** | check, path, project, size | scan, cancel, selectAll, selectNone, delete, keep, loadMore | FILES, VENVS | Yes | trash, open, folder | VS Code | Project name tracking |
| **empty** | check, path | scan, cancel, selectAll, selectNone, **deleteEmpty**, keep, loadMore | SCANNED, EMPTY | Yes | trash, open, folder | VS Code | No size column |
| **images** | Card layout (not grid rows) | scan, cancel, **deleteAllCopies**, loadMore | FILES, GROUPS | No | trash, open, folder (per card) | — | Thumbnail previews, lazy load |
| **backups** | check, dirName, path, files, size | scan, cancel, selectAll, selectNone, delete, keep, loadMore | SCANNED, FOUND | Yes | trash, open, folder | VS Code | Orange badge for folder name |
| **tiny-files** | check, path, size, modified | scan, cancel, selectAll, selectNone, delete, keep, loadMore, **fullView** | FILES, TINY | Yes | trash, open, folder | VS Code | External full-view page |
| **html-files** | check, path, size, modified | scan, cancel, selectAll, selectNone, delete, keep, loadMore | FILES, HTML | Yes | trash, open, folder | **Browser** | Opens in default browser |
| **css-files** | check, path, size, modified | scan, cancel, selectAll, selectNone, delete, keep, loadMore | FILES, CSS | Yes | trash, open, folder | **Browser** | Opens in default browser |
| **tasks** | checkbox, safety, pid, name, memory, threads, company, desc, path | **refresh**, **killSelected** | — | Text + safety dropdown | — | — | Safety badges, no scan lifecycle |
| **savings** | Custom data-grid columns | **refresh**, **export**, **newSession**, **recycleBin** | — | Text + action dropdown | restore | — | Stats grid, session badge |

### 4.3 Standard Row Actions (Every Scan Section)

Every scan section's grid rows get these three actions auto-appended:

| Action | Icon | Title | Behavior |
|--------|------|-------|----------|
| Trash | 🗑 | Delete (Recycle Bin) | `TrashQ.enqueue(path)` → remove from all grids + backend cache |
| Open File | 📄 | Open file | `/api/open` (VS Code) or `/api/open-default` (browser, for html/css) |
| Open Folder | 📂 | Open containing folder | Extract parent dir → `/api/open-folder` |

**Smart Dedup sub-paths** also get these three actions inline (`.btn-xxs`, opacity-on-hover).

### 4.4 Custom Toolbar Buttons (One-Off Per Section)

| Section | Button | Label | Action |
|---------|--------|-------|--------|
| duplicates | deleteAllCopies | 🗑 Delete All Copies | Trash all non-keep items |
| smart-dedup | applyAll | ⚡ Apply All (Delete Copies) | Apply smart-dedup decisions |
| node-modules | deletePermanent | 🗑 Delete Permanently | `/api/delete-permanent` (bypasses recycle) |
| empty | deleteEmpty | 🗑 Delete Selected | `/api/empty-folders/delete` |
| images | deleteAllCopies | 🗑 Delete All Copies | Trash all image copies |
| tiny-files | fullView | 🔍 Full View | `window.open('/tinyfiles-render.html')` |
| tasks | refresh | 🔄 Refresh | `taskMgr.load()` |
| tasks | killSelected | ☠️ Kill Selected | `taskMgr.killSelected()` |
| savings | refresh | 🔄 Refresh | Reload savings data |
| savings | export | 📤 Export JSON | Download savings as JSON |
| savings | newSession | 🆕 New Session | Create new savings session |
| savings | recycleBin | ♻️ Recycle Bin | Toggle recycle bin panel |

---

## 5. Global Controls & Widgets

### 5.1 Header Bar

| Widget | ID | Type | Location |
|--------|----|------|----------|
| Logo | — | Static | wb-core `flex` |
| Root Path Display | `#rootPath` | Text | DiskCleanUp one-off |
| Connection Badge | `#connStatus` | `ConnectionBadge` | wb-core |
| Total Saved | `#totalSaved` | `SummaryBadges` | wb-core |
| Queue Badge | `#queueBadge` | `SummaryBadges` | wb-core |
| Keep Badge | `#keepBadgeBtn` | `SummaryBadges` | wb-core |
| Trace Button | — | Button | DiskCleanUp one-off |
| Metrics Bar | `#metricsBar` | `MetricsBar` | wb-core |

### 5.2 Navigation Tabs

| Widget | Type | Location |
|--------|------|----------|
| Section tab buttons | `wb-core tabs` component | wb-core (currently unused, should adopt) |
| Active section toggle | `.active-section` class | wb-core `tabs` handles this |

### 5.3 Modals & Overlays

| Widget | Current | Migrated To |
|--------|---------|-------------|
| Keep-List Modal | Custom `.kl-modal` div | wb-core `overlay`/`sheet` + `stack` + `cover` |

---

## 6. Animations & Visual Feedback

### 6.1 wb-core Reusable Animations

| Animation | Class | Duration | Description |
|-----------|-------|----------|-------------|
| Row entry | `.live-row` | 0.4s | Fade-in from tint color |
| Row removal | `.keep-flash` | 0.4s | Green flash + slide-right |
| Skeleton pulse | `.skel-bar` | 1.4s | Opacity cycle (loading state) |
| Pulse glow | `.pulse-dot` | continuous | Heartbeat animation (uptime) |

### 6.2 DiskCleanUp One-Off Animations

| Animation | Description |
|-----------|-------------|
| Load More dot glow | Green shadow when data available, static red when exhausted |
| Status bar border transitions | Gray → orange (scanning) → green (done) |

---

## 7. Backend Integration

### 7.1 WebSocket Protocol

**Connection:** `ws://{host}/ws` — auto-reconnect with exponential backoff (0, 2s, 5s, 10s, 20s + jitter).

**Client → Server:**

| Message | Fields | Purpose |
|---------|--------|---------|
| `start` | `{ type: "start", section, extensions? }` | Start a scan |
| `cancel` | `{ type: "cancel", section }` | Cancel a running scan |

**Server → Client:**

| Message | Fields | Purpose |
|---------|--------|---------|
| `started` | `{ section, type: "started" }` | Scan began — show skeleton |
| `progress` | `{ section, type: "progress", data: { files, results, folder } }` | Status bar update (every 200ms) |
| `batch-ready` | `{ section, type: "batch-ready", data: { count } }` | Rows written to disk — fetch via HTTP |
| `done` | `{ section, type: "done", data: { results, totalBytes?, ... } }` | Scan complete |
| `error` | `{ section, type: "error", data: { message } }` | Scan failed |
| `metrics/update` | `{ section: "metrics", type: "update", data: { cpu, mem, threads } }` | System metrics broadcast |

### 7.2 REST API Endpoints

**Cache (JSONL paging):**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/cache/{section}` | GET | Read JSONL page → `{ rows[], nextOffset? }` |
| `/api/cache/{section}` | DELETE | Clear section cache |
| `/api/cache/{section}/remove` | POST | Remove paths from JSONL + trash files |

**File Operations:**

| Endpoint | Method | Body | Purpose |
|----------|--------|------|---------|
| `/api/trash` | POST | `{ paths[] }` | Move to Recycle Bin |
| `/api/delete-permanent` | POST | `{ paths[] }` | Permanently delete (node_modules) |
| `/api/empty-folders/delete` | POST | `{ paths[] }` | Delete empty directories |
| `/api/smart-dedup/apply` | POST | `{ items[] }` | Delete numbered copies |
| `/api/open` | POST | `{ path }` | Open in VS Code |
| `/api/open-default` | POST | `{ path }` | Open with default app (browser) |
| `/api/open-folder` | POST | `{ path }` | Open containing folder in Explorer |
| `/api/file` | GET | `?path=...` | Serve file content (image previews) |

**Keep List:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/keep-list` | GET | Get all kept paths |
| `/api/keep-list/add` | POST | Add paths |
| `/api/keep-list/remove` | POST | Remove paths |
| `/api/keep-list` | DELETE | Clear all |

**System:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/config` | GET/POST | Load/save settings |
| `/api/session` | GET | Current session info |
| `/api/session/new` | POST | Create new savings session |
| `/api/savings` | GET | Savings log data |
| `/api/export` | GET | Export savings as JSON |
| `/api/recycle-bin` | GET | List Recycle Bin contents |
| `/api/recycle-bin/restore` | POST | Restore files from Recycle Bin |
| `/api/tasks` | GET | List Windows processes |
| `/api/tasks/kill` | POST | Kill process(es) |
| `/api/gc` | POST | Trigger .NET garbage collection |
| `/api/trace` | POST/DELETE | Write/clear trace log |

### 7.3 Scan Lifecycle

```json
1. User clicks Scan          → Toolbar.onScan(section)
2. Clear UI + show skeleton  → GridShell.clear() + GridShell.showSkeleton()
3. WS send { type: start }   → websocket.js wsSend()
4. Server: 'started'         → StatusBar.begin(), skeleton shown
5. Server: 'progress' × N    → StatusBar.progress() (files/results/folder, every 200ms)
6. Server: 'batch-ready' × N → page-loader fetches JSONL → GridShell.addRows()
7. Server: 'done'            → StatusBar.done(), FilterBar.rebuild()
8. User selects + deletes    → TrashQ.enqueue() → /api/trash → /api/cache/remove
```

### 7.4 JSONL Cache System

- Backend writes scan results as JSONL to disk files
- Frontend reads via `/api/cache/{section}?offset=N` in ~40KB pages
- `page-loader.js` manages byte offsets, EOF detection, and resume
- On page load, `init.js restoreCachedResults()` replays all cached sections
- Stale cache auto-cleared after 24 hours
- Keep-list paths filtered out during cache restore

---

## 8. Settings Section

Not a grid — a configuration form. Uses wb-core `sidebarlayout` for the split view.

| Control | ID | Type | Description |
|---------|----|------|-------------|
| Root Path | `#cfgRoot` | text input | Primary scan root directory |
| Extra Roots | `#cfgExtraRoots` | textarea (4 rows) | Additional root directories |
| Stale Days | `#cfgStaleDays` | number input | Threshold for stale file detection |
| Large MB | `#cfgLargeMb` | number input | Threshold for large file detection |
| Parallelism | `#cfgParallelism` | number input | Scan thread count |
| Schedule Time | `#cfgScheduleTime` | text input | Auto-scan time (e.g., "02:00") |
| Schedule Sections | `#cfgScheduleSections` | text input | Comma-separated section list |
| Trace Enabled | `#cfgTrace` | checkbox | Enable/disable trace logging |
| Save Button | — | `.btn green` | 💾 Save Settings |
| Trace Viewer | — | `.btn muted` | Opens `/trace-viewer.html` in new tab |
| Help Panel | — | Markdown rendered | Right column documentation |

---

## 9. Keyboard & Accessibility

| Key | Context | Action |
|-----|---------|--------|
| Escape | Modal open | Close modal |
| Space | Row focused | Toggle checkbox |
| Double-click | Grid row | Open file (VS Code or browser per section) |
| Tab | Anywhere | Standard form tab order |

---

## 10. Migration Path Summary

### 10.1 New wb-core Components to Build

| Component | Priority | Replaces |
|-----------|----------|----------|
| `GridShell` | P0 — Critical | scan-grid.js + data-grid.js + GridView renderer |
| `RowActions` | P0 — Critical | Hardcoded actions in scan-grid `case 'actions':` |
| `StatusBar` | P1 — High | status-bar.js inline DOM creation |
| `FilterBar` | P1 — High | scan-filter.js inline DOM creation |
| `Toolbar` | P1 — High | Repeated toolbar HTML in index.html |
| `MetricsBar` | P2 — Medium | metrics.js canvas + DOM |
| `ConnectionBadge` | P2 — Medium | Inline connection status DOM |
| `SummaryBadges` | P2 — Medium | Inline header badge DOM |

### 10.2 Layout Adoptions (Existing wb-core, Currently Unused)

| Layout | Replaces | Priority |
|--------|----------|----------|
| `flex` / `cluster` | Hand-written `display: flex` on header, nav, toolbars | P1 |
| `container` | Hand-written `padding: 20px; max-width: 100%` on main | P1 |
| `stack` | Hand-written flex-column on section panels | P1 |
| `grid` | Hand-written `.grid2`, `.img-grid` | P2 |
| `sidebarlayout` | Hand-written `.settings-split` grid | P2 |
| `tabs` | Custom button-based section switching | P2 |
| `cover` / `overlay` | Custom keep-list modal | P3 |

### 10.3 Quick Wins (Existing wb-core Utilities, Currently Unused)

| Utility | Replaces | Files Affected |
|---------|----------|----------------|
| `escHtml` | data-grid's duplicate `_esc()` | data-grid.js |
| `fmtNumber` | `.toLocaleString()` calls | 10+ files |
| `fmtDate` / `fmtTime` | `new Date().toLocaleString()` | savings.js, others |

### 10.4 DiskCleanUp Refactors

| Module | Action |
|--------|--------|
| `ext-legend.js` | Extract from scan-grid into standalone module |
| `scan-lifecycle.js` | Consolidate start/progress/done flow from multiple files |
| `image-cards.js` | Extract image card rendering from section-handlers |
| Section handlers | Convert from DOM builders to config objects for unified grid |
