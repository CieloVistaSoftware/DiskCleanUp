// Scanning/Rules/ImagesRule.cs
// Finds byte-identical image files via fast xxHash64 grouping.
//
// Changed from perceptual hashing (visual similarity) to exact byte-for-byte
// matching so only truly identical images are grouped — no false positives
// from similar color palettes or resized near-duplicates.
//
// Algorithm mirrors DuplicatesRule: group by xxHash64, emit result/result_update
// as groups grow to 2+ members. Output format: { hash, files[] }.

using System.Collections.Concurrent;

namespace DiskCleanup.Scanning.Rules;

public sealed class ImagesRule : IScanRule
{
    public string Section => "images";

    private static readonly HashSet<string> _imageExts = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "images";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);

        var seen    = new ConcurrentDictionary<string, List<string>>();
        var lockObj = new object();
        long scanned = 0, results = 0;

        await Parallel.ForEachAsync(
            FileEnumerator.FilteredFiles(ctx)
                          .Where(f => _imageExts.Contains(Path.GetExtension(f))),
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    var h = await ctx.HashAsync(fp, token);
                    if (string.IsNullOrEmpty(h)) return;

                    int groupCount;
                    string[] groupSnapshot;
                    lock (lockObj)
                    {
                        var group = seen.GetOrAdd(h, _ => []);
                        group.Add(fp);
                        groupCount    = group.Count;
                        groupSnapshot = group.ToArray();   // snapshot while holding lock — safe
                    }

                    var count = Interlocked.Increment(ref scanned);
                    if (groupCount == 2)
                    {
                        Interlocked.Increment(ref results);
                        await ctx.PushAsync(sec, "result",        new { hash = h, files = groupSnapshot }, token);
                    }
                    else if (groupCount > 2)
                    {
                        await ctx.PushAsync(sec, "result_update", new { hash = h, files = groupSnapshot }, token);
                    }
                    ctx.PushProgress(sec, new { files = count, results, folder = Path.GetDirectoryName(fp) });
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FileNotFoundException)
                {
                    Interlocked.Increment(ref scanned);
                }
            });

        await ctx.PushAsync(sec, "done", new { files = scanned, results }, ct);
    }
}
