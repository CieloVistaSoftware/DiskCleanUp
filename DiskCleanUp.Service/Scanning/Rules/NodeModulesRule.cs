// Scanning/Rules/NodeModulesRule.cs
// Finds node_modules directories. Also surfaces runaway (recursive) folders
// as actionable delete targets.

using System.Collections.Concurrent;
using DiskCleanup.Services;

namespace DiskCleanup.Scanning.Rules;

public sealed class NodeModulesRule : IScanRule
{
    public string Section => "node-modules";

    private static readonly EnumerationOptions _shallowOpts =
        new() { RecurseSubdirectories = false, IgnoreInaccessible = true };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "node-modules";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long results = 0;

        foreach (var root in FileEnumerator.AllRoots(ctx.Config))
        {
            var runaways = new ConcurrentBag<string>();

            var nmDirs = FileEnumerator.EnumerateDirsSafe(root, runaways)
                .Where(d =>
                    Path.GetFileName(d).Equals("node_modules", StringComparison.OrdinalIgnoreCase)
                    && !FileUtilities.IsNodeModules(Path.GetDirectoryName(d) ?? string.Empty)
                    && !ctx.KeepSet.Contains(d))
                .ToList();

            // Surface runaway folders as actionable results
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var rp in runaways)
            {
                if (!seen.Add(rp)) continue;
                Interlocked.Increment(ref results);
                long rpSize = 0;
                try { rpSize = new DirectoryInfo(rp).EnumerateFiles("*", _shallowOpts).Sum(f => f.Length); }
                catch { }
                await ctx.PushAsync(sec, "result", new { path = rp, size = rpSize, runaway = true }, ct);
            }

            await Parallel.ForEachAsync(nmDirs,
                new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
                async (dp, token) =>
                {
                    var size = await FileUtilities.DirSizeAsync(dp, token);
                    Interlocked.Increment(ref results);
                    await ctx.PushAsync(sec, "result",   new { path = dp, size }, token);
                    ctx.PushProgress(sec, new { results });
                });
        }

        await ctx.PushAsync(sec, "done", new { results }, ct);
    }
}
