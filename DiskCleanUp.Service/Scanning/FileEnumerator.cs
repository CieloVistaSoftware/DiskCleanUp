// DiskCleanUp.Service/Scanning/FileEnumerator.cs
// Shared filesystem enumeration utilities used by all IScanRule implementations.
//
// SAFE BFS DESIGN:
//   .NET's RecurseSubdirectories = true descends BEFORE we can filter,
//   so a runaway recursive folder (backup\backup\backup\...) exceeds MAX_PATH
//   and crashes. We use depth-limited BFS with loop detection instead.
//
// 40KB RULE: no buffer allocations > 40,960 bytes. All reads use StreamReader
//   with bufferSize: 4096. No File.ReadAllLines / ReadAllBytes on growable files.

using System.Collections.Concurrent;
using System.Text.RegularExpressions;
using DiskCleanup.Models;
using DiskCleanup.Scanning;
using DiskCleanup.Services;

namespace DiskCleanup.Scanning.Rules;

public static class FileEnumerator
{
    // ── Depth cap ─────────────────────────────────────────────
    public const int MaxDepth = 20;

    private static readonly EnumerationOptions _shallowOpts =
        new() { RecurseSubdirectories = false, IgnoreInaccessible = true };

    // ── Root resolver ─────────────────────────────────────────
    /// All scan roots from config (primary + extra), filtered to existing dirs.
    public static IEnumerable<string> AllRoots(DashConfig cfg)
        => new[] { cfg.Root }.Concat(cfg.ExtraRoots ?? [])
           .Where(r => !string.IsNullOrWhiteSpace(r) && Directory.Exists(r));

    // ── Filtered file stream ──────────────────────────────────
    /// All files under all roots, excluding node_modules / trash / venvs /
    /// temp folders (optional) and the keep-set.
    public static IEnumerable<string> FilteredFiles(
        ScanContext ctx, bool filterTempFolders = true)
        => AllRoots(ctx.Config)
           .SelectMany(EnumerateSafe)
           .Where(f => !FileUtilities.IsNodeModules(f)
                    && !FileUtilities.IsTrash(f)
                    && !FileUtilities.IsVenv(f)
                    && (!filterTempFolders || !FileUtilities.IsTempFolder(f))
                    && !ctx.KeepSet.Contains(f));

    // ── BFS file walker ───────────────────────────────────────
    /// Depth-limited BFS that yields every file under root.
    /// Skips backup dirs so the BackupsRule sees them as whole units.
    public static IEnumerable<string> EnumerateSafe(string root)
    {
        var queue = new Queue<(string Dir, int Depth)>();
        queue.Enqueue((root, 0));

        while (queue.Count > 0)
        {
            var (dir, depth) = queue.Dequeue();

            IEnumerable<string> files;
            try   { files = Directory.EnumerateFiles(dir, "*", _shallowOpts); }
            catch { continue; }

            foreach (var f in files) yield return f;

            if (depth >= MaxDepth) continue;

            IEnumerable<string> subdirs;
            try   { subdirs = Directory.EnumerateDirectories(dir, "*", _shallowOpts); }
            catch { continue; }

            foreach (var sub in subdirs)
            {
                if (IsBackupDir(Path.GetFileName(sub))) continue;
                if (IsRecursiveLoop(sub))                continue;
                queue.Enqueue((sub, depth + 1));
            }
        }
    }

    // ── BFS directory walker ──────────────────────────────────
    /// Depth-limited BFS that yields every sub-directory under root.
    /// Collects runaway (recursive) paths into the optional bag.
    public static IEnumerable<string> EnumerateDirsSafe(
        string root, ConcurrentBag<string>? runaways = null)
    {
        var queue = new Queue<(string Dir, int Depth)>();
        queue.Enqueue((root, 0));

        while (queue.Count > 0)
        {
            var (dir, depth) = queue.Dequeue();

            IEnumerable<string> subdirs;
            try   { subdirs = Directory.EnumerateDirectories(dir, "*", _shallowOpts); }
            catch { continue; }

            foreach (var sub in subdirs)
            {
                if (IsRecursiveLoop(sub))
                {
                    var rr = FindRunawayRoot(sub);
                    if (rr != null) runaways?.Add(rr);
                    continue;
                }

                yield return sub;

                // Yield backup dirs but don't descend into them
                if (IsBackupDir(Path.GetFileName(sub))) continue;
                if (depth + 1 < MaxDepth) queue.Enqueue((sub, depth + 1));
            }
        }
    }

    // ── Backup directory detection ────────────────────────────
    private static readonly Regex _backupRe = new(
        @"(?i)^(bak|bck|backup|backups|back-?up|old|archive|archives|copy|copies|" +
        @"\.bak|\.backup|\.old|~backup|~bak|_bak|_backup|_old|" +
        @"before[-_ ]|pre[-_ ]|orig|original|originals|" +
        @"save|saved|snapshot|snapshots|previous|retired)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static bool IsBackupDir(string dirName)
    {
        if (_backupRe.IsMatch(dirName)) return true;
        var lo = dirName.ToLowerInvariant();
        return lo.Contains("backup") || lo.Contains("_bak")  || lo.Contains("-bak")
            || lo.Contains(".bak")   || lo.Contains("_old")  || lo.Contains("-old")
            || lo.EndsWith(" copy")  || lo.EndsWith("_copy") || lo.EndsWith("-copy");
    }

    // ── Loop detection ────────────────────────────────────────
    /// True when 3 consecutive identical directory names appear in path.
    /// Short paths skip the check (< 150 chars cannot form the pattern).
    public static bool IsRecursiveLoop(string path)
    {
        if (path.Length < 150) return false;
        var parts = path.Split(Path.DirectorySeparatorChar);
        if (parts.Length < 4) return false;
        int n = parts.Length;
        for (int i = n - 3; i >= 1; i--)
            if (parts[i].Length > 0
                && string.Equals(parts[i], parts[i + 1], StringComparison.OrdinalIgnoreCase)
                && string.Equals(parts[i], parts[i + 2], StringComparison.OrdinalIgnoreCase))
                return true;
        return false;
    }

    /// Find the first pair of repeated path segments (the runaway root).
    public static string? FindRunawayRoot(string loopPath)
    {
        var parts = loopPath.Split(Path.DirectorySeparatorChar);
        for (int i = 1; i < parts.Length; i++)
            if (parts[i].Length > 0
                && string.Equals(parts[i], parts[i - 1], StringComparison.OrdinalIgnoreCase))
                return string.Join(Path.DirectorySeparatorChar, parts.Take(i + 1));
        return null;
    }
}
