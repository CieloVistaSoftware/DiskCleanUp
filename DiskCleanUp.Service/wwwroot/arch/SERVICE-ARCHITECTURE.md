---
docid: 300.2.service-architecture
id: diskcleanup-windows-service-architecture
title: DiskCleanUp — Windows Service Architecture
project: DiskCleanUp
description: Author: Claude + John Peters Date: 2026-02-27 Status: Design Phase Version: 1.0
status: active
tags: [service, architecture, diskcleanup]
category: 300.2 — Architecture
created: 2026-02-28
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: DiskCleanUp.Service/wwwroot/arch/SERVICE-ARCHITECTURE.md
---
# DiskCleanUp — Windows Service Architecture

**Author:** Claude + John Peters
**Date:** 2026-02-27
**Status:** Design Phase
**Version:** 1.0

---

## 1. Executive Summary

Migrate DiskCleanUp from a single ASP.NET Core process into a **two-process architecture**: a headless Windows Service that owns all business logic and file operations, and a lightweight system tray application that provides the dashboard UI on demand.

**Goals:**

- Background scanning on schedule without a browser open
- Survive user logoff (service runs as SYSTEM or a dedicated account)
- Auto-start on boot
- Dashboard becomes a disposable, stateless UI layer
- Clean separation: service = engine, tray app = windshield

---

## 2. Architecture Overview

