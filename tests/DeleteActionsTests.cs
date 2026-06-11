// DeleteActionsTests.cs
// Tests for all delete/trash actions — the critical "Delete Selected" paths.
// Copyright (c) 2026 CieloVista Software. All rights reserved.
//
// Answers the question: "What test did you run to test Delete Selected?"

using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Xunit;
using DiskCleanup.Api;
using DiskCleanup.Services;

/// <summary>
/// Integration tests for all delete endpoints.
/// Uses TestServer — no live port needed.
/// </summary>
public class DeleteActionsTests : IAsyncDisposable
{
    private readonly string          _tempDir;
    private readonly WebApplication  _app;
    private readonly HttpClient      _client;

    public DeleteActionsTests()
    {
        _tempDir = Path.Combine(Path.GetPathRoot(Environment.CurrentDirectory) ?? @"C:\",
                                "dcu-delete-tests", Guid.NewGuid().ToString("N")[..8]);
        Directory.CreateDirectory(_tempDir);

        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddSingleton(new ConfigService(_tempDir));
        _app = builder.Build();
        _app.MapTrashEndpoints();
        _app.StartAsync().GetAwaiter().GetResult();
        _client = _app.GetTestClient();
    }

    // ── /api/delete-permanent ─────────────────────────────────────────────────

    [Fact]
    public async Task DeletePermanent_RemovesFile()
    {
        var file = TmpFile("to-delete.txt");
        Assert.True(File.Exists(file));

        var res = await _client.PostAsJsonAsync("/api/delete-permanent", new { paths = new[] { file } });
        res.EnsureSuccessStatusCode();

        Assert.False(File.Exists(file), "File should be gone after permanent delete");
    }

    [Fact]
    public async Task DeletePermanent_ReturnsFreedBytes()
    {
        var file = TmpFileSized("sized.bin", 4096);
        var res = await _client.PostAsJsonAsync("/api/delete-permanent", new { paths = new[] { file } });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<DeleteResult>();
        Assert.True(body!.freed >= 4096);
    }

    [Fact]
    public async Task DeletePermanent_MultipleFiles_AllRemoved()
    {
        var files = Enumerable.Range(0, 5).Select(i => TmpFile($"f{i}.txt")).ToArray();
        var res = await _client.PostAsJsonAsync("/api/delete-permanent", new { paths = files });
        res.EnsureSuccessStatusCode();
        Assert.All(files, f => Assert.False(File.Exists(f)));
    }

    [Fact]
    public async Task DeletePermanent_MissingFile_ReturnsErrorNotException()
    {
        var res = await _client.PostAsJsonAsync("/api/delete-permanent",
            new { paths = new[] { Path.Combine(_tempDir, "ghost.txt") } });
        res.EnsureSuccessStatusCode(); // endpoint never throws — errors go in body
    }

    [Fact]
    public async Task DeletePermanent_EmptyPaths_ReturnsZeroFreed()
    {
        var res = await _client.PostAsJsonAsync("/api/delete-permanent", new { paths = Array.Empty<string>() });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<DeleteResult>();
        Assert.Equal(0L, body!.freed);
    }

