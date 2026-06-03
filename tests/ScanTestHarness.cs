// ScanTestHarness.cs — shared test harness for all scan rule unit tests.
// Copyright (c) 2026 CieloVista Software. All rights reserved.

using System.Threading.Channels;
using DiskCleanup.Models;
using DiskCleanup.Scanning;
using DiskCleanup.Services;

/// <summary>
/// Creates a temporary directory, provides file/dir helpers, runs an IScanRule,
/// and collects all ScanEvents for assertion. Disposed at end of each test.
/// </summary>
public sealed class ScanTestHarness : IDisposable
{
    public string Root { get; }

    public ScanTestHarness()
    {
        // Do NOT use Path.GetTempPath() — it resolves to AppData\Local\Temp which
        // FileUtilities.IsTempFolder filters out, causing all file-scan rules to
        // return zero results. Use the drive root instead.
        var driveRoot = Path.GetPathRoot(Environment.CurrentDirectory) ?? @"C:\";
        Root = Path.Combine(driveRoot, "dcu-tests", Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(Root);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    public string CreateDir(string relPath)
    {
        var full = Path.Combine(Root, relPath);
        Directory.CreateDirectory(full);
        return full;
    }

    public string CreateFile(string relPath, string content = "test content")
    {
        var full = Path.Combine(Root, relPath);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content);
        return full;
    }

    /// <summary>Create a file whose LastWriteTime is <paramref name="daysOld"/> days ago.</summary>
    public string CreateFileOld(string relPath, int daysOld, string content = "test content")
    {
        var full = CreateFile(relPath, content);
        File.SetLastWriteTime(full, DateTime.Now.AddDays(-daysOld));
        return full;
    }

    /// <summary>Create a file with exactly <paramref name="bytes"/> bytes.</summary>
    public string CreateFileSized(string relPath, long bytes)
    {
        var full = Path.Combine(Root, relPath);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        using var fs = new FileStream(full, FileMode.Create, FileAccess.Write);
        fs.SetLength(bytes);
        return full;
    }

    // ── Runner ────────────────────────────────────────────────────────────────

    public async Task<List<ScanEvent>> RunAsync(
        IScanRule rule,
        DashConfig? config   = null,
        HashSet<string>? keepSet = null,
        string[]? extensions = null)
    {
        var channel = Channel.CreateBounded<ScanEvent>(50_000);
        var cfg = config ?? DefaultConfig(Root);
        var ctx = new ScanContext(
            cfg,
            keepSet ?? [],
            channel.Writer,
            FileUtilities.XxHash64Async,
            FileUtilities.Sha256Async,
            extensions,
            FileUtilities.PHashAsync);

        await rule.RunAsync(ctx, CancellationToken.None);
        channel.Writer.Complete();

        var events = new List<ScanEvent>();
        await foreach (var e in channel.Reader.ReadAllAsync())
            events.Add(e);
        return events;
    }

    // ── Accessors ─────────────────────────────────────────────────────────────

    public static IEnumerable<string> ResultPaths(IEnumerable<ScanEvent> events)
        => events
            .Where(e => e.Type == "result" && e.Data != null)
            .Select(e => GetProp<string>(e.Data!, "path"))
            .Where(p => p != null)
            .Select(p => p!);

    public static IEnumerable<long> ResultSizes(IEnumerable<ScanEvent> events)
        => events
            .Where(e => e.Type == "result" && e.Data != null)
            .Select(e => GetProp<long?>(e.Data!, "size") ?? 0L);

    /// <summary>Reflection-based property access — works across assembly boundaries
    /// where dynamic/anonymous-type binding fails at runtime.</summary>
    public static T? GetPropPublic<T>(object obj, string name) => GetProp<T>(obj, name);
    private static T? GetProp<T>(object obj, string name)
    {
        var prop = obj.GetType().GetProperty(name,
            System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance
            | System.Reflection.BindingFlags.IgnoreCase);
        if (prop == null) return default;
        var val = prop.GetValue(obj);
        if (val is T t) return t;
        try { return (T)Convert.ChangeType(val, typeof(T))!; }
        catch { return default; }
    }

    public static int ResultCount(IEnumerable<ScanEvent> events)
        => events.Count(e => e.Type == "result");

    public static bool HasEvent(IEnumerable<ScanEvent> events, string type)
        => events.Any(e => e.Type == type);

    // ── Config factory ────────────────────────────────────────────────────────

    public static DashConfig DefaultConfig(string root) => new()
    {
        Root            = root,
        StaleDays       = 365,
        LargeFileMb     = 10,
        MaxParallelism  = 2,
    };

    public void Dispose()
    {
        try { if (Directory.Exists(Root)) Directory.Delete(Root, true); } catch { /* best-effort */ }
    }
}
