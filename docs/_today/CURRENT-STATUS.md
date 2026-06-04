# 🅿️ PARKING LOT

**Last session:** 2026-06-01
**Active project:** DiskCleanUp (`C:\Users\jwpmi\source\repos\DiskCleanUp`)

## ✅ COMPLETED — 2026-06-01/02 (Duplicates viewer overhaul + symlink/hardlink + misc fixes)

**TASKS:** Duplicates viewer full redesign, symlink/hardlink endpoint, WS reconnect cap, CSS merge timeout, self-heal module, MCP crash suppression, Extension Finder Add Issue, worktree cleaner safety audit, White BG on all sections, duplicates 0-rows bug, DiskCleanUp backend status indicator in CVT home.

**NEXT STEP:** Zero open issues on both repos. Continue with new user requests.

---

## ✅ COMPLETED — 2026-05-18 (Issue #18 — Worker Service + IScanRule Pipeline)

**TASK:** Redesign as Worker Service + plugin scanner pipeline (GitHub Issue #18)
**STATUS:** Complete — build succeeds, 0 errors
**FILES TOUCHED:**
- Removed Windows Service: `UseWindowsService`, `--install`/`--uninstall`, `InstallService`, `UninstallService`, `RunSc`, `MigrateData` from `Program.cs`
- `DiskCleanUp.Service/Program.cs` — added `ScanPipeline` + 13 `IScanRule` DI registrations in both scan and serve/console modes
- `DiskCleanUp.Service/Services/ScanOrchestrator.cs` — rewrote: inject `ScanPipeline`, replace switch with `_pipeline.RunAsync`, add `_GatedXxHashAsync`/`_GatedSha256Async`, remove all private scan methods + scan log machinery
- `DiskCleanUp.Shared/Scanning/ScanContext.cs` — added `Extensions` property
- Created 13 IScanRule files in `DiskCleanUp.Service/Scanning/Rules/`: Duplicates, SmartDedup, Stale, Large, TinyFiles, HtmlFiles, CssFiles, Empty, NodeModules, Venvs, Images, Backups, ExtSearch
- `DiskCleanUp.Service/Scanning/FileEnumerator.cs` — already complete (BFS enumeration helper)
- `DiskCleanUp.Service/Scanning/ScanPipeline.cs` — already complete (rule dispatcher)
- Docs updated: `SERVICE-ARCHITECTURE.md`, `service-engine.md`, `server-pipeline.md`, `README.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `CHANGELOG.md`

## 🅿️ PARKING LOT — previous session 2026-05-09

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
docid: 300.9.current-status
id: parking-lot
title: 🅿️ PARKING LOT
project: DiskCleanUp
description: Parking lot and current session status for DiskCleanUp.
status: active
tags: [current, diskcleanup, lot, meta, parking, session, status, today]
category: 300.9 — Meta
created: 2026-03-24
updated: 2026-05-18
version: 2.2.0
author: CieloVista Software
relativepath: docs/_today/CURRENT-STATUS.md
---