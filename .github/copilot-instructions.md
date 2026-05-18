---
dewey: 300.5
id: copilot-instructions
title: copilot instructions
project: DiskCleanUp
description: ASP.NET Core 8 Windows Service + vanilla HTML/JS dashboard for disk cleanup.
status: active
tags: [copilot, instructions, project]
category: 300.5 — AI Coordination
created: 2026-02-21
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: .github/copilot-instructions.md
---
<!-- Workspace instructions for GitHub Copilot -->

## Project: DiskCleanUp
ASP.NET Core 8 Windows Service + vanilla HTML/JS dashboard for disk cleanup.

## Key Rules
- **ES modules only** in frontend (import/export, no CommonJS)
- **All data paths** use `Constants.DataDir` (`C:\ProgramData\DiskCleanUp\`)
- **40KB read rule** - never allocate buffers > 40,960 bytes on .NET heap
- **FileShare.ReadWrite** on all file I/O
- **All deletes** go to Windows Recycle Bin via `FileUtilities.SendToRecycleBin()`
- **No duplicate files** - single canonical location for everything

## Structure
- `DiskCleanUp.Service/` - Main app (API, Services, wwwroot)
- `DiskCleanUp.Shared/` - Constants.cs + Models.cs
- `DiskCleanUp.Tray/` - System tray WinForms app
- `mcp-server/` - MCP server for Claude Desktop

## Ports
- Service mode: 5100 (`Constants.ServicePort`)
- Console mode: 5000 (`Constants.DevPort`)

## Build
```powershell
dotnet build DiskCleanUp.sln
```

## Run
```powershell
dotnet run --project DiskCleanUp.Service -- --console
```
