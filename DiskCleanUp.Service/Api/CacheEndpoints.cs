// Api/CacheEndpoints.cs
// GET /api/cache/{section} — paged JSONL restore (40KB chunks)
// DELETE /api/cache/{section} — clear section cache
// POST /api/cache/{section}/remove — remove specific paths from cache

using System.Text.Json;
using DiskCleanup.Helpers;
using DiskCleanup.Models;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class CacheEndpoints
{
    public static void MapCacheEndpoints(this WebApplication app, string baseDir)
    {
        // ── Cache restore (paged, 40KB rule) ──────────────────────────
        app.MapGet("/api/cache/{section}", (string section, long? offset, HttpContext ctx) =>
        {
            ctx.Response.Headers.CacheControl = "no-store, no-cache, must-revalidate";
            ctx.Response.Headers.Pragma = "no-cache";
            var path = Path.Combine(baseDir, "scan-cache", $"{section}.json");
            if (!File.Exists(path)) return Results.Ok(new { rows = Array.Empty<object>(), nextOffset = (long?)null });

            try
            {
                const int ChunkSize = 40_960;
                long startAt = offset ?? 0;
                var rows = new List<object>();

                using var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite, bufferSize: 4096);
                fs.Seek(startAt, SeekOrigin.Begin);
                using var sr = new StreamReader(fs, System.Text.Encoding.UTF8,
                    detectEncodingFromByteOrderMarks: false, bufferSize: 4096);

                long bytesRead = 0;
                bool hitEof = false;
                while (bytesRead < ChunkSize)
                {
                    var line = sr.ReadLine();
                    if (line == null) { hitEof = true; break; }
                    bytesRead += System.Text.Encoding.UTF8.GetByteCount(line) + 1;
                    if (string.IsNullOrWhiteSpace(line)) continue;
                    try
                    {
                        var obj = JsonSerializer.Deserialize<object>(line);
                        if (obj != null) rows.Add(obj);
                    }
                    catch { }
                }

                var nextOffset = startAt + bytesRead;
                bool hasMore = !hitEof;
                var cachedAt = startAt == 0 ? File.GetLastWriteTimeUtc(path).ToString("o") : null;
                // nextOffset = null when EOF (tells "Load More" button there's no more)
                // resumeOffset = always the byte position so live-scan _fetchBatch
                //   can resume reading after new data is appended past the old EOF
                return Results.Ok(new { rows, nextOffset = hasMore ? (long?)nextOffset : null, resumeOffset = nextOffset, cachedAt });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { rows = Array.Empty<object>(), nextOffset = (long?)null, error = ex.Message });
            }
        });

        // ── Clear scan cache ──────────────────────────────────────────
        app.MapDelete("/api/cache/{section}", (string section) =>
        {
            var cachePath = Path.Combine(baseDir, "scan-cache", $"{section}.json");
            SafeFileHelpers.SafeTruncate(cachePath);
            return Results.Ok(new { ok = true });
        });

        // ── Remove paths from JSONL ───────────────────────────────────
        app.MapPost("/api/cache/{section}/remove", async (
            string section,
            [FromBody] RemovePathsRequest req,
            ConfigService cfgService) =>
        {
            var paths = req.Paths ?? [];
            if (paths.Length == 0) return Results.Ok(new { ok = true, removed = 0 });

            var cachePath = Path.Combine(baseDir, "scan-cache", $"{section}.json");
            if (!File.Exists(cachePath)) return Results.Ok(new { ok = true, removed = 0 });

            try
            {
                var pathSet = new HashSet<string>(paths, StringComparer.OrdinalIgnoreCase);
                var kept    = new List<string>();
                int removed = 0;
                var deleteResults = new List<object>();

                using (var fs = new FileStream(cachePath, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite, bufferSize: 4096))
                using (var sr = new StreamReader(fs, System.Text.Encoding.UTF8, false, 4096))
                {
                    while (sr.ReadLine() is { } line)
                    {
                        if (string.IsNullOrWhiteSpace(line)) continue;
                        try
                        {
                            var je = JsonSerializer.Deserialize<JsonElement>(line);
                            bool drop = false;

                            if (section is "duplicates" or "images")
                            {
                                if (je.TryGetProperty("data", out var data) &&
                                    data.TryGetProperty("files", out var filesArr))
                                {
                                    var remaining = new List<JsonElement>();
                                    foreach (var f in filesArr.EnumerateArray())
                                    {
                                        var p = f.TryGetProperty("path", out var pp) ? pp.GetString() : null;
                                        if (p != null && pathSet.Contains(p)) { removed++; continue; }
                                        remaining.Add(f);
                                    }
                                    if (remaining.Count <= 1)
                                    {
                                        drop = true;
                                    }
                                    else if (remaining.Count < filesArr.GetArrayLength())
                                    {
                                        var rebuilt = JsonSerializer.Deserialize<Dictionary<string, object>>(line);
                                        if (rebuilt != null)
                                        {
                                            var dataDict = JsonSerializer.Deserialize<Dictionary<string, object>>(data.GetRawText());
                                            if (dataDict != null)
                                            {
                                                dataDict["files"] = remaining.Select(r => JsonSerializer.Deserialize<object>(r.GetRawText())).ToList();
                                                rebuilt["data"] = dataDict;
                                                kept.Add(JsonSerializer.Serialize(rebuilt));
                                                continue;
                                            }
                                        }
                                    }
                                }
                            }
                            else
                            {
                                if (je.TryGetProperty("data", out var data) &&
                                    data.TryGetProperty("path", out var pp))
                                {
                                    var p = pp.GetString();
                                    if (p != null && pathSet.Contains(p)) { removed++; drop = true; }
                                }
                            }

                            if (!drop) kept.Add(line);
                        }
                        catch { kept.Add(line); }
                    }
                }

                var tmpPath = cachePath + ".tmp";
                await File.WriteAllLinesAsync(tmpPath, kept);
                await SafeFileHelpers.SafeAtomicMoveAsync(tmpPath, cachePath);

                // Synchronously delete files and collect results
                if (req.Trash)
                {
                    foreach (var p in paths)
                    {
                        try
                        {
                            var r = FileUtilities.SendToRecycleBin(p);
                            if (r.Ok) await cfgService.AppendSavingsAsync("trash", r.Freed, p);
                            deleteResults.Add(new { path = p, ok = r.Ok, error = r.Error });
                        }
                        catch (Exception ex)
                        {
                            deleteResults.Add(new { path = p, ok = false, error = ex.Message });
                        }
                    }
                }

                return Results.Ok(new { ok = true, removed, deleteResults });
            }
            catch (Exception ex)
            {
                return Results.Ok(new { ok = false, removed = 0, error = ex.Message });
            }
        });
    }
}
