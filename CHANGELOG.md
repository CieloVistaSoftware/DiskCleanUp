# Changelog — DiskCleanUp

All notable changes to this project are documented here.

## [2.1.0] — 2026-05

### Added
- Docs Audit card reads `audit-orphans-*.md` files (#43, #44)
- MCP server for AI integration

### Fixed
- Error handling: added try/catch to all exported JS modules across 8 source files (#49)
- `scan-toolbar-vm`, `scan-toolbar-view`, `grid-view` — ERR-009/010
- Scan filter: extension shorthand now only matches ≤5-char words or dot-prefixed terms (#41)

## [2.0.0] — 2026-04

### Added
- Real-time scanning via SignalR
- Exact Duplicates scanner with SHA-256 file hashing
- Duplicate Images scanner
- Backup Folders scanner
- Tiny Files scanner
- HTML Files scanner
- CSS Files scanner
- Extension Finder
- Tasks panel
- Savings Log
- Windows tray application (DiskCleanUp.Tray)
- Playwright UI test suite

### Changed
- Migrated backend from .NET 6 to .NET 8
- Rewrote dashboard frontend in vanilla JS (no framework)

## [1.0.0] — 2025

### Added
- Initial release: disk scanning web dashboard
- ASP.NET Core service backend
- Empty Folders scanner
- Basic file deletion support
