// TinyFilesRuleTests.cs — boundary-complete unit tests for TinyFilesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.
//
// Rule: result if fi.Length > 0 && fi.Length < 1024
// Two conditions: length must be positive AND below 1024 bytes.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class TinyFilesRuleTests
{
    private const long Limit = 1024L; // const in TinyFilesRule

    // ── Boundary: lower bound (fi.Length > 0) ─────────────────────────────────

    [Fact]
    public async Task BVA_ZeroBytes_NotFound()
    {
        // 0 fails fi.Length > 0 → NOT found
        using var h = new ScanTestHarness();
        h.CreateFileSized("zero.txt", 0);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_OneByte_Found()
    {
        // 1 > 0 && 1 < 1024 → found (min valid value)
        using var h = new ScanTestHarness();
        h.CreateFileSized("one.txt", 1);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    // ── Boundary: upper bound (fi.Length < 1024) ──────────────────────────────

    [Fact]
    public async Task BVA_LimitMinusOne_Found()
    {
        // 1023 < 1024 → found (max valid value)
        using var h = new ScanTestHarness();
        h.CreateFileSized("max-valid.txt", Limit - 1);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_ExactlyAtLimit_NotFound()
    {
        // 1024 < 1024 = false → NOT found (at boundary, excluded)
        using var h = new ScanTestHarness();
        h.CreateFileSized("at-limit.txt", Limit);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_LimitPlusOne_NotFound()
    {
        // 1025 < 1024 = false → NOT found
        using var h = new ScanTestHarness();
        h.CreateFileSized("above.txt", Limit + 1);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task BVA_LargeFile_NotFound()
    {
        // Max scenario: well above limit
        using var h = new ScanTestHarness();
        h.CreateFileSized("large.bin", 10 * 1024 * 1024);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    // ── Boundary: mixed file sizes ────────────────────────────────────────────

    [Fact]
    public async Task MixedSizes_OnlyValidRangeReported()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("zero.txt",    0);          // NOT found
        h.CreateFileSized("one.txt",     1);          // found
        h.CreateFileSized("mid.txt",     512);        // found
        h.CreateFileSized("max.txt",     Limit - 1);  // found
        h.CreateFileSized("at.txt",      Limit);      // NOT found
        h.CreateFileSized("above.txt",   Limit + 1);  // NOT found
        var events = await h.RunAsync(new TinyFilesRule());
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Equal(3, paths.Count);
        Assert.DoesNotContain(paths, p => p.EndsWith("zero.txt"));
        Assert.DoesNotContain(paths, p => p.EndsWith("at.txt"));
        Assert.DoesNotContain(paths, p => p.EndsWith("above.txt"));
        Assert.Contains(paths, p => p.EndsWith("one.txt"));
        Assert.Contains(paths, p => p.EndsWith("mid.txt"));
        Assert.Contains(paths, p => p.EndsWith("max.txt"));
    }

    // ── Code path: extension filter ───────────────────────────────────────────

    [Fact]
    public async Task ExtFilter_Null_AllExtensionsIncluded()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("a.txt", 100);
        h.CreateFileSized("b.js",  100);
        var events = await h.RunAsync(new TinyFilesRule(), extensions: null);
        Assert.Equal(2, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExtFilter_SingleExt_OnlyMatchingFound()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("a.txt", 100);
        h.CreateFileSized("b.js",  100);
        var events = await h.RunAsync(new TinyFilesRule(), extensions: ["txt"]);
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Single(paths);
        Assert.EndsWith(".txt", paths[0]);
    }

    [Fact]
    public async Task ExtFilter_WithDotPrefix_SameAsWithout()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("file.log", 100);
        var withDot    = await h.RunAsync(new TinyFilesRule(), extensions: [".log"]);
        var withoutDot = await h.RunAsync(new TinyFilesRule(), extensions: ["log"]);
        Assert.Equal(ScanTestHarness.ResultCount(withDot), ScanTestHarness.ResultCount(withoutDot));
    }

    [Fact]
    public async Task ExtFilter_EmptyArray_ZeroResults()
    {
        // Empty array = no extensions to match
        using var h = new ScanTestHarness();
        h.CreateFileSized("file.txt", 100);
        var events = await h.RunAsync(new TinyFilesRule(), extensions: []);
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExtFilter_NoMatch_ZeroResults()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("file.txt", 100);
        var events = await h.RunAsync(new TinyFilesRule(), extensions: ["xyz"]);
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExtFilter_CaseInsensitive()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("FILE.TXT", 100);
        var events = await h.RunAsync(new TinyFilesRule(), extensions: ["txt"]);
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    // ── Code paths: exclusions ────────────────────────────────────────────────

    [Fact]
    public async Task Exclusion_NodeModules_NotFound()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("node_modules/pkg/tiny.js", 100);
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task Exclusion_KeepSet_FilesNotFound()
    {
        using var h = new ScanTestHarness();
        var kept  = h.CreateFileSized("kept.txt",  100);
        h.CreateFileSized("other.txt", 100);
        var events = await h.RunAsync(new TinyFilesRule(), keepSet:
            new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
    }

    // ── Result shape ──────────────────────────────────────────────────────────

    [Fact]
    public async Task Result_ContainsPathAndSize()
    {
        using var h = new ScanTestHarness();
        h.CreateFileSized("check.txt", 500);
        var events = await h.RunAsync(new TinyFilesRule());
        var result = events.First(e => e.Type == "result");
        Assert.NotNull(ScanTestHarness.GetPropPublic<string>(result.Data!, "path"));
        Assert.Equal(500L, ScanTestHarness.GetPropPublic<long?>(result.Data!, "size"));
    }

    // ── Lifecycle ─────────────────────────────────────────────────────────────

    [Fact]
    public async Task EmptyRoot_ZeroResults_LifecyclePresent()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new TinyFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.Single(events, e => e.Type == "started");
        Assert.Single(events, e => e.Type == "done");
    }
}
