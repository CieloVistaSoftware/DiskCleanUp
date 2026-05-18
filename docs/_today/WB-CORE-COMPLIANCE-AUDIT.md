---
docid: 300.9.wb-core-compliance-audit
id: wb-core-compliance-audit-one-time-one-place
title: "WB-CORE COMPLIANCE AUDIT — One-Time-One-Place"
project: DiskCleanUp
description: "Full codebase audit to find every one-off duplicating wb-core. Scope: all .js, .css, .html files."
status: active
tags: [core, compliance, audit]
category: 300.9 — Meta
created: 2026-03-03
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: docs/_today/WB-CORE-COMPLIANCE-AUDIT.md
---
# WB-CORE COMPLIANCE AUDIT — One-Time-One-Place

**Date:** 2026-03-03
**Scope:** Every `.js`, `.css`, `.html` file — full codebase line-by-line
**Objective:** Find every one-off that duplicates wb-core, every shared pattern missing a single home, and every inline block that should be a module.
**Rule:** If wb-core has it, use wb-core. If two files share it, extract it. One-offs are allowed ONLY after confirming nothing in wb-core covers it.

---

## Compliance Score

| Layer | Score | Verdict |
|-------|-------|---------|
| C# Backend | **95%** | ✅ ScanFilesGeneric template, FilteredFiles(), static extension sets |
| JS (wb-core imports) | **60%** | ⚠️ wb-core exists but several files ignore it |
| JS (shared helpers) | **50%** | 🔴 Path escaping, alert(), raw fetch — all duplicated |
| CSS (styling) | **45%** | 🔴 Badge, button, flex, skeleton all re-implemented in dashboard.css |
| HTML (inline code) | **35%** | 🔴 5 HTML files have inline `<style>` + `<script>` + `on*` handlers |

**Overall: ~55% compliant.** The wb-core layer is solid. The app layer doesn't use it enough.

---

## 🔴 HIGH PRIORITY — JS Duplication

### H-001: `_esc()` in data-grid.js duplicates wb-core `escHtml()`

