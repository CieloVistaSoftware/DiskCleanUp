// Api/KeepListEndpoints.cs
// GET /api/keep-list — list protected paths
// POST /api/keep-list/add — add paths
// POST /api/keep-list/remove — remove paths
// DELETE /api/keep-list — clear all

using DiskCleanup.Models;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class KeepListEndpoints
{
    public static void MapKeepListEndpoints(this WebApplication app)
    {
        app.MapGet("/api/keep-list", async (ConfigService cfgService) =>
        {
            try { return Results.Ok(new { paths = await cfgService.GetKeepListAsync() }); }
            catch (Exception ex) { return Results.Ok(new { paths = Array.Empty<string>(), error = ex.Message }); }
        });

        app.MapPost("/api/keep-list/add", async ([FromBody] KeepPathsRequest req, ConfigService cfgService) =>
        {
            try
            {
                await cfgService.AddKeepPathsAsync(req.Paths ?? []);
                return Results.Ok(new { ok = true, count = (await cfgService.GetKeepListAsync()).Length });
            }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapPost("/api/keep-list/remove", async ([FromBody] KeepPathsRequest req, ConfigService cfgService) =>
        {
            try
            {
                await cfgService.RemoveKeepPathsAsync(req.Paths ?? []);
                return Results.Ok(new { ok = true, count = (await cfgService.GetKeepListAsync()).Length });
            }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapDelete("/api/keep-list", async (ConfigService cfgService) =>
        {
            try { await cfgService.ClearKeepListAsync(); return Results.Ok(new { ok = true }); }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });
    }
}
