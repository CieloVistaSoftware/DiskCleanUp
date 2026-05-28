// Scanning/Rules/StaleRule.cs
// Files that have not been modified in more than StaleDays (config).

namespace DiskCleanup.Scanning.Rules;

public sealed class StaleRule : IScanRule
{
    public string Section => "stale";

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec    = "stale";
        var          cutoff = DateTime.Now.AddDays(-ctx.Config.StaleDays);

        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long files = 0, results = 0;

        await Parallel.ForEachAsync(
            FileEnumerator.FilteredFiles(ctx),
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return;

                    var c = Interlocked.Increment(ref files);
                    if (fi.LastWriteTime < cutoff)
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
