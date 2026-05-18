---
docid: 300.9.diskcleanup
id: diskcleanup-user-guide
title: DiskCleanUp User Guide
project: DiskCleanUp
description: Welcome to DiskCleanUp! This guide will help you get the most out of your disk cleanup dashboard, covering all features, usage instructions, troubl…
status: active
tags: [diskcleanup, user, guide]
category: 300.9 — Meta
created: 2026-03-02
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: diskcleanup.md
---
# DiskCleanUp User Guide

Welcome to DiskCleanUp! This guide will help you get the most out of your disk cleanup dashboard, covering all features, usage instructions, troubleshooting, and expert tips.

---

## Table of Contents
1. [Overview](#overview)
2. [Getting Started](#getting-started)
3. [Dashboard Features](#dashboard-features)
4. [Tabs & Tools](#tabs--tools)
5. [Sessions & Savings Log](#sessions--savings-log)
6. [Scan Cache & Performance](#scan-cache--performance)
7. [Help & Context Menus](#help--context-menus)
8. [Troubleshooting](#troubleshooting)
9. [Advanced Tips](#advanced-tips)
10. [FAQ](#faq)

---

## Overview
DiskCleanUp is a modern, browser-based dashboard for reclaiming disk space. It scans for duplicates, stale files, large files, empty folders, and more, with real-time updates and a user-friendly interface.

- **Backend:** ASP.NET Core 8 Windows Service + Minimal API
- **Frontend:** Vanilla HTML/JS (no frameworks), ES modules
- **Live updates:** SignalR WebSocket event streaming
- **No permanent delete:** All deletes go to Windows Recycle Bin
- **Data:** `C:\ProgramData\DiskCleanUp\`

---

## Getting Started
1. **Install .NET 8 SDK** (required) and Node.js (for MCP server).
2. **Install as Windows Service:**
   - Open an admin terminal in the project root.
   - Run `dotnet build DiskCleanUp.sln` then `dotnet run --project DiskCleanUp.Service -- --install`
   - Dashboard opens at `http://localhost:5100`
3. **Run in console mode (development):**
   - Run `dotnet run --project DiskCleanUp.Service -- --console`
   - Dashboard opens at `http://localhost:5000`
4. **Access the dashboard:** All features available from the main page.

---

## Dashboard Features
- **Tabbed interface:** Duplicates, Smart Dedup, Stale, Large, Tiny Files, HTML Files, CSS Files, Backups, node_modules, Venvs, Empty, Images, Savings Log, Settings.
- **Live activity console:** See scan progress and logs in real time.
- **Progress bar:** Visual feedback for scan progress.
- **Session system:** Track savings across sessions.
- **Scan cache:** Instant load of previous results.

---

## Tabs & Tools
### Duplicates
- Scan for exact duplicate files.
- Multi-select, filter, trash/delete options.

### Smart Dedup
- Detects numbered copies (e.g., file (1).txt).
- One-click trash for all but newest.

### Stale Files
- Finds files not modified in X days.
- Trash or delete in bulk.

### Large Files
- Lists files over a size threshold.
- Bulk actions supported.

### node_modules
- Finds and deletes large node_modules folders.

### Venvs
- (Planned) Consolidate Python virtual environments.

### Empty Folders
- Quickly remove empty directories.

### Images
- Detects duplicate images by content.

### Savings Log
- Tracks all space reclaimed, with session breakdowns.

### Settings
- Configure scan roots, thresholds, and parallelism.

---

## Sessions & Savings Log
- **Sessions:** Start a new session to track savings for a project or time period.
- **Savings Log:** Every trash/delete action is logged with size, date, and session.
- **Export:** Download your savings log as JSON.

---

## Scan Cache & Performance
- **Scan cache:** Results are saved to disk and loaded instantly on restart.
- **No rescans** unless you hit the refresh button.
- **Performance:** All file I/O uses safe sharing to avoid OS conflicts.

---

## Help & Context Menus
- **Right-click anywhere:** Get context-sensitive help for rows, buttons, and features.
- **❓ button:** Opens the full help panel.

---

## Troubleshooting
- **Backend won’t start:** Check for missing .NET SDK or build errors.
- **404 errors:** Ensure the backend is running and serving static files.
- **Scan stalls:** Try refreshing the page or restarting the backend.
- **File not deleted:** Check permissions or if the file is in use.

---

## Advanced Tips
- **Multi-select:** Use Shift+Click and Ctrl+Click for bulk actions.
- **Filter:** Use the filter box to narrow down results instantly.
- **Export logs:** Use the Savings Log tab to export your cleanup history.
- **Session management:** Start a new session before a big cleanup for better tracking.

---

## FAQ
**Q: Does DiskCleanUp permanently delete files?**
A: No, all deletes go to Trash or Recycle Bin for safety.

**Q: Can I undo a delete?**
A: Yes, recover files from your system’s Trash/Recycle Bin.

**Q: How do I add more scan roots?**
A: Use the Settings tab to add extra root folders.

**Q: Is my data safe?**
A: Yes, all actions are logged and no files are deleted without confirmation.

---

For more help, use the in-app help system or contact the project maintainer.
