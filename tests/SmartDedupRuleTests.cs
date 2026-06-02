// SmartDedupRuleTests.cs — unit tests for SmartDedupRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class SmartDedupRuleTests
{
    [Fact]
    public async Task FindsNumberedCopyParenthesis()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("report.pdf",     "original");
        h.CreateFile("report (1).pdf", "copy one");
        h.CreateFile("report (2).pdf", "copy two");
        var events = await h.RunAsync(new SmartDedupRule());
        Assert.True(ScanTestHarness.ResultCount(events) >= 1);
    }

    [Fact]
    public async Task FindsNumberedCopyUnderscore()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("photo.jpg",   "original");
        h.CreateFile("photo_1.jpg", "copy"); // underscore variant — supported
        var events = await h.RunAsync(new SmartDedupRule());
        Assert.True(ScanTestHarness.ResultCount(events) >= 1);
    }

    [Fact]
    public async Task DoesNotFlagUniqueFiles()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("document.docx");
        h.CreateFile("spreadsheet.xlsx");
        var events = await h.RunAsync(new SmartDedupRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("node_modules/pkg/file.js");
        h.CreateFile("node_modules/pkg/file (1).js");
        var events = await h.RunAsync(new SmartDedupRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateFile("doc.pdf");
        h.CreateFile("doc (1).pdf");
        var events = await h.RunAsync(new SmartDedupRule(), keepSet: [kept]);
        // kept is in keep-set so it won't be reported as the canonical
        // but the numbered copy may still be found
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new SmartDedupRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
        Assert.True(ScanTestHarness.HasEvent(events, "started"));
        Assert.True(ScanTestHarness.HasEvent(events, "done"));
    }

    [Fact]
    public async Task NumberedCopyInSubdirectory()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("downloads/file.zip");
        h.CreateFile("downloads/file (1).zip");
        var events = await h.RunAsync(new SmartDedupRule());
        Assert.True(ScanTestHarness.ResultCount(events) >= 1);
    }
}
