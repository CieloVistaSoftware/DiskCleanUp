---
docid: 300.9.unified-grid-migration
id: diskcleanup-unified-grid-migration-plan
title: "DiskCleanUp — Unified Grid Migration Plan"
project: DiskCleanUp
description: "Unified grid migration plan. Start: March 3, 2026. Target completion: TBD."
status: active
tags: [unified, grid, migration]
category: 300.9 — Meta
created: 2026-03-03
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: docs/UNIFIED-GRID-MIGRATION.md
---
# DiskCleanUp — Unified Grid Migration Plan

**Start Date:** March 3, 2026  
**Target Completion:** TBD (4-6 weeks estimated)  
**Status:** Not Started

---

## Overview

Migrate from 3 separate grid systems (scan-grid.js, data-grid.js, GridView MVVM) to a single unified grid architecture split between:
- **wb-core** (reusable components)
- **DiskCleanUp** (app-specific logic)

**Success Criteria:**
- All 14 sections render via unified grid
- Zero visual regressions
- Performance maintained or improved
- All existing features preserved
- Code volume reduced by ~40%

---

## Phase 0: Foundation & Preparation (Week 1)

### P0.1 — Environment Setup
- [ ] Create feature branch: `feature/unified-grid`
- [ ] Document current grid implementations (baseline screenshots)
- [ ] Set up parallel testing environment
- [ ] Create rollback plan

### P0.2 — wb-core Scaffolding
- [ ] Create `lib/wb-core/components/` directory structure
- [ ] Set up component index exports in `lib/wb-core/index.js`
- [ ] Add JSDoc comment standards
- [ ] Create component test harness page

### P0.3 — Metrics & Baseline
- [ ] Capture current bundle size
- [ ] Document current render times per section
- [ ] Capture memory usage baseline
- [ ] Record all keyboard shortcuts and interactions

**Exit Criteria:** Clean branch, scaffolding ready, baselines documented

---

## Phase 1: Core Grid Engine (Week 1-2)

### P1.1 — GridShell Component (Critical Path)
**Priority:** P0 — Blocking all other work

**Tasks:**
- [ ] Create `wb-core/components/grid-shell.js`
- [ ] Implement column type registry (lineNo, checkbox, text, size, badge, html, actions, path, paths)
- [ ] Build fragment batching system (`queueMicrotask`)
- [ ] Add skeleton loading (5 placeholder rows)
- [ ] Implement line number auto-prepending
- [ ] Add row animations (`.live-row` fade-in, `.keep-flash` removal)
- [ ] Build public API (create, addRow, addRows, clear, destroy)
- [ ] Implement selection API (getChecked, selectAll)
- [ ] Add removal API (removeByPath, removeByPaths)
- [ ] Implement filter API (filter by predicate)
- [ ] Add query API (hasRows, rowCount)

**Testing:**
- [ ] Create test page with sample data
- [ ] Test all column types render correctly
- [ ] Verify fragment batching (no layout thrash)
- [ ] Test skeleton show/hide
- [ ] Verify animations trigger
- [ ] Test selection operations
- [ ] Test removal with animation
- [ ] Test filtering performance

**Files Created:**
- `lib/wb-core/components/grid-shell.js`

**Dependencies:** None

### P1.2 — Column Resize/Sort (High Priority)
**Priority:** P1

**Tasks:**
- [ ] Add drag handle rendering between columns
- [ ] Implement resize logic with localStorage persistence
- [ ] Add sort indicators (asc/desc/original cycle)
- [ ] Implement numeric vs text sort
- [ ] Handle `data-sortVal` attribute for custom sort values

**Testing:**
- [ ] Resize columns, verify localStorage
- [ ] Sort text columns alphabetically
- [ ] Sort numeric columns numerically
- [ ] Verify sort cycle (asc → desc → original)
- [ ] Test persistence across page reloads

**Files Modified:**
- `lib/wb-core/components/grid-shell.js`

**Dependencies:** P1.1

### P1.3 — RowActions Component
**Priority:** P0 — Critical

**Tasks:**
- [ ] Create `wb-core/components/row-actions.js`
- [ ] Implement action definition schema
- [ ] Build standard action renderer
- [ ] Add inline compact variant (`.btn-xxs`)
- [ ] Implement conditional action display
- [ ] Wire up onClick handlers

