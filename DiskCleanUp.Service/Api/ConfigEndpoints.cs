// Api/ConfigEndpoints.cs
// GET/POST /api/config — dashboard configuration
// GET /api/session, POST /api/session/new — session management
// GET /api/savings — cumulative savings log

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

        app.MapGet("/api/savings", async (ConfigService cfgService) =>
        {
            try { return Results.Ok(await cfgService.ReadSavingsAsync()); }
            catch (Exception ex) { return Results.Ok(new { error = ex.Message }); }
        });
    }
}
