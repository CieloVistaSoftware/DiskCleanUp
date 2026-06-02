// TinyFilesRuleTests.cs — unit tests for TinyFilesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class TinyFilesRuleTests
{
    [Fact]
    public async Task FindsFileBelowLimit()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("tiny.txt", 512); // 512 bytes < 1024
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("tiny.txt"));
    }

    [Fact]
    public async Task IgnoresFilesAboveLimit()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("large.txt", 2048);    // clearly above 1024-byte limit
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task IgnoresEmptyFiles()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("empty.txt", 0);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExtensionFilterLimitsResults()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("a.txt", 100);
        h.CreateFileSized("b.js", 100);
        var events = await h.RunAsync(new TinyFilesRule(), extensions: ["txt"]);
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Contains(paths, p => p.EndsWith("a.txt"));
        Assert.DoesNotContain(paths, p => p.EndsWith("b.js"));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("node_modules/a/b.js", 100);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.True(ScanTestHarness.HasEvent(events, "started"));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }
}