**Testing:**
- [ ] Render standard action set (trash, open, folder)
- [ ] Test inline variant for sub-paths
- [ ] Verify conditional actions
- [ ] Test click handlers fire correctly

**Files Created:**
- `lib/wb-core/components/row-actions.js`

**Dependencies:** None

**Exit Criteria:** GridShell + RowActions fully functional and tested

---

## Phase 2: Supporting UI Components (Week 2)

### P2.1 — StatusBar Component
**Priority:** P1 — High

**Tasks:**
- [ ] Create `wb-core/components/status-bar.js`
- [ ] Implement configurable segment system
- [ ] Add built-in segments (status, rows, time, folder, stop)
- [ ] Implement state transitions (idle → active → done → error)
- [ ] Add visual states (border colors, text colors)
- [ ] Build timer update system (200ms interval)
- [ ] Add stop button with callback

**Testing:**
- [ ] Test all visual states
- [ ] Verify timer updates during active state
- [ ] Test stop button callback
- [ ] Test custom metric segments

**Files Created:**
- `lib/wb-core/components/status-bar.js`

**Dependencies:** None

### P2.2 — FilterBar Component
**Priority:** P1 — High

**Tasks:**
- [ ] Create `wb-core/components/filter-bar.js`
- [ ] Build dropdown with dynamic options
- [ ] Implement include/exclude mode toggle
- [ ] Add text input filter
- [ ] Build exclude chips display
- [ ] Implement localStorage persistence
- [ ] Add status display ("X rows" / "Showing X of Y")

**Testing:**
- [ ] Test dropdown population
- [ ] Toggle include/exclude modes
- [ ] Test text filter (case-insensitive)
- [ ] Add/remove exclude chips
- [ ] Verify persistence across reloads

**Files Created:**
- `lib/wb-core/components/filter-bar.js`

**Dependencies:** None

### P2.3 — Toolbar Component
**Priority:** P1 — High

**Tasks:**
- [ ] Create `wb-core/components/toolbar.js`
- [ ] Implement standard button set
- [ ] Add custom button support
- [ ] Build Load More button with states (green/red dot, loading)
- [ ] Implement button enable/disable API

**Testing:**
- [ ] Render all standard buttons
- [ ] Test custom button injection
- [ ] Test Load More states
- [ ] Verify callbacks fire

**Files Created:**
- `lib/wb-core/components/toolbar.js`

**Dependencies:** None

**Exit Criteria:** All UI components functional and tested independently

---

## Phase 3: Header & System Components (Week 2-3)

### P3.1 — MetricsBar Component
**Priority:** P2 — Medium

**Tasks:**
- [ ] Create `wb-core/components/metrics-bar.js`
- [ ] Implement CPU canvas graph
- [ ] Implement memory canvas graph
- [ ] Add thread counter
- [ ] Add uptime pulse dot + timer
- [ ] Build update system

**Testing:**
- [ ] Test canvas rendering
- [ ] Verify graphs update smoothly
- [ ] Test pulse animation

**Files Created:**
- `lib/wb-core/components/metrics-bar.js`

**Dependencies:** None

### P3.2 — Badge Components
**Priority:** P2 — Medium

**Tasks:**
- [ ] Create `wb-core/components/connection-badge.js`
- [ ] Create `wb-core/components/summary-badges.js`
- [ ] Implement state management

**Testing:**
- [ ] Test connection states (online/offline)
- [ ] Test badge updates

**Files Created:**
- `lib/wb-core/components/connection-badge.js`
- `lib/wb-core/components/summary-badges.js`

**Dependencies:** None

**Exit Criteria:** All header components functional

---

## Phase 4: Layout Adoption (Week 3)

### P4.1 — Adopt Existing wb-core Layouts
**Priority:** P1 — High (Easy wins)

**Tasks:**
- [ ] Replace header flex div with `<wb-flex>`
- [ ] Replace nav tabs with `<wb-cluster>`
- [ ] Replace section panels with `<wb-stack>`
- [ ] Replace main padding with `<wb-container>`
- [ ] Replace settings split with `<wb-sidebar>`
- [ ] Replace keep-list modal with `<wb-cover>`

**Testing:**
- [ ] Visual regression test all sections
- [ ] Test responsive behavior

**Files Modified:**
- `DiskCleanUp.Service/wwwroot/index.html`
- `DiskCleanUp.Service/wwwroot/css/dashboard.css`

