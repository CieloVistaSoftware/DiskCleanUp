using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class CssMergeAnalyzerEndpoints
{
    private static readonly Regex SelectorRegex =
        new(@"^\s*([^{@/][^{]*)\s*\{", RegexOptions.Multiline | RegexOptions.Compiled);
    private static readonly Regex PropertyRegex =
        new(@"^\s*([\w-]+)\s*:", RegexOptions.Multiline | RegexOptions.Compiled);
    private static readonly Regex AtImportRegex =
        new(@"^\s*@import\b", RegexOptions.Multiline | RegexOptions.Compiled);
    private static readonly Regex CssLinkRegex =
        new(@"href\s*=\s*[""']([^""']+\.css)[""']", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex JsImportRegex =
        new(@"(import|require)\s*\(?[""']([^""']+\.css)[""']\)?", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static void MapCssMergeAnalyzerEndpoints(this WebApplication app)
    {
        app.MapPost("/api/css/merge-analyze", async ([FromBody] CssMergeAnalyzeRequest req) =>
            await AnalyzeAsync(req.Paths, req.FolderScope, req.ExcludePatterns));

        app.MapPost("/api/css/merge-execute", async ([FromBody] CssMergeExecuteRequest req) =>
            await ExecuteMergeAsync(req.Groups));

        app.MapPost("/api/css/merge-preview", async ([FromBody] MergeGroupRequest req) =>
            await PreviewMergeAsync(req));

        app.MapPost("/api/css/merge-dry-run", async ([FromBody] MergeGroupRequest req) =>
            await DryRunMergeAsync(req));

        app.MapPost("/api/css/merge-restore", async ([FromBody] MergeRestoreRequest req) =>
            await RestoreMergeAsync(req.MergedName, req.SourcePaths));

        app.MapPost("/api/css/merge-dry-run/discard", ([FromBody] MergeDryRunDiscardRequest req) =>
        {
            try { if (File.Exists(req.Path) && req.Path.Contains("PREVIEW")) File.Delete(req.Path); }
            catch { /* best effort */ }
            return Results.Ok(new { ok = true });
        });
    }

    private static bool _IsExcluded(string filePath, List<string> patterns)
    {
        if (patterns.Count == 0) return false;
        var parts = filePath.Split(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        return patterns.Any(pat =>
            parts.Any(seg => seg.Equals(pat, StringComparison.OrdinalIgnoreCase)
                          || seg.StartsWith(pat, StringComparison.OrdinalIgnoreCase)));
    }

    private static async Task<IResult> PreviewMergeAsync(MergeGroupRequest group)
    {
        var filePaths = group.Files?
            .Select(f => f.Path)
            .Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p))
            .ToList() ?? [];

        if (filePaths.Count == 0)
            return Results.BadRequest(new { error = "No valid files" });

        var sections = new List<CssPreviewSection>();
        int totalBytes = 0;
        foreach (var fp in filePaths)
        {
            var content = await File.ReadAllTextAsync(fp);
            totalBytes += content.Length;
            sections.Add(new CssPreviewSection(
                Path.GetFileName(fp),
                fp,
                content.Length,
                content.TrimEnd().Split('\n').Select(l => l.TrimEnd('\r')).ToList()));
        }
        return Results.Ok(new { sections, sourceBytes = totalBytes, mergedBytes = totalBytes });
    }

    private static async Task<IResult> DryRunMergeAsync(MergeGroupRequest group)
    {
        var filePaths = group.Files?
            .Select(f => f.Path)
            .Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p))
            .ToList() ?? [];

        if (filePaths.Count == 0)
            return Results.BadRequest(new { error = "No valid files" });

        var folder = Path.GetDirectoryName(filePaths[0]) ?? string.Empty;
        var dryRunPath = Path.Combine(folder, "merged.PREVIEW.css");

        var parts = new List<string>();
        int totalBytes = 0;
        foreach (var fp in filePaths)
        {
            var content = await File.ReadAllTextAsync(fp);
            totalBytes += content.Length;
            parts.Add($"/* === {Path.GetFileName(fp)} ({content.Length / 1024.0:F1} KB) === */\n{content.TrimEnd()}");
        }
        var merged = string.Join("\n\n", parts);

        await File.WriteAllTextAsync(dryRunPath, $"/* DRY RUN — DELETE THIS FILE — originals NOT modified */\n\n{merged}");

        return Results.Ok(new { ok = true, dryRunPath, sourceBytes = totalBytes, mergedBytes = merged.Length });
    }

    private static Task<IResult> RestoreMergeAsync(string? mergedName, List<string>? sourcePaths)
    {
        if (string.IsNullOrWhiteSpace(mergedName))
            return Task.FromResult(Results.BadRequest(new { error = "mergedName required" }));

        var restored = new List<string>();
        var errors   = new List<string>();

        foreach (var src in sourcePaths ?? [])
        {
            var bak = src + ".bak";
            try
            {
                if (File.Exists(bak))
                {
                    File.Copy(bak, src, overwrite: true);
                    File.Delete(bak);
                    restored.Add(src);
                }
            }
            catch (Exception ex) { errors.Add($"{src}: {ex.Message}"); }
        }

        try { if (File.Exists(mergedName)) File.Delete(mergedName); }
        catch (Exception ex) { errors.Add($"delete merged: {ex.Message}"); }

        return Task.FromResult(Results.Ok(new { ok = true, restored = restored.Count, errors }));
    }

    private static async Task<IResult> ExecuteMergeAsync(List<MergeGroupRequest>? groups)
    {
        if (groups is null || groups.Count == 0)
            return Results.BadRequest(new { error = "No groups provided" });

        int merged = 0;
        var errors = new List<string>();

        foreach (var group in groups)
        {
            var filePaths = group.Files?
                .Select(f => f.Path)
                .Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p))
                .ToList() ?? [];

            if (filePaths.Count < 2) continue;

            var mergedName = group.MergedName;
            if (string.IsNullOrWhiteSpace(mergedName))
                mergedName = Path.Combine(Path.GetDirectoryName(filePaths[0]) ?? "", "merged.css");

            try
            {
                var parts = new List<string>();
                foreach (var fp in filePaths)
                {
                    var content = await File.ReadAllTextAsync(fp);
                    parts.Add($"/* === {Path.GetFileName(fp)} === */\n{content}");
                    // Backup original
                    File.Copy(fp, fp + ".bak", overwrite: true);
                    File.Delete(fp);
                }
                await File.WriteAllTextAsync(mergedName, string.Join("\n\n", parts));
                merged++;
            }
            catch (Exception ex)
            {
                errors.Add($"{group.MergedName}: {ex.Message}");
            }
        }

        return Results.Ok(new { ok = true, merged, errors });
    }

    private static async Task<IResult> AnalyzeAsync(string[]? rawPaths, string? folderScope, List<string>? excludePatterns)
    {
        var exclude = excludePatterns?.Where(p => !string.IsNullOrWhiteSpace(p)).ToList() ?? [];

        var paths = rawPaths?
            .Where(p => !string.IsNullOrWhiteSpace(p) && File.Exists(p))
            .Where(p => !_IsExcluded(p, exclude))
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
                var hasImport = AtImportRegex.IsMatch(text);
                var selectors = SelectorRegex.Matches(text)
                    .Select(m => m.Groups[1].Value.Trim())
                    .Where(s => s.Length > 0 && !s.StartsWith("//")
                             && !s.Equals(":root", StringComparison.OrdinalIgnoreCase)
                             && s != "*")
                    .Distinct(StringComparer.OrdinalIgnoreCase)
                    .ToList();
                // Map selector -> set of properties defined under it
                var selectorProps = _ParseSelectorProperties(text);
                fileInfos.Add(new CssFileInfo(p, selectors, text.Length, selectorProps, hasImport));
            }
            catch (Exception ex)
            {
                fileInfos.Add(new CssFileInfo(p, [], 0, [], false) { Error = ex.Message });
            }
        }

        // Group by folder
        var byFolder = fileInfos
            .Where(f => f.Error is null)
            .GroupBy(f => Path.GetDirectoryName(f.Path) ?? string.Empty, StringComparer.OrdinalIgnoreCase)
            .ToList();

        // Detect conflicts within each folder group
        var groups = new List<object>();
        foreach (var folder in byFolder)
        {
            var files = folder.ToList();
            if (files.Count < 2) continue;

            // @import in any source file makes order-dependent — block merge
            var blocked = files.Any(f => f.HasImport);

            // Property-level conflict: same selector + same property in two different files
            var conflicts = new List<object>();
            if (!blocked)
            {
                // selector -> { property -> filename }
                var seen = new Dictionary<string, Dictionary<string, string>>(StringComparer.OrdinalIgnoreCase);
                foreach (var f in files)
                {
                    var fname = Path.GetFileName(f.Path);
                    foreach (var (sel, props) in f.SelectorProps)
                    {
                        if (!seen.TryGetValue(sel, out var propOwners))
                            seen[sel] = propOwners = new(StringComparer.OrdinalIgnoreCase);
                        foreach (var prop in props)
                        {
                            if (propOwners.TryGetValue(prop, out var owner) && owner != fname)
                                conflicts.Add(new { selector = sel, property = prop, files = new[] { owner, fname } });
                            else
                                propOwners[prop] = fname;
                        }
                    }
                }
            }

            var risk = blocked ? "blocked"
                     : conflicts.Count == 0 ? "low"
                     : conflicts.Count <= 3 ? "medium"
                     : "high";

            groups.Add(new
            {
                folder = folder.Key,
                files = files.Select(f => new { f.Path, selectorCount = f.Selectors.Count, sizeChars = f.SizeChars, f.HasImport }),
                conflictCount = conflicts.Count,
                conflicts = conflicts.Take(20),
                risk,
                blocked,
                mergedName = Path.Combine(folder.Key, "merged.css"),
            });
        }

        // Find HTML/JS refs for each CSS file
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
        // Search each CSS file's own folder and one level up only.
        // Going further crosses project boundaries and produces noisy false positives.
        var searchRoots = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var p in cssPaths)
        {
            var dir = Path.GetDirectoryName(p) ?? string.Empty;
            for (var i = 0; i < 2; i++)   // own dir + one parent only
            {
                if (string.IsNullOrEmpty(dir)) break;
                searchRoots.Add(dir);
                dir = Path.GetDirectoryName(dir) ?? string.Empty;
            }
        }

        var cssNamesLookup = cssPaths.ToLookup(p => Path.GetFileName(p)!, StringComparer.OrdinalIgnoreCase);

        // Use HashSet<string> as the value to deduplicate — the same HTML file
        // can be found from multiple search roots as we walk up the directory tree.
        var result = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);

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

                foreach (var cssGroup in cssNamesLookup)
                {
                    var cssName = cssGroup.Key;
                    var linkMatches   = CssLinkRegex.Matches(text);
                    var importMatches = JsImportRegex.Matches(text);
                    var matchesLink   = linkMatches.Any(m => m.Groups[1].Value.Contains(cssName, StringComparison.OrdinalIgnoreCase));
                    var matchesImport = importMatches.Any(m => m.Groups[2].Value.Contains(cssName, StringComparison.OrdinalIgnoreCase));

                    if (!matchesLink && !matchesImport) continue;

                    foreach (var cssPath in cssGroup)
                    {
                        if (!result.TryGetValue(cssPath, out var refSet))
                            result[cssPath] = refSet = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
                        refSet.Add(file);
                    }
                }
            }
        }

        return result
            .Select(kv => (object)new { cssFile = kv.Key, referencedBy = kv.Value.Order().ToList() })
            .ToList();
    }

    // Parses selector -> set of property names from raw CSS text.
    // Handles nested braces by tracking depth; skips @-rules, :root, and *.
    private static Dictionary<string, HashSet<string>> _ParseSelectorProperties(string text)
    {
        var result = new Dictionary<string, HashSet<string>>(StringComparer.OrdinalIgnoreCase);
        var depth = 0;
        var currentSelector = string.Empty;
        var i = 0;

        while (i < text.Length)
        {
            var c = text[i];
            if (c == '{')
            {
                if (depth == 0)
                {
                    // Capture selector text before this brace
                    var start = text.LastIndexOf('\n', i - 1) + 1;
                    var raw = text[start..i].Trim();
                    // Skip @-rules, :root, *
                    if (!raw.StartsWith('@') && !raw.Equals(":root", StringComparison.OrdinalIgnoreCase) && raw != "*")
                        currentSelector = raw;
                    else
                        currentSelector = string.Empty;
                }
                depth++;
            }
            else if (c == '}')
            {
                depth--;
                if (depth == 0) currentSelector = string.Empty;
            }
            else if (depth == 1 && !string.IsNullOrEmpty(currentSelector))
            {
                // Look for property: value lines
                var lineEnd = text.IndexOf('\n', i);
                if (lineEnd < 0) lineEnd = text.Length;
                var line = text[i..lineEnd].Trim();
                var colon = line.IndexOf(':');
                if (colon > 0)
                {
                    var prop = line[..colon].Trim();
                    if (prop.Length > 0 && prop.All(ch => char.IsLetterOrDigit(ch) || ch == '-'))
                    {
                        if (!result.TryGetValue(currentSelector, out var props))
                            result[currentSelector] = props = new(StringComparer.OrdinalIgnoreCase);
                        props.Add(prop);
                    }
                }
                i = lineEnd;
                continue;
            }
            i++;
        }
        return result;
    }

    private sealed class CssFileInfo(string path, List<string> selectors, int sizeChars,
        Dictionary<string, HashSet<string>> selectorProps, bool hasImport)
    {
        public string Path { get; } = path;
        public List<string> Selectors { get; } = selectors;
        public int SizeChars { get; } = sizeChars;
        public Dictionary<string, HashSet<string>> SelectorProps { get; } = selectorProps;
        public bool HasImport { get; } = hasImport;
        public string? Error { get; set; }
    }
}

public sealed record CssMergeAnalyzeRequest(string[]? Paths, string? FolderScope, List<string>? ExcludePatterns);
public sealed record CssMergeExecuteRequest(List<MergeGroupRequest>? Groups);
public sealed record MergeGroupRequest(string? MergedName, List<MergeFileRef>? Files);
public sealed record MergeFileRef(string Path);
public sealed record MergeRestoreRequest(string? MergedName, List<string>? SourcePaths);
public sealed record MergeDryRunDiscardRequest(string Path);
public sealed record CssPreviewSection(string FileName, string FullPath, int SizeChars, List<string> Lines);
