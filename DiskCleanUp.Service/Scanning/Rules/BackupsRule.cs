// Scanning/Rules/BackupsRule.cs
// Finds backup-like directories (bak, backup, old, archive, etc.).
// Deduplicates nested backup dirs so parent and child are not double-counted.
// Also surfaces runaway (recursive) folders as actionable targets.

using System.Collections.Concurrent;
using DiskCleanup.Services;

namespace DiskCleanup.Scanning.Rules;

public sealed class BackupsRule : IScanRule
{
    public string Section => "backups";

    private static readonly EnumerationOptions _shallowOpts =
        new() { RecurseSubdirectories = false, IgnoreInaccessible = true };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "backups";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long scanned = 0, results = 0, totalBytes = 0;

        foreach (var root in FileEnumerator.AllRoots(ctx.Config))
        {
            var runaways   = new ConcurrentBag<string>();
            var candidates = new List<string>();

            foreach (var d in FileEnumerator.EnumerateDirsSafe(root, runaways))
            {
                ct.ThrowIfCancellationRequested();
                if (d.Contains($"{Path.DirectorySeparatorChar}node_modules{Path.DirectorySeparatorChar}",
                        StringComparison.OrdinalIgnoreCase)) continue;
                if (!FileUtilities.IsTrash(d)
                    && FileEnumerator.IsBackupDir(Path.GetFileName(d))
                    && !ctx.KeepSet.Contains(d))
                    candidates.Add(d);
            }

            // Surface runaway folders
            var seenRunaways = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var rp in runaways)
            {
                if (!seenRunaways.Add(rp)) continue;
                Interlocked.Increment(ref results);
                long rpSize = 0;
                try { rpSize = new DirectoryInfo(rp).EnumerateFiles("*", _shallowOpts).Sum(f => f.Length); }
                catch { }
                await ctx.PushAsync(sec, "result", new { path = rp, size = rpSize, runaway = true }, ct);
            }

            // Remove subdirectories of already-found backup dirs (no double-counting)
            var filtered = candidates
                .Where(c => !candidates.Any(p => p != c
                    && c.StartsWith(p + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            await Parallel.ForEachAsync(filtered,
                new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
                async (dp, token) =>
                {
                    var c = Interlocked.Increment(ref scanned);
                    try
                    {
                        var size      = await FileUtilities.DirSizeAsync(dp, token);
                        var fileCount = 0;
                        try { fileCount = FileEnumerator.EnumerateSafe(dp).Count(); } catch { }

                        Interlocked.Increment(ref results);
                        Interlocked.Add(ref totalBytes, size);

                        await ctx.PushAsync(sec, "result", new
                        {
                            path      = dp,
                            size,
                            fileCount,
                            dirName   = Path.GetFileName(dp),
                            parent    = Path.GetDirectoryName(dp) ?? ""
                        }, token);
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        // skip inaccessible
                    }

                    ctx.PushProgress(sec, new { scanned = c, results, folder = dp });
                });
        }

        await ctx.PushAsync(sec, "done", new { scanned, results, totalBytes }, ct);
    }
}
