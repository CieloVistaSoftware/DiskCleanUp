# Sysinternals Integration Proposal

**Project:** DiskCleanUp  
**Date:** 2026-05-21  
**Status:** Proposal — not yet approved

---

## Overview

Sysinternals tools are free, signed Microsoft utilities that expose kernel-level information unavailable through standard .NET APIs. Several of them map directly onto pain points in DiskCleanUp's current scan-and-delete workflow. This document lists the candidates, rates each one, and proposes a phased adoption plan.

---

## Candidates

### 1. `handle.exe` — File Lock Detection ⭐ High Priority

**What it does:** Lists which processes hold an open handle to a specific file or path.

**Why DiskCleanUp needs it:**  
The most common reason a delete or move fails silently is that another process has the file locked. Today the service returns a generic "access denied" with no guidance. With `handle.exe`, the error message can say *"Locked by: chrome.exe (PID 4812)"*.

**Integration point:**  
`DELETE /api/cache/{section}` and the file-remove path in `CacheEndpoints`. When a `File.Delete` throws `UnauthorizedAccessException` or `IOException`, run:
```text
handle.exe -p <path> -nobanner
```
Parse the output and include the locking process name + PID in the JSON error response.

**Effort:** Low — shell-out, parse 2–3 lines of output.  
**Risk:** Requires `handle.exe` to be present on the host. Can degrade gracefully when absent (return the original error without the lock detail).

---

### 2. `sysmon` — Kernel-Level File Event Monitoring ⭐ High Priority

**What it does:** Logs file create, delete, and rename events at the kernel level via ETW (Event IDs 11, 23, 26).

**Why DiskCleanUp needs it:**  
Currently each scan is a full directory walk. Sysmon would let the service maintain a *delta* — only files touched since the last scan need re-evaluation. This directly maps to the planned "Sysmon Delta" scan mode described in `scan-modes.md`.

**Integration point:**  
Already has a placeholder: `Constants.SysmonConfig`. The architecture is documented in `sysmon-integration.md`. The implementation work is Phase 4.

**Effort:** Medium — ETW subscription via `EventLogWatcher`, XML config generation, graceful fallback to `FileSystemWatcher`.  
**Risk:** Requires admin rights to install Sysmon. Must be opt-in.

---

### 3. `du.exe` — Fast Recursive Disk Usage ⭐ Medium Priority

**What it does:** Recursively reports directory sizes much faster than `DirectoryInfo` enumeration, using the same kernel enumeration path as Explorer.

**Why DiskCleanUp needs it:**  
The large-file scanner currently calls `new FileInfo(path).Length` for every file. For roots with millions of small files the overhead is significant. `du.exe` returns a full subtree summary in one pass.

**Sample output (parseable):**
```text
  Disk usage: 4,823 KB
  Files: 1,204
  Directories: 87
```

**Integration point:**  
Pre-scan step in `ScanOrchestrator` — call `du.exe <root>` to get total size before deciding whether to run the expensive walk. Also useful for the metrics endpoint to report per-root disk consumption without a full scan.

**Effort:** Low — shell-out, simple number extraction.  
**Risk:** Minor — `du.exe` output format is stable but version-dependent. Pin to a known version or parse defensively.

---

### 4. `pslist.exe` / `pskill.exe` — Process Management

**What it does:** Lists running processes with memory and CPU stats; kills by name or PID.

**Why DiskCleanUp needs it:**  
The existing `GET /api/tasks` endpoint uses `Process.GetProcesses()` which gives limited information on non-admin sessions. `pslist.exe` can report session IDs, parent PIDs, and working-set size for processes the current user cannot inspect.

`pskill.exe` would be a natural companion to a "kill the locking process" action in the UI — though this is a sharp edge that should require explicit user confirmation.

**Effort:** Low for list, Medium for kill (UI confirmation flow needed).  
**Risk:** Killing processes on behalf of the user is dangerous. Scope strictly to user-owned processes. Consider opt-in admin elevation path.

---

### 5. `accesschk.exe` — Permission Auditing

**What it does:** Reports effective permissions on files, directories, registry keys, and services for a given user or group.

**Why DiskCleanUp needs it:**  
When the stale-file scanner finds files the service cannot delete, it currently skips them silently. `accesschk.exe` would let the service report *why* — "owned by SYSTEM, your account has read-only access" — and optionally surface a "request elevation" prompt.

**Effort:** Medium — shell-out + output parsing is more complex than `handle.exe`.  
**Risk:** Low risk since it is read-only. Output format varies slightly between versions.

---

## Items Not Recommended

| Tool | Reason to skip |
|---|---|
| `procexp.exe` | GUI only — no scriptable output |
| `procmon.exe` | GUI only — ETW capture is better done via Sysmon for server scenarios |
| `autoruns.exe` | GUI only; startup auditing is out of scope for DiskCleanUp |
| `psexec.exe` | Remote execution — no use case here, and a security surface we don't want |

---

## Deployment Model

Sysinternals tools are not redistributable as part of an installer without agreeing to Microsoft's terms. Three options:

| Option | Tradeoff |
|---|---|
| **User installs manually** | Zero friction on our side; user must download from microsoft.com/sysinternals |
| **Auto-download on first use** | Convenient, but requires outbound HTTP and EULA acceptance flow |
| **Bundle with silent EULA acceptance** | Not permitted by Microsoft's license |

**Recommendation:** auto-download on first use with an explicit EULA prompt in the dashboard. Cache the binaries under `%APPDATA%\DiskCleanUp\sysinternals\`. Wrap every shell-out in a `ISysinternalsToolProvider` interface so the real download path and a stub are swappable for tests.

---

## Phased Plan

| Phase | Item | Depends on |
|---|---|---|
| **A** (next sprint) | `handle.exe` lock detection on delete errors | Nothing — pure enhancement |
| **B** | `du.exe` pre-scan sizing | Phase A infra (tool provider interface) |
| **C** | `pslist.exe` enriched task list | Phase A infra |
| **D** | Sysmon delta scanning | Separate admin-opt-in install flow |
| **E** | `accesschk.exe` permission detail | Phase A infra |

---

## Open Questions

1. Should auto-download require the user to click "I accept the Sysinternals EULA" in the dashboard before the first use, or is a one-time prompt on the install page enough?
2. Is Phase D (Sysmon) worth the admin requirement, or should it remain a documented manual option?
3. `pskill.exe` — include in Phase C or keep out of scope entirely?
