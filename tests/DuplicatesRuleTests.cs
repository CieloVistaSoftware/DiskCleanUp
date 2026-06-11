// DuplicatesRuleTests.cs — unit tests for DuplicatesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class DuplicatesRuleTests
{
    private const string SameContent = "IDENTICAL CONTENT FOR DUPLICATE TEST 12345";

    [Fact]
    public async Task FindsTwoIdenticalFiles()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("a/original.txt", SameContent);
        h.CreateFile("b/copy.txt",     SameContent);
        var events = await h.RunAsync(new DuplicatesRule());
        Assert.True(ScanTestHarness.ResultCount(events) >= 1, "Expected at least one duplicate result");
    }

    [Fact]
    public async Task DoesNotFlagUniqueFiles()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("a.txt", "content A");
        h.CreateFile("b.txt", "content B");
        h.CreateFile("c.txt", "content C");
        var events = await h.RunAsync(new DuplicatesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ThreeIdenticalFilesEmitsDoneEvent()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("a/f.txt", SameContent);
        h.CreateFile("b/f.txt", SameContent);
        h.CreateFile("c/f.txt", SameContent);
        var events = await h.RunAsync(new DuplicatesRule());
        // Rule completes and finds duplicates
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
        Assert.True(ScanTestHarness.ResultCount(events) >= 1);
    }

    [Fact]
    public async Task OnlyOneFileInGroupNotReported()
    {
        using var h = new ScanTestHarness();
        // Single unique file — no duplicate group possible
        h.CreateFile("a/unique.txt", "unique content xyz 999");
        var events = await h.RunAsync(new DuplicatesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("node_modules/pkg/a.js", SameContent);
        h.CreateFile("src/a.js", SameContent);
        var events = await h.RunAsync(new DuplicatesRule());
        // node_modules version should be excluded
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new DuplicatesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.True(ScanTestHarness.HasEvent(events, "started"));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }
}
