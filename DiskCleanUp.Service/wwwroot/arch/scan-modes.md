---
docid: 300.2.diskcleanup-service-wwwroot-arch-scan-modes
id: scan-modes
title: Scan Modes
project: DiskCleanUp
description: The always-running service supports six scan modes. Four are active today (in priority order), two are planned for Phase 4.
status: active
tags: [scan, modes, priority]
category: 300.2 — Architecture
created: 2026-02-28
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: DiskCleanUp.Service/wwwroot/arch/scan-modes.md
---
# Scan Modes

The always-running service supports six scan modes. Four are active today (in priority order), two are planned for Phase 4.

## Priority Order

| Priority | Mode | Trigger | Scope |
|----------|------|---------|-------|
| **P1** | User On-Demand | Dashboard scan button | Single section |
| **P2** | Startup Staggered | Service boot | All 12 sections |
| **P3** | Scheduled Daily | Configured time (e.g. `"02:00"`) | Configured sections |
| **P4** | Interval Recurring | Every N hours (default 6) | All sections |
| *Planned* | Sysmon Delta | Real-time kernel file events | Single directory |
| *Planned* | Targeted Area Scan | User picks a folder | One subtree |

## 1. User On-Demand — P1: USER IS WAITING

Highest priority. User clicks a scan button in the dashboard, triggering `ScanOrchestrator.StartAsync(section)` for that single section. Runs immediately. The orchestrator's `TryAdd` guard prevents double-runs — if a background scan already has that section running, the new request is silently skipped (the user sees the in-progress scan).

## 2. Startup Staggered — P2: CACHE WARMUP

On service boot (after a 15-second settle delay), `BackgroundScanService` queues all 12 sections with a 30-second gap between each. Sections are ordered light → heavy so quick results appear first:

```text
empty → large → stale → tiny-files → html-files → css-files
  → backups → node-modules → venvs → smart-dedup
    → images → duplicates
```

Total startup cycle: ~6 minutes to kick off all sections. By the time someone opens the dashboard, most sections already have fresh cached data.

If the user manually starts a section before its turn in the stagger queue, the orchestrator skips the duplicate — no conflict.

## 3. Scheduled Daily — P3: DAILY BASELINE

Optional. If `scheduled_scan_time` is configured in `config.json` (e.g. `"02:00"`), runs the configured `scheduled_sections` at that time daily. Uses the same staggered approach as startup.

If both a scheduled time and an interval are configured, whichever comes first wins.

## 4. Interval Recurring — P4: BACKGROUND REFRESH

After startup scans complete, the service enters a recurring loop. Every `scan_interval_hours` (default: 6.0, configurable in `config.json`), it runs all sections again with the same stagger pattern.

This keeps the cache fresh even if no one opens the dashboard for days.

## Config Properties

```json
{
  "scheduled_scan_time": "02:00",
  "scan_interval_hours": 6.0,
  "scheduled_sections": ["duplicates", "backups", "large", "stale", "empty"]
}
```

- `scheduled_scan_time` — empty string disables daily schedule
- `scan_interval_hours` — set to 0 to disable interval scanning (use daily schedule only)
- `scheduled_sections` — empty array means all 12 sections

## Conflict Resolution

The `ScanOrchestrator` uses a `ConcurrentDictionary<string, CancellationTokenSource>` keyed by section name. `TryAdd` returns false if a section is already running from any source. This means:

- User clicks "Scan Duplicates" while a startup scan is running duplicates → skipped (user sees the in-progress scan)
- Interval scan tries to start "stale" while user already kicked it off → skipped
- No double-runs, no race conditions, no wasted CPU

## Planned: Sysmon Delta (Phase 4)

Automatic, real-time. Sysmon fires a kernel event when files change. The service debounces by directory (5-second window), then scans just the affected directory. Cache stays current throughout the day without any scheduled scans.

## Planned: Targeted Area Scan (Phase 4)

User-initiated. Right-click any folder in the dashboard → "Scan This Folder." The service scans only that subtree across all applicable sections. Results in seconds instead of minutes.
