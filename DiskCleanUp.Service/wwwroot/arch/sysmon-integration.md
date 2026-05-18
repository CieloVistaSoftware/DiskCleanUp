---
docid: 300.2.diskcleanup-service-wwwroot-arch-sysmon-integration
id: sysmon-integration-kernel-level-file-monitoring
title: Sysmon Integration — Kernel-Level File Monitoring
project: DiskCleanUp
description: Mark Russinovich's Sysmon hooks into the Windows kernel via ETW (Event Tracing for Windows). It captures file events at the driver level — zero mis…
status: active
tags: [sysmon, integration, kernellevel]
category: 300.2 — Architecture
created: 2026-02-28
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
relativepath: DiskCleanUp.Service/wwwroot/arch/sysmon-integration.md
---
# Sysmon Integration — Kernel-Level File Monitoring

Mark Russinovich's **Sysmon** hooks into the Windows kernel via ETW (Event Tracing for Windows). It captures file events at the driver level — zero missed events, near-zero CPU overhead, survives process restarts because events persist in the Windows Event Log.

DiskCleanUp **decorates** this raw power with a beautiful web dashboard. Sysmon is the engine. We're the windshield.

## Relevant Sysmon Events

| Event ID | Name | DiskCleanUp Use |
|----------|------|-----------------|
| **11** | FileCreate | Detect new files → trigger delta scan of parent dir |
| **23** | FileDelete (archived) | Detect external deletions → update cache |
| **26** | FileDeleteDetected | Detect deletions without archiving |
| **2** | FileCreateTime changed | Detect suspicious timestamp manipulation |
| **15** | FileCreateStreamHash | Detect ADS (alternate data streams) — hidden bloat |

## Auto-Generated Config

The service generates `sysmon-config.xml` from your configured scan roots. Only file events in those roots are captured — everything else is excluded to keep overhead minimal.

```xml
<Sysmon schemaversion="4.90">
  <EventFiltering>
    <RuleGroup name="DiskCleanUp" groupRelation="or">
      <FileCreate onmatch="include">
        <TargetFilename condition="begin with">C:\Users\jwpmi\source\repos</TargetFilename>
      </FileCreate>
    </RuleGroup>
    <!-- All non-file events excluded -->
    <ProcessCreate onmatch="exclude"/>
    <NetworkConnect onmatch="exclude"/>
    <RegistryEvent onmatch="exclude"/>
  </EventFiltering>
</Sysmon>
```

When scan roots change in config, the service regenerates the XML and hot-reloads Sysmon (`Sysmon64.exe -c config.xml`) — no restart needed.

## Event Subscription

```csharp
var query = new EventLogQuery(
    "Microsoft-Windows-Sysmon/Operational",
    PathType.LogName,
    "*[System[(EventID=11 or EventID=23 or EventID=26)]]");

using var watcher = new EventLogWatcher(query);
watcher.EventRecordWritten += (_, e) => OnSysmonEvent(e.EventRecord);
watcher.Enabled = true;
```

## Debouncing

A build dropping 50 files in 2 seconds doesn't trigger 50 scans. The service batches events by directory with a 5-second debounce window. After the window closes, one delta scan runs for that directory.

## Graceful Degradation

Sysmon is a separate install. The service detects it at startup and picks the best available strategy:

| Capability | With Sysmon | Without Sysmon |
|------------|-------------|----------------|
| Real-time events | Kernel ETW — guaranteed | FileSystemWatcher — may miss |
| Delete detection | Event ID 23/26 — reliable | FSW — unreliable for deletes |
| CPU overhead | ~0.1% (kernel driver) | ~1-2% (user-mode polling) |
| Survives restart | Events in Event Log | Events lost |
| ADS detection | Event ID 15 | Not possible |

```csharp
IFileEventSource watcher = SysmonAvailable()
    ? new SysmonWatcher(cfg)       // kernel-level
    : new FswWatcher(cfg);         // best-effort fallback
```

## Dashboard Integration

The dashboard shows a **Sysmon Status Panel** in Settings: install status, version, events per hour, monitored roots. If not installed, a one-click button runs `Sysmon64.exe -accepteula -i sysmon-config.xml`.

A live **Activity Feed** shows file events as they happen — color-coded by type (create = green, delete = red, modify = amber). Filterable by section, extension, directory.
