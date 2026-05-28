// Scanning/Rules/VenvsRule.cs
// Finds Python virtual environments (venv, .venv, env, .env directories
// that contain a pyvenv.cfg marker file).

using DiskCleanup.Services;

namespace DiskCleanup.Scanning.Rules;

public sealed class VenvsRule : IScanRule
{
    public string Section => "venvs";

    private static readonly HashSet<string> _venvNames =
        new(StringComparer.OrdinalIgnoreCase) { "venv", ".venv", "env", ".env" };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "venvs";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long results = 0;

        foreach (var root in FileEnumerator.AllRoots(ctx.Config))
        {
            var venvDirs = FileEnumerator.EnumerateDirsSafe(root)
                .Where(d =>
                    _venvNames.Contains(Path.GetFileName(d))
                    && File.Exists(Path.Combine(d, "pyvenv.cfg"))
                    && !ctx.KeepSet.Contains(d))
                .ToList();

            await Parallel.ForEachAsync(venvDirs,
                new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
                async (dp, token) =>
                {
                    var size = await FileUtilities.DirSizeAsync(dp, token);
                    Interlocked.Increment(ref results);
                    await ctx.PushAsync(sec, "result", new
                    {
                        path    = dp,
                        size,
                        project = Path.GetDirectoryName(dp)
                    }, token);
                });
        }

        await ctx.PushAsync(sec, "done", new { results }, ct);
    }
}
