// ExtSearchRuleTests.cs — unit tests for ExtSearchRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class ExtSearchRuleTests
{
    [Fact]
    public async Task FindsFilesByExtension()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("a.log");
        h.CreateFile("b.log");
        h.CreateFile("c.txt");
        var events = await h.RunAsync(new ExtSearchRule(), extensions: ["log"]);
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Equal(2, paths.Count);
        Assert.All(paths, p => Assert.EndsWith(".log", p));
    }

    [Fact]
    public async Task ExtensionWithDotPrefixWorks()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("file.tmp");
        var events = await h.RunAsync(new ExtSearchRule(), extensions: [".tmp"]);
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task NoExtensionFilterReturnsNoResults()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("file.txt");
        // ExtSearchRule with no extensions returns nothing (needs an extension to search for)
        var events = await h.RunAsync(new ExtSearchRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task CaseInsensitiveExtensionMatch()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("FILE.LOG");
        var events = await h.RunAsync(new ExtSearchRule(), extensions: ["log"]);
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("node_modules/pkg/output.log");
        h.CreateFile("myapp/app.log");
        var events = await h.RunAsync(new ExtSearchRule(), extensions: ["log"]);
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Equal(1, paths.Count);
        Assert.EndsWith("app.log", paths[0]);
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateFile("kept.tmp");
        h.CreateFile("other.tmp");
        var events = await h.RunAsync(new ExtSearchRule(), keepSet: [kept], extensions: ["tmp"]);
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("kept.tmp"));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("other.tmp"));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new ExtSearchRule(), extensions: ["log"]);
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
