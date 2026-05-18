using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Extensions.Logging.Abstractions;
using Xunit;
using DiskCleanup.Services;

/// <summary>
/// Unit tests for WsManager. Uses a FakeWebSocket stub — no live server required.
/// </summary>
public class WsManagerTests
{
    // ── helpers ─────────────────────────────────────────────────────────────

    static WsManager CreateManager() =>
        new WsManager(NullLogger<WsManager>.Instance);

    // A minimal WebSocket stub that immediately returns a Close frame,
    // then transitions to Closed state.
    sealed class FakeCloseWebSocket : WebSocket
    {
        private WebSocketState _state = WebSocketState.Open;
        private bool _closeSent;

        public override WebSocketState State => _state;
        public override WebSocketCloseStatus? CloseStatus => WebSocketCloseStatus.NormalClosure;
        public override string? CloseStatusDescription => "test close";
        public override string? SubProtocol => null;

        public override ValueTask<ValueWebSocketReceiveResult> ReceiveAsync(
            Memory<byte> buffer, CancellationToken ct)
        {
            _state = WebSocketState.CloseReceived;
            return ValueTask.FromResult(
                new ValueWebSocketReceiveResult(0, WebSocketMessageType.Close, true));
        }

        // Legacy overload required by abstract base
        public override Task<WebSocketReceiveResult> ReceiveAsync(
            ArraySegment<byte> buffer, CancellationToken ct)
        {
            _state = WebSocketState.CloseReceived;
            return Task.FromResult(
                new WebSocketReceiveResult(0, WebSocketMessageType.Close, true));
        }

        public override Task SendAsync(
            ArraySegment<byte> buffer, WebSocketMessageType type, bool end, CancellationToken ct)
            => Task.CompletedTask;

        public override Task CloseAsync(
            WebSocketCloseStatus status, string? description, CancellationToken ct)
        {
            _state = WebSocketState.Closed;
            _closeSent = true;
            return Task.CompletedTask;
        }

        public override Task CloseOutputAsync(
            WebSocketCloseStatus status, string? description, CancellationToken ct)
        {
            _state = WebSocketState.CloseSent;
            return Task.CompletedTask;
        }

        public override void Abort() => _state = WebSocketState.Aborted;
        public override void Dispose() { }

        public bool WasClosed => _closeSent || _state == WebSocketState.Closed;
    }

    // A stub whose ReceiveAsync blocks until the CancellationToken fires.
    sealed class FakeBlockingWebSocket : WebSocket
    {
        private WebSocketState _state = WebSocketState.Open;

        public override WebSocketState State => _state;
        public override WebSocketCloseStatus? CloseStatus => null;
        public override string? CloseStatusDescription => null;
        public override string? SubProtocol => null;

        public override async Task<WebSocketReceiveResult> ReceiveAsync(
            ArraySegment<byte> buffer, CancellationToken ct)
        {
            await Task.Delay(Timeout.Infinite, ct);          // blocks until cancelled
            return new WebSocketReceiveResult(0, WebSocketMessageType.Text, true);
        }

        public override Task SendAsync(
            ArraySegment<byte> buffer, WebSocketMessageType type, bool end, CancellationToken ct)
            => Task.CompletedTask;

        public override Task CloseAsync(
            WebSocketCloseStatus status, string? description, CancellationToken ct)
        {
            _state = WebSocketState.Closed;
            return Task.CompletedTask;
        }

        public override Task CloseOutputAsync(
            WebSocketCloseStatus status, string? description, CancellationToken ct)
        {
            _state = WebSocketState.CloseSent;
            return Task.CompletedTask;
        }

        public override void Abort() => _state = WebSocketState.Aborted;
        public override void Dispose() { }
    }

    // ── tests ────────────────────────────────────────────────────────────────

    [Fact]
    public async Task HandleAsync_ExitsCleanly_WhenSocketSendsCloseFrame()
    {
        var manager = CreateManager();
        var ws = new FakeCloseWebSocket();

        // Should return without throwing — Close frame terminates the loop
        await manager.HandleAsync(ws, CancellationToken.None);

        // HandleAsync calls CloseAsync when the socket was still Open before close frame
        // Either Closed or CloseReceived is acceptable
        Assert.True(ws.State is WebSocketState.Closed or WebSocketState.CloseReceived);
    }

    [Fact]
    public async Task HandleAsync_PropagatesOperationCanceled_WhenCancellationRequested()
    {
        // HandleAsync does NOT swallow OperationCanceledException — it propagates it
        // so the ASP.NET Core middleware can log/handle shutdown correctly.
        var manager = CreateManager();
        var ws = new FakeBlockingWebSocket();
        var cts = new CancellationTokenSource();

        var task = manager.HandleAsync(ws, cts.Token);
        cts.Cancel();

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => task);
    }

    [Fact]
    public async Task BroadcastAsync_DoesNotThrow_WhenNoSockets()
    {
        var manager = CreateManager();

        // Broadcasting to an empty registry should be a no-op
        await manager.BroadcastAsync("duplicates", "done", null);
    }
}
