---
docid: 300.9.diskcleanup-service-wwwroot-settings-help
id: disk-cleanup-dashboard-settings-guide
title: Disk Cleanup Dashboard — Settings Guide
project: DiskCleanUp
description: The main directory to scan. All scanners start here and recurse into subdirectories up to 20 levels deep. Example: C:\Users\jwpmi\Downloads
status: active
tags: [settings, help, disk]
category: 300.9 — Meta
created: 2026-02-28
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: DiskCleanUp.Service/wwwroot/settings-help.md
---
# Disk Cleanup Dashboard — Settings Guide

## Primary Root Folder

The main directory to scan. All scanners start here and recurse into subdirectories up to 20 levels deep.

**Example:** `C:\Users\jwpmi\Downloads`

---

## Extra Root Folders

Additional directories to scan alongside the primary root. Enter one path per line. Useful for scanning multiple drives or project folders in a single pass.

**Example:**
```text
D:\Projects
E:\Archive
C:\Users\jwpmi\Documents
```

---

## Stale Threshold (days)

Files not modified in more than this many days are flagged as **stale** by the Stale Files scanner.

- **Default:** 365 days
- **Tip:** Lower this to 90–180 for aggressive cleanup of Downloads folders.

---

## Large File Threshold (MB)

Files larger than this size are flagged by the **Large Files** scanner.

- **Default:** 100 MB
- **Tip:** Set to 50 MB for tighter control, or 500 MB for media-heavy folders.

---

## Max Parallelism

Controls how many files are processed concurrently during scans. Higher values = faster scans but more CPU/disk usage.

- **Default:** 4
- **Range:** 1–16
- **Tip:** Set to 2 on HDDs (seek-bound), 8–12 on NVMe SSDs. Keep below your CPU core count.

---

## Scheduled Daily Scan

Automatically runs selected scanners at a set time each day.

### Run Time
24-hour format (e.g. `02:00` for 2 AM). Leave empty to disable.

### Sections
Comma-separated list of scanners to run. Valid names:

| Scanner | Section Name |
|---------|-------------|
| Exact Duplicates | `duplicates` |
| Smart Dedup | `smart-dedup` |
| Stale Files | `stale` |
| Large Files | `large` |
| node_modules | `node-modules` |
| Python Venvs | `venvs` |
| Empty Folders | `empty` |
| Dup Images | `images` |
| Backup Folders | `backups` |
| Tiny Files | `tiny-files` |
| HTML Files | `html-files` |

**Example:** `duplicates,stale,large,empty,backups`

---

## Diagnostics

### Enable Trace Logging
When enabled, writes detailed timing and event traces to a log file. View the trace log via the **📜 View Trace Log** button or the Trace link in the header.

- Traces include: scan timing, WebSocket events, file operations, heartbeats, and thread freezes.
- Disabling clears the trace on next page load.

---

## Scanner Reference

| Tab | What It Finds | Delete Method |
|-----|--------------|---------------|
| 🔁 Duplicates | Files with identical MD5 hashes | Recycle Bin |
| 🧠 Smart Dedup | Numbered copies like `file (1).txt` | Recycle Bin |
| 🕰 Stale Files | Files older than threshold | Recycle Bin |
| 📦 Large Files | Files above size threshold | Recycle Bin |
| ⬡ node_modules | Node.js dependency folders | Permanent |
| 🐍 Venvs | Python virtual environments | Recycle Bin |
| 📂 Empty Folders | Directories with nothing in them | Permanent |
| 🖼 Dup Images | Identical images by hash | Recycle Bin |
| 📦 Backups | Folders named backup, bak, old, etc. | Recycle Bin |
| 🔬 Tiny Files | Files ≤1 KB | Recycle Bin |
| 🌐 HTML Files | .html, .htm, .xhtml, .mhtml files | Recycle Bin |

---

## Keep List

Mark any file or folder with 🔒 **Keep** to exclude it from all future scans. Kept items are stored in `config/keep-list.txt` and loaded once per scan for O(1) lookups.

---

## Keyboard Tips

- **Ctrl+Click** checkboxes to select ranges
- **Filter** text box narrows results in real-time
- Click any path to open in VS Code Insiders
