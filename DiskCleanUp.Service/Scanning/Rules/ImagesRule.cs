// Scanning/Rules/ImagesRule.cs
// Finds near-duplicate images via perceptual hash (aHash) + Hamming distance.
//
// Algorithm:
//   Phase 1 (parallel): compute 64-bit aHash per image via ctx.PHashAsync.
//   Phase 2 (sequential): O(n²) union-find — merge any two images whose
//              Hamming distance is <= SimilarityBits (default: 10/64 ≈ 15%).
//   Phase 3: emit one "result" per group of >= 2 similar images.
//
// Detects: resized, re-compressed, cropped, slightly edited near-duplicates.
// Exact byte-duplicates are always caught (distance = 0).

using System.Collections.Concurrent;
using System.Numerics;

namespace DiskCleanup.Scanning.Rules;

public sealed class ImagesRule : IScanRule
{
    public string Section => "images";

    /// Hamming distance threshold: images differing in <= 10 of 64 bits are "similar".
    private const int SimilarityBits = 10;

    private static readonly HashSet<string> _imageExts = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "images";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);

        // ── Phase 1: compute pHash for every image (parallel) ─────────────
        var bag    = new ConcurrentBag<(string Path, ulong Hash)>();
        long scanned = 0;

        await Parallel.ForEachAsync(
            FileEnumerator.FilteredFiles(ctx)
                          .Where(f => _imageExts.Contains(Path.GetExtension(f))),
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                var h = await ctx.PHashAsync(fp, token);
                if (h == 0UL) return; // unreadable or unsupported
                bag.Add((fp, h));
                ctx.PushProgress(sec, new { files = Interlocked.Increment(ref scanned) });
            });

        // ── Phase 2: union-find grouping by Hamming distance ──────────────
        var list = bag.ToArray();
        int n    = list.Length;
        var parent = new int[n];
        for (int i = 0; i < n; i++) parent[i] = i;

        int Find(int i)
        {
            while (parent[i] != i) { parent[i] = parent[parent[i]]; i = parent[i]; }
            return i;
        }

        for (int i = 0; i < n; i++)
        {
            ct.ThrowIfCancellationRequested();
            for (int j = i + 1; j < n; j++)
            {
                if (BitOperations.PopCount(list[i].Hash ^ list[j].Hash) <= SimilarityBits)
                {
                    int ri = Find(i), rj = Find(j);
                    if (ri != rj) parent[ri] = rj;
                }
            }
        }

        // ── Phase 3: emit one result per group of >= 2 ───────────────────
        var groups = new Dictionary<int, List<string>>();
        for (int i = 0; i < n; i++)
        {
            var root = Find(i);
            if (!groups.TryGetValue(root, out var g)) groups[root] = g = [];
            g.Add(list[i].Path);
        }

        int results = 0;
        foreach (var (root, files) in groups.Where(g => g.Value.Count >= 2))
        {
            results++;
            var hash = list[root].Hash.ToString("x16");
            await ctx.PushAsync(sec, "result", new { hash, files }, ct);
        }

        await ctx.PushAsync(sec, "done", new { files = scanned, results }, ct);
    }
}
