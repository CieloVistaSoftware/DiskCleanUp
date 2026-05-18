// Helpers/SafeFileHelpers.cs
// Every file operation in this app goes through these helpers.
// FileShare.ReadWrite on everything. Swallows errors where appropriate.

namespace DiskCleanup.Helpers;

public static class SafeFileHelpers
{
    /// <summary>Read entire file as string, FileShare.ReadWrite, swallows errors.</summary>
    public static string? SafeReadAllText(string path)
    {
        if (!File.Exists(path)) return null;
        try
        {
            using var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                FileShare.ReadWrite, bufferSize: 4096);
            using var sr = new StreamReader(fs, System.Text.Encoding.UTF8);
            return sr.ReadToEnd();
        }
        catch { return null; }
    }

    /// <summary>Stream a file to the HTTP response with FileShare.ReadWrite.</summary>
    public static IResult SafeFileResult(string path, string contentType, string? downloadName = null)
    {
        if (!File.Exists(path)) return Results.NotFound(new { error = "File not found" });
        try
        {
            var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                FileShare.ReadWrite, bufferSize: 4096);
            return Results.Stream(fs, contentType, downloadName, enableRangeProcessing: true);
        }
        catch (Exception ex)
        {
            return Results.Problem($"Cannot read file: {ex.Message}", statusCode: 500);
        }
    }

    /// <summary>Truncate a file to zero bytes (safe alternative to File.Delete).</summary>
    public static void SafeTruncate(string path)
    {
        try
        {
            if (!File.Exists(path)) return;
            using var fs = new FileStream(path, FileMode.Truncate, FileAccess.Write,
                FileShare.ReadWrite);
        }
        catch { /* best-effort */ }
    }

    /// <summary>Retry-aware atomic file move for JSONL rewrites.</summary>
    public static async Task SafeAtomicMoveAsync(string tmpPath, string destPath, int maxRetries = 5)
    {
        for (int attempt = 0; attempt < maxRetries; attempt++)
        {
            try { File.Move(tmpPath, destPath, overwrite: true); return; }
            catch (IOException) when (attempt < maxRetries - 1) { await Task.Delay(200 * (attempt + 1)); }
            catch (UnauthorizedAccessException) when (attempt < maxRetries - 1) { await Task.Delay(200 * (attempt + 1)); }
        }
    }
}
