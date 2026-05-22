// tests/TaskEndpointsTests.cs
// Integration tests for TaskEndpoints (GET /api/tasks).

using System.Text.Json;
using Xunit;

public class TaskEndpointsTests
{
    [Fact]
    public async Task GetTasks_ReturnsProcessListWithCount()
    {
        await using var svc = await ApiTestFactory.CreateTasksAsync();
        var res = await svc.Client.GetAsync("/api/tasks");
        res.EnsureSuccessStatusCode();
        var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
        Assert.True(root.TryGetProperty("processes", out var procs));
        Assert.True(root.TryGetProperty("count",     out var count));
        Assert.True(procs.GetArrayLength() > 0);
        Assert.Equal(procs.GetArrayLength(), count.GetInt32());
    }

    [Fact]
    public async Task GetTasks_EachProcess_HasExpectedFields()
    {
        await using var svc = await ApiTestFactory.CreateTasksAsync();
        var res = await svc.Client.GetAsync("/api/tasks");
        res.EnsureSuccessStatusCode();
        var procs = JsonDocument.Parse(await res.Content.ReadAsStringAsync())
            .RootElement.GetProperty("processes");
        // Spot-check the first entry has all expected fields
        var first = procs.EnumerateArray().First();
        Assert.True(first.TryGetProperty("pid",    out _));
        Assert.True(first.TryGetProperty("name",   out _));
        Assert.True(first.TryGetProperty("memory", out _));
    }
}
