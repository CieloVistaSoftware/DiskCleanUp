
# DiskCleanUp.Service — The Engine

A headless **Windows Service** built on ASP.NET Core 8 with `UseWindowsService()`. Starts on boot, survives logoff, owns all state.

## Hosting

```csharp
var builder = Host.CreateApplicationBuilder(args);
builder.Services.AddWindowsService(options =>
{
    options.ServiceName = "DiskCleanUp";
});

builder.WebHost.ConfigureKestrel(k =>
    k.ListenLocalhost(5100));  // localhost only — no attack surface

builder.Services.AddSingleton<ConfigService>();
builder.Services.AddSingleton<WsManager>();
builder.Services.AddSingleton<ScanOrchestrator>();
builder.Services.AddHostedService<MetricsService>();
builder.Services.AddHostedService<BackgroundScanService>();
builder.Services.AddHostedService<SysmonWatcher>();  // NEW
```

## Endpoint Organization

Current `Program.cs` has ~500 lines of inline endpoints. Split into domain files:

| File | Endpoints |
|------|-----------|
| `CacheEndpoints.cs` | `/api/cache/{section}` GET, DELETE, POST remove |
| `ConfigEndpoints.cs` | `/api/config` GET, POST |
| `TrashEndpoints.cs` | `/api/trash`, `/api/delete-permanent` |
| `KeepListEndpoints.cs` | `/api/keep-list/*` |
| `MetricsEndpoints.cs` | `/api/metrics`, `/api/gc` |
| `ScanEndpoints.cs` | `/api/scan/start`, `/api/scan/activity` |
| `DiagEndpoints.cs` | `/api/debug`, `/api/trace`, `/api/errors` |
| `FileEndpoints.cs` | `/api/file`, `/api/preview`, `/api/open*` |
| `SysmonEndpoints.cs` | `/api/sysmon/status`, `/api/sysmon/reload` |

Each is a static extension class — one `MapXxxEndpoints(this WebApplication app)` method. No logic changes, just reorganization.

## Data Directory

Moves from `AppContext.BaseDirectory` to `%ProgramData%\DiskCleanUp\`:

```text
%ProgramData%\DiskCleanUp\
├── config.json           ← Scan settings, roots, thresholds
├── keep-list.json        ← Protected paths
├── savings.jsonl         ← Trash/delete history
├── errors.jsonl          ← Client + server errors
├── sysmon-config.xml     ← Auto-generated Sysmon filter
├── scan-cache/           ← JSONL per section
│   ├── css-files.json
│   ├── stale.json
│   └── ...
└── logs/
    └── service.log       ← Rolling 10MB × 3
```

**Why `%ProgramData%`?** Writable by SYSTEM, survives app updates, standard for Windows services, not user-profile-specific.

## Service Installation

```text
DiskCleanUp.Service.exe --install     ← sc create + sc start
DiskCleanUp.Service.exe --uninstall   ← sc stop + sc delete
DiskCleanUp.Service.exe --console     ← Run as console (dev mode)
```

## Logging

EventLog (Application → DiskCleanUp) + rolling file log. Visible in Windows Event Viewer. Structured logging replaces all `Console.WriteLine` calls.

---
dewey: 300.9
title: DiskCleanUp.Service — The Engine
description: A headless Windows Service built on ASP.NET Core 8 with UseWindowsService(). Starts on boot, survives logoff, owns all state.
project: DiskCleanUp
category: 300.9 — Meta
relativePath: bin/Fresh/wwwroot/arch/service-engine.md
created: 2026-03-04
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [arch, aspnet, boot, built, core, diskcleanup, diskcleanupservice, engine, headless, meta, service, starts, survives, usewindowsservice, windows]
---