**Dependencies:** None (layouts already exist)

**Exit Criteria:** All layouts adopted, no visual regressions

---

## Phase 5: DiskCleanUp Refactors (Week 3)

### P5.1 — Extract Extension Legend
**Priority:** P1 — High

**Tasks:**
- [ ] Create `js/ext-legend.js`
- [ ] Extract legend rendering from scan-grid.js
- [ ] Integrate with unified grid
- [ ] Consume colorFn from ext-colors.js

**Testing:**
- [ ] Verify legend appears with mixed extensions
- [ ] Test color consistency

**Files Created:**
- `DiskCleanUp.Service/wwwroot/js/ext-legend.js`

**Files Modified:**
- `DiskCleanUp.Service/wwwroot/js/scan-grid.js` (remove legend code)

**Dependencies:** P1.1 (GridShell)

### P5.2 — Create Scan Lifecycle Manager
**Priority:** P1 — High

**Tasks:**
- [ ] Create `js/scan-lifecycle.js`
- [ ] Consolidate start/progress/done flow
- [ ] Wire StatusBar, Skeleton, PageLoader, FilterBar
- [ ] Handle cache restore on page load

**Testing:**
- [ ] Test full scan lifecycle (start → progress → done)
- [ ] Test error handling
- [ ] Test cancel operation
- [ ] Verify cache restore

**Files Created:**
- `DiskCleanUp.Service/wwwroot/js/scan-lifecycle.js`

**Dependencies:** P2.1, P2.2, P2.3 (StatusBar, FilterBar, Toolbar)

### P5.3 — Extract Image Card Layout
**Priority:** P2 — Medium

**Tasks:**
- [ ] Create `js/image-cards.js`
- [ ] Extract from section-handlers.js
- [ ] Use wb-core `<wb-grid>` or `<wb-masonry>`

**Testing:**
- [ ] Test image preview loading
- [ ] Test lazy loading
- [ ] Test error fallback

**Files Created:**
- `DiskCleanUp.Service/wwwroot/js/image-cards.js`

**Dependencies:** P4.1 (layout adoption)

**Exit Criteria:** All DiskCleanUp modules extracted and functional

---

## Phase 6: Section Migration — Pilot (Week 4)

### P6.1 — Migrate "Stale" Section (Pilot)
**Priority:** P0 — Critical (First migration test)

**Why Stale?** Simple section with all standard components, no special cases.

**Tasks:**
- [ ] Update section-handlers.js to use unified grid config
- [ ] Replace scan-grid.js calls with GridShell API
- [ ] Wire StatusBar, FilterBar, Toolbar
- [ ] Integrate RowActions
- [ ] Wire scan lifecycle
- [ ] Test full workflow

**Testing:**
- [ ] Full scan workflow (start → progress → done)
- [ ] Test filtering (include/exclude extensions)
- [ ] Test selection + trash
- [ ] Test keep-list integration
- [ ] Test Load More paging
- [ ] Performance comparison vs old grid

**Files Modified:**
- `DiskCleanUp.Service/wwwroot/js/section-handlers.js`

**Dependencies:** P1.1, P1.3, P2.1, P2.2, P2.3, P5.2

**Exit Criteria:** Stale section 100% functional, performance equal or better

---

## Phase 7: Section Migration — Standard Sections (Week 4-5)

### P7.1 — Migrate Standard Sections (Batch 1)
**Sections:** large, empty, backups, tiny-files

**Tasks (per section):**
- [ ] Update section-handlers.js config
- [ ] Wire unified grid components
- [ ] Test full workflow
- [ ] Verify one-off features (e.g., fullView button for tiny-files)

**Testing:**
- [ ] Full workflow per section
- [ ] Visual regression tests
- [ ] Performance validation

**Dependencies:** P6.1 (Pilot successful)

### P7.2 — Migrate Standard Sections (Batch 2)
**Sections:** html-files, css-files, venvs

**Tasks:** Same as P7.1

**Dependencies:** P7.1

**Exit Criteria:** All standard sections migrated

---

## Phase 8: Section Migration — Complex Sections (Week 5-6)

### P8.1 — Migrate "Smart Dedup" Section
**Priority:** P1 — High (Complex: inline sub-path actions)

