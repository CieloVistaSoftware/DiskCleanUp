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

                // Step 1: probe link creation BEFORE touching the copy so we never
                // leave a dangling path. Create the link at a temp location first.
                var tempLink = req.CopyPath + $".link{Guid.NewGuid():N}";
                string linkType;
                try
                {
                    File.CreateSymbolicLink(tempLink, req.KeepPath);
                    linkType = "symlink";
                }
                catch   // IOException on Windows without Developer Mode — not UnauthorizedAccessException
                {
                    // Try hardlink (no elevation required, same volume)
                    if (!CreateHardLink(tempLink, req.KeepPath, IntPtr.Zero))
                    {
                        var err = Marshal.GetLastWin32Error();
                        return Results.Problem(
                            $"Cannot create symlink (enable Developer Mode in Settings → System → For developers) " +
                            $"or hardlink (Win32 error {err} — files may be on different drives or a network share).");
                    }
                    linkType = "hardlink";
                }

                // Step 2: link creation succeeded — now safe to trash the copy
                var trash = await Task.Run(() => FileUtilities.SendToRecycleBin(req.CopyPath));
                if (!trash.Ok)
                {
                    // Couldn't trash — clean up the temp link and bail
                    try { File.Delete(tempLink); } catch { }
                    return Results.Problem(trash.Error ?? "Could not move copy to Recycle Bin");
                }

                // Step 3: move temp link into the vacated slot
                File.Move(tempLink, req.CopyPath);

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
