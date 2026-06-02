// NodeModulesRuleTests.cs — unit tests for NodeModulesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class NodeModulesRuleTests
{
    [Fact]
    public async Task FindsNodeModulesFolder()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("myproject/node_modules");
        h.CreateFile("myproject/node_modules/express/index.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("node_modules"));
    }

    [Fact]
    public async Task DoesNotFindNestedNodeModules()
    {
        using var h = new ScanTestHarness();
        // Inner node_modules inside outer node_modules should not be double-counted
        h.CreateDir("project/node_modules");
        h.CreateFile("project/node_modules/pkg/node_modules/dep/index.js");
        var events = await h.RunAsync(new NodeModulesRule());
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        // Should only find the outer one
        Assert.Single(paths);
        Assert.EndsWith("node_modules", paths[0]);
    }

    [Fact]
    public async Task FindsMultipleNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("projectA/node_modules");
        h.CreateFile("projectA/node_modules/a.js");
        h.CreateDir("projectB/node_modules");
        h.CreateFile("projectB/node_modules/b.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(2, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ReportsFolderSize()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("app/node_modules");
        h.CreateFileSized("app/node_modules/large.js", 1024 * 1024);
        var events = await h.RunAsync(new NodeModulesRule());
        var size = ScanTestHarness.ResultSizes(events).Single();
        Assert.True(size >= 1024 * 1024);
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateDir("kept/node_modules");
        h.CreateFile("kept/node_modules/a.js");
        h.CreateDir("other/node_modules");
        h.CreateFile("other/node_modules/b.js");
        var events = await h.RunAsync(new NodeModulesRule(), keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.Contains("other"));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task DirectoryWithoutNodeModulesGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("project/src/index.js");
        h.CreateFile("project/package.json");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
