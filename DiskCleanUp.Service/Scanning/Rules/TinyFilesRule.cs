// Scanning/Rules/TinyFilesRule.cs
// Files ≤ 1 KB (non-empty). Respects ctx.Extensions filter when set.

namespace DiskCleanup.Scanning.Rules;

public sealed class TinyFilesRule : IScanRule
{
    public string Section => "tiny-files";

    private const long Limit = 1024;

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "tiny-files";

        HashSet<string>? extFilter = ctx.Extensions is { Length: > 0 }
            ? new HashSet<string>(
                ctx.Extensions.Select(e => e.StartsWith('.') ? e : "." + e),
                StringComparer.OrdinalIgnoreCase)
            : null;

        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long files = 0, results = 0;

        await Parallel.ForEachAsync(
            FileEnumerator.FilteredFiles(ctx, filterTempFolders: true),
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return;

                    var c = Interlocked.Increment(ref files);
                    if (fi.Length > 0 && fi.Length <= Limit
                        && (extFilter == null || extFilter.Contains(fi.Extension)))
                    {
                        Interlocked.Increment(ref results);
                        await ctx.PushAsync(sec, "result", new
                        {
                            path     = fp,
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
