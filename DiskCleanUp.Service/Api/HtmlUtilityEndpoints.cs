using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using DiskCleanup.Models;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class HtmlUtilityEndpoints
{
    private static readonly Regex SvgRegex = new("<svg\\b[\\s\\S]*?</svg>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex StyleBlockRegex = new("<style\\b[^>]*>([\\s\\S]*?)</style>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ScriptBlockRegex = new("<script\\b(?![^>]*\\bsrc=)[^>]*>([\\s\\S]*?)</script>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex InlineStyleRegex = new("style\\s*=\\s*(\"([^\"]*)\"|'([^']*)')", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ImgDataUriRegex = new("src\\s*=\\s*(\"data:image/([a-zA-Z0-9+.-]+);base64,([^\"]+)\"|'data:image/([a-zA-Z0-9+.-]+);base64,([^']+)')", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex HrefSrcRegex = new("(href|src)\\s*=\\s*(\"([^\"]+)\"|'([^']+)')", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex ImgTagRegex = new("<img\\b[^>]*>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex SymbolRegex = new("<symbol\\b[\\s\\S]*?</symbol>", RegexOptions.IgnoreCase | RegexOptions.Compiled);
    private static readonly Regex DefsRegex = new("<defs\\b[\\s\\S]*?</defs>", RegexOptions.IgnoreCase | RegexOptions.Compiled);

    public static void MapHtmlUtilityEndpoints(this WebApplication app)
    {
        app.MapPost("/api/html/utility", async ([FromBody] HtmlUtilityRequest req) =>
            await HandleUtilityRequestAsync(req.Paths, req.Utility));

        // Backward-compatible alias for older callers.
        app.MapPost("/api/svg/extract", async ([FromBody] PathsRequest req) =>
            await HandleUtilityRequestAsync(req.Paths, "extract-svg"));
    }

    private static async Task<IResult> HandleUtilityRequestAsync(string[]? rawPaths, string utility)
    {
        var utilityKey = (utility ?? string.Empty).Trim().ToLowerInvariant();
        var paths = rawPaths?.Where(static p => !string.IsNullOrWhiteSpace(p)).Distinct(StringComparer.OrdinalIgnoreCase).ToArray() ?? [];
        if (paths.Length == 0) return Results.BadRequest(new { error = "No HTML paths provided" });
        if (string.IsNullOrWhiteSpace(utilityKey)) return Results.BadRequest(new { error = "No utility provided" });

        var files = new List<object>();
        var okCount = 0;
        var errorCount = 0;

        foreach (var path in paths)
        {
            if (!File.Exists(path))
            {
                errorCount++;
                files.Add(new { source = path, outputs = Array.Empty<string>(), error = "Not found" });
                continue;
            }

            var ext = Path.GetExtension(path);
            if (!ext.Equals(".html", StringComparison.OrdinalIgnoreCase) && !ext.Equals(".htm", StringComparison.OrdinalIgnoreCase))
            {
                errorCount++;
                files.Add(new { source = path, outputs = Array.Empty<string>(), error = "Not an HTML file" });
                continue;
            }

            try
            {
                var outputs = await RunUtilityAsync(path, utilityKey);
                okCount++;
                files.Add(new { source = path, outputs, error = (string?)null });
            }
            catch (Exception ex)
            {
                errorCount++;
                files.Add(new { source = path, outputs = Array.Empty<string>(), error = ex.Message });
            }
        }

        return Results.Ok(new
        {
            ok = true,
            utility = utilityKey,
            processed = paths.Length,
            okCount,
            errorCount,
            files
        });
    }

    private static async Task<List<string>> RunUtilityAsync(string htmlPath, string utility)
    {
        return utility switch
        {
            "extract-svg" => await ExtractSvgAsync(htmlPath),
            "extract-css" => await ExtractCssAsync(htmlPath),
            "extract-js" => await ExtractJsAsync(htmlPath),
            "inline-asset-report" => await InlineAssetReportAsync(htmlPath),
            "convert-data-uri-images" => await ConvertDataUriImagesAsync(htmlPath),
            "remove-dead-tags" => await RemoveDeadTagsAsync(htmlPath),
            "normalize-paths" => await NormalizePathsAsync(htmlPath),
            "find-broken-links" => await FindBrokenLinksAsync(htmlPath),
            "a11y-quick-fix" => await A11yQuickFixAsync(htmlPath),
            "format-html" => await FormatHtmlAsync(htmlPath),
            "split-multi-svg" => await SplitMultiSvgAsync(htmlPath),
            "extract-icons-symbols" => await ExtractIconsSymbolsAsync(htmlPath),
            "fingerprint-diff" => await FingerprintDiffAsync(htmlPath),
            _ => throw new InvalidOperationException($"Unsupported utility: {utility}")
        };
    }

    private static async Task<List<string>> ExtractSvgAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var matches = SvgRegex.Matches(html);
        var sourceDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var outputDir = ResolveOutputDir(sourceDir, "SVG");
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var outputs = new List<string>();

        for (var i = 0; i < matches.Count; i++)
        {
            var outPath = Path.Combine(outputDir, $"{baseName}-svg-{i + 1:000}.svg");
            await WriteTextAsync(outPath, matches[i].Value.Trim() + "\n");
            outputs.Add(outPath);
        }

        return outputs;
    }

    private static async Task<List<string>> ExtractCssAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var outputDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var outputs = new List<string>();

        var cssBlocks = StyleBlockRegex.Matches(html).Select(m => m.Groups[1].Value.Trim()).Where(s => s.Length > 0).ToList();
        if (cssBlocks.Count > 0)
        {
            var cssPath = Path.Combine(outputDir, $"{baseName}.styles.css");
            await WriteTextAsync(cssPath, string.Join("\n\n", cssBlocks) + "\n");
            outputs.Add(cssPath);
        }

        var inline = InlineStyleRegex.Matches(html)
            .Select(m => m.Groups[2].Success ? m.Groups[2].Value : m.Groups[3].Value)
            .Where(s => !string.IsNullOrWhiteSpace(s))
            .Select((s, i) => $"/* inline-style-{i + 1} */\n.inline-style-{i + 1} {{ {s.Trim()} }}")
            .ToList();
        if (inline.Count > 0)
        {
            var inlinePath = Path.Combine(outputDir, $"{baseName}.inline-styles.css");
            await WriteTextAsync(inlinePath, string.Join("\n\n", inline) + "\n");
            outputs.Add(inlinePath);
        }

        return outputs;
    }

    private static async Task<List<string>> ExtractJsAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var scripts = ScriptBlockRegex.Matches(html).Select(m => m.Groups[1].Value.Trim()).Where(s => s.Length > 0).ToList();
        var outputDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var outputs = new List<string>();

        for (var i = 0; i < scripts.Count; i++)
        {
            var jsPath = Path.Combine(outputDir, $"{baseName}.inline-script-{i + 1:000}.js");
            await WriteTextAsync(jsPath, scripts[i] + "\n");
            outputs.Add(jsPath);
        }

        return outputs;
    }

    private static async Task<List<string>> InlineAssetReportAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var outputDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var reportPath = Path.Combine(outputDir, $"{baseName}.inline-assets-report.md");

        var svgCount = SvgRegex.Matches(html).Count;
        var styleCount = StyleBlockRegex.Matches(html).Count;
        var scriptCount = ScriptBlockRegex.Matches(html).Count;
        var dataUriCount = ImgDataUriRegex.Matches(html).Count;
        var hrefSrcCount = HrefSrcRegex.Matches(html).Count;

        var report = new StringBuilder();
        report.AppendLine("# Inline Asset Report");
        report.AppendLine();
        report.AppendLine($"- File: `{htmlPath}`");
        report.AppendLine($"- SVG blocks: {svgCount}");
        report.AppendLine($"- STYLE blocks: {styleCount}");
        report.AppendLine($"- Inline SCRIPT blocks: {scriptCount}");
        report.AppendLine($"- Data URI images: {dataUriCount}");
        report.AppendLine($"- href/src attributes: {hrefSrcCount}");
        report.AppendLine($"- HTML size (chars): {html.Length}");

        await WriteTextAsync(reportPath, report.ToString());
        return [reportPath];
    }

    private static async Task<List<string>> ConvertDataUriImagesAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var sourceDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var outputDir = ResolveOutputDir(sourceDir, "SVG");
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var outputs = new List<string>();
        var n = 0;

        var converted = ImgDataUriRegex.Replace(html, m =>
        {
            var mime = m.Groups[2].Success ? m.Groups[2].Value : m.Groups[4].Value;
            var b64 = m.Groups[3].Success ? m.Groups[3].Value : m.Groups[5].Value;
            var ext = MimeToExt(mime);
            var name = $"{baseName}-dataimg-{++n:000}.{ext}";
            var outPath = Path.Combine(outputDir, name);
            try
            {
                var bytes = Convert.FromBase64String(b64);
                WriteBytes(outPath, bytes);
                outputs.Add(outPath);
            }
            catch
            {
                return m.Value;
            }
            return $"src=\"{name}\"";
        });

        var htmlOut = Path.Combine(sourceDir, $"{baseName}.data-uri-converted.html");
        await WriteTextAsync(htmlOut, converted);
        outputs.Add(htmlOut);
        return outputs;
    }

    private static async Task<List<string>> RemoveDeadTagsAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var deadTag = new Regex("<(span|div|p)\\b[^>]*>\\s*</\\1>", RegexOptions.IgnoreCase);
        string cleaned;
        do
        {
            cleaned = deadTag.Replace(html, string.Empty);
            if (cleaned == html) break;
            html = cleaned;
        } while (true);

        var metaRegex = new Regex("<meta\\b[^>]*>", RegexOptions.IgnoreCase);
        var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        cleaned = metaRegex.Replace(cleaned, m => seen.Add(m.Value) ? m.Value : string.Empty);

        var output = Path.Combine(Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory(),
            Path.GetFileNameWithoutExtension(htmlPath) + ".cleaned.html");
        await WriteTextAsync(output, cleaned);
        return [output];
    }

    private static async Task<List<string>> NormalizePathsAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var normalized = HrefSrcRegex.Replace(html, m =>
        {
            var attr = m.Groups[1].Value;
            var value = m.Groups[3].Success ? m.Groups[3].Value : m.Groups[4].Value;
            if (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("#", StringComparison.Ordinal) ||
                value.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase))
            {
                return m.Value;
            }

            var v = value.Replace('\\', '/');
            if (Path.IsPathRooted(value))
            {
                v = Path.GetFileName(value);
            }

            return $"{attr}=\"{v}\"";
        });

        var output = Path.Combine(Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory(),
            Path.GetFileNameWithoutExtension(htmlPath) + ".normalized.html");
        await WriteTextAsync(output, normalized);
        return [output];
    }

    private static async Task<List<string>> FindBrokenLinksAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var baseDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var broken = new List<string>();

        foreach (Match m in HrefSrcRegex.Matches(html))
        {
            var value = m.Groups[3].Success ? m.Groups[3].Value : m.Groups[4].Value;
            if (string.IsNullOrWhiteSpace(value)) continue;
            if (value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("https://", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("#", StringComparison.Ordinal) ||
                value.StartsWith("mailto:", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("javascript:", StringComparison.OrdinalIgnoreCase) ||
                value.StartsWith("data:", StringComparison.OrdinalIgnoreCase)) continue;

            var clean = value.Split('#')[0].Split('?')[0].Trim();
            if (string.IsNullOrWhiteSpace(clean)) continue;
            var full = Path.IsPathRooted(clean) ? clean : Path.GetFullPath(Path.Combine(baseDir, clean));
            if (!File.Exists(full) && !Directory.Exists(full)) broken.Add(value);
        }

        var reportPath = Path.Combine(baseDir, Path.GetFileNameWithoutExtension(htmlPath) + ".broken-links.md");
        var sb = new StringBuilder();
        sb.AppendLine("# Broken Links/Assets");
        sb.AppendLine();
        if (broken.Count == 0)
        {
            sb.AppendLine("No broken local links found.");
        }
        else
        {
            foreach (var b in broken.Distinct(StringComparer.OrdinalIgnoreCase)) sb.AppendLine($"- {b}");
        }
        await WriteTextAsync(reportPath, sb.ToString());
        return [reportPath];
    }

    private static async Task<List<string>> A11yQuickFixAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var fixedHtml = ImgTagRegex.Replace(html, m =>
        {
            var tag = m.Value;
            if (Regex.IsMatch(tag, "\\balt\\s*=", RegexOptions.IgnoreCase)) return tag;
            return tag.EndsWith("/>", StringComparison.Ordinal) ? tag[..^2] + " alt=\"\" />" : tag[..^1] + " alt=\"\">";
        });

        var headingRegex = new Regex("<h([1-6])\\b", RegexOptions.IgnoreCase);
        var levels = headingRegex.Matches(fixedHtml).Select(m => int.Parse(m.Groups[1].Value)).ToList();
        var jumps = new List<string>();
        for (var i = 1; i < levels.Count; i++)
        {
            if (levels[i] - levels[i - 1] > 1) jumps.Add($"h{levels[i - 1]} -> h{levels[i]} at index {i}");
        }

        var baseDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var htmlOut = Path.Combine(baseDir, baseName + ".a11y-fixed.html");
        var reportOut = Path.Combine(baseDir, baseName + ".a11y-report.md");

        await WriteTextAsync(htmlOut, fixedHtml);
        var report = new StringBuilder();
        report.AppendLine("# Accessibility Quick Fix Report");
        report.AppendLine();
        report.AppendLine("- Added missing `alt` attributes to `<img>` tags.");
        report.AppendLine($"- Heading jumps: {jumps.Count}");
        foreach (var j in jumps) report.AppendLine($"  - {j}");
        await WriteTextAsync(reportOut, report.ToString());

        return [htmlOut, reportOut];
    }

    private static async Task<List<string>> FormatHtmlAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var minified = Regex.Replace(html, "<!--([\\s\\S]*?)-->", string.Empty);
        minified = Regex.Replace(minified, ">\\s+<", "><").Trim();
        var pretty = PrettyHtml(html);

        var baseDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var minPath = Path.Combine(baseDir, baseName + ".min.html");
        var prettyPath = Path.Combine(baseDir, baseName + ".pretty.html");

        await WriteTextAsync(minPath, minified + "\n");
        await WriteTextAsync(prettyPath, pretty + "\n");
        return [minPath, prettyPath];
    }

    private static async Task<List<string>> SplitMultiSvgAsync(string htmlPath)
    {
        var outputs = await ExtractSvgAsync(htmlPath);
        var manifestPath = Path.Combine(Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory(),
            Path.GetFileNameWithoutExtension(htmlPath) + ".svg-manifest.json");
        await WriteTextAsync(manifestPath, JsonSerializer.Serialize(outputs, new JsonSerializerOptions { WriteIndented = true }));
        outputs.Add(manifestPath);
        return outputs;
    }

    private static async Task<List<string>> ExtractIconsSymbolsAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var symbols = SymbolRegex.Matches(html).Select(m => m.Value).ToList();
        var defs = DefsRegex.Matches(html).Select(m => m.Value).ToList();

        var outputs = new List<string>();
        if (symbols.Count == 0 && defs.Count == 0) return outputs;

        var sourceDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var outDir = ResolveOutputDir(sourceDir, "SVG");
        var outPath = Path.Combine(outDir, Path.GetFileNameWithoutExtension(htmlPath) + ".sprite.svg");

        var sb = new StringBuilder();
        sb.AppendLine("<svg xmlns=\"http://www.w3.org/2000/svg\" style=\"display:none\">");
        foreach (var d in defs) sb.AppendLine(d);
        foreach (var s in symbols) sb.AppendLine(s);
        sb.AppendLine("</svg>");

        await WriteTextAsync(outPath, sb.ToString());
        outputs.Add(outPath);
        return outputs;
    }

    private static async Task<List<string>> FingerprintDiffAsync(string htmlPath)
    {
        var html = await ReadTextAsync(htmlPath);
        var baseDir = Path.GetDirectoryName(htmlPath) ?? Directory.GetCurrentDirectory();
        var baseName = Path.GetFileNameWithoutExtension(htmlPath);
        var fpPath = Path.Combine(baseDir, baseName + ".fingerprint.json");
        var diffPath = Path.Combine(baseDir, baseName + ".fingerprint-diff.md");

        var tagCounts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        var tagRegex = new Regex("<([a-zA-Z0-9-]+)\\b", RegexOptions.Compiled);
        foreach (Match m in tagRegex.Matches(html))
        {
            var key = m.Groups[1].Value.ToLowerInvariant();
            tagCounts[key] = tagCounts.TryGetValue(key, out var n) ? n + 1 : 1;
        }

        var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(html))).ToLowerInvariant();
        var current = new { hash, length = html.Length, tags = tagCounts };

        Dictionary<string, int>? prevTags = null;
        string? prevHash = null;
        if (File.Exists(fpPath))
        {
            var prev = await ReadTextAsync(fpPath);
            using var doc = JsonDocument.Parse(prev);
            if (doc.RootElement.TryGetProperty("hash", out var h)) prevHash = h.GetString();
            if (doc.RootElement.TryGetProperty("tags", out var t) && t.ValueKind == JsonValueKind.Object)
            {
                prevTags = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
                foreach (var p in t.EnumerateObject()) prevTags[p.Name] = p.Value.GetInt32();
            }
        }

        await WriteTextAsync(fpPath, JsonSerializer.Serialize(current, new JsonSerializerOptions { WriteIndented = true }));

        var report = new StringBuilder();
        report.AppendLine("# HTML Fingerprint Diff");
        report.AppendLine();
        report.AppendLine($"- Current hash: `{hash}`");
        report.AppendLine($"- Previous hash: `{prevHash ?? "(none)"}`");
        report.AppendLine($"- Changed: {(prevHash is null ? "n/a" : !string.Equals(prevHash, hash, StringComparison.OrdinalIgnoreCase))}");
        if (prevTags is not null)
        {
            report.AppendLine();
            report.AppendLine("## Tag Count Delta");
            foreach (var kv in tagCounts.OrderBy(k => k.Key))
            {
                var old = prevTags.TryGetValue(kv.Key, out var n) ? n : 0;
                var delta = kv.Value - old;
                if (delta != 0) report.AppendLine($"- {kv.Key}: {old} -> {kv.Value} ({(delta > 0 ? "+" : string.Empty)}{delta})");
            }
        }
        await WriteTextAsync(diffPath, report.ToString());

        return [fpPath, diffPath];
    }

    private static string ResolveOutputDir(string sourceDir, string preferredName)
    {
        var preferred = Path.Combine(sourceDir, preferredName);
        try
        {
            Directory.CreateDirectory(preferred);
            return preferred;
        }
        catch
        {
            return sourceDir;
        }
    }

    private static string MimeToExt(string mime)
    {
        return mime.ToLowerInvariant() switch
        {
            "svg+xml" => "svg",
            "jpeg" => "jpg",
            "jpg" => "jpg",
            "png" => "png",
            "gif" => "gif",
            "webp" => "webp",
            "bmp" => "bmp",
            _ => "bin"
        };
    }

    private static async Task<string> ReadTextAsync(string path)
    {
        var sb = new StringBuilder();
        var buf = new char[4096];
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read, FileShare.ReadWrite, bufferSize: 4096);
        using var sr = new StreamReader(fs, Encoding.UTF8, detectEncodingFromByteOrderMarks: true, bufferSize: 4096);
        while (true)
        {
            var read = await sr.ReadBlockAsync(buf, 0, buf.Length);
            if (read <= 0) break;
            sb.Append(buf, 0, read);
        }
        return sb.ToString();
    }

    private static async Task WriteTextAsync(string path, string content)
    {
        await using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite, bufferSize: 4096);
        await using var sw = new StreamWriter(fs, Encoding.UTF8, bufferSize: 4096);
        await sw.WriteAsync(content);
    }

    private static void WriteBytes(string path, byte[] bytes)
    {
        using var fs = new FileStream(path, FileMode.Create, FileAccess.Write, FileShare.ReadWrite, bufferSize: 4096);
        fs.Write(bytes, 0, bytes.Length);
    }

    private static string PrettyHtml(string html)
    {
        var tokens = Regex.Split(html, "(<[^>]+>)");
        var sb = new StringBuilder();
        var indent = 0;
        foreach (var token in tokens)
        {
            if (string.IsNullOrWhiteSpace(token)) continue;
            var t = token.Trim();
            if (t.StartsWith("</", StringComparison.Ordinal)) indent = Math.Max(0, indent - 1);
            sb.Append(' ', indent * 2);
            sb.AppendLine(t);
            if (t.StartsWith("<", StringComparison.Ordinal) &&
                !t.StartsWith("</", StringComparison.Ordinal) &&
                !t.EndsWith("/>", StringComparison.Ordinal) &&
                !t.StartsWith("<!", StringComparison.Ordinal))
            {
                indent++;
            }
        }
        return sb.ToString();
    }
}
