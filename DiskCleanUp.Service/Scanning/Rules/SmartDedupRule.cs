// Scanning/Rules/SmartDedupRule.cs
// Finds numbered copy files — Windows Explorer copies ("name (2).ext")
// and underscore-numbered variants ("name_2.ext").
//
// Groups by base name (strips the copy suffix), keeps the newest as "original",
// flags all older copies as deletable. Respects ctx.Extensions filter when set.

using System.Collections.Concurrent;
using System.Text.RegularExpressions;

namespace DiskCleanup.Scanning.Rules;

public sealed class SmartDedupRule : IScanRule
{
    public string Section => "smart-dedup";

    // Matches "name (N).ext" and "name_N.ext"
    private static readonly Regex _copyRe =
        new(@"^(.+?)(?:\s*\((\d+)\)|_(\d+))$", RegexOptions.Compiled);

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "smart-dedup";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);

        HashSet<string>? extFilter = ctx.Extensions is { Length: > 0 }
            ? new HashSet<string>(
                ctx.Extensions.Select(e => e.StartsWith('.') ? e : "." + e),
                StringComparer.OrdinalIgnoreCase)
            : null;

        var byBase    = new ConcurrentDictionary<string, List<string>>();
        var fileCache = new ConcurrentDictionary<string, (long Size, DateTime Modified)>();
        var lockObj   = new object();
        long files    = 0;

        var allFiles = FileEnumerator.FilteredFiles(ctx);
        if (extFilter != null)
            allFiles = allFiles.Where(f => extFilter.Contains(Path.GetExtension(f)));

        await Parallel.ForEachAsync(
            allFiles,
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            (fp, token) =>
            {
                try
                {
                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return ValueTask.CompletedTask;

                    fileCache[fp] = (fi.Length, fi.LastWriteTime);

                    var stem = Path.GetFileNameWithoutExtension(fp);
                    var ext  = Path.GetExtension(fp).ToLower();
                    var m    = _copyRe.Match(stem);
                    var key  = (m.Success ? m.Groups[1].Value : stem) + ext;
                    lock (lockObj) { byBase.GetOrAdd(key, _ => []).Add(fp); }

                    ctx.PushProgress(sec, new { files = Interlocked.Increment(ref files), folder = Path.GetDirectoryName(fp) });
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FileNotFoundException)
                {
                    Interlocked.Increment(ref files);
                }
                return ValueTask.CompletedTask;
            });

        long results = 0;
        foreach (var (_, flist) in byBase)
        {
            if (flist.Count <= 1) continue;

            var sorted  = flist
                .OrderByDescending(f => fileCache.TryGetValue(f, out var info) ? info.Modified : DateTime.MinValue)
                .ToList();
            var deletes = sorted.Skip(1).ToArray();
            var savings = deletes.Sum(f => fileCache.TryGetValue(f, out var info) ? info.Size : 0L);

            results++;
            await ctx.PushAsync(sec, "result", new { keep = sorted[0], delete = deletes, size = savings }, ct);
        }

        await ctx.PushAsync(sec, "done", new { files, results }, ct);
    }
}
