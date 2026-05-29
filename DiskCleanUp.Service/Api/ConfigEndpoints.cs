// Api/ConfigEndpoints.cs
// GET/POST /api/config — dashboard configuration
// GET /api/session, POST /api/session/new — session management
// GET /api/savings?limit=N&offset=N — paginated savings log (newest first)
// GET /api/savings/summary — totals only (fast, no payload)

using DiskCleanup.Models;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class ConfigEndpoints
{
    public static void MapConfigEndpoints(this WebApplication app)
    {
        app.MapGet("/api/config", async (ConfigService cfgService) =>
        {
            try
            {
                var cfg = await cfgService.LoadAsync();
                // Strip API key — never send it to the browser.
                // The key is write-only from the browser's perspective.
                // Use /api/ai/status to check if a key is configured.
                return Results.Ok(cfg with { AnthropicApiKey = "" });
            }
            catch (Exception ex) { return Results.Ok(new { error = ex.Message }); }
        });

        app.MapPost("/api/config", async ([FromBody] DashConfig cfg, ConfigService cfgService) =>
        {
            try { await cfgService.SaveAsync(cfg); return Results.Ok(new { ok = true }); }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapGet("/api/session", async (ConfigService cfgService) =>
        {
            try { return Results.Ok(await cfgService.GetCurrentSessionAsync()); }
            catch (Exception ex) { return Results.Ok(new { error = ex.Message }); }
        });

        app.MapPost("/api/session/new", async ([FromBody] NewSessionRequest? req, ConfigService cfgService) =>
        {
            try { return Results.Ok(await cfgService.NewSessionAsync(req?.Label)); }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapGet("/api/savings", async (HttpContext http, ConfigService cfgService) =>
        {
            try
            {
                int limit  = int.TryParse(http.Request.Query["limit"],  out var l) ? Math.Clamp(l, 1, 1000) : 200;
                int offset = int.TryParse(http.Request.Query["offset"], out var o) ? Math.Max(o, 0) : 0;
                var (entries, total) = await cfgService.ReadSavingsPagedAsync(limit, offset);
                return Results.Ok(new { entries, total, hasMore = offset + entries.Count < total });
            }
            catch (Exception ex) { return Results.Ok(new { error = ex.Message }); }
        });

        app.MapGet("/api/savings/summary", async (ConfigService cfgService) =>
        {
            try
            {
                var (totalBytes, totalCount) = await cfgService.ReadSavingsSummaryAsync();
                return Results.Ok(new { totalBytes, totalCount });
            }
            catch (Exception ex) { return Results.Ok(new { error = ex.Message }); }
        });
    }
}
