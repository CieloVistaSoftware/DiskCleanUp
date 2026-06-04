
# DiskCleanUp.Tray — System Tray Launcher

A minimal **WinForms** application using `NotifyIcon`. No visible window — lives entirely in the system tray. Double-click opens the dashboard in your default browser.

## Context Menu

| Item | Action |
|------|--------|
| Open Dashboard | Launches `http://localhost:5100` in default browser |
| Settings | Opens `http://localhost:5100/#settings` |
| Start Service | `ServiceController.Start()` (disabled when running) |
| Stop Service | `ServiceController.Stop()` (disabled when stopped) |
| Restart Service | Stop, WaitForStatus, Start |
| View Logs | Opens Event Viewer filtered to Application log |
| Start with Windows | Toggles HKCU Run registry key |
| Exit Tray App | Hides icon, exits process (service keeps running) |

## Health Polling

Every 10 seconds, calls `GET /api/service/info` on the service. Updates icon color and tooltip:

| State | Icon Color | Tooltip Example |
|-------|------------|-----------------|
| Running (idle) | Green circle | `DiskCleanUp — Running - Up 2h 15m` |
| Scanning | Blue circle | `DiskCleanUp — Scanning...` |
| Stopped | Gray circle | `DiskCleanUp — Service not running` |
| Error | Red circle | `DiskCleanUp — Service timeout` |

## Auto-Start

Registry entry at `HKCU\Software\Microsoft\Windows\CurrentVersion\Run` launches the tray app on user login. The service itself starts on boot (Windows Service auto-start). Two independent lifecycles — killing the tray app does not stop the service.

## Single Instance

Uses a named `Mutex` to prevent multiple tray icons:

```csharp
using var mutex = new Mutex(true, "DiskCleanUp.Tray.SingleInstance", out bool isNew);
if (!isNew) return;  // already running
```

## Icon Generation

Icons are generated at runtime via `IconGenerator.CreateCircleIcon(Color)` — no external .ico files needed. Four colors: green (running), blue (scanning), gray (stopped), red (error).

## Future: Toast Notifications

Windows 10/11 native notifications for scan completion, large files found, and disk space alerts. The tray app is the natural owner of user notifications since it runs in the user session context.

---
dewey: 300.9
title: DiskCleanUp.Tray — System Tray Launcher
description: A minimal WinForms application using NotifyIcon. No visible window — lives entirely in the system tray. Double-click opens the dashboard in your de…
project: DiskCleanUp
category: 300.9 — Meta
relativePath: bin/Fresh/wwwroot/arch/tray-app.md
created: 2026-03-04
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [app, application, arch, diskcleanup, diskcleanuptray, entirely, launcher, lives, meta, minimal, notifyicon, system, tray, using, visible, window, winforms]
---