// EmptyRuleTests.cs — boundary-complete unit tests for EmptyRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.
//
// Rule: result if Directory.EnumerateFileSystemEntries(dp).Any() == false
// i.e. directory has NO files AND NO subdirectories
// Scanned deepest-first so inner empties appear before outer ones.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class EmptyRuleTests
{
    // ── Boundary: empty vs. one entry ─────────────────────────────────────────

    [Fact]
    public async Task BVA_TrulyEmpty_Found()
    {
        // No files, no subdirs → empty → found
        using var h = new ScanTestHarness();
        h.CreateDir("empty");
        var events = await h.RunAsync(new EmptyRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("empty"));
    }

    [Fact]
    public async Task BVA_OneFile_NotFound()
    {
        // 1 file = NOT empty
        using var h = new ScanTestHarness();
        h.CreateFile("one/file.txt");
        var events = await h.RunAsync(new EmptyRule());
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("one"));
    }

    [Fact]
    public async Task BVA_OneSubDir_NotFound()
    {
        // Has subdir even if that subdir is empty → outer dir is NOT empty
        using var h = new ScanTestHarness();
        h.CreateDir("outer/inner");
        var events = await h.RunAsync(new EmptyRule());
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Contains(paths, p => p.EndsWith("inner"));      // inner IS empty
        Assert.DoesNotContain(paths, p => p.EndsWith("outer")); // outer is NOT empty
    }

    [Fact]
    public async Task BVA_OneFileAndOneSubDir_NotFound()
    {
        // Has both — definitely not empty
        using var h = new ScanTestHarness();
        h.CreateFile("dir/file.txt");
        h.CreateDir("dir/sub");
        var events = await h.RunAsync(new EmptyRule());
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("dir"));
    }

    // ── Boundary: nesting depth ───────────────────────────────────────────────

    [Fact]
    public async Task BVA_TopLevelEmpty_Found()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("toplevel");
        var events = await h.RunAsync(new EmptyRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("toplevel"));
    }

    [Fact]
    public async Task BVA_DeeplyNestedEmpty_Found()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("a/b/c/d/empty");
        var events = await h.RunAsync(new EmptyRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("empty"));
    }

    [Fact]
    public async Task BVA_DeepestFoundFirst_OuterNotReported()
    {
        // outer/inner — inner is empty, outer has inner (subdir) so NOT empty
        using var h = new ScanTestHarness();
        h.CreateDir("outer/inner");
        var events = await h.RunAsync(new EmptyRule());
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Single(paths); // only inner
        Assert.EndsWith("inner", paths[0]);
    }

    // ── Boundary: multiple empty dirs ─────────────────────────────────────────

    [Fact]
    public async Task BVA_MultipleEmptyDirs_AllFound()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("a");
        h.CreateDir("b");
        h.CreateDir("c");
        var events = await h.RunAsync(new EmptyRule());
        Assert.Equal(3, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_MixedEmptyAndNonEmpty_OnlyEmptyFound()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("empty1");
        h.CreateFile("full/file.txt");
        h.CreateDir("empty2");
        var events = await h.RunAsync(new EmptyRule());
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Equal(2, paths.Count);
        Assert.DoesNotContain(paths, p => p.EndsWith("full"));
    }

    // ── Code paths: exclusions ────────────────────────────────────────────────

    [Fact]
    public async Task Exclusion_KeepSet_NotFound()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateDir("keepme");
        h.CreateDir("deleteme");
        var events = await h.RunAsync(new EmptyRule(),
            keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("deleteme"));
    }

    [Fact]
    public async Task Exclusion_AllKept_ZeroResults()
    {
        using var h = new ScanTestHarness();
        var d1 = h.CreateDir("a");
        var d2 = h.CreateDir("b");
        var events = await h.RunAsync(new EmptyRule(),
            keepSet: new HashSet<string>([d1, d2], StringComparer.OrdinalIgnoreCase));
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    // ── Result shape ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Result_ContainsPath()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("check");
        var events = await h.RunAsync(new EmptyRule());
        var result = events.First(e => e.Type == "result");
        Assert.NotNull(ScanTestHarness.GetPropPublic<string>(result.Data!, "path"));
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task EmptyRoot_ZeroResults_LifecyclePresent()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new EmptyRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.Single(events, e => e.Type == "started");
        Assert.Single(events, e => e.Type == "done");
    }

    [Fact]
    public async Task RootWithOnlyFiles_ZeroEmptyDirs()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("a.txt");
        h.CreateFile("b.txt");
        var events = await h.RunAsync(new EmptyRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
