// WsManager.cs
// Pure WebSocket broadcast manager — replaces SignalR entirely.
// One /ws endpoint. All connected browsers receive every scan event.

using System.Collections.Concurrent;
using System.Net.WebSockets;
using System.Text;
using System.Text.Json;

namespace DiskCleanup.Services;

public class WsManager
{
    private readonly ConcurrentDictionary<string, WebSocket> _sockets = new();
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);
    private readonly ILogger<WsManager> _logger;

    public WsManager(ILogger<WsManager> logger)
    {
        _logger = logger;
    }

    // Raised when the client sends { type: 'start'|'cancel', section: '...', extensions?: [...] }
    public event Func<string, string, string[]?, Task>? OnClientMessage;

    public async Task HandleAsync(WebSocket ws, CancellationToken ct)
    {
        var id = Guid.NewGuid().ToString("N");
        _sockets[id] = ws;
        var buf = new byte[4096];
        try
        {
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                var result = await ws.ReceiveAsync(buf, ct);
                if (result.MessageType == WebSocketMessageType.Close) break;

                if (result.MessageType == WebSocketMessageType.Text && result.EndOfMessage)
                {
                    try
                    {
                        var msg = JsonSerializer.Deserialize<WsClientMessage>(
                            buf.AsSpan(0, result.Count), _json);
                        if (msg is not null && OnClientMessage is not null)
                            await OnClientMessage(msg.Type, msg.Section, msg.Extensions);
                    }
                    catch { /* malformed message — ignore */ }
                }
            }
        }
        catch (Exception ex) when (ex is not OperationCanceledException)
        {
            // Log unexpected receive-loop errors so they appear in the rolling service log.
            // OperationCanceledException is normal on service shutdown — skip it.
            _logger.LogWarning("WsManager: WebSocket {Id} receive loop ended unexpectedly: {Message}", id, ex.Message);
        }
        finally
        {
            _sockets.TryRemove(id, out _);
            if (ws.State == WebSocketState.Open)
                await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None);
        }
    }

    public record WsClientMessage(string Type, string Section, string[]? Extensions = null);

    public async Task BroadcastAsync(string section, string type, object? data)
    {
        var msg  = JsonSerializer.Serialize(new { section, type, data }, _json);
        var bytes = Encoding.UTF8.GetBytes(msg);
        var seg   = new ArraySegment<byte>(bytes);

        foreach (var (id, ws) in _sockets)
        {
            if (ws.State != WebSocketState.Open)
            {
                _sockets.TryRemove(id, out _);
                continue;
            }
            try { await ws.SendAsync(seg, WebSocketMessageType.Text, true, CancellationToken.None); }
            catch { _sockets.TryRemove(id, out _); }
        }
    }
}
