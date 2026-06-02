// EmptyRuleTests.cs — unit tests for EmptyRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class EmptyRuleTests
{
    [Fact]
    public async Task FindsTrulyEmptyDirectory()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("emptydir");
        var events = await h.RunAsync(new EmptyRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("emptydir"));
    }

    [Fact]
    public async Task IgnoresDirectoryWithFiles()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("nonempty/file.txt");
        var events = await h.RunAsync(new EmptyRule());
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("nonempty"));
    }

    [Fact]
    public async Task IgnoresDirectoryWithSubdirs()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("outer/inner");
        var events = await h.RunAsync(new EmptyRule());
        // inner is empty — outer is not (has a subdir)
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Contains(paths, p => p.EndsWith("inner"));
        Assert.DoesNotContain(paths, p => p.EndsWith("outer"));
    }

    [Fact]
    public async Task FindsMultipleEmptyDirs()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("a");
        h.CreateDir("b");
        h.CreateDir("c");
        var events = await h.RunAsync(new EmptyRule());
        Assert.Equal(3, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateDir("keepme");
        h.CreateDir("deleteme");
        var events = await h.RunAsync(new EmptyRule(), keepSet: [kept]);
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("keepme"));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("deleteme"));
    }

    [Fact]
    public async Task EmptyRootWithNoSubdirsGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("file.txt"); // root has a file, not empty
        var events = await h.RunAsync(new EmptyRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task EmitsStartedAndDoneEvents()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new EmptyRule());
        Assert.True(ScanTestHarness.HasEvent(events, "started"));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }
}
