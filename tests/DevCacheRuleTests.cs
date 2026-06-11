// DevCacheRuleTests.cs — unit tests for DevCacheRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class DevCacheRuleTests
{
    [Theory]
    [InlineData(".vscode-test-web")]
    [InlineData(".vscode-test")]
    [InlineData(".playwright")]
    [InlineData("__pycache__")]
    [InlineData(".pytest_cache")]
    [InlineData(".mypy_cache")]
    [InlineData(".ruff_cache")]
    [InlineData(".tox")]
    [InlineData(".nx")]
    public async Task FindsKnownCacheFolder(string cacheDir)
    {
        using var h = new ScanTestHarness();
        h.CreateDir($"project/{cacheDir}");
        h.CreateFileSized($"project/{cacheDir}/data.bin", 1024);
        var events = await h.RunAsync(new DevCacheRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p =>
            Path.GetFileName(p).Equals(cacheDir, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task IgnoresRegularDirectories()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("project/src");
        h.CreateFile("project/src/main.ts");
        var events = await h.RunAsync(new DevCacheRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task SkipsCacheInsideNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("node_modules/some-pkg/__pycache__");
        h.CreateFile("node_modules/some-pkg/__pycache__/mod.pyc");
        var events = await h.RunAsync(new DevCacheRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ReportsFolderSize()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("project/__pycache__");
        h.CreateFileSized("project/__pycache__/module.pyc", 50_000);
        var events = await h.RunAsync(new DevCacheRule());
        var size = ScanTestHarness.ResultSizes(events).Single();
        Assert.True(size >= 50_000);
    }

    [Fact]
    public async Task FindsCachesAcrossMultipleProjects()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("projA/__pycache__"); h.CreateFile("projA/__pycache__/a.pyc");
        h.CreateDir("projB/__pycache__"); h.CreateFile("projB/__pycache__/b.pyc");
        var events = await h.RunAsync(new DevCacheRule());
        Assert.Equal(2, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateDir("a/__pycache__");
        h.CreateFile("a/__pycache__/a.pyc");
        h.CreateDir("b/__pycache__");
        h.CreateFile("b/__pycache__/b.pyc");
        var events = await h.RunAsync(new DevCacheRule(), keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.Contains("b"));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new DevCacheRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
