// Scanning/Rules/DevCacheRule.cs
// Finds known developer tool cache directories that are safe to delete.
// These are always regenerated automatically by the owning tool.
//
// Covered patterns (folder name, any depth):
//   .vscode-test-web  — @vscode/test-web downloads (VS Code web extension tests)
//   .vscode-test      — @vscode/test-electron downloads (VS Code desktop extension tests)
//   .playwright       — Playwright browser downloads
//   __pycache__       — Python bytecode cache
//   .pytest_cache     — Pytest cache
//   .mypy_cache       — Mypy type-check cache
//   .ruff_cache       — Ruff linter cache
//   .tox              — Tox Python test environments
//   .gradle           — Gradle build cache
//   .m2               — Maven local repository (careful — can be large but used across projects)
//   .nx               — Nx monorepo cache

using System.Collections.Concurrent;
using DiskCleanup.Services;

namespace DiskCleanup.Scanning.Rules;

public sealed class DevCacheRule : IScanRule
{
    public string Section => "dev-cache";

    // Folder names (case-insensitive) that are always safe to delete
    private static readonly HashSet<string> _cacheNames = new(StringComparer.OrdinalIgnoreCase)
    {
        ".vscode-test-web",
        ".vscode-test",
        ".playwright",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        ".ruff_cache",
        ".tox",
        ".nx",
    };

    // Skip scanning inside these — they contain caches legitimately
    private static readonly HashSet<string> _skipParents = new(StringComparer.OrdinalIgnoreCase)
    {
        "node_modules", ".git",
    };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "dev-cache";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long results = 0;

        foreach (var root in FileEnumerator.AllRoots(ctx.Config))
        {
            var found = new ConcurrentBag<(string path, long size)>();

            var cacheDirs = FileEnumerator.EnumerateDirsSafe(root, new ConcurrentBag<string>())
                .Where(d =>
                {
                    var name = Path.GetFileName(d);
                    if (!_cacheNames.Contains(name)) return false;
                    // Skip if any ancestor is in the skip list
                    var parent = Path.GetDirectoryName(d) ?? string.Empty;
                    while (!string.IsNullOrEmpty(parent))
                    {
                        if (_skipParents.Contains(Path.GetFileName(parent))) return false;
                        parent = Path.GetDirectoryName(parent) ?? string.Empty;
                    }
                    return !ctx.KeepSet.Contains(d);
                })
                .ToList();

            await Parallel.ForEachAsync(cacheDirs,
                new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
                async (dp, token) =>
                {
                    var size = await FileUtilities.DirSizeAsync(dp, token);
                    Interlocked.Increment(ref results);
                    var folderName = Path.GetFileName(dp);
                    await ctx.PushAsync(sec, "result", new { path = dp, size, folderName }, token);
                    ctx.PushProgress(sec, new { results });
                });
        }

        await ctx.PushAsync(sec, "done", new { results }, ct);
    }
}
