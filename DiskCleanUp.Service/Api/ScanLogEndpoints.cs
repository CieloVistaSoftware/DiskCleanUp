// Api/ScanLogEndpoints.cs
// Serves per-section scan log files written by ScanOrchestrator during active scans.
// Each log is a plain-text file: one absolute file path per line, written as files are visited.
// Used by scan-log-viewer.html to show live progress during a scan.

using DiskCleanup;

namespace DiskCleanup.Api;

public static class ScanLogEndpoints
{
    public static void MapScanLogEndpoints(this WebApplication app)
    {
        // GET /api/scan-log/{section}?tail=N
        // Returns the last N lines of the scan log for {section} (default: all).
        // Returns 404 if no log exists for the section yet.
        app.MapGet("/api/scan-log/{section}", (string section, int? tail) =>
        {
            var logPath = Path.Combine(Constants.DataDir, "scan-logs", $"{section}.log");
            if (!File.Exists(logPath))
                return Results.NotFound(new { error = $"No scan log for section '{section}'" });

            try
            {
                using var fs = new FileStream(logPath, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite, bufferSize: 4096);
                using var sr = new StreamReader(fs, System.Text.Encoding.UTF8,
                    detectEncodingFromByteOrderMarks: false, bufferSize: 4096);

                var lines = new List<string>();
                while (sr.ReadLine() is { } line)
                    if (!string.IsNullOrWhiteSpace(line))
                        lines.Add(line);

                var result = tail is > 0 ? lines.TakeLast(tail.Value).ToArray() : lines.ToArray();
                return Results.Ok(new { section, count = result.Length, lines = result });
            }
            catch (Exception ex)
            {
                return Results.Problem($"Failed to read scan log: {ex.Message}");
            }
        });
    }
}
