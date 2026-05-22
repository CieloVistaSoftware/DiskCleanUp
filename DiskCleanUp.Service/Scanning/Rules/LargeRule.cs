// Scanning/Rules/LargeRule.cs
// Files that exceed LargeFileMb (config, default 100 MB).

namespace DiskCleanup.Scanning.Rules;

public sealed class LargeRule : IScanRule
{
    public string Section => "large";

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec   = "large";
        var          limit = (long)ctx.Config.LargeFileMb * 1_048_576;

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
                    if (fi.Length >= limit)
                    {
                        Interlocked.Increment(ref results);
                        await ctx.PushAsync(sec, "result", new { path = fp, size = fi.Length }, token);
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
