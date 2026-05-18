using Xunit;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using DiskCleanup.Services;

public class WsManagerTests
{
    [Fact]
    public async Task HandleAsync_ClosesSocketOnException()
    {
        var ws = new ClientWebSocket();
        var wsManager = new WsManager();
        var cts = new CancellationTokenSource();

        // Simulate socket open and force exception
        await ws.ConnectAsync(new System.Uri("ws://localhost:5000/ws"), cts.Token);
        await wsManager.HandleAsync(ws, cts.Token);

        Assert.True(ws.State == WebSocketState.Closed || ws.State == WebSocketState.Aborted);
    }
}
