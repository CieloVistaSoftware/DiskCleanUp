// Hubs/ScanHub.cs
// SignalR Hub — replaces SSE entirely.
//
// Why SignalR over SSE:
//   • Bidirectional  — client can call hub methods (cancel, request status)
//   • Typed methods  — no hand-rolled "data: {...}\n\n" formatting
//   • Auto-reconnect — built into the JS client with exponential backoff
//   • WebSocket transport — lower overhead than HTTP/1.1 chunked SSE
//   • Group routing  — we use a "scanners" group so hub can broadcast
//     to all connected dashboards simultaneously (multi-tab works free)
//
// Client JS usage (via CDN):
//   const conn = new signalR.HubConnectionBuilder()
//       .withUrl("/scanhub")
//       .withAutomaticReconnect()
//       .build();
//   conn.on("ScanEvent", (section, type, data) => { ... });
//   await conn.start();

using Microsoft.AspNetCore.SignalR;
using DiskCleanup.Services;

namespace DiskCleanup.Hubs;

public class ScanHub : Hub
{
    private readonly ScanOrchestrator _orchestrator;

    public ScanHub(ScanOrchestrator orchestrator)
        => _orchestrator = orchestrator;

    // Called by JS: conn.invoke("StartScan", "duplicates")
    public async Task StartScan(string section)
        => await _orchestrator.StartAsync(section);

    // Called by JS: conn.invoke("CancelScan", "duplicates")
    public Task CancelScan(string section)
    {
        _orchestrator.Cancel(section);
        return Task.CompletedTask;
    }

    // Called by JS: conn.invoke("GetCachedResults", "duplicates")
    // Returns already-scanned results so a page refresh doesn't lose data.
    public IEnumerable<object> GetCachedResults(string section)
        => _orchestrator.GetCache(section);

    public override async Task OnConnectedAsync()
    {
        await Groups.AddToGroupAsync(Context.ConnectionId, "scanners");
        await base.OnConnectedAsync();

        // Push cached results to this client the moment they connect.
        // Same ScanEvent format as a live scan — client renders identically.
        var sections = new[] { "duplicates","smart-dedup","stale","large",
                               "node-modules","venvs","empty","images" };
        foreach (var section in sections)
        {
            var cached = _orchestrator.GetCache(section).ToList();
            if (!cached.Any()) continue;

            foreach (var evt in cached.Cast<DiskCleanup.Models.ScanEvent>())
                await Clients.Caller.SendAsync("ScanEvent", evt.Section, evt.Type, evt.Data);

            // Tell the client this section is restored so it can update the status bar
            await Clients.Caller.SendAsync("ScanEvent", section, "restored", new { results = cached.Count });
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, "scanners");
        await base.OnDisconnectedAsync(exception);
    }
}
