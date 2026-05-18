// Api/TrashEndpoints.cs
// POST /api/trash — send files to recycle bin
// POST /api/delete-permanent — permanent deletion
// POST /api/smart-dedup/apply — smart dedup batch cleanup
// POST /api/empty-folders/delete — remove empty directories

using DiskCleanup.Models;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class TrashEndpoints
{
    public static void MapTrashEndpoints(this WebApplication app)
    {
        app.MapPost("/api/trash", async ([FromBody] PathsRequest req, ConfigService cfgService) =>
        {
            long freed = 0; var errors = new List<string>();
            foreach (var p in req.Paths ?? [])
            {
                try
                {
                    var r = await Task.Run(() => FileUtilities.SendToRecycleBin(p));
                    if (r.Ok) { freed += r.Freed; await cfgService.AppendSavingsAsync("trash", r.Freed, p); }
                    else if (r.Error != null) errors.Add(r.Error);
                }
                catch (Exception ex) { errors.Add($"{p}: {ex.Message}"); }
            }
            return Results.Ok(new { freed, errors });
        });

        app.MapPost("/api/delete-permanent", async ([FromBody] PathsRequest req, ConfigService cfgService) =>
        {
            long freed = 0; var errors = new List<string>();
            foreach (var p in req.Paths ?? [])
            {
                try
                {
                    var (size, err) = await FileUtilities.DeleteAsync(p);
                    if (err == null) { freed += size; await cfgService.AppendSavingsAsync("delete", size, p); }
                    else errors.Add(err);
                }
                catch (Exception ex) { errors.Add($"{p}: {ex.Message}"); }
            }
            return Results.Ok(new { freed, errors });
        });

        app.MapPost("/api/smart-dedup/apply", async ([FromBody] SmartDedupApplyRequest req, ConfigService cfgService) =>
        {
            try
            {
                long freed = 0;
                foreach (var item in req.Items ?? [])
                    foreach (var p in item.Delete ?? [])
                    {
                        try
                        {
                            var r = FileUtilities.SendToRecycleBin(p);
                            if (r.Ok) freed += r.Freed;
                        }
                        catch { /* best-effort */ }
                    }
                await cfgService.AppendSavingsAsync("smart-dedup", freed);
                return Results.Ok(new { freed });
            }
            catch (Exception ex) { return Results.Ok(new { freed = 0L, error = ex.Message }); }
        });

        app.MapPost("/api/empty-folders/delete", async ([FromBody] PathsRequest req, ConfigService cfgService) =>
        {
            var deleted = new List<string>();
            var errors  = new List<string>();
            foreach (var p in req.Paths ?? [])
            {
                try
                {
                    var di = new DirectoryInfo(p);
                    if (di.Exists && di.Attributes.HasFlag(FileAttributes.ReadOnly))
                        di.Attributes &= ~FileAttributes.ReadOnly;

                    Directory.Delete(p);
                    deleted.Add(p);
                }
                catch (Exception ex) { errors.Add($"{p}: {ex.Message}"); }
            }
            if (deleted.Count > 0)
                await cfgService.AppendSavingsBatchAsync("empty-delete",
                    deleted.Select(d => (0L, d)));
            return Results.Ok(new { deleted, errors });
        });
    }
}
