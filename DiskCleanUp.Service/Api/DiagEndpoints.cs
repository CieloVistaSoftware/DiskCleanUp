// Api/DiagEndpoints.cs
// POST/GET/DELETE /api/errors — client error log
// POST/GET/DELETE /api/debug — workflow debug log
// POST/GET/DELETE /api/trace — trace log
// GET /api/fixes — fixes.json
// GET /api/export — full data export

using System.Text.Json;
using DiskCleanup.Helpers;
using DiskCleanup.Models;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class DiagEndpoints
{
    public static void MapDiagEndpoints(this WebApplication app, string baseDir)
    {
        // ── Errors ───────────────────────────────────────────────────
        app.MapPost("/api/errors", async ([FromBody] ClientErrorEntry entry, ConfigService cfgService) =>
        {
            try { await cfgService.AppendErrorAsync(entry); return Results.Ok(new { ok = true }); }
            catch { return Results.Ok(new { ok = true }); }
        });

        app.MapGet("/api/errors", async (ConfigService cfgService) =>
        {
            try { return Results.Ok(await cfgService.ReadErrorsAsync()); }
            catch { return Results.Ok(new { errors = Array.Empty<object>() }); }
        });

        app.MapGet("/api/errors/export", () =>
        {
            var path = Path.Combine(baseDir, "errors.jsonl");
            return SafeFileHelpers.SafeFileResult(path, "application/json", "errors.jsonl");
        });

        // ── Debug workflow log ────────────────────────────────────────
        app.MapPost("/api/debug", async (HttpContext ctx, DiagService diagService) =>
        {
            try
            {
                using var sr = new StreamReader(ctx.Request.Body);
                var body = await sr.ReadToEndAsync();
                if (string.IsNullOrWhiteSpace(body)) return Results.Ok(new { ok = true });

                var events = JsonSerializer.Deserialize<List<JsonElement>>(body);
                if (events == null || events.Count == 0) return Results.Ok(new { ok = true });

                diagService.WriteDebugEvents(events);
                return Results.Ok(new { ok = true });
            }
            catch { return Results.Ok(new { ok = true }); }
        });

        app.MapGet("/api/debug", (HttpContext ctx, DiagService diagService) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            return Results.Ok(diagService.ReadDebugEvents());
        });

        app.MapDelete("/api/debug", (DiagService diagService) =>
        {
            diagService.ClearDebug();
            return Results.Ok(new { ok = true });
        });

        // ── Trace log ─────────────────────────────────────────────────
        app.MapPost("/api/trace", async (HttpContext ctx, DiagService diagService) =>
        {
            try
            {
                using var sr = new StreamReader(ctx.Request.Body);
                var body = await sr.ReadToEndAsync();
                diagService.WriteTrace(body);
                return Results.Ok(new { ok = true });
            }
            catch { return Results.Ok(new { ok = true }); }
        });

        app.MapGet("/api/trace", (HttpContext ctx, DiagService diagService, int? tail) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            return Results.Ok(diagService.ReadTrace(tail));
        });

        app.MapDelete("/api/trace", (DiagService diagService) =>
        {
            diagService.ClearTrace();
            return Results.Ok(new { ok = true });
        });

        // ── Audit report ───────────────────────────────────────────────
        // Serves data/js-error-audit.json for the fix viewer
        app.MapGet("/api/audit-report", (HttpContext ctx) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            // Audit report lives in the project root data/ folder (not baseDir)
            var candidates = new[]
            {
                Path.Combine(AppContext.BaseDirectory, "data", "js-error-audit.json"),
                Path.Combine(Directory.GetCurrentDirectory(), "data", "js-error-audit.json"),
            };
            foreach (var p in candidates)
            {
                var json = SafeFileHelpers.SafeReadAllText(p);
                if (json == null) continue;
                try
                {
                    var doc = JsonSerializer.Deserialize<JsonElement>(json);
                    return Results.Ok(doc);
                }
                catch { }
            }
            return Results.Ok(new { violations = Array.Empty<object>(), warnings = Array.Empty<object>(), clean = Array.Empty<object>() });
        });

        // ── Fixes ─────────────────────────────────────────────────────
        app.MapGet("/api/fixes", () =>
        {
            var path = Path.Combine(baseDir, "data", "fixes.json");
            var json = SafeFileHelpers.SafeReadAllText(path);
            if (json == null) return Results.Ok(new { fixes = Array.Empty<object>(), metadata = new { } });
            try
            {
                var doc = JsonSerializer.Deserialize<JsonElement>(json);
                return Results.Ok(doc);
            }
            catch (Exception ex) { return Results.Ok(new { fixes = Array.Empty<object>(), error = ex.Message }); }
        });

        // ── Docs Audit ────────────────────────────────────────────────
        app.MapGet("/api/docs-audit", (HttpContext ctx) =>
        {
            ctx.Response.Headers.CacheControl = "no-store";
            var searchRoots = new[]
            {
                Path.GetFullPath(Path.Combine(Directory.GetCurrentDirectory(), "..")),
                Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..")),
                Directory.GetCurrentDirectory(),
            };

            string? auditFile = null;
            foreach (var root in searchRoots)
            {
                var docsDir = Path.Combine(root, "docs");
                if (!Directory.Exists(docsDir)) continue;
                var files = Directory.GetFiles(docsDir, "audit-orphans-*.md");
                if (files.Length > 0) { auditFile = files.OrderByDescending(f => f).First(); break; }
            }

            if (auditFile == null)
                return Results.Ok(new { orphans = Array.Empty<object>(), count = 0, source = (string?)null });

            var orphans = new List<object>();
            foreach (var line in File.ReadAllLines(auditFile))
            {
                var m = System.Text.RegularExpressions.Regex.Match(line, @"^- `(.+?)`");
                if (!m.Success) continue;
                var p = m.Groups[1].Value;
                orphans.Add(new { path = p, exists = File.Exists(p) || Directory.Exists(p) });
            }
            return Results.Ok(new { orphans, count = orphans.Count, source = Path.GetFileName(auditFile) });
        });

        // ── Export ────────────────────────────────────────────────────
        app.MapGet("/api/export", async (ConfigService cfgService) =>
        {
            try
            {
                return Results.Ok(new
                {
                    exported = DateTime.Now.ToString("o"),
                    config   = await cfgService.LoadAsync(),
                    savings  = await cfgService.ReadSavingsAsync(),
                    session  = await cfgService.GetCurrentSessionAsync()
                });
            }
            catch (Exception ex) { return Results.Ok(new { error = ex.Message }); }
        });
    }
}
