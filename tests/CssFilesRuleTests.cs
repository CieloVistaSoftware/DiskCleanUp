// CssFilesRuleTests.cs — unit tests for CssFilesRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class CssFilesRuleTests
{
    [Theory]
    [InlineData("styles.css")]
    [InlineData("styles.scss")]
    [InlineData("styles.sass")]
    [InlineData("styles.less")]
    public async Task FindsCssVariants(string filename)
    {
        using var h = new ScanTestHarness();
        h.CreateFile(filename, "body { margin: 0; }");
        var events = await h.RunAsync(new CssFilesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith(filename));
    }

    [Theory]
    [InlineData("page.html")]
    [InlineData("script.js")]
    [InlineData("readme.md")]
    public async Task IgnoresNonCssFiles(string filename)
    {
        using var h = new ScanTestHarness();
        h.CreateFile(filename);
        var events = await h.RunAsync(new CssFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesNodeModules()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("node_modules/bootstrap/dist/css/bootstrap.css");
        var events = await h.RunAsync(new CssFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task FindsCssInNestedDirs()
    {
        using var h = new ScanTestHarness();
        h.CreateFile("src/components/button/button.scss");
        var events = await h.RunAsync(new CssFilesRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("button.scss"));
    }

    [Fact]
    public async Task ReportsSizeCorrectly()
    {
        using var h = new ScanTestHarness();
        var content = "body { color: red; }";
        h.CreateFile("style.css", content);
        var events = await h.RunAsync(new CssFilesRule());
        var size = ScanTestHarness.ResultSizes(events).Single();
        Assert.True(size > 0);
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new CssFilesRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
