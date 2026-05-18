// Api/FileEndpoints.cs
// GET /api/preview — file preview (image/pdf/text)
// GET /api/file — serve raw file
// POST /api/open-folder — open folder in Explorer
// POST /api/open-default — open file in default app
// POST /api/open — open file in VS Code

using DiskCleanup.Helpers;
using DiskCleanup.Models;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class FileEndpoints
{
    public static void MapFileEndpoints(this WebApplication app)
    {
        app.MapGet("/api/preview", (string path) =>
        {
            if (!File.Exists(path)) return Results.NotFound(new { error = "Not found" });
            var ext = Path.GetExtension(path).ToLower();
            if (ext is ".jpg" or ".jpeg" or ".png" or ".gif" or ".webp" or ".bmp" or ".svg")
                return Results.Ok(new { type = "image", path });
            if (ext == ".pdf") return Results.Ok(new { type = "pdf", path });
            try
            {
                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite, bufferSize: 4096);
                using var sr = new StreamReader(fs, System.Text.Encoding.UTF8,
                    detectEncodingFromByteOrderMarks: true, bufferSize: 4096);
                var buf = new char[4000];
                int read = sr.ReadBlock(buf, 0, buf.Length);
                return Results.Ok(new { type = "text", content = new string(buf, 0, read) });
            }
            catch (Exception ex) { return Results.Ok(new { type = "error", error = ex.Message }); }
        });

        app.MapGet("/api/file", (string path) =>
        {
            if (!File.Exists(path)) return Results.NotFound();
            var mime = Path.GetExtension(path).ToLower() switch
            {
                ".jpg" or ".jpeg" => "image/jpeg",
                ".png"  => "image/png",
                ".gif"  => "image/gif",
                ".webp" => "image/webp",
                ".svg"  => "image/svg+xml",
                ".bmp"  => "image/bmp",
                ".ico"  => "image/x-icon",
                ".pdf"  => "application/pdf",
                ".mp4"  => "video/mp4",
                ".webm" => "video/webm",
                ".mov"  => "video/quicktime",
                ".avi"  => "video/x-msvideo",
                ".mkv"  => "video/x-matroska",
                _       => "application/octet-stream"
            };
            return SafeFileHelpers.SafeFileResult(path, mime);
        });

        app.MapPost("/api/open-folder", ([FromBody] OpenFileRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.Path)) return Results.BadRequest(new { error = "No path" });
            var folder = req.Path;
            if (!Directory.Exists(folder))
                folder = Path.GetDirectoryName(req.Path) ?? req.Path;
            if (!Directory.Exists(folder))
                return Results.NotFound(new { error = "Folder not found" });
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "explorer.exe",
                    Arguments = $"\"{folder}\"",
                    UseShellExecute = false, CreateNoWindow = true
                });
                return Results.Ok(new { ok = true, path = folder });
            }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapPost("/api/open-default", ([FromBody] OpenFileRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.Path)) return Results.BadRequest(new { error = "No path" });
            if (!File.Exists(req.Path))
                return Results.NotFound(new { error = "Not found" });
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = req.Path,
                    UseShellExecute = true
                });
                return Results.Ok(new { ok = true, path = req.Path });
            }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapPost("/api/open", ([FromBody] OpenFileRequest req) =>
        {
            if (string.IsNullOrWhiteSpace(req.Path)) return Results.BadRequest(new { error = "No path" });
            if (!File.Exists(req.Path) && !Directory.Exists(req.Path))
                return Results.NotFound(new { error = "Not found" });
            try
            {
                System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo
                {
                    FileName = @"C:\Users\jwpmi\AppData\Local\Programs\Microsoft VS Code Insiders\Code - Insiders.exe",
                    Arguments = $"--reuse-window \"{req.Path}\"",
                    UseShellExecute = false, CreateNoWindow = true
                });
                return Results.Ok(new { ok = true, path = req.Path });
            }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapPost("/api/pick-folder", () =>
        {
            try
            {
                var script =
                    "Add-Type -AssemblyName System.Windows.Forms; " +
                    "$dlg = New-Object System.Windows.Forms.FolderBrowserDialog; " +
                    "$dlg.Description = 'Choose scan root folder'; " +
                    "if ($dlg.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dlg.SelectedPath }";

                var psi = new System.Diagnostics.ProcessStartInfo
                {
                    FileName = "powershell.exe",
                    Arguments = $"-NoProfile -STA -ExecutionPolicy Bypass -Command \"{script}\"",
                    UseShellExecute = false,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true,
                    CreateNoWindow = true,
                };

                using var p = System.Diagnostics.Process.Start(psi);
                if (p == null) return Results.Ok(new { ok = false, error = "Unable to launch folder picker" });

                var output = p.StandardOutput.ReadToEnd().Trim();
                p.WaitForExit(120000);

                if (string.IsNullOrWhiteSpace(output))
                    return Results.Ok(new { ok = false, cancelled = true });

                return Results.Ok(new { ok = true, path = output });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { ok = false, error = ex.Message });
            }
        });

        app.MapGet("/api/folder-choices", (string? path) =>
        {
            try
            {
                var input = (path ?? string.Empty).Trim();
                var choices = new List<string>();

                // Empty input => suggest logical drive roots.
                if (string.IsNullOrWhiteSpace(input))
                {
                    choices.AddRange(DriveInfo.GetDrives()
                        .Select(d => d.Name)
                        .OrderBy(n => n, StringComparer.OrdinalIgnoreCase));
                    return Results.Ok(new { choices });
                }

                string baseDir;
                string partial;
                var trimmed = input.TrimEnd('\\', '/');

                if (Directory.Exists(input))
                {
                    baseDir = input;
                    partial = string.Empty;
                }
                else
                {
                    baseDir = Path.GetDirectoryName(trimmed) ?? string.Empty;
                    partial = Path.GetFileName(trimmed) ?? string.Empty;
                }

                if (string.IsNullOrWhiteSpace(baseDir) || !Directory.Exists(baseDir))
                    return Results.Ok(new { choices });

                choices.AddRange(Directory.EnumerateDirectories(baseDir, "*", new EnumerationOptions
                {
                    RecurseSubdirectories = false,
                    IgnoreInaccessible = true,
                    ReturnSpecialDirectories = false,
                })
                .Where(d => string.IsNullOrWhiteSpace(partial)
                    || Path.GetFileName(d).StartsWith(partial, StringComparison.OrdinalIgnoreCase))
                .OrderBy(d => d, StringComparer.OrdinalIgnoreCase)
                .Take(200));

                if (Directory.Exists(trimmed) && !choices.Contains(trimmed, StringComparer.OrdinalIgnoreCase))
                    choices.Insert(0, trimmed);

                return Results.Ok(new { choices });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { choices = Array.Empty<string>(), error = ex.Message });
            }
        });
    }
}