**Tasks:**
- [ ] Implement `paths` column type with inline actions
- [ ] Wire applyAll custom button
- [ ] Test sub-path action clicks

**Testing:**
- [ ] Test inline sub-path actions (trash, open, folder)
- [ ] Test applyAll button
- [ ] Verify decisions applied correctly

**Dependencies:** P7.2

### P8.2 — Migrate "Node Modules" Section
**Priority:** P1 — High (Permanent delete)

**Tasks:**
- [ ] Wire deletePermanent custom button
- [ ] Update trash logic to bypass recycle bin

**Testing:**
- [ ] Verify permanent delete confirmation
- [ ] Test files deleted (not recycled)

**Dependencies:** P7.2

### P8.3 — Migrate "Images" Section
**Priority:** P1 — High (Card layout, not grid)

**Tasks:**
- [ ] Use image-cards.js module
- [ ] Wire deleteAllCopies button
- [ ] Test thumbnail lazy loading

**Testing:**
- [ ] Test card layout rendering
- [ ] Test lazy loading
- [ ] Test deleteAllCopies

**Dependencies:** P5.3 (image-cards.js)

### P8.4 — Migrate "Duplicates" Section (MVVM)
**Priority:** P0 — Critical (Most complex)

**Tasks:**
- [ ] Update GridView to render into GridShell
- [ ] Preserve MVVM architecture (Model, ViewModel, View)
- [ ] Wire deleteAllCopies button
- [ ] Test group separators
- [ ] Test click-to-expand (MAX_ROWS_PER_GROUP=20)
- [ ] Verify RAF batching (GROUPS_PER_FRAME=20)
- [ ] Test MAX_RENDERED=200 limit

**Testing:**
- [ ] Test full MVVM flow
- [ ] Test large datasets (1000+ groups)
- [ ] Verify performance (RAF batching)
- [ ] Test expand/collapse groups
- [ ] Test preview (images/code)

**Dependencies:** P1.1, P5.2

**Exit Criteria:** All complex sections migrated and functional

---

## Phase 9: Non-Scan Sections (Week 6)

### P9.1 — Migrate "Tasks" (Process Manager)
**Priority:** P1 — High

**Tasks:**
- [ ] Define custom columns (safety badge, PID, name, memory, threads, etc.)
- [ ] Wire refresh, killSelected buttons
- [ ] Test safety filtering

**Testing:**
- [ ] Test process list rendering
- [ ] Test kill operation
- [ ] Test safety filters

**Dependencies:** P1.1, P2.3

### P9.2 — Migrate "Savings" Section
**Priority:** P1 — High

**Tasks:**
- [ ] Define custom columns
- [ ] Wire all custom buttons (refresh, export, newSession, recycleBin)
- [ ] Test stats grid
- [ ] Test recycle bin panel toggle

**Testing:**
- [ ] Test savings log display
- [ ] Test session management
- [ ] Test export JSON
- [ ] Test recycle bin restore

**Dependencies:** P1.1, P2.3

**Exit Criteria:** All sections using unified grid

---

## Phase 10: Cleanup & Optimization (Week 6)

### P10.1 — Remove Old Grid Systems
**Priority:** P1 — High

**Tasks:**
- [ ] Delete `js/scan-grid.js` (or mark @deprecated)
- [ ] Delete `js/data-grid.js` (or mark @deprecated)
- [ ] Remove unused GridView code (if fully replaced)
- [ ] Remove duplicate utility functions

**Files Deleted:**
- `DiskCleanUp.Service/wwwroot/js/scan-grid.js`
- `DiskCleanUp.Service/wwwroot/js/data-grid.js`

**Dependencies:** All sections migrated (P9.2)

### P10.2 — CSS Consolidation
**Priority:** P2 — Medium

**Tasks:**
- [ ] Remove old grid CSS rules
- [ ] Consolidate duplicate styles
- [ ] Optimize animations
- [ ] Add CSS custom properties for theming

**Files Modified:**
- `DiskCleanUp.Service/wwwroot/css/dashboard.css`

**Dependencies:** P10.1

### P10.3 — Adopt Quick-Win Utilities
**Priority:** P2 — Medium

**Tasks:**
- [ ] Replace `_esc()` with wb-core `escHtml`
- [ ] Replace `.toLocaleString()` with wb-core `fmtNumber`
- [ ] Replace date formatting with wb-core `fmtDate`/`fmtTime`