```text
┌─────────────────────────────────────────────────────┐
│                    Windows OS                        │
│                                                      │
│  ┌──────────────────────┐  ┌──────────────────────┐ │
│  │  DiskCleanUp.Service │  │  DiskCleanUp.Tray    │ │
│  │  (Windows Service)   │  │  (System Tray App)   │ │
│  │                      │  │                      │ │
│  │  Kestrel :5100       │  │  NotifyIcon          │ │
│  │  ├─ REST API         │◄─┤  ├─ Open Dashboard   │ │
│  │  ├─ WebSocket /ws    │  │  ├─ Start/Stop Scans │ │
│  │  └─ SignalR (future) │  │  ├─ Status tooltip   │ │
│  │                      │  │  └─ Exit             │ │
│  │  ScanOrchestrator    │  │                      │ │
│  │  ConfigService       │  │  Launches browser →  │ │
│  │  WsManager           │  │  http://localhost:5100│ │
│  │  MetricsService      │  │                      │ │
│  │  BackgroundScans     │  │  Static files served  │ │
│  │  JSONL Cache         │  │  by the Service       │ │
│  │  Keep-List           │  │                      │ │
│  │  Savings/Errors      │  └──────────────────────┘ │
│  │                      │                            │
│  │  %ProgramData%\      │  ┌──────────────────────┐ │
│  │   DiskCleanUp\       │  │  Browser (Edge)      │ │
│  │   ├─ config.json     │  │  http://localhost:5100│ │
│  │   ├─ scan-cache\     │◄─┤  ├─ REST calls       │ │
│  │   ├─ keep-list.json  │  │  ├─ WebSocket conn   │ │
│  │   └─ savings.jsonl   │  │  └─ All existing JS  │ │
│  └──────────────────────┘  └──────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

---

## 3. Solution Structure

```text
DiskCleanUp/
├── DiskCleanUp.sln
│
├── DiskCleanUp.Service/              ← Windows Service (.NET 8 Worker)
│   ├── Program.cs                    ← UseWindowsService() + Kestrel
│   ├── ServiceWorker.cs              ← IHostedService lifecycle
│   ├── appsettings.json
│   │
│   ├── Api/                          ← All HTTP endpoints (moved from Program.cs)
│   │   ├── CacheEndpoints.cs         ← /api/cache/{section}
│   │   ├── ConfigEndpoints.cs        ← /api/config
│   │   ├── TrashEndpoints.cs         ← /api/trash, /api/delete-permanent
│   │   ├── KeepListEndpoints.cs      ← /api/keep-list/*
│   │   ├── MetricsEndpoints.cs       ← /api/metrics, /api/gc
│   │   ├── ScanEndpoints.cs          ← /api/export, /api/tasks
│   │   ├── DiagEndpoints.cs          ← /api/debug, /api/trace, /api/errors
│   │   └── FileEndpoints.cs          ← /api/file, /api/preview, /api/open*
│   │
│   ├── Services/                     ← Business logic (moved from root)
│   │   ├── ScanOrchestrator.cs
│   │   ├── ConfigService.cs
│   │   ├── WsManager.cs
│   │   ├── MetricsService.cs
│   │   ├── BackgroundScanService.cs
│   │   └── FileUtilities.cs
│   │
│   ├── Models/
│   │   ├── ScanEvent.cs
│   │   ├── DashConfig.cs
│   │   └── Requests.cs               ← All request DTOs
│   │
│   └── wwwroot/                       ← Static dashboard files
│       ├── index.html
│       ├── js/
│       ├── css/
│       └── sections/
│
├── DiskCleanUp.Tray/                 ← System Tray WinForms App
│   ├── Program.cs
│   ├── TrayApplicationContext.cs     ← NotifyIcon + context menu
│   ├── ServiceController.cs          ← Start/stop/status of the service
│   ├── Assets/
│   │   ├── icon.ico                  ← Tray icon (normal)
│   │   ├── icon-scanning.ico         ← Tray icon (scan in progress)
│   │   └── icon-error.ico            ← Tray icon (service down)
│   └── DiskCleanUp.Tray.csproj
│
├── DiskCleanUp.Shared/               ← Shared models/constants
│   ├── Constants.cs                  ← Ports, paths, section names
│   ├── Models/
│   │   ├── DashConfig.cs
│   │   └── ScanEvent.cs
│   └── DiskCleanUp.Shared.csproj
│
└── DiskCleanUp.Installer/            ← Optional: MSI/MSIX packaging
    └── (future)
```

---

## 4. DiskCleanUp.Service — The Engine

### 4.1 Hosting

```csharp
// Program.cs
var builder = Host.CreateApplicationBuilder(args);

builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "DiskCleanUp";
});

builder.Services.AddSingleton<ConfigService>();
builder.Services.AddSingleton<WsManager>();
builder.Services.AddSingleton<ScanOrchestrator>();
builder.Services.AddHostedService<MetricsService>();
builder.Services.AddHostedService<BackgroundScanService>();

builder.WebHost.ConfigureKestrel(k =>
{
    k.ListenLocalhost(Constants.ServicePort); // 5100
});

builder.Services.AddCors(o => o.AddDefaultPolicy(p =>
    p.SetIsOriginAllowed(origin =>
        new Uri(origin).Host == "localhost")
     .AllowAnyMethod()
     .AllowAnyHeader()
     .AllowCredentials()));

var app = builder.Build();
app.UseCors();
app.UseWebSockets();
app.UseStaticFiles();

app.MapCacheEndpoints();
app.MapConfigEndpoints();
app.MapTrashEndpoints();
app.MapKeepListEndpoints();
app.MapMetricsEndpoints();
app.MapScanEndpoints();
app.MapDiagEndpoints();
app.MapFileEndpoints();

app.MapFallbackToFile("index.html");

await app.RunAsync();
```

### 4.2 Data Directory

```text
%ProgramData%\DiskCleanUp\
├── config.json
├── keep-list.json
├── savings.jsonl
├── errors.jsonl
├── debug.json
├── trace.jsonl
├── scan-cache/
│   ├── css-files.json
│   ├── stale.json
│   └── ...
└── logs/
    └── service.log
```

**Why `%ProgramData%`?** Writable by SYSTEM and Administrators, survives app updates, standard for Windows services, not user-profile-specific.

### 4.3 Endpoint Organization

Split `Program.cs` into static extension method classes:

```csharp
// Api/CacheEndpoints.cs
public static class CacheEndpoints
{
    public static void MapCacheEndpoints(this WebApplication app)
    {
        app.MapGet("/api/cache/{section}", HandleGetCache);
        app.MapDelete("/api/cache/{section}", HandleDeleteCache);
        app.MapPost("/api/cache/{section}/remove", HandleRemovePaths);
    }
}
```

### 4.4 Service Installation

```text
DiskCleanUp.Service.exe --install     ← sc create + sc start
DiskCleanUp.Service.exe --uninstall   ← sc stop + sc delete
DiskCleanUp.Service.exe --console     ← Run as console app (dev mode)
```

### 4.5 Service Account

**LocalSystem** — full disk access, localhost-only Kestrel means no external attack surface.

### 4.6 Logging

EventLog (Application → DiskCleanUp) + rolling file log (10MB × 3 files).

---

## 5. DiskCleanUp.Tray — The Dashboard Launcher

### 5.1 Context Menu

- 📊 Open Dashboard (also on double-click)
- ▶ Start Service
- ⏹ Stop Service
- 🔄 Restart Service
- ⚙ Settings
- 📋 View Logs
- ❌ Exit Tray App

### 5.2 Tray Icon States

| State | Icon | Tooltip |
|-------|------|---------|
| Running (idle) | Green broom | `DiskCleanUp — Running · 12 MB` |
| Scanning | Animated sweep | `DiskCleanUp — Scanning stale files...` |
| Stopped | Gray broom | `DiskCleanUp — Service not running` |
| Error | Red broom | `DiskCleanUp — Service error` |

### 5.3 Health Polling

Polls `GET /api/metrics` every 10 seconds. Updates icon + tooltip based on response.

### 5.4 Auto-Start

```text
HKCU\Software\Microsoft\Windows\CurrentVersion\Run
  DiskCleanUp.Tray = "C:\Program Files\DiskCleanUp\DiskCleanUp.Tray.exe"
```

Service = boot start. Tray app = login start. Independent lifecycles.

---

## 6. Frontend Changes

**Minimal impact.** Service serves static files AND the API from the same Kestrel on port 5100. Relative URLs continue to work. WebSocket `ws://${location.host}/ws` resolves correctly. No CORS needed — same origin.

---

## 7. Migration Plan

### Phase 1: Restructure (No Behavior Change)
1. Create `DiskCleanUp.sln` with three projects
2. Extract `DiskCleanUp.Shared` (models, constants)
3. Move `.cs` files into `DiskCleanUp.Service/`
4. Split `Program.cs` endpoints into `Api/*.cs`
5. Move `wwwroot/` into Service project
6. Change data directory to `%ProgramData%\DiskCleanUp\`
7. **Test**: Run as console, verify identical behavior

### Phase 2: Windows Service
1. Add `UseWindowsService()`
2. Add CLI install/uninstall flags
3. Add EventLog + file logging
4. Install as service, verify background scans
5. **Test**: Starts on boot, API accessible, scans execute

### Phase 3: System Tray App
1. Create WinForms tray project
2. Implement NotifyIcon + context menu
3. Add health polling + service controls
4. Add auto-start on login
5. **Test**: Status icons, dashboard launch, start/stop

### Phase 4: Polish
1. Tray icon state animation
2. Toast notifications for scan completion
3. Live stats in tooltip
4. Installer (MSI/MSIX)
5. Data migration from old location

---

## 8. Shared Constants

```csharp
// DiskCleanUp.Shared/Constants.cs
public static class Constants
{
    public const int ServicePort = 5100;
    public const string ServiceName = "DiskCleanUp";

    public static string DataDir =>
        Path.Combine(Environment.GetFolderPath(
            Environment.SpecialFolder.CommonApplicationData), "DiskCleanUp");

    public static string ScanCacheDir => Path.Combine(DataDir, "scan-cache");
    public static string ConfigPath   => Path.Combine(DataDir, "config.json");
    public static string KeepListPath => Path.Combine(DataDir, "keep-list.json");
}
```

---

## 9. Security

- **Localhost only** — no external attack surface
- **Path validation** — existing `AllRoots(cfg)` prevents arbitrary file ops
- **No auth needed** — localhost IPC, single-user machine
- **XSS hardening** — existing scan-grid.js protections carry forward

---

## 10. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Service crash | Recovery policy: auto-restart via sc.exe |
| Port conflict | Configurable in appsettings.json |
| Data dir permissions | Installer creates dir with proper ACLs |
| Migration breaks data | Phase 1 includes migration script |
| Tray can't reach service | Clear error in tooltip + retry |

---

## 11. Decision Log

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Architecture | Two-process | Independent lifecycles |
| Service framework | ASP.NET Core + UseWindowsService | Minimal migration |
| Dashboard delivery | Static files from service Kestrel | No CORS, single port |
| Tray framework | WinForms NotifyIcon | Lightest weight |
| Data directory | %ProgramData% | Writable by SYSTEM, survives updates |
| Service port | 5100 | Avoids dev port 5000 conflict |
| IPC | HTTP + WebSocket | Zero frontend rewrite |

---

## 12. Future Enhancements

- Named Pipes transport (eliminate HTTP overhead for local IPC)
- Toast notifications for scan completion
- Scheduled scan profiles (different configs for different times)
- OneDrive / Google Drive integration
- Installer (MSI/MSIX) for clean deployment
