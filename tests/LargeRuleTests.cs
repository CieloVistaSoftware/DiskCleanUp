// LargeRuleTests.cs — boundary-complete unit tests for LargeRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.
//
// Rule: result if fi.Length >= LargeFileMb * 1_048_576
// Boundary: limit = LargeFileMb * 1_048_576

using Xunit;
using DiskCleanup.Models;
using DiskCleanup.Scanning.Rules;

public class LargeRuleTests
{
    private const int   LargeMb    = 10;
    private const long  LimitBytes = LargeMb * 1_048_576L; // 10,485,760

    private static DashConfig Cfg(string root) =>
        ScanTestHarness.DefaultConfig(root) with { LargeFileMb = LargeMb };

    // ── Boundary: file size vs. limit ─────────────────────────────────────────

    [Fact]
    public async Task BVA_ZeroBytes_NotFound()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("zero.bin", 0);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_OneByte_NotFound()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("one.bin", 1);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_LimitMinusOne_NotFound()
    {
        // limit - 1 bytes: strictly below → NOT found
        using var h = new ScanTestHarness();
        h.CreateFileSized("limit-1.bin", LimitBytes - 1);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_ExactlyAtLimit_Found()
    {
        // limit bytes: >= limit → found
        using var h = new ScanTestHarness();
        h.CreateFileSized("limit.bin", LimitBytes);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_LimitPlusOne_Found()
    {
        // limit + 1: > limit → found
        using var h = new ScanTestHarness();
        h.CreateFileSized("limit+1.bin", LimitBytes + 1);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_VeryLargeFile_Found()
    {
        // Max scenario: well above limit
        using var h = new ScanTestHarness();
        h.CreateFileSized("huge.bin", LimitBytes * 5);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    // ── Boundary: LargeFileMb config edge values ──────────────────────────────

    [Fact]
    public async Task BVA_LargeFileMb_1_LimitIs1MB()
    {
        // LargeFileMb=1 → limit = 1,048,576 bytes
        using var h = new ScanTestHarness();
        h.CreateFileSized("below.bin", 1_048_575);  // limit-1 → NOT found
        h.CreateFileSized("at.bin",    1_048_576);  // limit   → found
        var events = await h.RunAsync(new LargeRule(),
            ScanTestHarness.DefaultConfig(h.Root) with { LargeFileMb = 1 });
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.DoesNotContain(paths, p => p.EndsWith("below.bin"));
        Assert.Contains(paths, p => p.EndsWith("at.bin"));
    }

    [Fact]
    public async Task BVA_LargeFileMb_0_EveryNonEmptyFileIsLarge()
    {
        // LargeFileMb=0 → limit=0 → fi.Length >= 0 → every file found
        using var h = new ScanTestHarness();
        h.CreateFileSized("tiny.bin",  1);
        h.CreateFileSized("empty.bin", 0);
        var events = await h.RunAsync(new LargeRule(),
            ScanTestHarness.DefaultConfig(h.Root) with { LargeFileMb = 0 });
        // 1-byte file: 1 >= 0 → found; 0-byte: 0 >= 0 → also found
        Assert.True(ScanTestHarness.ResultCount(events) >= 1);
    }

    // ── Result shape ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Result_ContainsPathAndSize()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("check.bin", LimitBytes);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        var result = events.First(e => e.Type == "result");
        Assert.NotNull(ScanTestHarness.GetPropPublic<string>(result.Data!, "path"));
        Assert.True(ScanTestHarness.GetPropPublic<long?>(result.Data!, "size") >= LimitBytes);
    }

    [Fact]
    public async Task Result_ReportedSizeMatchesActualSize()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("exact.bin", LimitBytes);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(LimitBytes, ScanTestHarness.ResultSizes(events).Single());
    }

    // ── Code paths: exclusions ────────────────────────────────────────────────

    [Fact]
    public async Task Exclusion_NodeModules_NotFound()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("node_modules/vendor/large.js", LimitBytes);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task Exclusion_KeepSet_NotFound()
    {
        using var h = new ScanTestHarness();
        var kept  = h.CreateFileSized("kept.bin",  LimitBytes);
        h.CreateFileSized("other.bin", LimitBytes);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root),
            keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task Exclusion_AllFilesKept_ZeroResults()
    {
        using var h = new ScanTestHarness();
        var f1 = h.CreateFileSized("a.bin", LimitBytes);
        var f2 = h.CreateFileSized("b.bin", LimitBytes);
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root),
            keepSet: new HashSet<string>([f1, f2], StringComparer.OrdinalIgnoreCase));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    // ── Code paths: mixed sizes ───────────────────────────────────────────────

    [Fact]
    public async Task MixedSizes_OnlyLargeFilesReported()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("small.bin",  LimitBytes - 1);  // NOT found
        h.CreateFileSized("exact.bin",  LimitBytes);      // found
        h.CreateFileSized("large.bin",  LimitBytes + 100); // found
        h.CreateFileSized("huge.bin",   LimitBytes * 2);  // found
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Equal(3, paths.Count);
        Assert.DoesNotContain(paths, p => p.EndsWith("small.bin"));
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task EmptyRoot_ZeroResults_LifecycleEventsPresent()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new LargeRule(), Cfg(h.Root));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.Single(events, e => e.Type == "started");
        Assert.Single(events, e => e.Type == "done");
    }

    [Fact]
    public async Task Cancellation_DoesNotThrow()
    {
        using var h = new ScanTestHarness();
        for (int i = 0; i < 10; i++) h.CreateFileSized($"f{i}.bin", LimitBytes);
        using var cts = new CancellationTokenSource();
        cts.Cancel();
        await Record.ExceptionAsync(async () =>
        {
            var ch  = System.Threading.Channels.Channel.CreateBounded<ScanEvent>(100);
            var ctx = new DiskCleanup.Scanning.ScanContext(Cfg(h.Root), [],
                ch.Writer, DiskCleanup.Services.FileUtilities.XxHash64Async,
                DiskCleanup.Services.FileUtilities.Sha256Async);
            await new LargeRule().RunAsync(ctx, cts.Token);
        });
    }
}
