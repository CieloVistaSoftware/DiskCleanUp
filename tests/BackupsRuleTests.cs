// BackupsRuleTests.cs — unit tests for BackupsRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class BackupsRuleTests
{
    [Theory]
    [InlineData("backup")]
    [InlineData("bak")]
    [InlineData("old")]
    [InlineData("archive")]
    [InlineData(".bak")]
    public async Task FindsKnownBackupNames(string dirName)
    {
        using var h = new ScanTestHarness();
        h.CreateDir($"project/{dirName}");
        h.CreateFile($"project/{dirName}/data.txt");
        var events = await h.RunAsync(new BackupsRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p =>
            Path.GetFileName(p).Equals(dirName, StringComparison.OrdinalIgnoreCase));
    }

    [Fact]
    public async Task IgnoresRegularDirectories()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("project/src");
        h.CreateFile("project/src/main.cs");
        var events = await h.RunAsync(new BackupsRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ReportsFolderSize()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("project/backup");
        h.CreateFileSized("project/backup/db.bak", 2 * 1024 * 1024);
        var events = await h.RunAsync(new BackupsRule());
        var size = ScanTestHarness.ResultSizes(events).Single();
        Assert.True(size >= 2 * 1024 * 1024);
    }

    [Fact]
    public async Task DoesNotDoubleCountNestedBackupDirs()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("project/backup/archive");
        h.CreateFile("project/backup/archive/old.txt");
        var events = await h.RunAsync(new BackupsRule());
        // Should find backup but not separately enumerate archive inside it
        var paths = ScanTestHarness.ResultPaths(events).ToList();
        Assert.Single(paths);
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        var kept = h.CreateDir("a/backup");
        h.CreateFile("a/backup/x.txt");
        h.CreateDir("b/backup");
        h.CreateFile("b/backup/y.txt");
        var events = await h.RunAsync(new BackupsRule(), keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith("backup") && p.Contains("b"));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new BackupsRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }
}
