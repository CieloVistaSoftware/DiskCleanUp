// Api/IssueFileEndpoints.cs
// POST /api/issue/file — file a GitHub issue for a specific scan grid row

using System.Diagnostics;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class IssueFileEndpoints
{
    public static void MapIssueFileEndpoints(this WebApplication app)
    {
        app.MapPost("/api/issue/file", async ([FromBody] FileIssueRequest req) =>
            await FileIssueAsync(req));
    }

    private static async Task<IResult> FileIssueAsync(FileIssueRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Path))
            return Results.BadRequest(new { error = "Path is required" });

        var fileName = Path.GetFileName(req.Path);
        var section  = req.Section ?? "unknown";
        var size     = req.SizeBytes.HasValue ? FormatBytes(req.SizeBytes.Value) : "unknown";
        var modified = req.Modified ?? "unknown";

        var title = $"review: {section} — {fileName} ({size})";
        var body  = string.Join("\n", [
            "## Flagged from DiskCleanUp Dashboard",
            "",
            $"**Section:** {section}",
            $"**File:** `{req.Path}`",
            $"**Size:** {size}",
            $"**Modified:** {modified}",
            "",
            "## Notes",
            req.Notes ?? "(none — flagged for review)",
        ]);

        try
        {
            var psi = new ProcessStartInfo("gh", [
                "issue", "create",
                "--repo", "CieloVistaSoftware/DiskCleanUp",
                "--title", title,
                "--body", body,
            ])
            {
                RedirectStandardOutput = true,
                RedirectStandardError  = true,
                UseShellExecute        = false,
                CreateNoWindow         = true,
            };

            using var proc = Process.Start(psi)!;
            var stdout = await proc.StandardOutput.ReadToEndAsync();
            var stderr = await proc.StandardError.ReadToEndAsync();
            await proc.WaitForExitAsync();

            if (proc.ExitCode != 0)
                return Results.Problem(detail: stderr.Trim(), title: "gh issue create failed", statusCode: 500);

            var issueUrl = stdout.Trim();
            return Results.Ok(new { ok = true, issueUrl });
        }
        catch (Exception ex)
        {
            return Results.Problem(detail: ex.Message, title: "Failed to file issue", statusCode: 500);
        }
    }

    private static string FormatBytes(long bytes)
    {
        if (bytes >= 1_073_741_824) return $"{bytes / 1_073_741_824.0:F1} GB";
        if (bytes >= 1_048_576)     return $"{bytes / 1_048_576.0:F1} MB";
        if (bytes >= 1_024)         return $"{bytes / 1_024.0:F1} KB";
        return $"{bytes} B";
    }
}

public sealed record FileIssueRequest(string Path, string? Section, long? SizeBytes, string? Modified, string? Notes);
