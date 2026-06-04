
# Server-Side Pipeline

## ⑤ WsManager.HandleAsync

The WebSocket entry point. Maintains a `ConcurrentDictionary<id, WebSocket>` of all connected browser tabs. The read loop deserializes incoming JSON into `WsClientMessage` objects and raises `OnClientMessage`.

```csharp
public async Task HandleAsync(WebSocket ws, CancellationToken ct)
{
    var id = Guid.NewGuid().ToString();
    _sockets[id] = ws;
    try {
        while (ws.State == WebSocketState.Open) {
            var msg = await ReceiveJsonAsync<WsClientMessage>(ws, ct);
            OnClientMessage?.Invoke(msg);
        }
    } finally {
        _sockets.TryRemove(id, out _);
    }
}
```

## ⑥ Program.cs OnClientMessage Handler

Routes messages by type:

- `type: "start"` → `ScanOrchestrator.StartAsync(section)`
- `type: "cancel"` → `ScanOrchestrator.Cancel(section)`
- `type: "config"` → reload config, broadcast to all tabs

## ⑦ ScanOrchestrator.StartAsync()

The scan engine. For each section:

1. Clears the JSONL cache file for that section
2. Creates a `Channel<ScanEvent>` (async producer/consumer queue)
3. Spawns `Parallel.ForEachAsync` workers that enumerate files and write events to the channel
4. Runs a drain loop that reads from the channel and calls both `BroadcastAsync` (→ browser) and `AppendAllTextAsync` (→ JSONL disk cache)

The drain loop is the single point where all scan results flow — it serializes disk writes and WebSocket broadcasts to prevent contention.

## ⑧ WsManager.BroadcastAsync

Serializes `{ section, type, data }` to JSON and calls `ws.SendAsync` on every open socket in the `ConcurrentDictionary`. Failed sends remove the socket from the dictionary.

## ⑬ Scan Workers (Parallel.ForEachAsync)

The actual file system scanning. Concurrency-limited (CPU × 4 threads). Process priority set to `BelowNormal` to avoid starving the UI.

**Scanners:** duplicates, smart-dedup, stale, large, node-modules, venvs, empty, images, backups, tiny-files, html-files, css-files.

Each worker calls `EnumerateSafe(root)` to walk directories, applies section-specific filters, and writes `ScanEvent` objects to the channel. MD5 hashing (for duplicates) uses semaphore-limited concurrency.

## ⑭ scan-cache/ (JSONL)

Every scan result is appended to a section-specific JSONL file (`scan-cache/stale.json`, etc.). These survive server restarts. On page load, `GET /api/cache/{section}` reads and collapses the JSONL into a single response.

**Collapse** means: if the same file path appears multiple times (e.g., from a delta scan update), only the latest entry is returned.

## ⑮ REST Endpoints

Data-only endpoints that read from disk and config:

- `GET /api/cache/{section}` — cached scan results (for page restore)
- `POST /api/trash` — move files to recycle bin
- `POST /api/delete-permanent` — permanent deletion
- `GET /api/config` — current scan configuration
- `GET /api/savings` — cumulative space freed
- `GET /api/session` — current session metadata

## ⑯ MetricsService (IHostedService)

Background service that samples `Process.TotalProcessorTime` and `WorkingSet64` every 5 seconds. Broadcasts metrics via WebSocket to all connected tabs. These bypass the RAF queue on the browser side and update CPU/MEM mini-graphs directly.

---
dewey: 300.9
title: Server-Side Pipeline
description: The WebSocket entry point. Maintains a ConcurrentDictionary<id, WebSocket> of all connected browser tabs. The read loop deserializes incoming JSON …
project: DiskCleanUp
category: 300.9 — Meta
relativePath: bin/Fresh/wwwroot/arch/server-pipeline.md
created: 2026-03-04
updated: 2026-04-27
version: 1.0.0
author: CieloVista Software
status: active
tags: [all, arch, browser, concurrentdictionaryid, connected, diskcleanup, entry, maintains, meta, pipeline, point, server, serverside, side, tabs, websocket]
---