# README

---
docid: 300.7
dewey: 300.7
id: diskcleanup
title: DiskCleanUp
project: DiskCleanUp
description: ASP.NET Core 8 Worker Service + browser dashboard for reclaiming disk space. Scans duplicates, stale files, large files, empty folders, and more.
status: active
tags: [readme, diskcleanup, quick]
category: 300.7 — Getting Started
created: 2026-02-21
updated: 2026-05-18
version: 2.2.0
author: CieloVista Software
relativepath: README.md
---
# DiskCleanUp

ASP.NET Core 8 Worker Service + browser dashboard for reclaiming disk space.
Scans duplicates, stale files, large files, empty folders, and additional cleanup categories with real-time WebSocket updates.

## Quick Start

**Run in console mode (development):**
```powershell
dotnet build DiskCleanUp.sln
dotnet run --project DiskCleanUp.Service -- --console
# Dashboard: http://localhost:5000
```

**Headless scan mode (Task Scheduler / CI):**
```powershell
dotnet run --project DiskCleanUp.Service -- --scan
```

**MCP Server (for Claude Desktop):**
```powershell
cd mcp-server
npm install
node server.js
```

## Architecture

- **Backend:** ASP.NET Core 8 Worker Service (Generic Host), Minimal API, WebSocket
- **Scan engine:** `IScanRule` plugin pipeline (13 rules, no switch statements)
- **Frontend:** Vanilla HTML/JS, ES modules, no frameworks
- **Data:** `C:\ProgramData\DiskCleanUp\` (single location, both modes)
- **Tray App:** WinForms NotifyIcon

## Notes

- **Ports:** service mode uses `5100`, console mode uses `5000`.
- **Extension Finder:** users can set a per-section root path directly in the UI and pick a folder; that path is used for subsequent Extension Finder scans until changed.
- **Deletes:** file deletes are routed to the Windows Recycle Bin.

## Troubleshooting

- WebSocket stuck at "⚡ Connecting...": see [docs/TROUBLESHOOTING-WebSocket-Connecting-vs-Live.md](docs/TROUBLESHOOTING-WebSocket-Connecting-vs-Live.md)

## Project Structure

```text
DiskCleanUp.Service/    The app (service + console mode)
DiskCleanUp.Shared/     Constants + Models
DiskCleanUp.Tray/       System tray app
mcp-server/             MCP server for Claude Desktop
scripts/                Dev utilities (kill-port, trace-viewer)
tests/                  Playwright tests
```text
All repository PowerShell scripts (`*.ps1`) are kept under `scripts/`.

## Common Commands

```powershell
# Build solution
dotnet build DiskCleanUp.sln

# Run dashboard in dev mode
dotnet run --project DiskCleanUp.Service -- --console

# Run nav dropdown regression test
cd tests
npm run test:nav
```text
## Prerequisites

- .NET 8 SDK
- Node.js (for MCP server only)
- Windows 10/11

## License

Cielo Vista Software

---

## What it does

_TODO: 2–5 sentences describing what problem this project solves and who uses it._
