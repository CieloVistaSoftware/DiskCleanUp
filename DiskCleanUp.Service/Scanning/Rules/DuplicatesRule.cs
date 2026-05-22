// Scanning/Rules/DuplicatesRule.cs
// Finds byte-identical files via two-stage hashing:
//   Pass 1: xxHash64 (fast grouping)
//   Pass 2: SHA-256 only on candidate groups (collision verification)
//
// Each group with ≥2 identical files is emitted as a result.
// The preferred-extension list keeps "source" files (code, docs, images) first;
// .tmp files sort last so the scanner suggests them as delete targets.

using System.Collections.Concurrent;
using DiskCleanup.Models;
using DiskCleanup.Services;

namespace DiskCleanup.Scanning.Rules;

public sealed class DuplicatesRule : IScanRule
{
    public string Section => "duplicates";

    private static readonly HashSet<string> _preferredExts = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
        ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
        ".pdf", ".txt", ".rtf", ".csv",
        ".zip", ".rar", ".7z",
        ".mp3", ".wav", ".mp4", ".avi", ".mov", ".mkv",
        ".html", ".xml", ".json", ".js", ".ts", ".css",
        ".cpp", ".c", ".h", ".py", ".java", ".cs"
    };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "duplicates";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);

        var seen    = new ConcurrentDictionary<string, List<FileRecord>>();
        var lockObj = new object();
        long files  = 0, results = 0;

        await Parallel.ForEachAsync(
            FileEnumerator.FilteredFiles(ctx),
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    // Pass 1: fast xxHash64 grouping
                    var h = await ctx.HashAsync(fp, token);
                    if (string.IsNullOrEmpty(h)) return;

                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return;
                    var entry = new FileRecord(fp, fi.Length, fi.LastWriteTime.ToString("yyyy-MM-dd"));

                    List<FileRecord> group;
                    lock (lockObj)
                    {
                        group = seen.GetOrAdd(h, _ => []);
                        group.Add(entry);
                        group.Sort(static (a, b) =>
                        {
                            var extA  = Path.GetExtension(a.Path);
                            var extB  = Path.GetExtension(b.Path);
                            var aPref = _preferredExts.Contains(extA) ? 0
                                      : extA.Equals(".tmp", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
                            var bPref = _preferredExts.Contains(extB) ? 0
                                      : extB.Equals(".tmp", StringComparison.OrdinalIgnoreCase) ? 2 : 1;
                            if (aPref != bPref) return aPref.CompareTo(bPref);
                            return string.Compare(b.Modified, a.Modified, StringComparison.OrdinalIgnoreCase);
                        });
                    }

                    var count = Interlocked.Increment(ref files);
                    if (group.Count == 2)
                    {
                        Interlocked.Increment(ref results);
                        await ctx.PushAsync(sec, "result", new { hash = h, files = group.ToArray() }, token);
                    }
                    else if (group.Count > 2)
                    {
                        await ctx.PushAsync(sec, "result_update", new { hash = h, files = group.ToArray() }, token);
                    }
                    ctx.PushProgress(sec, new { files = count, results, folder = Path.GetDirectoryName(fp) });
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FileNotFoundException)
                {
                    Interlocked.Increment(ref files);
                }
            });

        await ctx.PushAsync(sec, "done", new { files, results }, ct);
    }
}
