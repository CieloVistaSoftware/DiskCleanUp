// HtmlFilesRuleTests.cs — unit tests for HtmlFilesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class HtmlFilesRuleTests
{
    [Theory]
    [InlineData("page.html")]
    [InlineData("page.htm")]
    public async Task FindsHtmlFiles(string filename)
    {
        using var h = new ScanTestHarness();
        h.CreateFile(filename, "<html></html>");
        var events = await h.RunAsync(new HtmlFilesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith(filename));
    }

    [Theory]
    [InlineData("styles.css")]
    [InlineData("script.js")]
    [InlineData("readme.md")]
    public async Task IgnoresNonHtmlFiles(string filename)
    {
        using var h = new ScanTestHarness();
        h.CreateFile(filename);
        var events = await h.RunAsync(new HtmlFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("node_modules/pkg/index.html", "<html/>");
        var events = await h.RunAsync(new HtmlFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateFile("kept.html", "<html/>");
        h.CreateFile("other.html", "<html/>");
        var events = await h.RunAsync(new HtmlFilesRule(), keepSet: [kept]);
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p => p.EndsWith("kept.html"));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("other.html"));
    }

    [Fact]
    public async Task FindsHtmlInSubdirectories()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("sub/deep/page.html", "<html/>");
        var events = await h.RunAsync(new HtmlFilesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("page.html"));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new HtmlFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