**File:** `wwwroot/js/data-grid.js` line 356
```javascript
function _esc(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

**wb-core provides:** `escHtml()` in `lib/wb-core/utils/format.js`
**Already migrated in:** scan-grid.js, task-manager.js, recycle-bin.js, savings.js
**Still broken in:** data-grid.js — the ONE holdout

**Fix:** Add `import { escHtml } from '/lib/wb-core/utils/format.js';` at top, delete the local `_esc()`, replace all calls with `escHtml()`.

**Effort:** 5 min | **Risk:** Zero

---

### H-002: Five files render `<table>` HTML instead of CSS Grid

wb-core provides `GridShell` — CSS Grid engine with sort, resize, skeleton, checkbox, fragment batching. Five files ignore it:

| ID | File | Line | Renders |
|----|------|------|---------|
| H-002a | `table-utils.js` | 46, 101 | Generic `<table>` factory with skeleton rows |
| H-002b | `recycle-bin.js` | 44 | `<table id="rbTable">` |
| H-002c | `savings.js` | 69 | `<table id="savingsTable-${sid}">` per session |
| H-002d | `keep-list.js` | 69 | `<table id="savingsTable-${sid}">` |
| H-002e | `task-manager.js` | 220 | `<table class="task-table">` |

**Fix:** Migrate each to GridShell using stale-unified.js as the template.

**Migration order:** recycle-bin → task-manager → savings → keep-list → retire table-utils.js

**Effort:** 1-2 hr each | **Depends on:** WB-001 data-grid behavior in wb-core

---

### H-003: Path escaping duplicated in 5 files

Same `replace(/\\/g, '\\\\').replace(/'/g, "\\'")` in:

| File | Line | Context |
|------|------|---------|
| `actions.js` | 187 | onclick for open-folder |
| `section-handlers.js` | 259 | onclick for open-folder |
| `keep-list.js` | 202 | onclick for open-folder |
| `scan-grid.js` | 591 | Extracting folder from path |
| `task-manager.js` | 237 | Shortening system paths |

**Fix:** Create ONE function in `ui-utils.js`:
```javascript
export function escPath(fp) {
  return (fp || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}
```

**Effort:** 30 min | **Risk:** Zero

---

### H-004: 16 `alert()` calls instead of wb-core `createToast()`

| File | Count | Examples |
|------|-------|---------|
| `actions.js` | 7 | `alert('Select files first.')`, `alert('Scan first.')`, `alert('No duplicate image copies found.')` |
| `savings.js` | 6 | `alert('Select entries first.')`, `alert('Restore failed...')`, `alert('Could not start new session')` |
| `keep-list.js` | 2 | `alert('Select files first.')`, `alert('Select files to un-keep first.')` |
| `recycle-bin.js` | 1 | `alert('No items selected')` |

**wb-core provides:** `createToast()` in `components/feedback.js`
**Fix:** Import `createToast`, replace `alert(msg)` with `createToast(msg, 'warn')`.

**Effort:** 1 hr | **Risk:** Low — better UX

---

### H-005: Raw `fetch()` calls bypass `apiFetch()`

`keep-list.js` has 6+ raw `fetch()` calls instead of using `apiFetch` from ui-utils.js:

| Line | Code |
|------|------|
| 61-65 | `fetch('/api/cache/${sec}/remove', { method: 'POST', ... }).catch(() => {})` |
| 114 | Similar fire-and-forget fetch |
| 202 | Inline `fetch('/api/open-folder', ...)` inside HTML onclick attribute |

**wb-core provides:** `apiFetch()` in ui-utils.js wrapper — includes error logging + timeout
**Fix:** Replace all raw `fetch()` with `apiFetch()`.

**Effort:** 30 min | **Risk:** Low

---

## 🔴 HIGH PRIORITY — CSS Duplication

### H-006: dashboard.css re-implements wb-core button, badge, flex, skeleton, and table styles

`dashboard.css` is the biggest offender. It re-implements patterns wb-core already provides:

#### Buttons (lines 37-42)
```css
.btn { background: var(--accent); padding: 7px 16px; border-radius: 4px; }
.btn.danger { background: #e74c3c; }
.btn.muted { background: #444; }
.btn.green { background: #2ecc71; }
.btn.orange { background: #f39c12; }
```
**wb-core provides:** `.tb-btn`, `.tb-btn-danger`, `.tb-btn-muted` in `toolbar.css`

#### Badges (lines 49-53, 184-187, 459-462, 546-556)
```css
.badge { padding: 2px 8px; border-radius: 10px; }
#queueBadge { background: var(--orange); padding: 3px 10px; border-radius: 10px; }
.savings-badge { padding: 2px 10px; border-radius: 10px; }
.keep-badge { background: #2ecc71; padding: 1px 6px; border-radius: 10px; }
```
**wb-core provides:** `.sb-badge`, `.sb-green`, `.sb-orange`, `.sb-red` in `summary-badges.css`

#### Flex/Grid utilities (lines 10, 54, 90-94, 333)
```css
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.fix-grid { display: grid; gap: 1.25rem; }
```
**wb-core provides:** `.flex-row`, `.flex-column`, `.gap-*`, `.grid-columns`, `.grid-auto` in `layout.css`

#### Skeleton animation (lines 153-169, 473-477)
```css
@keyframes skelPulse { 0%,100%{opacity:.35} 50%{opacity:.7} }
.skel-grid { ... }
.skel-card { animation: skelPulse ... }
```
**wb-core provides:** Built-in skeleton in `grid-shell.css`

#### Table styles (lines 44-48, 493-505)
```css
table { width: 100%; border-collapse: collapse; }
th { padding: 8px 10px; }
th.sort-asc::after { content: " ▲"; }
```
**wb-core provides:** GridShell handles all of this via CSS Grid

**Fix:** Refactor dashboard.css to import and use wb-core classes. Remove duplicate definitions.

**Effort:** 2-3 hrs | **Impact:** Eliminates ~150 lines of duplicate CSS

---

## 🔴 HIGH PRIORITY — HTML Inline Code

### H-007: Five HTML files have inline `<style>` and `<script>` blocks

Every one of these violates the one-time-one-place rule. Styles belong in `.css` files. Scripts belong in `.js` ES modules.

| File | Inline `<style>` lines | Inline `<script>` lines | Total inline |
|------|----------------------|------------------------|-------------|
| `fix-viewer.html` | 168 lines (7-174) | 192 lines (216-408) | **360 lines** |
| `tinyfiles-render.html` | 83 lines (6-88) | 207 lines (137-343) | **290 lines** |
| `architecture.html` | 181 lines (10-190) | 72 lines (632-703) | **253 lines** |
| `error-viewer.html` | 63 lines (7-69) | 84 lines (102-185) | **147 lines** |
| `trace-viewer.html` | 45 lines (6-50) | 102 lines (65-166) | **147 lines** |

**Total: ~1,197 lines of inline code that should be in separate files.**

**Fix per file:**
1. Extract `<style>` → `css/{name}.css`, link with `<link rel="stylesheet">`
2. Extract `<script>` → `js/{name}.js`, load with `<script type="module" src="...">`
3. Replace `on*` attributes with `addEventListener()` in the extracted JS

**Effort:** 30 min per file (~2.5 hrs total) | **Risk:** Low — pure extraction

---

### H-008: 15+ inline event handlers across HTML files

| File | Line | Handler | Fix |
|------|------|---------|-----|
| `tinyfiles-render.html` | 110 | `oninput="applyFilters()"` | `addEventListener('input', applyFilters)` |
| `tinyfiles-render.html` | 111 | `onchange="applySort()"` | `addEventListener('change', applySort)` |
| `tinyfiles-render.html` | 120 | `onclick="clearFilters()"` | `addEventListener('click', clearFilters)` |
| `tinyfiles-render.html` | 128-130 | `onclick="sortCol('path')"` | Event delegation |
| `error-viewer.html` | 76 | `oninput` (missing handler) | Fix + `addEventListener` |
| `error-viewer.html` | 78 | `onchange="..."` | `addEventListener` |
| `trace-viewer.html` | 55-60 | 4× `onclick` + 2× `oninput/onchange` | Event delegation |
| `index.html` | 20 | `onclick="fetch('/api/open-folder'...)"` | Extract to module |
| `index.html` | 393 | `oninput="window._taskMgr?.filter()"` | `addEventListener` |
| `index.html` | 420 | `oninput="window.filterSavings()"` | `addEventListener` |
| `index.html` | 582 | Modal `onclick` close handler | Extract to module |

**Fix:** All inline handlers → `addEventListener()` calls in the extracted JS modules.

---

### H-009: HTML files missing wb-core CSS imports

| File | Uses wb-core JS? | Links wb-core CSS? | Missing |
|------|-------------------|-------------------|---------|
| `fix-viewer.html` | No | No | toolbar.css, summary-badges.css |
| `tinyfiles-render.html` | No | No | All wb-core CSS |
| `error-viewer.html` | Yes (`escHtml`) | No | error-logger.css, toolbar.css |
| `trace-viewer.html` | No | No | All wb-core CSS |
| `architecture.html` | No | No | layout.css (documentation page, low priority) |
| `index.html` | Yes | Yes | ✅ Correct |
| `grid-shell-test.html` | Yes | Yes | ✅ Correct |

---

### H-010: Two `<table>` elements in HTML files

| File | Line | Table |
|------|------|-------|
| `tinyfiles-render.html` | 124-135 | Sort-by-column table with inline onclick headers |
| `error-viewer.html` | 86-99 | Error log table |

**Fix:** Migrate to CSS Grid or GridShell component (aligns with H-002).

---

## ⚠️ MEDIUM — Missed wb-core Opportunities

### M-001: Dual skeleton systems

| System | File | Approach |
|--------|------|----------|
| Legacy | `table-utils.js` lines 82-105 | `<tr class="skel-row">` inside `<table>` |
| Modern | `scan-grid.js`, `data-grid.js` | CSS Grid `skel-w-0` through `skel-w-5` |

**Dies with:** H-002 (retire table-utils.js after GridShell migration)

---

### M-002: wb-core layout utilities unused

`LayoutBuilder` (layout.js) with `.withHeader()`, `.withStatusBar()`, `.withGrid()` plus `.flex-row`, `.gap-*`, `.p-*` CSS utilities.

**Used by:** Only `stale-unified.js` (Phase 6.1 pilot)
**Ignored by:** Every other section
**Fix:** Adopt as sections migrate (part of H-002)

---

### M-003: `fmtBytes()` bypass in trash-queue.js

**File:** `wwwroot/js/trash-queue.js` line 26
```javascript
`freed ${((data.freed||0)/1024).toFixed(0)}KB`
```
**Fix:** Import `fmtBytes()`, replace inline math.

**Effort:** 2 min

---

### M-004: Non-standard responsive breakpoints

| File | Breakpoint | wb-core standard |
|------|-----------|-----------------|
| `dashboard.css` | 1100px | 1200px |
| `architecture.html` | 600px | 480px or 768px |
| Various | Mix of 1024px, 768px | 480px, 768px, 1200px |

**Fix:** Align all breakpoints to wb-core's three: 480px, 768px, 1200px.

---

### M-005: Color variables defined in 3 places

| File | Variables |
|------|----------|
| `dashboard.css` lines 1-6 | `--bg: #0d1117; --accent: #58a6ff; --border: ...` |
| `error-viewer.html` lines 8-12 | `--bg: #1f2937; --text: #f9fafb; ...` |
| `fix-viewer.html` inline | `--bg-primary: ...; --bg-secondary: ...` |

**Fix:** Centralize all CSS variables in one file (either dashboard.css or a new `theme.css`) and import everywhere.

---

## ✅ COMPLIANT — Already Following the Rules

| Area | Evidence |
|------|----------|
| **PubSub / Event Bus** | `event-queue.js` imports from `wb-core/utils/pubsub.js` — no custom event system |
| **`fmtBytes()` formatting** | Correctly imported in scan-grid.js, data-grid.js, task-manager.js, ui-utils.js |
| **`escHtml()` in 4 of 5 files** | scan-grid.js, task-manager.js, recycle-bin.js, savings.js — all from wb-core |
| **Error logging** | error-logger.js correctly delegates to wb-core's `logError()` |
| **C# ScanFilesGeneric** | 5 scanners use shared template — zero duplication |
| **C# FilteredFiles()** | All 7 file-enumerating scanners share one method |
| **C# static readonly extension sets** | `_htmlExts`, `_cssExts`, `_imageExts`, `_preferredExts` — allocated once |
| **C# _WriteLock() factory** | Per-section write locks — single implementation |
| **Phase 6 GridShell** | 8 components exported from wb-core, stale section fully migrated |
| **Section handler factory** | 9 handlers from 1 factory + config objects |
| **`_postAndRescan` helper** | 4 action functions delegate to shared helper |
| **index.html** | Correctly links wb-core CSS + loads JS modules via init.js |
| **grid-shell-test.html** | Correctly imports all wb-core components |

---

## Retirement Plan

Files that become dead code after completing all HIGH items:

| File | Lines | Dies after |
|------|-------|-----------|
| `table-utils.js` | ~100 | H-002 (all tables → GridShell) |
| `column-controls.js` | ~25 | H-002 (GridShell has built-in column resize) |
| 5× inline `<style>` blocks | ~540 | H-007 (extracted to .css files) |
| 5× inline `<script>` blocks | ~657 | H-007 (extracted to .js modules) |

**Total cleanup: ~1,322 lines of duplicated/inline code eliminated.**

---

## Execution Priority

| # | ID | Task | Effort | Impact |
|---|-----|------|--------|--------|
| 1 | H-001 | Import `escHtml` in data-grid.js, delete `_esc()` | 5 min | Consistency |
| 2 | H-003 | Extract `escPath()` to ui-utils.js, replace 5 copies | 30 min | ~15 dup lines |
| 3 | M-003 | Use `fmtBytes()` in trash-queue.js | 2 min | 1 inline calc |
| 4 | H-005 | Replace raw `fetch()` with `apiFetch()` in keep-list.js | 30 min | Error handling |
| 5 | H-004 | Replace 16 `alert()` with `createToast()` | 1 hr | UX + thread blocking |
| 6 | H-007 | Extract inline `<style>` + `<script>` from 5 HTML files | 2.5 hr | ~1,197 inline lines |
| 7 | H-008 | Replace 15+ inline `on*` handlers with `addEventListener` | 1 hr | Comes with H-007 |
| 8 | H-006 | Refactor dashboard.css to use wb-core classes | 2-3 hr | ~150 dup CSS lines |
| 9 | M-005 | Centralize CSS variables in one file | 30 min | 3 copies → 1 |
| 10 | H-002a | Migrate recycle-bin.js to GridShell | 1-2 hr | First table kill |
| 11 | H-002b | Migrate task-manager.js to GridShell | 1-2 hr | Second table kill |
| 12 | H-002c | Migrate savings.js to GridShell | 2 hr | Third table kill |
| 13 | H-002d | Migrate keep-list.js to GridShell | 2 hr | Fourth table kill |
| 14 | H-010 | Migrate 2 HTML file tables to CSS Grid | 1 hr | Last tables |
| 15 | M-001 | Delete table-utils.js + column-controls.js | 10 min | ~125 dead lines |
| 16 | H-009 | Add missing wb-core CSS links to HTML files | 15 min | Consistency |
| 17 | M-004 | Align breakpoints to 480/768/1200 | 30 min | Standardization |

**Estimated total: ~16-18 hours to reach 95%+ compliance.**
**Quick wins (items 1-5): ~2 hours for immediate consistency.**

---

## Rules Going Forward

1. **Never write a local utility if wb-core exports one.** Check `lib/wb-core/index.js` first.
2. **Never use `<table>`.** GridShell or CSS Grid only.
3. **Never use `alert()`.** Use `createToast()` from wb-core.
4. **Never put `<style>` or `<script>` inline in HTML.** Separate `.css` and `.js` files always.
5. **Never use `on*` HTML attributes.** Use `addEventListener()` in JS modules.
6. **Never define CSS utilities already in layout.css.** Use `.flex-row`, `.gap-*`, `.p-*` etc.
7. **Never define badge/button styles outside wb-core.** Use `.sb-badge`, `.tb-btn` classes.
8. **If you write the same logic twice, stop.** Extract to ui-utils.js (app-specific) or wb-core (project-agnostic).
9. **New sections use the stale-unified.js pattern.** GridShell + StatusBar + FilterBar + Toolbar + RowActions.
10. **Path handling goes through `escPath()`.** One function, one import, everywhere.
11. **CSS variables live in ONE file.** No per-page `:root` blocks.
12. **Breakpoints are 480px, 768px, 1200px.** No custom values.

---

*Full audit completed: 2026-03-03 — 17 action items, ~1,322 lines of duplication identified.*
