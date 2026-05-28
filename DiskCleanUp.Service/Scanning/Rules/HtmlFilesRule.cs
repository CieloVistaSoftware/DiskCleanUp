// Scanning/Rules/HtmlFilesRule.cs
// Finds all HTML-family files (.html .htm .xhtml .mhtml .mht).

namespace DiskCleanup.Scanning.Rules;

public sealed class HtmlFilesRule : IScanRule
{
    public string Section => "html-files";

    private static readonly HashSet<string> _exts = new(StringComparer.OrdinalIgnoreCase)
        { ".html", ".htm", ".xhtml", ".mhtml", ".mht" };

    public async Task RunAsync(ScanContext ctx, CancellationToken ct)
    {
        const string sec = "html-files";
        await ctx.PushAsync(sec, "started", new { root = ctx.Config.Root }, ct);
        long files = 0, results = 0;

        await Parallel.ForEachAsync(
            FileEnumerator.FilteredFiles(ctx, filterTempFolders: true)
                          .Where(f => _exts.Contains(Path.GetExtension(f))),
            new ParallelOptions { MaxDegreeOfParallelism = ctx.Config.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return;

                    var c = Interlocked.Increment(ref files);
                    Interlocked.Increment(ref results);
                    await ctx.PushAsync(sec, "result", new
                    {
                        path     = fp,
                        size     = fi.Length,
                        modified = fi.LastWriteTime.ToString("yyyy-MM-dd")
                    }, token);
                    ctx.PushProgress(sec, new { files = c, results, folder = Path.GetDirectoryName(fp) });
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                    or FileNotFoundException or DirectoryNotFoundException)
                {
                    Interlocked.Increment(ref files);
                }
            });

        await ctx.PushAsync(sec, "done", new { files, results }, ct);
    }
}
