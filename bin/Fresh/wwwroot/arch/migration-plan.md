
# Migration Plan

Four phases. Each phase is independently testable. Phase 1 changes zero behavior.

## Phase 1: Restructure

> **Goal:** New solution structure, same behavior. Everything still works as a console app.

1. Create `DiskCleanUp.sln` with three projects (Service, Tray, Shared)
2. Extract `DiskCleanUp.Shared` — move `Models/`, `Constants.cs`
3. Move all `.cs` files into `DiskCleanUp.Service/Services/`
4. Split `Program.cs` endpoints into `Api/*.cs` extension classes
5. Move `wwwroot/` into `DiskCleanUp.Service/`
6. Change data directory to `%ProgramData%\DiskCleanUp\`
7. Add data migration script (copies existing config/cache/keep-list)

**Test gate:** Run as console app with `--console`, verify all 148 tests pass, verify dashboard works identically.

## Phase 2: Windows Service

> **Goal:** Background service that starts on boot.

1. Add `UseWindowsService()` to hosting
2. Add `--install` / `--uninstall` CLI flags
3. Add EventLog + rolling file logging
4. Set service recovery policy (auto-restart on failure)
5. Install as Windows service

**Test gate:** Service starts on boot, API accessible at `localhost:5100`, scheduled scans execute in background, survives logoff.

## Phase 3: System Tray App

> **Goal:** User-facing presence with service controls.

1. Create `DiskCleanUp.Tray` WinForms project
2. Implement `NotifyIcon` with context menu
3. Add health polling (10-second interval)
4. Add service start/stop/restart via `ServiceController`
5. Add auto-start on login (registry entry)
6. Icon states: running / scanning / stopped / error

**Test gate:** Tray icon appears on login, shows correct status, double-click opens dashboard, start/stop controls work.

## Phase 4: Sysmon + Polish

> **Goal:** Real-time monitoring, production-ready installer.

1. Add `SysmonWatcher` background service
2. Auto-generate `sysmon-config.xml` from scan roots
3. Implement delta scan pipeline (debounced directory scans)
4. Add Sysmon status panel to dashboard Settings
5. Add activity feed (live file event timeline)
6. Toast notifications for scan completion
7. Targeted area scan (right-click → Scan This Folder)
8. Installer (MSI or MSIX) for clean deployment

**Test gate:** Sysmon events trigger delta scans, cache stays fresh without manual scans, dashboard shows real-time activity, installer works end-to-end.

## Shared Constants

```csharp
public static class Constants
{
    public const int ServicePort = 5100;
    public const string ServiceName = "DiskCleanUp";

    public static string DataDir =>
        Path.Combine(Environment.GetFolderPath(
            Environment.SpecialFolder.CommonApplicationData), "DiskCleanUp");

    public static string ScanCacheDir   => Path.Combine(DataDir, "scan-cache");
    public static string ConfigPath     => Path.Combine(DataDir, "config.json");
    public static string KeepListPath   => Path.Combine(DataDir, "keep-list.json");
    public static string SysmonConfig   => Path.Combine(DataDir, "sysmon-config.xml");
}
```

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Service crash loop | sc.exe failure recovery: restart after 5s, 30s, 60s |
| Port 5100 conflict | Configurable in `appsettings.json` |
| Data dir permissions | Installer creates dir with Administrators + SYSTEM ACL |
| Migration data loss | Phase 1 migration script backs up before moving |
| Sysmon not installed | Graceful fallback to FileSystemWatcher |

---
dewey: 300.9
title: Migration Plan
description: Four phases. Each phase is independently testable. Phase 1 changes zero behavior.
project: DiskCleanUp
category: 300.9 — Meta
relativePath: bin/Fresh/wwwroot/arch/migration-plan.md
created: 2026-03-04
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [arch, behavior, changes, diskcleanup, each, four, independently, meta, migration, phase, phases, plan, testable, zero]
---