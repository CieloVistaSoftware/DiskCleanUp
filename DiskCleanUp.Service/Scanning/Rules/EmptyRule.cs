// Scanning/Rules/EmptyRule.cs
// Finds empty directories (no files or sub-directories).
// Scanned deepest-first so inner empties are found before outer ones.

using DiskCleanup.Services;

namespace DiskCleanup.Scanning.Rules;

public sealed class EmptyRule : IScanRule
{
    public string Section => "empty";

    private static readonly EnumerationOptions _shallowOpts =
        new() { RecurseSubdirectories = false, IgnoreInaccessible = true };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "empty";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long scanned = 0, results = 0;

        foreach (var root in FileEnumerator.AllRoots(ctx.Config))
        {
            // Deepest-first so inner empties are found before outer
            var allDirs = FileEnumerator.EnumerateDirsSafe(root)
                .Where(d => !FileUtilities.IsTrash(d) && !ctx.KeepSet.Contains(d))
                .OrderByDescending(d => d.Length)
                .ToList();

            foreach (var dp in allDirs)
            {
                ct.ThrowIfCancellationRequested();
                Interlocked.Increment(ref scanned);
                try
                {
                    if (!Directory.EnumerateFileSystemEntries(dp).Any())
                    {
                        Interlocked.Increment(ref results);
                        await ctx.PushAsync(sec, "result", new { path = dp }, ct);
                    }
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    // access denied or path too long — skip
                }
            }
        }

        await ctx.PushAsync(sec, "done", new { scanned, results }, ct);
    }
}
