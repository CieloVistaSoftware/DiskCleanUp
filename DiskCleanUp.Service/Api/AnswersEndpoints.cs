// Api/AnswersEndpoints.cs
// GET /api/answers/manifest — current artifact manifest
// POST /api/answers/refresh — force immediate artifact regeneration

using System.Text.Json;
using DiskCleanup.Helpers;
using DiskCleanup.Services;

namespace DiskCleanup.Api;

public static class AnswersEndpoints
{
    public static void MapAnswersEndpoints(this WebApplication app, string baseDir)
    {
        app.MapGet("/api/answers/manifest", () =>
        {
            var manifestPath = Path.Combine(baseDir, Constants.AnswersDir, "manifest.json");
            if (!File.Exists(manifestPath))
            {
                return Results.Ok(new
                {
                    status = "empty",
                    generatedAtUtc = (string?)null,
                    sections = new Dictionary<string, object>(),
                });
            }

            var json = SafeFileHelpers.SafeReadAllText(manifestPath);
            if (string.IsNullOrWhiteSpace(json))
            {
                return Results.Ok(new
                {
                    status = "empty",
                    generatedAtUtc = (string?)null,
                    sections = new Dictionary<string, object>(),
                });
            }

            try
            {
                var parsed = JsonSerializer.Deserialize<object>(json);
                return Results.Ok(parsed ?? new
                {
                    status = "empty",
                    generatedAtUtc = (string?)null,
                    sections = new Dictionary<string, object>(),
                });
            }
            catch
            {
                return Results.Ok(new
                {
                    status = "error",
                    error = "manifest parse error",
                    generatedAtUtc = (string?)null,
                    sections = new Dictionary<string, object>(),
                });
            }
        });

        app.MapPost("/api/answers/refresh", async (AnswerArtifactService answers, HttpContext ctx) =>
        {
            var result = await answers.RefreshNowAsync(ctx.RequestAborted);
            return Results.Ok(result);
        });
    }
}
