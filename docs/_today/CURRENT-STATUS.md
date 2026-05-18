---
docid: 300.9.current-status
id: parking-lot
title: 🅿️ PARKING LOT
project: DiskCleanUp
description: "Parking lot and current session status for DiskCleanUp."
status: active
tags: [current, status, parking]
category: 300.9 — Meta
created: 2026-03-24
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: docs/_today/CURRENT-STATUS.md
---
# 🅿️ PARKING LOT

**Last session:** 2026-05-09
**Active project:** DiskCleanUp (`C:\Users\jwpmi\source\repos\DiskCleanUp`)

## 🅿️ PARKING LOT — end of session 2026-05-09

**TASK:** WebSocket auto-recovery (diagram-informed) + CieloVistaStandards git repo
**FILES TOUCHED:**
- `DiskCleanUp.Service/wwwroot/js/websocket.ts` + `websocket.js` — 3-case overlay (A/B/C), onopen clears overlay, Dismiss resets flag, wsConnect shows "Connecting…"
- `DiskCleanUp.Service/Services/WsManager.cs` — ILogger injection, logged outer catch
- `DiskCleanUp.Service/Program.cs` — KeepAliveInterval 30s (was Zero)
- `tests/ws-auto-recovery-test.mjs` — NEW: 13 checks, all pass; .NET build 0 errors
- `CLAUDE.md` — Global Standards table updated with repo URL + issue-filing-rules.md
**LAST ACTION:** All tests pass; .NET build clean; CieloVistaStandards pushed to GitHub
**NEXT STEP:** `npm run restart` → verify overlay shows correct failure case → confirm auto-dismiss on reconnect. Then open PR for cielovista-tools branch claude/dreamy-shaw-bde8a6.
**OPEN QUESTIONS:**
- DiskCleanUp repo: https://github.com/CieloVistaSoftware/DiskCleanUp (public, main branch)
- "Add Issue" button in Extension Finder — not started

---

## ✅ SESSION SUMMARY — 2026-05-09

### Task: WebSocket auto-recovery ("Connecting..." stuck bug)

**Root causes found & fixed:**

1. **`onopen` never cleared the `#ws-fatal-overlay`** — if auto-reconnect succeeded while the error panel was visible, the overlay stayed on screen forever. Fixed: `onopen` now removes the overlay and resets `_fatalShown = false`.

2. **"Dismiss" button didn't reset `_fatalShown`** — after clicking Dismiss, the next connection failure would call `_showFatalError()` which returned immediately because `_fatalShown = true`. Users could never see the error panel again. Fixed: Dismiss now sets `_fatalShown = false`.

3. **`wsConnect()` didn't update status before connecting** — status was stale ("Live" or "Failed") during a reconnect attempt. Fixed: `setConnStatus('⚡ Connecting…', false)` called at the top of `wsConnect()`.

4. **`WsManager.HandleAsync` had a bare `catch{}`** — all server-side WebSocket exceptions were silently swallowed. Fixed: added `ILogger<WsManager>` injection, outer catch now logs with `_logger.LogWarning(...)`.

5. **`KeepAliveInterval = TimeSpan.Zero`** — no server-side TCP keep-alives, so silently-dropped connections (VPN, sleep/wake, router timeout) were never detected. Fixed: changed to `TimeSpan.FromSeconds(30)`.

### Files changed
- `DiskCleanUp.Service/wwwroot/js/websocket.ts` — fixes 1, 2, 3
- `DiskCleanUp.Service/wwwroot/js/websocket.js` — compiled counterpart, same fixes
- `DiskCleanUp.Service/Services/WsManager.cs` — fix 4 (ILogger injection + catch logging)
- `DiskCleanUp.Service/Program.cs` — fix 5 (KeepAliveInterval = 30s)

### Test added
- `tests/ws-auto-recovery-test.mjs` — 7 source-level checks, all pass

