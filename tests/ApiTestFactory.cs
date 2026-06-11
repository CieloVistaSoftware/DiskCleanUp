// tests/ApiTestFactory.cs
// Minimal WebApplication + TestServer factory for API integration tests.
// Each Create*Async() builds an isolated in-process server.  Call
// await using var app = await ApiTestFactory.Create*Async(...) in tests.

using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using DiskCleanup.Api;
using DiskCleanup.Services;

internal sealed class ApiTestFactory : IAsyncDisposable
{
    private readonly WebApplication _app;
    public HttpClient Client { get; }

    private ApiTestFactory(WebApplication app, HttpClient client)
    {
        _app   = app;
        Client = client;
    }

    public static async Task<ApiTestFactory> CreateCacheAsync(string tempDir)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddSingleton(new ConfigService(tempDir));
        var app = builder.Build();
        app.MapCacheEndpoints(tempDir);
        await app.StartAsync();
        return new ApiTestFactory(app, app.GetTestClient());
    }

    public static async Task<ApiTestFactory> CreateMetricsAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var app = builder.Build();
        app.MapMetricsEndpoints();
        await app.StartAsync();
        return new ApiTestFactory(app, app.GetTestClient());
    }

    public static async Task<ApiTestFactory> CreateConfigAsync(string tempDir)
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        builder.Services.AddSingleton(new ConfigService(tempDir));
        var app = builder.Build();
        app.MapConfigEndpoints();
        await app.StartAsync();
        return new ApiTestFactory(app, app.GetTestClient());
    }

    public static async Task<ApiTestFactory> CreateTasksAsync()
    {
        var builder = WebApplication.CreateBuilder();
        builder.WebHost.UseTestServer();
        var app = builder.Build();
        app.MapTaskEndpoints();
        await app.StartAsync();
        return new ApiTestFactory(app, app.GetTestClient());
    }

    public async ValueTask DisposeAsync()
    {
        Client.Dispose();
        await _app.StopAsync();
        await _app.DisposeAsync();
    }
}
