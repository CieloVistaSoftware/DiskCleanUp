// VenvsRuleTests.cs — unit tests for VenvsRule
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using Xunit;
using DiskCleanup.Scanning.Rules;

public class VenvsRuleTests
{
    // Helper: create a valid venv (requires pyvenv.cfg marker)
    private static void MakeVenv(ScanTestHarness h, string relPath)
    {
        h.CreateDir(relPath);
        h.CreateFile($"{relPath}/pyvenv.cfg", "home = /usr/bin\nversion = 3.11");
    }

    [Theory]
    [InlineData("venv")]
    [InlineData(".venv")]
    [InlineData("env")]
    [InlineData(".env")]
    public async Task FindsKnownVenvNames(string venvDir)
    {
        using var h = new ScanTestHarness();
        MakeVenv(h, $"project/{venvDir}");
        var events = await h.RunAsync(new VenvsRule());
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith(venvDir));
    }

    [Fact]
    public async Task IgnoresDirWithoutPyvenvCfg()
    {
        using var h = new ScanTestHarness();
        h.CreateDir("project/venv");
        h.CreateFile("project/venv/a.py"); // no pyvenv.cfg
        var events = await h.RunAsync(new VenvsRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ReportsSizeOfVenvContents()
    {
        using var h = new ScanTestHarness();
        MakeVenv(h, "project/venv");
        h.CreateFileSized("project/venv/python3.exe", 500_000);
        var events = await h.RunAsync(new VenvsRule());
        Assert.Equal(1, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task ExcludesKeepSet()
    {
        using var h = new ScanTestHarness();
        MakeVenv(h, "proj/venv");
        var kept = Path.Combine(h.Root, "proj", "venv");
        MakeVenv(h, "other/.venv");
        var events = await h.RunAsync(new VenvsRule(), keepSet: new HashSet<string>([kept], StringComparer.OrdinalIgnoreCase));
        Assert.DoesNotContain(ScanTestHarness.ResultPaths(events), p =>
            string.Equals(p, kept, StringComparison.OrdinalIgnoreCase));
        Assert.Contains(ScanTestHarness.ResultPaths(events), p => p.EndsWith(".venv"));
    }

    [Fact]
    public async Task EmptyRootGivesZeroResults()
    {
        using var h = new ScanTestHarness();
        var events = await h.RunAsync(new VenvsRule());
        Assert.Equal(0, ScanTestHarness.ResultCount(events));
    }

    [Fact]
    public async Task FindsMultipleVenvsAcrossProjects()
    {
        using var h = new ScanTestHarness();
        MakeVenv(h, "projA/venv");
        MakeVenv(h, "projB/.venv");
        var events = await h.RunAsync(new VenvsRule());
        Assert.True(ScanTestHarness.ResultCount(events) >= 2);
    }
}
