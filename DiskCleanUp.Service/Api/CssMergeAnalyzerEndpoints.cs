using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class CssMergeAnalyzerEndpoints
{
    private static readonly Regex SelectorRegex =
        new(@"^\s*([^{@/][^{]*)\s*\{", RegexOptions.Multiline | RegexOptions.Compiled);
    private static readonly Regex CssLinkRegex =
        new(@"href\s*=\s*[""']([^""']+\.css)[""']", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex JsImportRegex =
        new(@"(import|require)\s*\(?[""']([^""']+\.css)[""']\)?", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static void MapCssMergeAnalyzerEndpoints(this WebApplication app)
    {
        app.MapPost("/api/css/merge-analyze", async ([FromBody] CssMergeAnalyzeRequest req) =>
            await AnalyzeAsync(req.Paths, req.FolderScope));
    }

    private static async Task<IResult> AnalyzeAsync(string[]? rawPaths, string? folderScope)
    {
        var paths = rawPaths?
            .Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray() ?? [];

        if (paths.Length == 0)
            return Results.BadRequest(new { error = "No valid CSS paths provided" });

        // Apply folder scope filter
        if (!string.IsNullOrWhiteSpace(folderScope))
        {
            var scopeNorm = folderScope.TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar)
                                       .ToLowerInvariant();
            paths = paths.Where(p =>
            {
                var dir = (Path.GetDirectoryName(p) ?? string.Empty).ToLowerInvariant();
                return dir == scopeNorm || dir.StartsWith(scopeNorm + Path.DirectorySeparatorChar);
            }).ToArray();

            if (paths.Length == 0)
                return Results.BadRequest(new { error = "No CSS files match the specified folder scope" });
        }

        // Parse each file
        var fileInfos = new List<CssFileInfo>();
        foreach (var p in paths)
        {
            try
            {
                var text = await File.ReadAllTextAsync(p);
                var selectors = SelectorRegex.Matches(text)
                    .Select(m => m.Groups[1].Value.Trim())
                    .Where(s => s.Length > 0 && !s.StartsWith("//"))
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                fileInfos.Add(new CssFileInfo(p, selectors, text.Length));
            }
            catch (Exception ex)
            {
                fileInfos.Add(new CssFileInfo(p, [], 0) { Error = ex.Message });
            }
        }

        // Group by folder
        var byFolder = fileInfos
            .Where(f => f.Error is null)
            .GroupBy(f => Path.GetDirectoryName(f.Path) ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Detect selector conflicts within each folder group
        var groups = new List<object>();
        foreach (var folder in byFolder)
        {
            var files = folder.ToList();
            if (files.Count < 2) continue; // nothing to merge

            var allSelectors = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);
            foreach (var f in files)
            {
                foreach (var sel in f.Selectors)
                {
                    if (!allSelectors.TryGetValue(sel, out var owners))
                        allSelectors[sel] = owners = [];
                    owners.Add(Path.GetFileName(f.Path));
                }
            }

            var conflicts = allSelectors
                .Where(kv => kv.Value.Count > 1)
                .Select(kv => new { selector = kv.Key, files = kv.Value })
                .ToList();

            var risk = conflicts.Count == 0 ? "low" : conflicts.Count <= 5 ? "medium" : "high";

            groups.Add(new
            {
                folder = folder.Key,
                files = files.Select(f => new { f.Path, selectorCount = f.Selectors.Count, sizeChars = f.SizeChars }),
                conflictCount = conflicts.Count,
                conflicts = conflicts.Take(20),
                risk,
                mergedName = Path.Combine(folder.Key, "merged.css"),
            });
        }

        // Find HTML/JS refs for each CSS file
        var cssFileName = paths.Select(Path.GetFileName).Where(n => n != null).ToHashSet(StringComparer.OrdinalIgnoreCase);
        var refs = await FindReferencingFilesAsync(paths);

        var errorFiles = fileInfos.Where(f => f.Error != null)
            .Select(f => new { f.Path, f.Error })
            .ToList();

        return Results.Ok(new
        {
            ok = true,
            analyzedCount = paths.Length,
            mergeGroups = groups,
            refs,
            errorFiles,
            scopeApplied = folderScope,
        });
    }

    private static async Task<List<object>> FindReferencingFilesAsync(string[] cssPaths)
    {
        // Search the union of all parent directories up to 3 levels up for HTML/JS files
        var searchRoots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in cssPaths)
        {
            var dir = Path.GetDirectoryName(p) ?? string.Empty;
            for (var i = 0; i < 4; i++)
            {
                if (string.IsNullOrEmpty(dir)) break;
                searchRoots.Add(dir);
                dir = Path.GetDirectoryName(dir) ?? string.Empty;
            }
        }

        var cssNames = cssPaths.ToDictionary(
            p => Path.GetFileName(p)!,
            p => p,
            StringComparer.OrdinalIgnoreCase);

        var result = new Dictionary<string, List<string>>(StringComparer.OrdinalIgnoreCase);

        foreach (var root in searchRoots)
        {
            if (!Directory.Exists(root)) continue;
            IEnumerable<string> candidates;
            try { candidates = Directory.EnumerateFiles(root, "*.*", SearchOption.TopDirectoryOnly); }
            catch { continue; }

            foreach (var file in candidates)
            {
                var ext = Path.GetExtension(file).ToLowerInvariant();
                if (ext is not (".html" or ".htm" or ".js" or ".ts" or ".jsx" or ".tsx")) continue;

                string text;
                try { text = await File.ReadAllTextAsync(file); }
                catch { continue; }

                foreach (var (cssName, cssPath) in cssNames)
                {
                    var matchesLink = CssLinkRegex.IsMatch(text) &&
                        CssLinkRegex.Matches(text).Any(m => m.Groups[1].Value.Contains(cssName, StringComparison.OrdinalIgnoreCase));
                    var matchesImport = JsImportRegex.IsMatch(text) &&
                        JsImportRegex.Matches(text).Any(m => m.Groups[2].Value.Contains(cssName, StringComparison.OrdinalIgnoreCase));

                    if (matchesLink || matchesImport)
                    {
                        if (!result.TryGetValue(cssPath, out var refList))
                            result[cssPath] = refList = [];
                        refList.Add(file);
                    }
                }
            }
        }

        return result.Select(kv => (object)new { cssFile = kv.Key, referencedBy = kv.Value }).ToList();
    }

    private sealed class CssFileInfo(string path, List<string> selectors, int sizeChars)
    {
        public string Path { get; } = path;
        public List<string> Selectors { get; } = selectors;
        public int SizeChars { get; } = sizeChars;
        public string? Error { get; set; }
    }
}

public sealed record CssMergeAnalyzeRequest(string[]? Paths, string? FolderScope);
