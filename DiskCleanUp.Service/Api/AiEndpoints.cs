// Api/AiEndpoints.cs - Anthropic API proxy. Key stays server-side only.
// Browser never sees the key. All calls go through /api/ai/chat.
using System.Text;
using System.Text.Json;
using DiskCleanup.Models;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class AiEndpoints
{
    private static readonly HttpClient _http = new() { Timeout = TimeSpan.FromSeconds(120) };
    private static readonly JsonSerializerOptions _json = new(JsonSerializerDefaults.Web);

    public static void MapAiEndpoints(this WebApplication app)
    {
        // GET /api/ai/status - is a key configured? Never returns the key itself.
        app.MapGet("/api/ai/status", async (ConfigService cfg) =>
        {
            var c = await cfg.LoadAsync();
            return Results.Ok(new { configured = !string.IsNullOrWhiteSpace(c.AnthropicApiKey) });
        });

        // POST /api/ai/key - write-only key save (browser sends, never reads back)
        app.MapPost("/api/ai/key", async ([FromBody] AiKeyRequest req, ConfigService cfgService) =>
        {
            try
            {
                var config = await cfgService.LoadAsync();
                await cfgService.SaveAsync(config with { AnthropicApiKey = req.Key?.Trim() ?? "" });
                return Results.Ok(new { ok = true });
            }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        // POST /api/ai/chat - SSE streaming proxy to Anthropic
        app.MapPost("/api/ai/chat", async (HttpContext ctx, [FromBody] AiChatRequest req, ConfigService cfgService) =>
        {
            var config = await cfgService.LoadAsync();
            var apiKey = config.AnthropicApiKey?.Trim();
            if (string.IsNullOrEmpty(apiKey))
            {
                ctx.Response.StatusCode = 400;
                await ctx.Response.WriteAsJsonAsync(new { error = "No API key configured. Add your Anthropic API key in Settings." });
                return;
            }

            var sysPrompt = BuildSystemPrompt(req.Context, config);
            var msgs = req.Messages.Select(m => new { role = m.Role, content = m.Content }).ToArray();
            var body = new { model = "claude-sonnet-4-5", max_tokens = 1024, stream = true, system = sysPrompt, messages = msgs };

            using var httpReq = new HttpRequestMessage(HttpMethod.Post, "https://api.anthropic.com/v1/messages");
            httpReq.Headers.Add("x-api-key", apiKey);
            httpReq.Headers.Add("anthropic-version", "2023-06-01");
            httpReq.Content = new StringContent(JsonSerializer.Serialize(body, _json), Encoding.UTF8, "application/json");

            HttpResponseMessage? httpResp;
            try
            {
                httpResp = await _http.SendAsync(httpReq, HttpCompletionOption.ResponseHeadersRead, ctx.RequestAborted);
            }
            catch (Exception ex)
            {
                ctx.Response.StatusCode = 502;
                await ctx.Response.WriteAsJsonAsync(new { error = ex.Message });
                return;
            }

            if (!httpResp.IsSuccessStatusCode)
            {
                ctx.Response.StatusCode = (int)httpResp.StatusCode;
                await ctx.Response.WriteAsJsonAsync(new { error = await httpResp.Content.ReadAsStringAsync() });
                return;
            }

            ctx.Response.ContentType = "text/event-stream";
            ctx.Response.Headers.CacheControl = "no-cache";

            await using var stream = await httpResp.Content.ReadAsStreamAsync();
            using var reader = new System.IO.StreamReader(stream);

            while (!reader.EndOfStream && !ctx.RequestAborted.IsCancellationRequested)
            {
                var line = await reader.ReadLineAsync();
                if (line == null) break;
                if (!line.StartsWith("data: ")) continue;
                var data = line["data: ".Length..];
                if (data == "[DONE]") break;
                try
                {
                    using var doc = JsonDocument.Parse(data);
                    var root = doc.RootElement;
                    if (root.TryGetProperty("type", out var t) && t.GetString() == "content_block_delta")
                        if (root.TryGetProperty("delta", out var d) && d.TryGetProperty("text", out var tx))
                        {
                            var payload = JsonSerializer.Serialize(new { text = tx.GetString() ?? "" });
                            await ctx.Response.WriteAsync($"data: {payload}\n\n");
                            await ctx.Response.Body.FlushAsync();
                        }
                    if (root.TryGetProperty("type", out var t2) && t2.GetString() == "message_stop")
                    {
                        await ctx.Response.WriteAsync("data: [DONE]\n\n");
                        await ctx.Response.Body.FlushAsync();
                    }
                }
                catch { }
            }
        });
    }

    private static string BuildSystemPrompt(AiContext? ctx, DashConfig cfg)
    {
        var sb = new StringBuilder();
        sb.AppendLine("You are an AI assistant inside DiskCleanUp, a Windows disk cleanup dashboard.");
        sb.AppendLine("Help the user understand scan results and decide what is safe to delete.");
        sb.AppendLine("Be concise. Use bullet points. Short answers only.");
        sb.AppendLine("Sections you know:");
        sb.AppendLine("  tiny-files = files <=1KB (empty configs, zero-byte logs)");
        sb.AppendLine("  stale = files not modified in N days");
        sb.AppendLine("  large = files over N MB");
        sb.AppendLine("  duplicates = exact MD5 duplicates - safe to delete copies");
        sb.AppendLine("  smart-dedup = copy-numbered files like 'report (1).pdf'");
        sb.AppendLine("  node-modules = npm folders - ALWAYS safe to delete (npm install regenerates)");
        sb.AppendLine("  empty = empty directories - always safe");
        sb.AppendLine("  venvs = Python virtual envs - safe (python -m venv regenerates)");
        sb.AppendLine("  backups = folders named backup/bak/old/archive");
        sb.AppendLine("  images = duplicate images by hash");
        sb.AppendLine("  html-files / css-files = web files scan");
        sb.AppendLine("Safety: NEVER recommend deleting C:\\Windows or C:\\Program Files.");
        sb.AppendLine("Always prefer sending to Recycle Bin over permanent delete when unsure.");
        sb.AppendLine($"\nCurrent scan root: {cfg.Root}");
        if (cfg.ExtraRoots?.Length > 0)
            sb.AppendLine($"Extra roots: {string.Join(", ", cfg.ExtraRoots)}");
        if (ctx != null)
        {
            if (!string.IsNullOrEmpty(ctx.Section))  sb.AppendLine($"Active section: {ctx.Section}");
            if (ctx.Files > 0)   sb.AppendLine($"Files scanned: {ctx.Files:N0}");
            if (ctx.Results > 0) sb.AppendLine($"Results found: {ctx.Results:N0}");
            if (!string.IsNullOrEmpty(ctx.Status)) sb.AppendLine($"Scan status: {ctx.Status}");
            if (ctx.SamplePaths?.Length > 0)
            {
                sb.AppendLine("Sample file paths from current results:");
                foreach (var p in ctx.SamplePaths.Take(10))
                    sb.AppendLine($"  - {p}");
            }
        }
        return sb.ToString();
    }
}

public record AiKeyRequest(
    [property: System.Text.Json.Serialization.JsonPropertyName("key")] string? Key
);
