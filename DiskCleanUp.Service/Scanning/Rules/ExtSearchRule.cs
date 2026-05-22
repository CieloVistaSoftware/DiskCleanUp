// Scanning/Rules/ExtSearchRule.cs
// Live extension search. ctx.Extensions[0] = query extension (e.g. "cs" or ".log").
// ctx.Extensions[1] = optional root path override.
//
// Emits root-level files first (alphabetical) for immediate, expected ordering,
using DiskCleanup.Services;
// then parallel-scans sub-directories.

namespace DiskCleanup.Scanning.Rules;

public sealed class ExtSearchRule : IScanRule
{
    public string Section => "ext-search";

    private static readonly EnumerationOptions _shallowOpts =
        new() { RecurseSubdirectories = false, IgnoreInaccessible = true };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "ext-search";

        var raw        = ctx.Extensions?.FirstOrDefault() ?? string.Empty;
        var query      = raw.Trim().TrimStart('.').ToLowerInvariant();
        var rootOverride = ctx.Extensions is { Length: > 1 } ? ctx.Extensions[1]?.Trim() : null;
        var scanRoot   = !string.IsNullOrWhiteSpace(rootOverride) && Directory.Exists(rootOverride)
                       ? rootOverride!
                       : ctx.Config.Root;

        await ctx.PushAsync(sec, "started", new { root = scanRoot }, ct);

        // Empty query must not trigger a full-disk scan
        if (string.IsNullOrWhiteSpace(query))
        {
            await ctx.PushAsync(sec, "done", new { files = 0, results = 0 }, ct);
            return;
        }

        bool IsAllowedPath(string f)
            => !FileUtilities.IsNodeModules(f)
               && !FileUtilities.IsTrash(f)
               && !FileUtilities.IsVenv(f)
               && !FileUtilities.IsTempFolder(f)
               && !ctx.KeepSet.Contains(f);

        bool ExtMatches(FileInfo fi)
        {
            var ext = fi.Extension.TrimStart('.');
            return !string.IsNullOrWhiteSpace(ext)
                   && ext.Equals(query, StringComparison.OrdinalIgnoreCase);
        }

        long files = 0, results = 0;

        // 1) Root-level files first (predictable order)
        IEnumerable<string> rootFiles;
        try { rootFiles = Directory.EnumerateFiles(scanRoot, "*", _shallowOpts); }
        catch { rootFiles = []; }

        foreach (var fp in rootFiles
                     .Where(IsAllowedPath)
                     .OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                var fi = new FileInfo(fp);
                if (!fi.Exists) continue;

                var c = Interlocked.Increment(ref files);
                if (ExtMatches(fi))
                {
                    Interlocked.Increment(ref results);
                    await ctx.PushAsync(sec, "result", new
                    {
                        path     = fp,
                        ext      = fi.Extension,
                        size     = fi.Length,
                        modified = fi.LastWriteTime.ToString("yyyy-MM-dd")
                    }, ct);
                }
                ctx.PushProgress(sec, new { files = c, results, folder = scanRoot });
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                or FileNotFoundException or DirectoryNotFoundException)
            {
                Interlocked.Increment(ref files);
            }
        }

        // 2) Sub-directories in parallel
        var subFiles = FileEnumerator.EnumerateSafe(scanRoot)
            .Where(IsAllowedPath)
            .Where(f => !string.Equals(
                Path.GetDirectoryName(f), scanRoot, StringComparison.OrdinalIgnoreCase));

        await Parallel.ForEachAsync(subFiles,
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return;

                    var c = Interlocked.Increment(ref files);
                    if (ExtMatches(fi))
                    {
                        Interlocked.Increment(ref results);
                        await ctx.PushAsync(sec, "result", new
                        {
                            path     = fp,
                            ext      = fi.Extension,
                            size     = fi.Length,
                            modified = fi.LastWriteTime.ToString("yyyy-MM-dd")
                        }, token);
                    }
                    ctx.PushProgress(sec, new { files = c, results, folder = Path.GetDirectoryName(fp) });
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                    or FileNotFoundException or DirectoryNotFoundException)
                {
                    Interlocked.Increment(ref files);
                }
            });

        await ctx.PushAsync(sec, "done", new { files, results }, ct);
    }
}
