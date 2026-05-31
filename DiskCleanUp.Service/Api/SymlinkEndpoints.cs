// POST /api/symlink — delete a duplicate copy and replace it with a symlink
// (or hardlink as fallback) so both paths still resolve on disk.
//
// Symlinks require Developer Mode on Windows.
// Hardlinks require same volume; no elevation needed — used as automatic fallback.

using System.Runtime.InteropServices;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class SymlinkEndpoints
{
    [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
    private static extern bool CreateHardLink(string lpFileName, string lpExistingFileName, IntPtr lpSecurityAttributes);

    public static void MapSymlinkEndpoints(this WebApplication app)
    {
        app.MapPost("/api/symlink", async ([FromBody] SymlinkRequest req, ConfigService cfgService) =>
        {
            if (string.IsNullOrWhiteSpace(req.CopyPath) || string.IsNullOrWhiteSpace(req.KeepPath))
                return Results.BadRequest(new { error = "copyPath and keepPath are required" });

            if (!File.Exists(req.CopyPath))
                return Results.BadRequest(new { error = $"Copy file not found: {req.CopyPath}" });

            if (!File.Exists(req.KeepPath))
                return Results.BadRequest(new { error = $"Keep file not found: {req.KeepPath}" });

            // Files must be on same volume for either symlink or hardlink
            var copyRoot = Path.GetPathRoot(req.CopyPath) ?? "";
            var keepRoot = Path.GetPathRoot(req.KeepPath) ?? "";
            if (!string.Equals(copyRoot, keepRoot, StringComparison.OrdinalIgnoreCase))
                return Results.BadRequest(new { error = "Both files must be on the same drive to create a link." });

            try
            {
                var size = new FileInfo(req.CopyPath).Length;

                // Trash the copy first so its slot is free for the link
                var trash = await Task.Run(() => FileUtilities.SendToRecycleBin(req.CopyPath));
                if (!trash.Ok)
                    return Results.Problem(trash.Error ?? "Could not move copy to Recycle Bin");

                // Try symlink first; fall back to hardlink if Developer Mode is off
                string linkType;
                try
                {
                    File.CreateSymbolicLink(req.CopyPath, req.KeepPath);
                    linkType = "symlink";
                }
                catch (UnauthorizedAccessException)
                {
                    // No Developer Mode — create a hardlink instead (same volume, no elevation)
                    if (!CreateHardLink(req.CopyPath, req.KeepPath, IntPtr.Zero))
                    {
                        var err = Marshal.GetLastWin32Error();
                        return Results.Problem(
                            $"Could not create symlink (Developer Mode off) or hardlink (Win32 error {err}). " +
                            $"Enable Developer Mode in Settings → System → For developers.");
                    }
                    linkType = "hardlink";
                }

                await cfgService.AppendSavingsAsync(linkType, size, req.CopyPath);

                return Results.Ok(new { ok = true, freed = size, linkType, linkPath = req.CopyPath, targetPath = req.KeepPath });
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });
    }
}

public sealed record SymlinkRequest(string CopyPath, string KeepPath);
