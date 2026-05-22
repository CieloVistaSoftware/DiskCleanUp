---
docid: 300.2.diskcleanup-service-wwwroot-arch-service-engine
id: diskcleanupservice-the-engine
title: DiskCleanUp.Service — The Engine
project: DiskCleanUp
description: A .NET 8 Generic Host Worker Service. Runs as a console app (dev) or headless via Task Scheduler (scheduled scans).
status: active
tags: [service, engine, diskcleanupservice]
category: 300.2 — Architecture
created: 2026-02-28
updated: 2026-05-18
version: 2.2.0
author: CieloVista Software
relativepath: DiskCleanUp.Service/wwwroot/arch/service-engine.md
---
# DiskCleanUp.Service — The Engine

A **.NET 8 Generic Host Worker Service** running as a plain console application. No Windows Service registration required — schedule via Task Scheduler or run interactively.

## Hosting

```csharp
// No UseWindowsService() — plain Generic Host
var builder = WebApplication.CreateBuilder(args);

// IScanRule plugin pipeline
builder.Services.AddSingleton<ScanPipeline>();
builder.Services.AddSingleton<IScanRule, DuplicatesRule>();
// ... all 13 rule registrations

builder.Services.AddSingleton<ScanOrchestrator>();
builder.Services.AddSingleton<WsManager>();
builder.Services.AddSingleton<ConfigService>();
builder.Services.AddHostedService<MetricsService>();
builder.Services.AddHostedService<BackgroundScanService>();
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

Each is a static extension class — one `MapXxxEndpoints(this WebApplication app)` method.

## Data Directory

All state in `%ProgramData%\DiskCleanUp\` via `Constants.DataDir`:

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
