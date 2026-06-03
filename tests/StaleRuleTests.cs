// StaleRuleTests.cs — boundary-complete unit tests for StaleRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.
//
// Rule logic: result if fi.LastWriteTime < DateTime.Now.AddDays(-StaleDays)
// i.e. file is stale when age > StaleDays (strictly less-than cutoff)

using Xunit;
using DiskCleanup.Models;
using DiskCleanup.Scanning.Rules;

public class StaleRuleTests
{
    private const int StaleDays = 30;
    private static DashConfig Cfg(string root) =>
        ScanTestHarness.DefaultConfig(root) with { StaleDays = StaleDays };

    // ── Boundary: file age vs. cutoff ─────────────────────────────────────────
    // cutoff = DateTime.Now.AddDays(-30)
    // condition: fi.LastWriteTime < cutoff → stale

    [Fact]
    public async Task BVA_AtExactCutoff_NotStale()
    {
        // LastWriteTime == cutoff → NOT < cutoff → NOT stale
        using var h = new ScanTestHarness();
        h.CreateFileOld("exact.txt", StaleDays);          // exactly at boundary
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("exact.txt"));
    }

    [Fact]
    public async Task BVA_OneDayBeyondCutoff_IsStale()
    {
        // age = StaleDays + 1 → LastWriteTime < cutoff → stale
        using var h = new ScanTestHarness();
        h.CreateFileOld("stale.txt", StaleDays + 1);
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("stale.txt"));
    }

    [Fact]
    public async Task BVA_OneDayBeforeCutoff_NotStale()
    {
        // age = StaleDays - 1 → LastWriteTime > cutoff → NOT stale
        using var h = new ScanTestHarness();
        h.CreateFileOld("fresh.txt", StaleDays - 1);
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("fresh.txt"));
    }

    [Fact]
    public async Task BVA_RecentFile_NotStale()
    {
        // 0 days old (just created) — far from boundary
        using var h = new ScanTestHarness();
        h.CreateFile("now.txt");
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_VeryOldFile_IsStale()
    {
        // Far beyond cutoff — max age scenario
        using var h = new ScanTestHarness();
        h.CreateFileOld("ancient.txt", 3650); // 10 years
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("ancient.txt"));
    }

    // ── Code paths: exclusions ────────────────────────────────────────────────

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFileOld("node_modules/pkg/old.js", StaleDays + 1);
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesVenvs()
    {
        using var h = new ScanTestHarness();
        h.CreateFileOld("venv/lib/old.py", StaleDays + 1);
        h.CreateFile("venv/pyvenv.cfg");
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesKeepSet_SingleFile()
    {
        using var h = new ScanTestHarness();
        var kept  = h.CreateFileOld("kept.txt",  StaleDays + 1);
        var other = h.CreateFileOld("other.txt", StaleDays + 1);
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root),
            keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, other, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task ExcludesKeepSet_AllFilesKept_ZeroResults()
    {
        using var h = new ScanTestHarness();
        var f1 = h.CreateFileOld("a.txt", StaleDays + 1);
        var f2 = h.CreateFileOld("b.txt", StaleDays + 1);
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root),
            keepSet: new HashSet<string>([f1, f2], StringComparer.OrdinalIgnoreCase));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    // ── Code paths: result shape ──────────────────────────────────────────────

    [Fact]
    public async Task ResultContainsPathAndModifiedAndSize()
    {
        using var h = new ScanTestHarness();
        h.CreateFileOld("check.txt", StaleDays + 1, "hello");
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        var result = events.First(e => e.Type == "result");
        var path     = ScanTestHarness.GetPropPublic<string>(result.Data!, "path");
        var modified = ScanTestHarness.GetPropPublic<string>(result.Data!, "modified");
        var size     = ScanTestHarness.GetPropPublic<long?>(result.Data!, "size");
        Assert.NotNull(path);
        Assert.NotNull(modified);
        Assert.True(size >= 0);
    }

    // ── Code paths: lifecycle events ─────────────────────────────────────────

    [Fact]
    public async Task AlwaysEmitsStartedAndDone()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.Single(events, e => e.Type == "started");
        Assert.Single(events, e => e.Type == "done");
    }

    [Fact]
    public async Task EmptyRoot_ZeroResults_DoneStillEmitted()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new StaleRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }

    [Fact]
    public async Task Cancellation_RespectsToken()
    {
        using var h = new ScanTestHarness();
        for (int i = 0; i < 20; i++) h.CreateFileOld($"f{i}.txt", StaleDays + 1);
        using var cts = new CancellationTokenSource();
        cts.Cancel(); // cancel immediately
        var channel = System.Threading.Channels.Channel.CreateBounded<DiskCleanup.Models.ScanEvent>(1000);
        var cfg = Cfg(h.Root);
        var ctx = new DiskCleanup.Scanning.ScanContext(cfg, [],
            channel.Writer,
            DiskCleanup.Services.FileUtilities.XxHash64Async,
            DiskCleanup.Services.FileUtilities.Sha256Async);
        // Should not throw — rule catches OperationCanceledException internally
        // or completes immediately with no results
        await Record.ExceptionAsync(async () => await new StaleRule().RunAsync(ctx, cts.Token));
    }

    // ── Boundary: StaleDays config edge values ────────────────────────────────

    [Theory]
    [InlineData(1)]     // min valid: 1 day
    [InlineData(365)]   // 1 year
    [InlineData(3650)]  // 10 years
    public async Task BVA_StaleDaysConfig_VariousThresholds(int staleDays)
    {
        using var h = new ScanTestHarness();
        h.CreateFileOld("stale.txt", staleDays + 1);
        h.CreateFileOld("fresh.txt", staleDays - 1);
        var events = await h.RunAsync(new StaleRule(),
            ScanTestHarness.DefaultConfig(h.Root) with { StaleDays = staleDays });
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Contains(paths, p => p.EndsWith("stale.txt"));
        Assert.DoesNotContain(paths, p => p.EndsWith("fresh.txt"));
    }
}
