---
docid: 300.9.tray-help
id: diskcleanup-tray-app-help
title: DiskCleanUp Tray App Help
project: DiskCleanUp
description: The DiskCleanUp Tray App is a small program that sits in your Windows system tray and provides quick access to control the DiskCleanUp backend serv…
status: active
tags: [tray, help, diskcleanup]
category: 300.9 — Meta
created: 2026-03-25
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: DiskCleanUp.Tray/TRAY-HELP.md
---
# DiskCleanUp Tray App Help

## What is the Tray App?
The DiskCleanUp Tray App is a small program that sits in your Windows system tray and provides quick access to control the DiskCleanUp backend service and dashboard during development.

## Features
- **Start Service**: Launches the DiskCleanUp backend in console mode (port 5000).
- **Stop Service**: Sends a shutdown command to the backend service.
- **Restart Service**: Stops and then starts the backend service.
- **Open Dashboard**: Opens the DiskCleanUp web dashboard in your browser.
- **Start with Windows**: Toggle whether the tray app launches automatically when you log in.
- **Dev Tools**: Access developer tools for testing (e.g., freeze simulation).
- **Help**: Opens this help document.
- **Exit**: Closes the tray app.

## How to Use
- **Right-click** the tray icon to open the menu.
- **Double-click** the tray icon to open the dashboard.
- Menu items will enable/disable based on the current state of the backend service.

## Notes
- The tray app only controls the development/console mode (port 5000), not the Windows Service (port 5100).
- For production, use the Windows Service directly.
- If you encounter issues, use the Help menu for guidance or contact support.

---
Cielo Vista Software — DiskCleanUp Project
