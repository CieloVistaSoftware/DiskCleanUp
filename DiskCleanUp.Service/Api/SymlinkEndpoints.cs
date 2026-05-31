// POST /api/symlink — delete a duplicate copy and replace it with a symlink
// pointing to the canonical (keep) file so both paths still resolve.

using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class SymlinkEndpoints
{
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

            try
            {
                var size = new FileInfo(req.CopyPath).Length;

                // Send the copy to Recycle Bin so it can be restored if needed
                var trash = await Task.Run(() => FileUtilities.SendToRecycleBin(req.CopyPath));
                if (!trash.Ok)
                    return Results.Problem(trash.Error ?? "Could not trash the copy file");

                // Create a symlink at the old copy path pointing to the keep file
                File.CreateSymbolicLink(req.CopyPath, req.KeepPath);

                await cfgService.AppendSavingsAsync("symlink", size, req.CopyPath);

                return Results.Ok(new { ok = true, freed = size, symlinkPath = req.CopyPath, targetPath = req.KeepPath });
            }
            catch (UnauthorizedAccessException)
            {
                return Results.Problem(
                    "Symlink creation requires Developer Mode or elevated privileges. " +
                    "Enable Developer Mode in Windows Settings → System → For developers.");
            }
            catch (Exception ex)
            {
                return Results.Problem(ex.Message);
            }
        });
    }
}

public sealed record SymlinkRequest(string CopyPath, string KeepPath);
