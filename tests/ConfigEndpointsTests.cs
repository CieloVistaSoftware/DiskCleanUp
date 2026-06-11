// tests/ConfigEndpointsTests.cs
// Integration tests for ConfigEndpoints (GET /api/config, POST /api/config).

using System.Net.Http.Json;
using System.Text.Json;
using Xunit;

public class ConfigEndpointsTests
{
    static string MakeTempDir()
    {
        var dir = Path.Combine(Path.GetTempPath(), Path.GetRandomFileName());
        Directory.CreateDirectory(dir);
        return dir;
    }

    [Fact]
    public async Task GetConfig_ReturnsDefaultFields()
    {
        var tmpDir = MakeTempDir();
        try
        {
            await using var svc = await ApiTestFactory.CreateConfigAsync(tmpDir);
            var res = await svc.Client.GetAsync("/api/config");
            res.EnsureSuccessStatusCode();
            var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
            Assert.True(root.TryGetProperty("stale_days",    out _));
            Assert.True(root.TryGetProperty("large_file_mb", out _));
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    [Fact]
    public async Task GetConfig_AnthropicKeyStripped()
    {
        var tmpDir = MakeTempDir();
        try
        {
            await using var svc = await ApiTestFactory.CreateConfigAsync(tmpDir);
            var res = await svc.Client.GetAsync("/api/config");
            res.EnsureSuccessStatusCode();
            var root = JsonDocument.Parse(await res.Content.ReadAsStringAsync()).RootElement;
            // Key must be blank — never sent to browser
            if (root.TryGetProperty("anthropic_api_key", out var key))
                Assert.Equal(string.Empty, key.GetString());
        }
        finally { Directory.Delete(tmpDir, true); }
    }

    [Fact]
    public async Task PostConfig_SavesAndGetReflectsChange()
    {
        var tmpDir = MakeTempDir();
        try
        {
            await using var svc = await ApiTestFactory.CreateConfigAsync(tmpDir);
            var cfg = new { root = @"C:\test-root", stale_days = 45, large_file_mb = 25,
                            max_parallelism = 2, extra_roots = Array.Empty<string>() };
            var postRes = await svc.Client.PostAsJsonAsync("/api/config", cfg);
            postRes.EnsureSuccessStatusCode();
            var getRes = await svc.Client.GetAsync("/api/config");
            getRes.EnsureSuccessStatusCode();
            var root = JsonDocument.Parse(await getRes.Content.ReadAsStringAsync()).RootElement;
            Assert.Equal(45, root.GetProperty("stale_days").GetInt32());
            Assert.Equal(25, root.GetProperty("large_file_mb").GetInt32());
        }
        finally { Directory.Delete(tmpDir, true); }
    }
}
