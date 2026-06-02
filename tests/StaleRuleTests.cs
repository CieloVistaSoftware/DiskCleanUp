// StaleRuleTests.cs — unit tests for StaleRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Models;
using DiskCleanup.Scanning.Rules;

public class StaleRuleTests
{
    [Fact]
    public async Task FindsFileOlderThanThreshold()
    {
        using var h = new ScanTestHarness();
        h.CreateFileOld("old.txt", daysOld: 60);
        var events = await h.RunAsync(new StaleRule(), ScanTestHarness.DefaultConfig(h.Root) with { StaleDays = 30 });
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("old.txt"));
    }

    [Fact]
    public async Task IgnoresRecentFiles()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("recent.txt");
        var events = await h.RunAsync(new StaleRule(), ScanTestHarness.DefaultConfig(h.Root) with { StaleDays = 30 });
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("recent.txt"));
    }

    [Fact]
    public async Task RespectsExactThreshold()
    {
        using var h = new ScanTestHarness();
        // cutoff = now - 30 days; 40 days old IS stale, 20 days old is NOT
        h.CreateFileOld("borderline.txt",  daysOld: 40);
        h.CreateFileOld("just-inside.txt", daysOld: 20);
        var events = await h.RunAsync(new StaleRule(), ScanTestHarness.DefaultConfig(h.Root) with { StaleDays = 30 });
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Contains(paths, p => p.EndsWith("borderline.txt"));
        Assert.DoesNotContain(paths, p => p.EndsWith("just-inside.txt"));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFileOld("node_modules/lib/old.js", daysOld: 500);
        var events = await h.RunAsync(new StaleRule());
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.Contains("node_modules"));
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateFileOld("kept.txt", daysOld: 60);
        h.CreateFileOld("other.txt", daysOld: 60);
        var events = await h.RunAsync(new StaleRule(), ScanTestHarness.DefaultConfig(h.Root) with { StaleDays = 30 }, keepSet: [kept]);
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("kept.txt"));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("other.txt"));
    }

    [Fact]
    public async Task EmptyRootReturnsNoResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new StaleRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.True(ScanTestHarness.HasEvent(events, "started"));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }

    [Fact]
    public async Task MultipleStalyFilesAllReported()
    {
        using var h = new ScanTestHarness();
        for (int i = 0; i < 5; i++) h.CreateFileOld($"old{i}.txt", daysOld: 60);
        var events = await h.RunAsync(new StaleRule(), ScanTestHarness.DefaultConfig(h.Root) with { StaleDays = 30 });
        Assert.Equal(5, ScanTestHarness.ResultCount(events));
    }
}
