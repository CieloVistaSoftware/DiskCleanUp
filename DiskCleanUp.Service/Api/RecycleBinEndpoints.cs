// Api/RecycleBinEndpoints.cs
// GET /api/recycle-bin — enumerate recycle bin items
// POST /api/recycle-bin/restore — restore items from recycle bin

using DiskCleanup.Models;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class RecycleBinEndpoints
{
    public static void MapRecycleBinEndpoints(this WebApplication app)
    {
        app.MapGet("/api/recycle-bin", () =>
        {
            try
            {
                var items = FileUtilities.EnumerateRecycleBin(2000);
                return Results.Ok(new { items, count = items.Count });
            }
            catch (Exception ex) { return Results.Ok(new { items = Array.Empty<object>(), count = 0, error = ex.Message }); }
        });

        app.MapPost("/api/recycle-bin/restore", ([FromBody] RestoreRequest req) =>
        {
            if (req.Items == null || req.Items.Length == 0)
                return Results.Ok(new { restored = 0, errors = Array.Empty<string>() });

            int restored = 0;
            var errors = new List<string>();
            var binItems = FileUtilities.EnumerateRecycleBin(5000);
            var lookup = binItems.ToDictionary(i => i.RecyclePath, i => i.OriginalPath, StringComparer.OrdinalIgnoreCase);

            foreach (var recyclePath in req.Items)
            {
                try
                {
                    var origPath = lookup.TryGetValue(recyclePath, out var op) ? op : "";
                    if (string.IsNullOrEmpty(origPath)) { errors.Add($"No original path for {recyclePath}"); continue; }
                    var ok = FileUtilities.RestoreFromRecycleBin(recyclePath, origPath);
                    if (ok) restored++;
                    else errors.Add($"Failed to restore {origPath}");
                }
                catch (Exception ex) { errors.Add($"{recyclePath}: {ex.Message}"); }
            }
            return Results.Ok(new { restored, errors });
        });
    }
}
