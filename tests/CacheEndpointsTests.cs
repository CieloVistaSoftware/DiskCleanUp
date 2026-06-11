// tests/CacheEndpointsTests.cs
// Integration tests for CacheEndpoints (GET/DELETE /api/cache/{section},
// POST /api/cache/{section}/remove).  Covers the critical delete path from #2.

using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

public class CacheEndpointsTests
{
    // ── helpers ──────────────────────────────────────────────────────────────

    static string MakeTempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName());
        Directory.CreateDirectory(dir);
        return dir;
    }

    static string EnsureCacheDir(string baseDir)
    {
        var dir = Path.Combine(baseDir, "scan-cache");
        Directory.CreateDirectory(dir);
        return dir;
    }

    static void WriteLines(string cacheDir, string section, IEnumerable<string> lines) =>
        File.WriteAllLines(Path.Combine(cacheDir, $"{section}.json"), lines);

    // ── GET /api/cache/{section} ──────────────────────────────────────────────

    [Fact]
    public async Task Get_NoFile_ReturnsEmptyRows()
    {
        var tmpDir = MakeTempDir();
        try
        {
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.GetAsync("/api/cache/stale");
            res.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            Assert.Equal(0, doc.RootElement.GetProperty("rows").GetArrayLength());
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    [Fact]
    public async Task Get_WithJsonlFile_ReturnsAllRows()
    {
        var tmpDir = MakeTempDir();
        try
        {
            var cacheDir = EnsureCacheDir(tmpDir);
            WriteLines(cacheDir, "stale", new[]
            {
                @"{""type"":""result"",""data"":{""path"":""C:\\file1.txt"",""size"":100}}",
                @"{""type"":""result"",""data"":{""path"":""C:\\file2.txt"",""size"":200}}",
            });
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.GetAsync("/api/cache/stale");
            res.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            Assert.Equal(2, doc.RootElement.GetProperty("rows").GetArrayLength());
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    [Fact]
    public async Task Get_WithOffset_SkipsFirstLine()
    {
        var tmpDir = MakeTempDir();
        try
        {
            var cacheDir = EnsureCacheDir(tmpDir);
            var line1 = @"{""type"":""result"",""data"":{""path"":""C:\\file1.txt"",""size"":100}}";
            var line2 = @"{""type"":""result"",""data"":{""path"":""C:\\file2.txt"",""size"":200}}";
            WriteLines(cacheDir, "stale", new[] { line1, line2 });
            var offset = System.Text.Encoding.UTF8.GetByteCount(line1) + 1; // +1 for newline
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.GetAsync($"/api/cache/stale?offset={offset}");
            res.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            Assert.Equal(1, doc.RootElement.GetProperty("rows").GetArrayLength());
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    [Fact]
    public async Task Get_ExhaustedCache_ReturnsNullNextOffset()
    {
        var tmpDir = MakeTempDir();
        try
        {
            var cacheDir = EnsureCacheDir(tmpDir);
            WriteLines(cacheDir, "stale", new[]
            {
                @"{""type"":""result"",""data"":{""path"":""C:\\file1.txt"",""size"":100}}",
            });
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.GetAsync("/api/cache/stale");
            res.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            // nextOffset is null when EOF (serialized as JSON null)
            Assert.Equal(JsonValueKind.Null, doc.RootElement.GetProperty("nextOffset").ValueKind);
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    // ── DELETE /api/cache/{section} ───────────────────────────────────────────

    [Fact]
    public async Task Delete_ClearsFileContents()
    {
        var tmpDir = MakeTempDir();
        try
        {
            var cacheDir = EnsureCacheDir(tmpDir);
            var cachePath = Path.Combine(cacheDir, "stale.json");
            WriteLines(cacheDir, "stale", new[] { @"{""data"":{""path"":""C:\\x.txt""}}" });
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.DeleteAsync("/api/cache/stale");
            res.EnsureSuccessStatusCode();
            Assert.Equal(0, new FileInfo(cachePath).Length);
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    // ── POST /api/cache/{section}/remove ─────────────────────────────────────

    [Fact]
    public async Task Remove_EmptyPaths_ReturnsZeroRemoved()
    {
        var tmpDir = MakeTempDir();
        try
        {
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.PostAsJsonAsync("/api/cache/stale/remove",
                new { paths = Array.Empty<string>(), trash = false });
            res.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
            Assert.Equal(0, doc.RootElement.GetProperty("removed").GetInt32());
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    [Fact]
    public async Task Remove_RemovesMatchingPath_KeepsOthers()
    {
        var tmpDir = MakeTempDir();
        try
        {
            var cacheDir = EnsureCacheDir(tmpDir);
            var cachePath = Path.Combine(cacheDir, "stale.json");
            WriteLines(cacheDir, "stale", new[]
            {
                @"{""type"":""result"",""data"":{""path"":""C:\\keep.txt"",""size"":100}}",
                @"{""type"":""result"",""data"":{""path"":""C:\\remove.txt"",""size"":200}}",
            });
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.PostAsJsonAsync("/api/cache/stale/remove",
                new { paths = new[] { @"C:\remove.txt" }, trash = false });
            res.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
            Assert.Equal(1, doc.RootElement.GetProperty("removed").GetInt32());
            var lines = File.ReadAllLines(cachePath);
            Assert.Single(lines);
            Assert.Contains("keep.txt", lines[0]);
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    [Fact]
    public async Task Remove_NoFile_ReturnsOkZeroRemoved()
    {
        var tmpDir = MakeTempDir();
        try
        {
            await using var svc = await ApiTestFactory.CreateCacheAsync(tmpDir);
            var res = await svc.Client.PostAsJsonAsync("/api/cache/stale/remove",
                new { paths = new[] { @"C:\ghost.txt" }, trash = false });
            res.EnsureSuccessStatusCode();
            var doc = JsonDocument.Parse(await res.Content.ReadAsStringAsync());
            Assert.True(doc.RootElement.GetProperty("ok").GetBoolean());
            Assert.Equal(0, doc.RootElement.GetProperty("removed").GetInt32());
        }
        finally { Directory.Delete(tmpDir, true); }
    }
}
