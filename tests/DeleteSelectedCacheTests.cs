// DeleteSelectedCacheTests.cs
// Reproduces: status bar shows "Done — 21 empty folders" after delete-all + rescan.
//
// Root cause: trashSelected (Delete Selected via /api/trash) removes dirs from
// the Recycle Bin but does NOT call /api/cache/{section}/remove.
// The cache retains stale entries → the frontend status bar shows the old count
// while the grid correctly shows 0 rows.
//
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using DiskCleanup.Api;
using DiskCleanup.Services;
using DiskCleanup.Scanning.Rules;

public class DeleteSelectedCacheTests : IAsyncDisposable
{
    private readonly string         _root;
    private readonly string         _dataDir;
    private readonly WebApplication _app;
    private readonly HttpClient     _client;

    public DeleteSelectedCacheTests()
    {
        _root    = Path.Combine(Path.GetPathRoot(Environment.CurrentDirectory) ?? @"C:\",
                                "dcu-cache-tests", Guid.NewGuid().ToString("N")[..8]);
        _dataDir = Path.Combine(_root, "_data");
        Directory.CreateDirectory(_root);
        Directory.CreateDirectory(_dataDir);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddSingleton(new ConfigService(_dataDir));
        _app = builder.Build();
        _app.MapTrashEndpoints();
        _app.MapCacheEndpoints(_dataDir);
        _app.StartAsync().GetAwaiter().GetResult();
        _client = _app.GetTestClient();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private string MakeEmptyDir(string name)
    {
        var d = Path.Combine(_root, "dirs", name);
        Directory.CreateDirectory(d);
        return d;
    }

    private async Task<int> RunEmptyScan()
    {
        using var h  = new ScanTestHarness();
        // Point the scan at our test dirs subdirectory
        var scanRoot = Path.Combine(_root, "dirs");
        if (!Directory.Exists(scanRoot)) Directory.CreateDirectory(scanRoot);
        var events = await h.RunAsync(new EmptyRule(),
            ScanTestHarness.DefaultConfig(scanRoot));
        return ScanTestHarness.ResultCount(events);
    }

    // ── BUG REPRODUCTION ─────────────────────────────────────────────────────

    [Fact]
    public async Task BUG_TrashViaApiTrash_DirsActuallyRemoved()
    {
        // Verify /api/trash removes directories from disk
        // (basic precondition — if trash doesn't work, the rescan bug is moot)
        var dirs = new[] { MakeEmptyDir("bug-a"), MakeEmptyDir("bug-b"), MakeEmptyDir("bug-c") };

        var scan1 = await RunEmptyScan();
        Assert.Equal(3, scan1); // found 3 empty dirs

        var res = await _client.PostAsJsonAsync("/api/trash", new { paths = dirs });
        res.EnsureSuccessStatusCode();

        // Dirs must be gone from original path after /api/trash
        Assert.All(dirs, d => Assert.False(Directory.Exists(d),
            $"Directory still exists after trash: {d}"));
    }

    [Fact]
    public async Task BUG_AfterTrashRescan_FindsZeroNotStaleCount()
    {
        // THE BUG: rescan after Delete Selected showed old count
        // This test verifies the BACKEND scan finds 0 after trash
        var dirs = new[] { MakeEmptyDir("r1"), MakeEmptyDir("r2"), MakeEmptyDir("r3") };

        var scan1 = await RunEmptyScan();
        Assert.Equal(3, scan1);

        // Simulate "Delete Selected" — uses /api/trash (NOT /api/empty-folders/delete)
        await _client.PostAsJsonAsync("/api/trash", new { paths = dirs });

        // Rescan — backend MUST return 0, not the cached 3
        var scan2 = await RunEmptyScan();
        Assert.Equal(0, scan2);
    }

    // ── CACHE ENDPOINT ────────────────────────────────────────────────────────

    [Fact]
    public async Task CacheRemove_Endpoint_Returns200()
    {
        // /api/cache/empty/remove should not throw even for unknown paths
        var res = await _client.PostAsJsonAsync("/api/cache/empty/remove",
            new { paths = new[] { Path.Combine(_root, "ghost") }, trash = false });
        res.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task CacheDelete_Endpoint_Returns200()
    {
        // DELETE /api/cache/empty clears entire section cache
        var res = await _client.DeleteAsync("/api/cache/empty");
        // 200 or 404 both acceptable (no cache to clear is fine)
        Assert.True((int)res.StatusCode < 500,
            $"Cache delete returned server error: {res.StatusCode}");
    }

    // ── FIXED FLOW ────────────────────────────────────────────────────────────

    [Fact]
    public async Task FixedFlow_TrashPlusCacheClear_RescanFindsZero()
    {
        // The fix: after trashing, also clear the cache
        var dirs = new[] { MakeEmptyDir("fix-a"), MakeEmptyDir("fix-b") };

        var scan1 = await RunEmptyScan();
        Assert.Equal(2, scan1);

        // Step 1: trash (what "Delete Selected" does)
        await _client.PostAsJsonAsync("/api/trash", new { paths = dirs });

        // Step 2: clear cache (the fix we add)
        await _client.PostAsJsonAsync("/api/cache/empty/remove",
            new { paths = dirs, trash = false });

        // Step 3: rescan — must find 0
        var scan2 = await RunEmptyScan();
        Assert.Equal(0, scan2);
    }

    [Fact]
    public async Task PermanentDelete_ViaEmptyEndpoint_RescanFindsZero()
    {
        // deleteEmpty() uses /api/empty-folders/delete — also verify clean rescan
        var dirs = new[] { MakeEmptyDir("perm-a"), MakeEmptyDir("perm-b") };

        Assert.Equal(2, await RunEmptyScan());

        await _client.PostAsJsonAsync("/api/empty-folders/delete", new { paths = dirs });

        Assert.Equal(0, await RunEmptyScan());
    }

    // ── DISPOSAL ──────────────────────────────────────────────────────────────

    public async ValueTask DisposeAsync()
    {
        await _app.DisposeAsync();
        _client.Dispose();
        try { Directory.Delete(_root, recursive: true); } catch { }
    }
}