**Files Modified:**
- 10+ files across js/ directory

**Dependencies:** None

**Exit Criteria:** Old code removed, CSS optimized

---

## Phase 11: Testing & Validation (Week 6)

### P11.1 — Visual Regression Testing
**Tasks:**
- [ ] Capture screenshots of all sections
- [ ] Compare with baseline (P0.3)
- [ ] Fix any visual discrepancies

**Dependencies:** P10.2

### P11.2 — Performance Testing
**Tasks:**
- [ ] Measure render times per section
- [ ] Compare with baseline
- [ ] Measure memory usage
- [ ] Compare bundle size
- [ ] Validate no regressions

**Dependencies:** P10.2

### P11.3 — Feature Validation
**Tasks:**
- [ ] Test all keyboard shortcuts
- [ ] Test all button actions
- [ ] Test all filters
- [ ] Test all sorting/resizing
- [ ] Test all animations
- [ ] Test WebSocket reconnection
- [ ] Test cache restore
- [ ] Test error handling

**Dependencies:** All migrations complete

### P11.4 — Cross-Browser Testing
**Tasks:**
- [ ] Test in Chrome
- [ ] Test in Edge
- [ ] Test in Firefox (if supported)

**Dependencies:** P11.3

**Exit Criteria:** All tests passing, no regressions

---

## Phase 12: Documentation & Deployment (Week 6)

### P12.1 — Update Documentation
**Tasks:**
- [ ] Update README.md
- [ ] Document new component APIs
- [ ] Update architecture diagrams
- [ ] Create migration guide for future sections

**Dependencies:** P11.4

### P12.2 — Deployment
**Tasks:**
- [ ] Merge feature branch to main
- [ ] Deploy to test environment
- [ ] Smoke test
- [ ] Deploy to production
- [ ] Monitor for issues

**Dependencies:** P12.1

**Exit Criteria:** Deployed successfully, no critical issues

---

## Rollback Plan

If critical issues discovered:

1. **Immediate:** Revert to previous commit
2. **Assess:** Identify root cause
3. **Fix:** Apply targeted fix or continue rollback
4. **Test:** Re-validate
5. **Redeploy:** Incremental or full rollback

**Rollback Triggers:**
- Critical visual regressions
- Performance degradation >20%
- Data loss or corruption
- Broken core functionality

---

## Success Metrics

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Bundle Size | TBD | -30% | — |
| Initial Render (stale) | TBD | <500ms | — |
| Memory Usage | TBD | No regression | — |
| Code Lines (grid logic) | ~2000 | ~800 | — |
| Sections on Unified Grid | 0/14 | 14/14 | 0/14 |
| Visual Regressions | 0 | 0 | — |
| Test Coverage | TBD | 80%+ | — |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| MVVM migration complexity | Medium | High | Start early (P8.4), allocate extra time |
| Performance regression | Low | High | Continuous profiling, rollback ready |
| Visual inconsistencies | Medium | Medium | Frequent screenshots, stakeholder reviews |
| Breaking changes in wb-core | Low | Medium | Version lock, thorough testing |
| Timeline overrun | Medium | Medium | Prioritize P0/P1, defer P2/P3 if needed |

---

## Team & Resources

**Required Skills:**
- JavaScript (ES modules)
- CSS Grid
- DOM manipulation
- WebSocket
- ASP.NET Core (minimal)

**Estimated Effort:**
- Full-time: 4-6 weeks
- Part-time: 8-12 weeks

---

## Decision Log

| Date | Decision | Rationale |
|------|----------|-----------|
| Mar 3, 2026 | Use CSS Grid over `<table>` | Better performance, flexibility |
| Mar 3, 2026 | Keep MVVM for duplicates | Too complex to rewrite, works well |
| Mar 3, 2026 | Fragment batching via queueMicrotask | Zero layout thrash |
| Mar 3, 2026 | Separate wb-core from app code | Reusability for future projects |

---

## Open Questions

- [ ] Should we version wb-core separately?
- [ ] Do we need IE11 support? (Affects CSS)
- [ ] Should GridShell support virtual scrolling? (Future enhancement)
- [ ] Should we create Storybook for wb-core components?

---

## Changelog

| Date | Change | Author |
|------|--------|--------|
| Mar 3, 2026 | Initial plan created | — |
