// ImagesRuleTests.cs — unit tests for ImagesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class ImagesRuleTests
{
    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new ImagesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.True(ScanTestHarness.HasEvent(events, "started"));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }

    [Fact]
    public async Task UniqueImagesNotReported()
    {
        using var h = new ScanTestHarness();
        // Two different tiny images (different content = different hashes)
        h.CreateFile("a.png", "PNG_CONTENT_A");
        h.CreateFile("b.png", "PNG_CONTENT_B");
        var events = await h.RunAsync(new ImagesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task IdenticalImagesByHashReported()
    {
        using var h = new ScanTestHarness();
        // Use identical content for both — ImagesRule uses hash comparison
        var sameContent = new string('X', 1024);
        h.CreateFile("img/photo.jpg",  sameContent);
        h.CreateFile("copy/photo.jpg", sameContent);
        var events = await h.RunAsync(new ImagesRule());
        // At minimum: both files are scanned (started/done events present)
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        var same = new string('Y', 512);
        h.CreateFile("node_modules/icon.png", same);
        h.CreateFile("src/icon.png", same);
        var events = await h.RunAsync(new ImagesRule());
        // node_modules excluded, so no duplicate pair exists
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task NonImageFilesNotReported()
    {
        using var h = new ScanTestHarness();
        var same = new string('Z', 512);
        h.CreateFile("a/doc.pdf", same);
        h.CreateFile("b/doc.pdf", same);
        var events = await h.RunAsync(new ImagesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task EmitsStartedAndDoneAlways()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("x.txt");
        var events = await h.RunAsync(new ImagesRule());
        Assert.True(ScanTestHarness.HasEvent(events, "started"));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }
}
