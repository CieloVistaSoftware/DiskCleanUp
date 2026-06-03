// NodeModulesRuleTests.cs — boundary-complete unit tests for NodeModulesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.
//
// Rule: finds directories named exactly "node_modules" (case-insensitive)
// that are NOT themselves inside another node_modules directory.
// Also surfaces "runaway" (recursive/too-deep) folders.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class NodeModulesRuleTests
{
    // ── Boundary: folder name exact match ─────────────────────────────────────

    [Fact]
    public async Task BVA_ExactNameLowerCase_Found()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("proj/node_modules");
        h.CreateFile("proj/node_modules/a.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("node_modules"));
    }

    [Fact]
    public async Task BVA_NameUpperCase_Found()
    {
        // Case-insensitive match
        using var h = new ScanTestHarness();
        h.CreateDir("proj/NODE_MODULES");
        h.CreateFile("proj/NODE_MODULES/a.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p =>
            p.EndsWith("node_modules", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task BVA_NameMixedCase_Found()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("proj/Node_Modules");
        h.CreateFile("proj/Node_Modules/a.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p =>
            p.EndsWith("Node_Modules", StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task BVA_NameWithSuffix_NotFound()
    {
        // "node_modules2" is NOT a match (exact name check)
        using var h = new ScanTestHarness();
        h.CreateDir("proj/node_modules2");
        h.CreateFile("proj/node_modules2/a.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_NameWithPrefix_NotFound()
    {
        // "my_node_modules" is NOT a match
        using var h = new ScanTestHarness();
        h.CreateDir("proj/my_node_modules");
        h.CreateFile("proj/my_node_modules/a.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_PartialName_NotFound()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("proj/node_module");  // missing 's'
        h.CreateFile("proj/node_module/a.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    // ── Boundary: nesting depth ───────────────────────────────────────────────

    [Fact]
    public async Task BVA_TopLevel_Found()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("node_modules");
        h.CreateFile("node_modules/a.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_NestedInsideOtherDir_Found()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("a/b/c/node_modules");
        h.CreateFile("a/b/c/node_modules/pkg.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_NestedInsideNodeModules_NotDoubleCounted()
    {
        // node_modules inside node_modules → only outer reported
        using var h = new ScanTestHarness();
        h.CreateDir("proj/node_modules");
        h.CreateFile("proj/node_modules/pkg/node_modules/sub.js");
        var events = await h.RunAsync(new NodeModulesRule());
        // Only the outer node_modules path should be in results
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Single(paths);
    }

    [Fact]
    public async Task BVA_TwoSiblingNodeModules_BothFound()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("a/node_modules"); h.CreateFile("a/node_modules/x.js");
        h.CreateDir("b/node_modules"); h.CreateFile("b/node_modules/y.js");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(2, ScanTestHarness.ResultCount(events));
    }

    // ── Boundary: empty vs. non-empty node_modules ────────────────────────────

    [Fact]
    public async Task BVA_EmptyNodeModules_StillFound()
    {
        // Empty directory still matches by name
        using var h = new ScanTestHarness();
        h.CreateDir("proj/node_modules");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    // ── Code paths: size reporting ────────────────────────────────────────────

    [Fact]
    public async Task Result_SizeEqualsContentsSize()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("proj/node_modules");
        h.CreateFileSized("proj/node_modules/big.js", 500_000);
        var events = await h.RunAsync(new NodeModulesRule());
        var size = ScanTestHarness.ResultSizes(events).Single();
        Assert.True(size >= 500_000);
    }

    [Fact]
    public async Task Result_EmptyNodeModules_SizeIsZero()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("proj/node_modules");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0L, ScanTestHarness.ResultSizes(events).Single());
    }

    // ── Code paths: exclusions ────────────────────────────────────────────────

    [Fact]
    public async Task Exclusion_KeepSet_NotFound()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateDir("a/node_modules");
        h.CreateFile("a/node_modules/x.js");
        h.CreateDir("b/node_modules");
        h.CreateFile("b/node_modules/y.js");
        var events = await h.RunAsync(new NodeModulesRule(),
            keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task EmptyRoot_ZeroResults_LifecyclePresent()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.Single(events, e => e.Type == "started");
        Assert.Single(events, e => e.Type == "done");
    }

    [Fact]
    public async Task NoNodeModulesPresent_ZeroResults()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("src/index.js");
        h.CreateFile("package.json");
        var events = await h.RunAsync(new NodeModulesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
