# Changelog — DiskCleanUp

All notable changes to this project are documented here.

## [2.2.0] — 2026-05-18

### Changed (Issue #18 — Worker Service + IScanRule Pipeline)
- Removed Windows Service hosting (`UseWindowsService`, `--install`, `--uninstall`)
- Replaced monolithic `ScanOrchestrator` switch statement with `ScanPipeline` + `IScanRule` plugin dispatch
- Added 13 `IScanRule` implementations in `DiskCleanUp.Service/Scanning/Rules/`
- Upgraded hashing: MD5 → xxHash64 (first-pass grouping) + SHA-256 (confirmation only)
- `ScanContext` now carries `HashAsync`/`ConfirmHashAsync` delegates and optional `Extensions` filter
- `FileEnumerator` extracted to shared BFS enumeration helper for all rules
- All rules registered in DI via `services.AddSingleton<IScanRule, TRule>()`
- Updated arch docs: SERVICE-ARCHITECTURE.md, service-engine.md, server-pipeline.md

## [2.1.0] — 2026-03-19

### Added
- Initial release

### Changed
- N/A

### Fixed
- N/A

---
docid: 300.6
id: changelog-diskcleanup
title: Changelog — DiskCleanUp
project: DiskCleanUp
description: All notable changes to this project are documented here.
status: active
tags: [20260319, all, changelog, changes, deployment, diskcleanup, doc, documented, here, notable, project, release]
category: 300.6 — Release & Deployment
created: 2026-03-19
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: CHANGELOG.md
---