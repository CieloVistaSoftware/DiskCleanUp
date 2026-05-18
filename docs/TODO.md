---
docid: 300.9.todo
id: diskcleanup-todo-backlog
title: DiskCleanUp — TODO Backlog
project: DiskCleanUp
description: "Last updated: 2026-02-26"
status: active
tags: [todo, diskcleanup, backlog]
category: 300.9 — Meta
created: 2026-02-26
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: docs/TODO.md
---
# DiskCleanUp — TODO Backlog

Last updated: 2026-02-26

---

## 🔴 Open — Next Up

### FEAT-017 — Memory % Text on MEM Indicator
- Show percentage of memory used as text element on the MEM gauge, matching CPU indicator style

### FEAT-018 — Smart Dedup: File Type Dropdown + Folder Breadcrumb
- Add file type filter dropdown to Smart Dedup (Numbered Copies)
- Add breadcrumb folder selector starting at root, showing subsequent choices after selection
- Filter should work during scan (only scan selected types) and post-scan (hide/show rows)

### FEAT-019 — Tiny Files: Render Subpage
- Button that opens filtered tiny files in a standalone `tinyfiles-render.html` page
- Full HTML page with sorting, filtering, file type breakdown

### FEAT-020 — Tiny Files: Extension Filter Passes to Scanner
- When a type filter is selected and a new scan starts, pass the selected extension(s) to the backend
- Backend only scans files matching those extensions (skip non-matching files early)

### FEAT-021 — Tiny Files: Dropdown Shows No Extension Names (BUG)
- The "All Types" dropdown populates with zero extensions after cache restore
- Extensions only tracked during live scan, not rebuilt from cached results

### FEAT-022 — Universal Scan Filter Module
- Create a reusable `scan-filter.js` module (one-time-one-place)
- Handles: file type dropdown, folder breadcrumb, text search
- All scan sections use the same filter logic — no duplication
- Filter state persists per section
- Supports both client-side filtering (hide/show rows) and server-side filtering (pass to scanner)

---

## 🟡 Backlog

### REFACTOR-001 — Break index.html JS into modules
### DOC-001 — In-Depth User Documentation
### FEAT-007 — Documentation Link on Dashboard
### FEAT-001 — ZIP Tab: Filter + Multi-Select + Delete
### FEAT-002 — Excel/CSV Tab: Same as FEAT-001
### FEAT-003 — Help System (right-click context help)
### FEAT-004 — Venv Consolidator Tab
### FEAT-006 — Venv Tab Launcher

---

## ✅ Completed

### Session 2026-02-26 (evening)
- ✅ FEAT-013 — Settings Markdown Help Panel (settings-split grid, marked.js, settings-help.md)
- ✅ FEAT-011 — Savings Log Recycle Bin Restore (Shell32 COM, filter toolbar, bulk restore)
- ✅ FEAT-014 — Memory Red Zone (85% warning + auto-GC, 92% critical + cancel idle scans)
- ✅ BUG-015 — Column resize not visible (table-layout: fixed + 100% width → sum-of-columns width)
- ✅ FEAT-TAB — Tab persistence on refresh (localStorage + restoreActiveTab)
- ✅ BUG-016 — Shell32 COM timeouts (apiFetch bumped to 30–60s for trash/delete/dedup)
- ✅ BUG-017 — CDN blocking page load (marked.min.js downloaded local, defer attribute)

### Session 2026-02-26 (earlier)
- ✅ BUG-013 — Overflow banner persists after Delete All Copies (grid-view.js `_removeOverflowBanner()`)
- ✅ BUG-014 — Stale cache resurrects deleted data on tab switch (DELETE /api/cache after bulk delete)
- ✅ FEAT-015 — Tiny Files scanner (≤1 KB) — backend + frontend + nav
- ✅ FEAT-016 — HTML Files scanner (.html/.htm/.xhtml/.mhtml/.mht) — backend + frontend + nav

### Session 2026-02-25
- ✅ BUG-010 — `openFileInVSCode` not a function → added to ui-utils.js
- ✅ BUG-011 — HTTP 405 on keep-list/add → needs dotnet build
- ✅ BUG-012 — Empty duplicates grid (vm.visible never set) → fixed wiring
- ✅ FEAT-010 — Keep list wired into all scanners
- ✅ FEAT-012 — Remove skeletons on scan complete (all 11 sections)

### Earlier
- ✅ BUG-001 — fix-viewer.html 404
- ✅ DONE-001 — Savings Log Tab
- ✅ DONE-002 — Scan Cache (JSONL)
- ✅ DONE-003 — SignalR → WebSocket Migration
- ✅ DONE-004 — Session System
- ✅ DONE-005 — SemaphoreSlim File Locking
- ✅ DONE-006 — File Lock on savings_log.jsonl
- ✅ DONE-007 — MVVM Architecture (duplicates section)
- ✅ DONE-008 — Bulletproof File Operations (FileShare.ReadWrite)
- ✅ DONE-009 — Recursive Backup Folder BFS Fix
- ✅ DONE-010 — Zombie Process Cleanup (kill-port.js)
- ✅ DONE-011 — Keep List Backend + Frontend
- ✅ DONE-012 — Recycle Bin Migration
