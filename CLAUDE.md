---
docid: 300.5.claude
id: claude
title: CLAUDE
project: DiskCleanUp
description: 1. Read this file (claude.md) 2. Read docs/today/CURRENT-STATUS.md (parking lot + backlog) 3. Use recentchats to pick up where we left off 4. Prefi…
status: active
tags: [claude, session, start]
category: 300.5 — AI Coordination
created: 2026-03-04
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: CLAUDE.md
---
# DiskCleanUp - Claude Session File

## Session Start Protocol
1. Read this file (claude.md)
2. Read `docs/_today/CURRENT-STATUS.md` (parking lot + backlog)
3. Use `recent_chats` to pick up where we left off
4. Prefix response with: "This was the last thing we spoke about:" then summarize

---

## Project Overview

**Type:** ASP.NET Core 8 Windows Service + vanilla HTML/JS frontend + SignalR real-time
**Location:** `C:\Users\jwpmi\source\repos\DiskCleanUp`
**Data:** `C:\ProgramData\DiskCleanUp\` (always, both modes)
**Service port:** 5100 | **Console port:** 5000

### Project Structure
```text
DiskCleanUp/
+-- DiskCleanUp.Service/     <- THE app (service + console via --console)
|   +-- Api/                 9 endpoint extension classes
|   +-- Services/            ConfigService, ScanOrchestrator, MetricsService, BackgroundScanService
|   +-- Program.cs           Entry point, DI, middleware, CLI (--install/--uninstall/--console)
|   +-- wwwroot/             THE canonical frontend + architecture docs
|       +-- js/              ES modules (init.js, page-loader.js, websocket.js, etc.)
|       +-- sections/        Per-section JS (duplicates.js)
|       +-- arch/            Architecture markdown docs
+-- DiskCleanUp.Shared/      Constants.cs + Models.cs
+-- DiskCleanUp.Tray/        System tray app (WinForms, NotifyIcon)
+-- mcp-server/              MCP server for Claude Desktop
+-- scripts/                 kill-port.js, trace-server.js
+-- tests/                   Playwright tests
+-- docs/_today/             CURRENT-STATUS.md (parking lot + backlog)
+-- _retired/                Old files (safe to delete)
```

### Key Files
| File | Purpose |
|------|---------|
| `Service/Program.cs` | Entry point: UseWindowsService, CLI, DI, middleware |
| `Service/Api/*.cs` | 9 endpoint classes (Cache, Config, Diag, File, KeepList, Metrics, RecycleBin, Task, Trash) |
| `Shared/Constants.cs` | Ports, service name, `DataDir` (single source of truth) |
| `Shared/Models.cs` | All record types |
| `Service/Services/ConfigService.cs` | Config, savings, session, error log, scan cache |
| `Service/Services/ScanOrchestrator.cs` | Background scan engine (12 sections) |
| `Service/Services/MetricsService.cs` | Win32 CPU/memory sampling (5s interval) |
| `Service/Services/BackgroundScanService.cs` | Startup staggered + scheduled + interval scans |

### Data Files (all in C:\ProgramData\DiskCleanUp\)
| File | Purpose |
|------|---------|
| `config.json` | User config (roots, thresholds) |
| `dashboard_config.json` | Dashboard preferences |
| `current_session.json` | Active session info |
| `keep-list.json` | Paths excluded from results |
| `savings_log.jsonl` | Append-only savings log |
| `trace.jsonl` | Frontend trace breadcrumbs |
| `errors.jsonl` | Client-side error log |
| `scan-cache/*.json` | Per-section JSONL result cache |
| `data/fixes.json` | Known bugs and fixes registry |

---

## Architecture Rules

- **One-time-one-place** - no duplicate files, no duplicate functions, single canonical location for everything
- **ES modules only** - frontend uses `import/export`, no CommonJS
- **All deletes go to Recycle Bin** - `FileUtilities.SendToRecycleBin()`, no `_trash` folder
- **Light DOM only** - no Shadow DOM in frontend components
- **No `.bat` files** - PowerShell `.ps1` or in-browser actions only
- **FileShare.ReadWrite always** - prevents OS file-lock conflicts
- **40KB Read Rule** - never allocate read buffer over 40,960 bytes (LOH avoidance). Use `StreamReader` with `bufferSize: 4096`. No `File.ReadAllBytes/Text/Lines` on growable files
- **Paged Cache Restore** - `/api/cache/{section}?offset=N` reads 40KB JSONL chunks. Frontend `page-loader.js` handles paging with "Load More" button
- **Constants.DataDir** - all data paths resolve through this single property. No `AppContext.BaseDirectory`, no conditional logic

---

## Scan Modes (Priority Order)
| Priority | Mode | Trigger | Sections |
|----------|------|---------|----------|
| P1 | On-Demand | Dashboard scan button | Single section |
| P2 | Startup Staggered | Service boot (15s delay) | All 12, 30s gaps, light-to-heavy |
| P3 | Scheduled Daily | `scheduled_scan_time` config | Configurable |
| P4 | Interval Recurring | Every `scan_interval_hours` (default 6) | All 12 |

12 sections: empty, large, stale, tiny-files, html-files, css-files, backups, node-modules, venvs, smart-dedup, images, duplicates

---

## NPM Scripts
| Command | Action |
|---------|--------|
| `npm start` | Start MCP server |
| `npm run trace` | Kill port 5001 + start trace viewer |
| `npm run kill` | Kill ports 5100 + 5001 |
| `npm run restart` | Kill all + trace + build + run service |

---

## DO NOT
- Do not use `File.ReadAllBytes/Text/Lines` on growable files (40KB rule)
- Do not let log exceptions surface as HTTP 500s - always wrap in try-catch
- Do not run tests synchronously without John's explicit request
- Do not create `.bat` launcher scripts
- Do not create duplicate files - one canonical location only
- Do not use `AppContext.BaseDirectory` for data paths - use `Constants.DataDir`
- Do not hardcode port numbers - use `Constants.ServicePort` / `Constants.DevPort`
- **Windows Service is for PRODUCTION only.** For dev, set it to Manual start (one-time admin cmd): `sc.exe config DiskCleanUp start= demand` — after this it will never auto-restart and fight builds again. Run as console app with `--console` during dev.
- **NEVER start the service exe directly from `bin\Debug\net8.0\`** — wwwroot will not resolve and the dashboard 404s. Always set WorkingDirectory to `DiskCleanUp.Service\` when launching manually:
  ```
  Start-Process ".\DiskCleanUp.Service\bin\Debug\net8.0\DiskCleanUp.Service.exe" -ArgumentList "--console" -WorkingDirectory (Resolve-Path "DiskCleanUp.Service") -WindowStyle Normal
  ```
  Or use `npm run restart` which does this correctly every time.

---

## Global Standards

These apply to ALL CieloVista projects.

**Repo:** https://github.com/CieloVistaSoftware/CieloVistaStandards
**Local:** `C:\Users\jwpmi\Downloads\CieloVistaStandards\`

| Document | Location |
|---|---|
| Copilot Rules | `C:\Users\jwpmi\Downloads\CieloVistaStandards\copilot-rules.md` |
| JavaScript Standards | `C:\Users\jwpmi\Downloads\CieloVistaStandards\javascript_standards.md` |
| Git Workflow | `C:\Users\jwpmi\Downloads\CieloVistaStandards\git_workflow.md` |
| Web Component Guide | `C:\Users\jwpmi\Downloads\CieloVistaStandards\web_component_guide.md` |
| Project Registry | `C:\Users\jwpmi\Downloads\CieloVistaStandards\project-registry.json` |
| Issue Filing Rules | `C:\Users\jwpmi\Downloads\CieloVistaStandards\issue-filing-rules.md` |