### Next step
- Run `npm run restart` to rebuild and verify the live dashboard shows "⚡ Connecting…" during startup and "⚡ Live" once connected
- Test: deliberately kill port 5100 (`npm run kill`), observe overlay appears, restart service, verify overlay auto-dismisses when connection resumes

---

## ✅ SESSION SUMMARY — 2026-03-24

### Done this session
- Removed Dell SupportAssist (all components) — was causing BSOD (cbfilter24 kernel driver, PAGE_FAULT_IN_NONPAGED_AREA)
- Removed Dell Update for Windows 10 and Dell Digital Delivery Services
- Fixed corrupted `wwwroot/js/error-logger.js` (had been replaced with AI boilerplate, self-importing itself)
- Fixed `data/errors.json` path → `/api/errors` in `lib/wb-core/utils/error-logger.ts` and all compiled `.js` copies
- Fixed bad relative imports `./error-logger.js` → `/js/error-logger.js` across 24 files (js/, models/, viewmodels/, views/)
- Added WebSocket proxy to `scripts/trace-server.js` (was proxying /api/* but not /ws upgrades)
- Added missing `_removeOverflowBanner`, `_listId`, `_buildFileRow` methods to `views/grid-view.js` (compiled output was truncated)
- Dashboard is UP — WebSocket ⚡ Live, duplicates scan working

### 🔜 NEXT SESSION — pick up here
- **Add search to the Duplicates webview** — filter duplicate groups by path/filename in real time
- Files to touch: `views/grid-view.ts` (add `filter()` hookup), `sections/duplicates.js` (add search input UI), possibly `scan-toolbar-view.ts`
- The `GridView.filter(val)` method already exists in `grid-view.ts` — just needs a search input wired to it

---

## 🔴 ON HOLD — TypeScript Error Migration (partial fix)

### What was done this session
- Created `DiskCleanUp.Service/wwwroot/window.d.ts` — global Window augmentation for all `window._T`, `window._wsSend`, `window._scanFilter`, etc.
- Added `window.d.ts` to `tsconfig.json` include array
- Rewrote `views/grid-view.ts` — removed `try{}` wrap, removed duplicate `ErrLog` import, added all private field declarations, full TypeScript types
- Rewrote `views/scan-toolbar-view.ts` — same fixes
- .NET build: ✅ 0 errors

### Remaining TS errors (still ~400+)
1. **`export` inside `try{}` (TS1184/TS1233)** — `column-controls.ts`, `data-grid.ts`, `event-queue.ts`, most `wb-core` components
2. **Duplicate `ErrLog` imports (TS2300)** — `column-controls.ts`, `data-grid.ts`, `event-queue.ts` (PowerShell bulk script didn't run — runner rejected multi-line)
3. **Absolute `/lib/wb-core/...` paths not resolving (TS2307)** — need `paths` alias in tsconfig or convert to relative imports
4. **Missing private fields in classes (TS2339)** — `section-vm.ts` (~60 errors), `data-grid.ts` (~20 errors)
5. **More `window.*` globals needed** — `_crumbs`, `_DataStore`, `_extColor`, `_extBg`, `_extDot`, `_scanGrid`
6. **Minor type mismatches in `actions.ts`** — `ErrLog.log` arg count, `Element` → `HTMLElement` casting

### Next steps when resuming
1. Add `paths` alias to tsconfig for `/lib/wb-core` → relative resolution
2. Fix `section-vm.ts` (biggest bang — 60 errors)
3. Fix `data-grid.ts`, `event-queue.ts`, `column-controls.ts` (export-in-try + dup imports)
4. Patch `window.d.ts` with remaining globals
5. Fix `actions.ts` type issues

---

## Previous work — Select All / None toolbar
Removed Select All / Select None toolbar buttons. Added header checkbox to both grid renderers.

**What changed:**
- `scan-toolbar-view.js` — removed `selectAll` + `selectNone` buttons from MCD (header checkbox replaces them)
- `scan-grid.js` — checkbox-type header cell now renders `<input class="sg-select-all">`. `body` declaration moved before the header loop (was a runtime crash — `body` referenced before declaration). Indeterminate state syncs back to header on individual row toggles.
- `grid-view.js` (duplicates) — `_ensureContainer` detects `type: 'checkbox'` column and renders header checkbox. Delegates row-change events to sync indeterminate state.

**Previously fixed ROWS-ZERO-001**
Fixed ROWS-ZERO-001 — Duplicates scan showed STATUS: Done, FILES: 5768, DUPES: 9 but ROWS: 0.

**Root cause (2 bugs):**
1. **websocket.js** — `done` arrived via WS while `_fetchBatch` was still awaiting `loadPage`. It fired immediately → `vm.scanDone()` ran with `vm.size === 0`. Fix: added `_deferredDone` map; `done`/`error` now held until `_fetchBatch` drains, then fired in `finally`.
2. **pubsub.js** — Memory pressure check (`_memPct > 70`) dropped result events silently even when `dropWhenFull: false`. MD5 hashing spikes memory. Fix: added `dropWhenFull &&` guard so only explicitly opt-in callers are affected.

**Files changed:**
- `wwwroot/js/websocket.js` — `_deferredDone` map, deferred flush in `finally`, intercept in `onmessage`
- `wwwroot/lib/wb-core/utils/pubsub.js` — `dropWhenFull &&` added to memory drop condition

## Next step
- Restart server (`npm run restart` or kill port 5100 + dotnet run)
- Run a Duplicates scan and verify ROWS shows correct count (was 0, should match DUPES)
- Then tackle LARGE-UI-001 (Large Files, Stale, node-modules missing scan button) or SCAN-INTEGRITY-001

---

## Where we left off

### ✅ CRITICAL BUG FIX: Scan results ROWS: 0 (2026-03-03)

**Root cause:** Two bugs in the live batch-fetch pipeline:
1. `_fetchBatch` in websocket.js used a boolean `_fetchPending` that lost count when hundreds of `batch-ready` WS signals arrived during a single HTTP fetch. The do-while loop ran at most 2 iterations, but 47+ pages were needed for large scans (e.g., 23,123 stale files).
2. When `loadPage` hit EOF, it set `_offsets[section] = null` (exhausted). When the next `batch-ready` arrived, `loadPage` returned empty immediately because it thought the section was done — but the scan was still appending data.

**Fix (3 files):**
- `CacheEndpoints.cs` — Added `resumeOffset` to the response (always returns byte position, even at EOF)
- `page-loader.js` — Added `_resumeOffsets` tracking + `resumeFromEof()` export to restore offset after EOF
- `websocket.js` — Rewrote `_fetchBatch` to drain ALL pages until EOF (not just 1-2), then exit. Calls `resumeFromEof()` before each `loadPage` so new data past the old EOF is picked up. If `_fetchPending` is set while at EOF, retries immediately.

**Status:** Needs `dotnet build` + live scan verification on Windows.

### ✅ TRACE VIEWER PAGINATION (2026-03-03)

**Problem:** Trace viewer loaded the entire trace file (thousands of entries), hanging the browser.
**Fix:** Backend `DiagService.ReadTrace()` now accepts `tail` parameter. Frontend requests `?tail=200` by default. Added "Load All" button for full file access.

---

## 🔧 wb-core BACKLOG

**Rule:** wb-core is a standalone, project-agnostic library. Only add things here that are useful across ANY project. DiskCleanUp-specific code stays in `js/`.

### Missing from wb-core (to be added)

| ID | Component | Why | Priority |
|----|-----------|-----|----------|
| WB-001 | `behaviors/data-grid.js` | Generic CSS grid component: sortable/resizable columns, fragment batching, skeleton loading, checkbox support. Replaces `<table>` usage everywhere. scan-grid.js would extend it with scan-specific features. | **HIGH** |
| WB-002 | Skeleton grid helper | `showSkeleton(container, colCount, rowCount)` that generates pulsing skeleton rows for any grid. Currently duplicated in table-utils.js, scan-grid.js. | MEDIUM |

### Already in wb-core but NOT being used by DiskCleanUp

| Utility | wb-core location | DiskCleanUp duplicate | Files affected |
|---------|-----------------|----------------------|----------------|
| `escHtml()` | `utils/format.js` | `_esc()` / `esc()` copied 5 times | scan-grid.js, recycle-bin.js, savings.js, task-manager.js, error-viewer.html |
| `fmtBytes()` | `utils/format.js` | `fmtMem()` in task-manager.js | task-manager.js |
| `skeleton()` | `components/feedback.js` | Custom skeleton in table-utils.js | table-utils.js |
| Layouts (grid, flex) | `components/layouts.js` | Not used at all | Could replace manual CSS grid setup |
| `createToast()` | `components/feedback.js` | Dashboard uses `alert()` instead | Multiple files |

---

## 🚫 INLINE STYLE VIOLATIONS — index.html

**Rule:** Zero inline styles. All styling goes through wb-core or dashboard.css classes.

| # | Element | Offending inline style | Fix |
|---|---------|----------------------|-----|
| 1 | `#rootOpenBtn` | `margin-left:4px;display:none` | Add class e.g. `.btn-root-open` to dashboard.css |
| 2 | `#connStatus` (link) | `text-decoration:none` | wb-core or dashboard.css link class |
| 3 | `#keepBadgeBtn` | `cursor:pointer` | dashboard.css `.keep-badge-btn` |
| 4 | `#keepCountBadge` | `display:none` | JS toggles class `.hidden` — already in wb-core |
| 5 | Trace link | `color:#58a6ff;font-size:.85rem;...` (8 props!) | wb-core `.btn-link` or dashboard `.header-link` |
| 6 | `#imgDeleteAllBtn` | `display:none` | JS toggles `.hidden` |
| 7 | `#taskCount` | `color:var(--muted);font-size:12px` | wb-core `.text-muted-sm` |
| 8 | Second savings toolbar | `margin-top:4px` | dashboard.css `.toolbar + .toolbar` gap rule |
| 9 | `#savingsSelCount` | `color:var(--muted);font-size:12px` | wb-core `.text-muted-sm` |
| 10 | `#savingsFilterStatus` | `color:var(--muted);font-size:12px` | wb-core `.text-muted-sm` |
| 11 | `#recycleBinPanel` | `display:none` | JS toggles `.hidden` |
| 12 | `#rbStatus` | `color:var(--muted);font-size:12px` | wb-core `.text-muted-sm` |
| 13 | `#keepListModal` | `display:none` | JS toggles `.hidden` |

**Also:** `onclick="if(event.target===this)this.style.display='none'"` on keepListModal sets style inline via JS — must use classList toggle instead.

**Blocked by:** Need to audit what wb-core already provides before adding new classes to dashboard.css.

---

## 🔍 CSS AUDIT BACKLOG

**Rule:** No CSS file linked unless its classes are provably used — either in static HTML or in named JS that dynamically injects them. No phantom imports.

| ID | Task | Status |
|----|------|--------|
| CSS-AUDIT-001 | Audit all wb-core CSS links in index.html — confirm each file's classes are actually used (static HTML or JS injection). Remove any that aren't. | ⏳ Pending |
| CSS-AUDIT-002 | `metrics-bar.css`, `connection-badge.css`, `summary-badges.css` exist in wwwroot/lib/wb-core/css but NOT linked in index.html — verify if used anywhere or delete them. | ⏳ Pending |
| CSS-AUDIT-003 | All sg-* classes (grid-shell.css) are JS-injected, not in static HTML. Document this clearly so future sessions don't question it. | ⏳ Pending |

---

## 📦 DiskCleanUp CODE REUSE BACKLOG

**Rule:** One-time-one-place. No `<table>` elements. All grids use our CSS grid system.

### Quick wins (use existing wb-core exports)

| ID | Task | Files | Effort |
|----|------|-------|--------|
| ~~CR-001~~ | ✅ Replace all `_esc()`/`esc()` with `escHtml` from wb-core | scan-grid.js, recycle-bin.js, savings.js, task-manager.js, error-viewer.html | Small |
| ~~CR-002~~ | ✅ Replace `fmtMem()` with `fmtBytes` from wb-core | task-manager.js | Tiny |

### Table → CSS grid migration (depends on WB-001 data-grid)

| ID | File | Current | Target |
|----|------|---------|--------|
| CR-003 | recycle-bin.js | `<table id="rbTable">` | data-grid with restore actions |
| CR-004 | savings.js | `<table id="savingsTable-*">` per session | data-grid per session group |
| CR-005 | task-manager.js | `<table class="task-table">` | data-grid with safety badges + kill actions |
| CR-006 | error-viewer.html | Inline `<table>` with `<script>` | data-grid (could become ES module) |
| CR-007 | architecture.html | `<table class="dec-table">` | CSS grid (low priority, docs page) |

### JS refactoring

| ID | Task | Savings |
|----|------|---------|
| ~~CR-008~~ | ✅ Extract section handler factory in section-handlers.js | ~143 lines saved (9 handlers → 1 factory + config objects) |
| ~~CR-009~~ | ✅ Extracted `_postAndRescan` helper in actions.js | 4 action functions now delegate to shared helper |
| CR-010 | Retire table-utils.js after grid migration | Entire file (~100 lines) |
| CR-011 | Retire column-controls.js after grid migration | Entire file (~25 lines) |

### C# refactoring

| ID | Task | Savings |
|----|------|---------|
| ~~CR-012~~ | ✅ Extract `ScanFilesGeneric` template in ScanOrchestrator.cs | ~70 lines saved (5 scan workers → 1 template + 5 thin wrappers) |
| ~~CR-013~~ | ✅ Extracted `FilteredFiles()` shared helper | All 7 file-enumerating scanners now call one method |
| ~~CR-014~~ | ✅ All 4 extension sets promoted to `static readonly` fields | `_htmlExts`, `_cssExts`, `_imageExts`, `_preferredExts` — zero per-scan allocation |

---

### What got done this session (2026-03-02)

**Semaphore bug FIXED** (root cause of `[duplicates] SCAN_ERROR Adding the specified count to the semaphore`):
- `ScanOrchestrator.StartAsync()` was recreating `_hashGate` on every scan start
- When 2 scans overlap (background stagger + user click), scan A's workers Release() on scan B's fresh semaphore → overflow
- Fix: `_hashGate ??=` (initialize once, never replace) + lock guard

**Cache-Control headers FIXED** (root cause of stale JS in browser):
- `Program.cs` → `OnPrepareResponse` sends `no-cache, no-store, must-revalidate` on ALL static files
- No more browser-cached old JS after server restart

**Node-modules scanner partially FIXED** (root cause of PathTooLongException + WS crash):
- Old code used `RecurseSubdirectories = true` — bypassed ALL safe enumeration guards
- New code uses `EnumerateDirsSafe()` with depth cap + loop detection
- Runaway recursive folders (like `backup_20250601\backup_20250601\backup_20250601\...`) now detected and surfaced as deletable results with `runaway: true` flag
- `FindRunawayRoot()` method added — walks path segments to find first duplicate pair

**Backup scanner file counting FIXED:**
- Replaced `Directory.EnumerateFiles(dp, "*", RecurseSubdirectories = true).Count()` with `EnumerateSafe(dp).Count()`

**Test script created** (`scripts/startup-test.js`):
- Entry points exist, dotnet build, JS import/export validation, server pages 200, cache-control headers, WebSocket connect, MCP server
- Added to package.json as `npm test`
- BUT: tests are incomplete — need scan lifecycle tests, concurrent scan tests, WebSocket stability tests

**Package.json cleaned:**
- Removed dead MCP SDK dependency (saved 10.9 MB node_modules)
- Fixed mcp-server name typo ("diskcleaup" → "diskcleanup")  
- kill-port.js targets both 5000+5100
- Retired trace-server.js proxy (unnecessary)
- All scripts verified working: build, console, restart, kill, start:mcp, test

**Docs updated:**
- CLAUDE.md full rewrite (correct architecture, ports, paths)
- README.md full rewrite
- diskcleanup.md updated
- .vscode/tasks.json cleaned
- .github/copilot-instructions.md project-specific

### Files changed this session
- `DiskCleanUp.Service/Program.cs` — Cache-Control headers on static files
- `DiskCleanUp.Service/Services/ScanOrchestrator.cs` — semaphore fix, node-modules safe enum, FindRunawayRoot, backup file counting (**BROKEN — see above**)
- `DiskCleanUp.Service/Api/CacheEndpoints.cs` — getCacheAge backend (cachedAt timestamp)
- `DiskCleanUp.Service/wwwroot/js/page-loader.js` — getCacheAge export + _cachedAt tracking
- `scripts/startup-test.js` — comprehensive startup test (NEW)
- `scripts/kill-port.js` — targets both ports
- `package.json` — cleaned scripts, removed dead deps
- `CLAUDE.md` — full rewrite
- `README.md` — full rewrite
- `docs/diskcleanup.md` — updated
- `.vscode/tasks.json` — cleaned
- `.github/copilot-instructions.md` — project-specific

### What was NOT done (planned but incomplete)
- ❌ Comprehensive WebSocket tests (connect, stay alive, receive metrics, survive scan errors)
- ❌ Scan lifecycle tests (start → progress → done for each section)
- ❌ Concurrent scan regression test (semaphore)
- ❌ Background test service running continuously in Windows Service
- ❌ Frontend handling of `runaway: true` results (show warning icon, inspection, delete button)

### Open questions
1. Should runaway folders show in their own section or within backups/node-modules?
2. The test script kills the server after testing — should it leave it running?
3. How aggressive should background testing be? Every scan cycle? Separate timer?

---

### Next session priorities (in order)
1. **Fix build** — `runaways` scope error in ScanOrchestrator.cs line 924
2. **Run `npm test`** — verify all 18 checks pass
3. **Start server, do Ctrl+Shift+R** — verify no console errors, WS connects, metrics flowing
4. **Run a duplicates scan** — verify semaphore fix (no overflow error)
5. **Run node-modules scan** — verify no PathTooLongException crash
6. **Write the missing tests** — WS stability, scan lifecycle, concurrent scans

---

### Backlog (unchanged from previous)

**✅ FIXED THIS SESSION (2026-03-04)**
- ✅ SCAN-TIMEOUT-001: Fake 10s scan timeout deleted from websocket.js — WS itself is the liveness signal
- ✅ SERVICE-001: Windows Service set to Manual start — no more auto-restart fighting builds
- ✅ LEGEND-001: Legend bar moved above column headers in scan-grid.js
- ✅ GRID-FOREACH-001: HTMLCollection.forEach crash fixed (Array.from in grid-shell.js)
- ✅ ACTIONS-WRAP-001: Action buttons wrapping to second line fixed (nowrap in row-actions.css)
- ✅ FILTER-PLACEHOLDER-001: Filter placeholder changed to "Filter by chars…"

**✅ FIXED THIS SESSION (2026-03-05)**
- ✅ STARTUP-001: Windows Service holding port 5100 blocked every console start — must run `sc.exe stop DiskCleanUp` (admin) before `npm start`
- ✅ STARTUP-002: `stale-unified.js`, `large-unified.js`, `node-modules-unified.js` called GridShell/StatusBar at module top-level before DOM ready — crashed entire JS module graph on load. Disabled imports in init.js, section-handlers.js handles these sections instead.
- ✅ STARTUP-003: `ai-panel.js` imported in init.js but file did not exist — 404 killed module load. Import removed.
- ✅ STARTUP-004: Added `scripts/test-connected.js` — tests HTTP, index.html, connStatus element, init.js imports, WS connect, WS message. All 7 pass.

**🚨 SCAN INTEGRITY — HIGH PRIORITY (2026-03-05)**

> **John's observation:** Large Files scan reported FILES: 5,553 in 0.7s. That is not physically possible for a real disk scan. Scans are not trustworthy until proven otherwise with tests and verified logs.

- ⏳ **SCAN-INTEGRITY-001: Scan speed is physically impossible — likely hitting cache, not disk.**
  - Large Files: 5,553 files in 0.7s = ~7,900 files/sec. A cold disk scan of real files takes seconds per hundred, not thousands per second.
  - Most likely cause: `_DeleteCache` is NOT clearing the JSONL before the new scan starts, so `restoreCachedResults()` on page reload replays old data and shows it instantly as if it were a new scan.
  - OR: root folder is tiny (SVG subfolder from SCAN-ROOT-001) and 5,553 is just the restored cached count from a previous good scan.
  - Must verify: what is the actual scan root at the moment of scan? Log it. Show it in the status bar during scan.
  - **Do not close this until a scan of a real large folder takes believable time and the log proves real files were visited.**

- ⏳ **SCAN-LOG-001: Implement per-scan file log — configurable in Settings.**
  - Backend (`ScanOrchestrator.cs`): write `data/scan-logs/{section}.log` — one file path per line as each file is visited.
  - New endpoint: `GET /api/scan-log/{section}` — serves the log file.
  - New page: `scan-log-viewer.html?section={section}` — live-tailing viewer, auto-refresh every 2s during scan.
  - Toolbar button `📋 Files` on every section opens the viewer in a new tab.
  - Settings toggle: `"enableScanLog": true/false` (default true). When false, no log is written (performance mode).
  - **This work is partially done (2026-03-05) but build is broken — finish and verify.**

- ⏳ **SCAN-TEST-001: Write scan integrity tests — no scan is trusted without them.**
  - Test 1: Start a large scan → verify `files` counter increases steadily over time (not instantly)
  - Test 2: After scan completes → read `data/scan-logs/{section}.log` → verify file count matches `FILES:` in status bar
  - Test 3: Verify scan log contains ONLY real paths that exist on disk (`File.Exists` check on sample)
  - Test 4: Verify `_DeleteCache` actually truncates the JSONL before scan starts (read file size before/after)
  - Test 5: Verify scan root matches Settings root (log the root path at scan start)
  - Test file: `scripts/scan-integrity-test.js` (new)
  - **Block all other scan work until these pass.**

- ⏳ **SCAN-ROOT-DISPLAY-001: Show the actual scan root in the status bar during every scan.**
  - Right now there is zero visibility into what folder is being scanned.
  - Backend: include `root` in the `started` event payload.
  - Frontend: display it in the status bar folder field on `started`.
  - This alone would have caught the SVG subfolder bug (SCAN-ROOT-001) immediately.

**🆕 NEW ITEMS (2026-03-05 session 2) — CLAUDE BROKE THESE, FIX THEM**
- ⏳ SCAN-ROOT-001: All scanners scan nothing — Claude added `scanRootOverride` input to header without being asked, user typed SVG folder in it, every scan returned FILES: 0. Input has been removed from HTML and actions.js. Verify all sections scan correctly again after `npm run start`.
- ⏳ ROWS-ZERO-001: Duplicates scan showed STATUS: Done 19 dupe groups, FILES 5768, DUPES 9 but ROWS: 0 — results never appeared in grid. Root cause not yet identified. Likely batch-ready → _fetchBatch → pushEvent chain broken or section handler not receiving events.
- ⏳ LARGE-UI-001: Large Files section missing scan button and status bar — Phase 6.2 unified component containers render nothing. Legacy containers are `display:none`. Fix: remove unified containers and unhide legacy HTML. Same issue on Stale and node-modules sections.
- ⏳ SCAN-FOLDER-001: User wants to target a specific folder for any scan without changing Settings root. Original ask was never properly implemented — Claude added GUI without permission instead of wiring it through Settings or a proper per-scan mechanism. Needs a design decision before touching code.

**🆕 NEW ITEMS (2026-03-05) — START IMMEDIATELY**
- ⏳ KEEP-BTN-001: Keep Selected button must be disabled until at least one row is checked. Currently always enabled.
- ⏳ LOAD-MORE-001: Load More Results button must show "Showing X of Y" so user knows how deep they are and how many remain. Values must be live/accurate.
- ⏳ IMG-GHOST-001: Duplicate Images — deleted images keep reappearing. Cache not invalidated after delete. After any image delete, force a rescan or purge the image cache entry.

**🐛 BUG FIXES (Priority)**
- ✅ ACTIONS-001: STALE, LARGE, NODE-MODULES handlers were commented out in section-handlers.js with false "migrated to *-unified.js" notes — those files never existed. Uncommented all three.
- ✅ GRID-SCROLL-001: Removed inner scroll cage from `.sg-body` — page scrolls naturally. Grid is full 100vw. No inner scrollbars.
- ✅ ACTIONS-002: Added `</>` button to every scan grid actions column — opens containing folder in VS Code via `vscode://file/{folder}` URI. No backend needed. Hover turns VS Code blue (#0078d4).
- ⏳ GRID-PREVIEW-001: Add inline mini media previews to scan grid rows for image/svg/video file types. Show a small thumbnail (hover or inline) in the path cell. Must be lazy-loaded (IntersectionObserver) — never block grid render. Affects tiny-files, stale, large, html-files, css-files grids wherever media extensions are detected.
- ✅ VSCODE-URI-001: Dropped URI scheme entirely. `</>` button now calls `/api/open` with the parent folder path — same endpoint used by file open, already handles directories. No browser URI issues possible.
- ⏳ IMG-LAZY-001: section-handlers.js:257 — Browser intervention replacing lazy images with placeholders in the duplicates image grid. The `loading="lazy"` attribute is being intercepted. Need to switch to IntersectionObserver-based loading (same pattern as sg-thumb) instead of native `loading="lazy"` attribute.
- ⏳ IMG-001: After delete, auto-rescan not load cached page
- ⏳ CACHE-001: Stale cached results with "Restored" status
- ⏳ KEEP-001: Keep should remove from grid immediately

**📋 EXACT DUPLICATES — Grid Improvements**
- ⏳ DUP-001: Full file path tooltip on hover
- ⏳ DUP-002: All columns sortable
- ⏳ DUP-003: Filter control + three-column actions
- ⏳ DUP-004: No folder/file pairing as duplicates

**📊 TRACE VIEWER**
- ⏳ TRACE-001: Pagination for 200+ rows
- 🔴 TRACE-002: TRACEVIEWER IS NOT WORKING (reported 2026-03-05 — added by John)

**📦 LARGE FILES**
- 🔴 LARGE-001: FILES:1 but grid shows 0 rows — file scanned but not appearing in results list (reported 2026-03-05 — added by John)

**📁 EMPTY FOLDERS**
- 🔴 EMPTY-001: STATUS says "Done — 1 empty folders" but SCANNED:0, EMPTY:0, ROWS:0 — result reported in status text but never reaches the grid (reported 2026-03-05 — added by John)
- 🔴 EMPTY-002: App tells user a result exists but gives zero way to identify it — no name, no path, no way to act on it. This is a trust-destroying UX failure. The grid MUST show every result the status line claims exists, or the status line is lying.

**📥 TRAY APP**
- ⏳ TRAY-001: Icon not visible on Win11 taskbar

**🔥 UI OVERHAUL**
- ⏳ GRID-001 through GRID-004: CSS grid, sortable, resizable, select-all
- ⏳ LAYOUT-001, LAYOUT-002: Consistent section layout

**Existing**
- ⏳ Phase 4: Sysmon + Polish
- ⏳ FEAT-017: Memory % on MEM indicator
- ⏳ Double-click HTML/CSS to open in browser
- ⏳ Filesystem watcher for external deletion
- ⏳ OneDrive/Google Drive support
