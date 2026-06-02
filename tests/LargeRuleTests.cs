// LargeRuleTests.cs — unit tests for LargeRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Models;
using DiskCleanup.Scanning.Rules;

public class LargeRuleTests
{
    private static DashConfig ConfigWithLimit(string root, int mb) =>
        ScanTestHarness.DefaultConfig(root) with { LargeFileMb = mb };

    [Fact]
    public async Task FindsFileExceedingLimit()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("big.dat", 11 * 1024 * 1024); // 11 MB
        var events = await h.RunAsync(new LargeRule(), ConfigWithLimit(h.Root, 10));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("big.dat"));
    }

    [Fact]
    public async Task IgnoresSmallFiles()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("small.dat", 1024);
        var events = await h.RunAsync(new LargeRule(), ConfigWithLimit(h.Root, 10));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task FileExactlyAtLimitIsIncluded()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("exact.dat", 10 * 1024 * 1024); // exactly 10 MB
        var events = await h.RunAsync(new LargeRule(), ConfigWithLimit(h.Root, 10));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("exact.dat"));
    }

    [Fact]
    public async Task ReportedSizeMatchesActualSize()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("sized.dat", 15 * 1024 * 1024);
        var events = await h.RunAsync(new LargeRule(), ConfigWithLimit(h.Root, 10));
        var size = ScanTestHarness.ResultSizes(events).Single();
        Assert.Equal(15 * 1024 * 1024, size);
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("node_modules/vendor/large.js", 20 * 1024 * 1024);
        var events = await h.RunAsync(new LargeRule(), ConfigWithLimit(h.Root, 10));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateFileSized("kept.dat", 20 * 1024 * 1024);
        h.CreateFileSized("other.dat", 20 * 1024 * 1024);
        var events = await h.RunAsync(new LargeRule(), ConfigWithLimit(h.Root, 10), keepSet: [kept]);
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("kept.dat"));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("other.dat"));
    }

    [Fact]
    public async Task EmptyRootReturnsZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new LargeRule(), ConfigWithLimit(h.Root, 10));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }
}