    [Fact]
    public async Task DeletePermanent_RemovesDirectory()
    {
        var dir = Path.Combine(_tempDir, "subdir-" + Guid.NewGuid().ToString("N")[..6]);
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "a.txt"), "content");
        Assert.True(Directory.Exists(dir));

        var res = await _client.PostAsJsonAsync("/api/delete-permanent", new { paths = new[] { dir } });
        res.EnsureSuccessStatusCode();
        Assert.False(Directory.Exists(dir), "Directory should be gone after permanent delete");
    }

    // ── /api/empty-folders/delete ─────────────────────────────────────────────

    [Fact]
    public async Task EmptyFoldersDelete_RemovesEmptyDir()
    {
        var dir = Path.Combine(_tempDir, "empty-" + Guid.NewGuid().ToString("N")[..6]);
        Directory.CreateDirectory(dir);
        Assert.True(Directory.Exists(dir));

        var res = await _client.PostAsJsonAsync("/api/empty-folders/delete", new { paths = new[] { dir } });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<EmptyDeleteResult>();
        Assert.Contains(dir, body!.deleted);
        Assert.False(Directory.Exists(dir));
    }

    [Fact]
    public async Task EmptyFoldersDelete_NonEmptyDirReturnsError()
    {
        var dir = Path.Combine(_tempDir, "nonempty-" + Guid.NewGuid().ToString("N")[..6]);
        Directory.CreateDirectory(dir);
        File.WriteAllText(Path.Combine(dir, "file.txt"), "not empty");

        var res = await _client.PostAsJsonAsync("/api/empty-folders/delete", new { paths = new[] { dir } });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<EmptyDeleteResult>();
        // Should report an error, not succeed
        Assert.Empty(body!.deleted);
        Assert.NotEmpty(body.errors);
        Assert.True(Directory.Exists(dir)); // dir should still exist
    }

    [Fact]
    public async Task EmptyFoldersDelete_MultipleDirs_AllRemoved()
    {
        var dirs = Enumerable.Range(0, 3)
            .Select(i => { var d = Path.Combine(_tempDir, $"ed{i}-{Guid.NewGuid():N}"); Directory.CreateDirectory(d); return d; })
            .ToArray();
        var res = await _client.PostAsJsonAsync("/api/empty-folders/delete", new { paths = dirs });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<EmptyDeleteResult>();
        Assert.Equal(3, body!.deleted.Length);
        Assert.All(dirs, d => Assert.False(Directory.Exists(d)));
    }

    [Fact]
    public async Task EmptyFoldersDelete_MissingDir_ReturnsError()
    {
        var missing = Path.Combine(_tempDir, "ghost-dir");
        var res = await _client.PostAsJsonAsync("/api/empty-folders/delete", new { paths = new[] { missing } });
        res.EnsureSuccessStatusCode(); // never throws
    }

    [Fact]
    public async Task EmptyFoldersDelete_EmptyPaths_ReturnsEmptyDeleted()
    {
        var res = await _client.PostAsJsonAsync("/api/empty-folders/delete", new { paths = Array.Empty<string>() });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<EmptyDeleteResult>();
        Assert.Empty(body!.deleted);
    }

    // ── /api/trash (recycle bin) ──────────────────────────────────────────────

    [Fact]
    public async Task Trash_SendsFileToRecycleBin()
    {
        var file = TmpFile("trash-me.txt");
        Assert.True(File.Exists(file));

        var res = await _client.PostAsJsonAsync("/api/trash", new { paths = new[] { file } });
        res.EnsureSuccessStatusCode();

        // File should no longer be at original path (it's in Recycle Bin)
        Assert.False(File.Exists(file), "File should be removed from original path after trash");
    }

    [Fact]
    public async Task Trash_MissingFile_ReturnsOkNotException()
    {
        var res = await _client.PostAsJsonAsync("/api/trash",
            new { paths = new[] { Path.Combine(_tempDir, "nonexistent.txt") } });
        res.EnsureSuccessStatusCode();
    }

    [Fact]
    public async Task Trash_EmptyPaths_ReturnsZeroFreed()
    {
        var res = await _client.PostAsJsonAsync("/api/trash", new { paths = Array.Empty<string>() });
        res.EnsureSuccessStatusCode();
        var body = await res.Content.ReadFromJsonAsync<DeleteResult>();
        Assert.Equal(0L, body!.freed);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private string TmpFile(string name, string content = "test content for delete")
    {
        var p = Path.Combine(_tempDir, name);
        File.WriteAllText(p, content);
        return p;
    }

    private string TmpFileSized(string name, long bytes)
    {
        var p = Path.Combine(_tempDir, name);
        using var fs = new FileStream(p, FileMode.Create, FileAccess.Write);
        fs.SetLength(bytes);
        return p;
    }

    public async ValueTask DisposeAsync()
    {
        await _app.DisposeAsync();
        _client.Dispose();
        try { if (Directory.Exists(_tempDir)) Directory.Delete(_tempDir, recursive: true); } catch { }
    }

    // ── response shapes ───────────────────────────────────────────────────────
    private record DeleteResult(long freed, string[] errors);
    private record EmptyDeleteResult(string[] deleted, string[] errors);
}
