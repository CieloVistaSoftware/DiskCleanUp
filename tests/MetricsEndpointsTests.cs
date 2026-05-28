// tests/MetricsEndpointsTests.cs
// Integration tests for MetricsEndpoints (GET /api/metrics, POST /api/gc).

using System.Text.Json;
using Xunit;

public class MetricsEndpointsTests
{
    [Fact]
    public async Task GetMetrics_ReturnsAllExpectedFields()
    {
        await using var svc = await ApiTestFactory.CreateMetricsAsync();
        var res = await svc.Client.GetAsync("/api/metrics");
        res.EnsureSuccessStatusCode();
        var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.True(root.TryGetProperty("process_mb",   out _));
        Assert.True(root.TryGetProperty("thread_count", out _));
        Assert.True(root.TryGetProperty("uptime_s",     out _));
        Assert.True(root.TryGetProperty("timestamp",    out _));
    }

    [Fact]
    public async Task GetMetrics_ProcessMb_IsPositive()
    {
        await using var svc = await ApiTestFactory.CreateMetricsAsync();
        var res = await svc.Client.GetAsync("/api/metrics");
        res.EnsureSuccessStatusCode();
        var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.True(root.GetProperty("process_mb").GetDouble() > 0);
    }

    [Fact]
    public async Task PostGc_ReturnsOkAndProcessMb()
    {
        await using var svc = await ApiTestFactory.CreateMetricsAsync();
        var res = await svc.Client.PostAsync("/api/gc", null);
        res.EnsureSuccessStatusCode();
        var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.True(root.GetProperty("ok").GetBoolean());
        Assert.True(root.TryGetProperty("process_mb", out _));
    }
}
