// Program.cs — DiskCleanUp.Service
// Slim entry point: hosting, DI, middleware, endpoint mapping.
//
// Modes:
//   --scan      Run scan engine only, no HTTP (headless, scheduled via Task Scheduler)
//   --serve     Run HTTP dashboard only, no background scan (on-demand, ephemeral)
//   --console   Run both (dev mode, opens browser)
//   (no args)   Console mode

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;
using DiskCleanup;
using DiskCleanup.Api;
using DiskCleanup.Scanning;
using DiskCleanup.Scanning.Rules;
using DiskCleanup.Services;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;

// ── CLI args ─────────────────────────────────────────────────
var cliMode = args.Length > 0 ? args[0].ToLowerInvariant().TrimStart('-') : null;

// Detect mode
bool isScanMode    = cliMode == "scan";
bool isServeMode   = cliMode == "serve";
bool isConsoleMode = !isScanMode && !isServeMode;

// ── Process tuning ───────────────────────────────────────────
Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal;
ThreadPool.SetMinThreads(
    workerThreads:         Environment.ProcessorCount * 4,
    completionPortThreads: Environment.ProcessorCount * 2);

// ── Data directory ───────────────────────────────────────────
var dataDir = Constants.DataDir;
EnsureDataDirectory(dataDir);

// ── Logging helpers ──────────────────────────────────────────
var logDir  = Path.Combine(dataDir, Constants.LogDir);
Directory.CreateDirectory(logDir);

void ConfigureLogging(ILoggingBuilder logging)
{
    logging.ClearProviders();
    if (isConsoleMode) logging.AddConsole();
    if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
    {
        logging.AddEventLog(s => { s.SourceName = Constants.ServiceName; s.LogName = "Application"; });
    }
    logging.SetMinimumLevel(isScanMode ? LogLevel.Information : LogLevel.Warning);
}

// ═══════════════════════════════════════════════════════════════
// SCAN MODE — engine only, no HTTP (headless, e.g. Task Scheduler)
// ═══════════════════════════════════════════════════════════════
if (isScanMode)
{
    var scanHost = Host.CreateDefaultBuilder(args)
        .ConfigureLogging(ConfigureLogging)
        .ConfigureServices(services =>
        {
            services.AddSingleton<ConfigService>(_ => new ConfigService(dataDir));
            services.AddSingleton<WsManager>();          // no-op — zero clients in scan mode
            services.AddSingleton<ScanPipeline>();
            services.AddSingleton<IScanRule, DuplicatesRule>();
            services.AddSingleton<IScanRule, SmartDedupRule>();
            services.AddSingleton<IScanRule, StaleRule>();
            services.AddSingleton<IScanRule, LargeRule>();
            services.AddSingleton<IScanRule, TinyFilesRule>();
            services.AddSingleton<IScanRule, HtmlFilesRule>();
            services.AddSingleton<IScanRule, CssFilesRule>();
            services.AddSingleton<IScanRule, EmptyRule>();
            services.AddSingleton<IScanRule, NodeModulesRule>();
            services.AddSingleton<IScanRule, VenvsRule>();
            services.AddSingleton<IScanRule, ImagesRule>();
            services.AddSingleton<IScanRule, BackupsRule>();
            services.AddSingleton<IScanRule, ExtSearchRule>();
            services.AddSingleton<ScanOrchestrator>();
            services.AddSingleton<AnswerArtifactService>();
            services.AddHostedService<MetricsService>();
            services.AddHostedService<BackgroundScanService>();
            services.AddHostedService(sp => sp.GetRequiredService<AnswerArtifactService>());
            services.AddSingleton<RollingFileLogger>(_ =>
                new RollingFileLogger(Path.Combine(logDir, "service.log")));
        })
        .Build();

    var fileLogger = scanHost.Services.GetRequiredService<RollingFileLogger>();
    AppDomain.CurrentDomain.UnhandledException += (_, e) =>
        fileLogger.Log($"FATAL: {e.ExceptionObject}");

    var log = scanHost.Services.GetRequiredService<ILogger<Program>>();
    log.LogInformation("🧹 DiskCleanUp scan engine starting — data={DataDir}, CPUs={Cpus}",
        dataDir, Environment.ProcessorCount);

    await scanHost.RunAsync();
    return;
}

// ═══════════════════════════════════════════════════════════════
// SERVE / CONSOLE MODE — HTTP dashboard (+ background scan in console)
// ═══════════════════════════════════════════════════════════════
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args            = args,
    ContentRootPath = AppContext.BaseDirectory,
    WebRootPath     = Path.Combine(AppContext.BaseDirectory, "wwwroot"),
});

builder.Logging.ClearProviders();
ConfigureLogging(builder.Logging);

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

// Core services — always registered in serve/console
builder.Services.AddSingleton<ConfigService>(_ => new ConfigService(dataDir));
builder.Services.AddSingleton<WsManager>();
builder.Services.AddSingleton<ScanPipeline>();
builder.Services.AddSingleton<IScanRule, DuplicatesRule>();
builder.Services.AddSingleton<IScanRule, SmartDedupRule>();
builder.Services.AddSingleton<IScanRule, StaleRule>();
builder.Services.AddSingleton<IScanRule, LargeRule>();
builder.Services.AddSingleton<IScanRule, TinyFilesRule>();
builder.Services.AddSingleton<IScanRule, HtmlFilesRule>();
builder.Services.AddSingleton<IScanRule, CssFilesRule>();
builder.Services.AddSingleton<IScanRule, EmptyRule>();
builder.Services.AddSingleton<IScanRule, NodeModulesRule>();
builder.Services.AddSingleton<IScanRule, VenvsRule>();
builder.Services.AddSingleton<IScanRule, ImagesRule>();
builder.Services.AddSingleton<IScanRule, BackupsRule>();
builder.Services.AddSingleton<IScanRule, ExtSearchRule>();
builder.Services.AddSingleton<ScanOrchestrator>();
builder.Services.AddSingleton<DiagService>(_ => new DiagService(dataDir));
builder.Services.AddSingleton<AnswerArtifactService>();
builder.Services.AddSingleton<RollingFileLogger>(_ =>
    new RollingFileLogger(Path.Combine(logDir, "service.log")));

// Background scan services — only in console (dev) mode
if (isConsoleMode)
{
    builder.Services.AddHostedService<MetricsService>();
    builder.Services.AddHostedService<BackgroundScanService>();
    builder.Services.AddHostedService(sp => sp.GetRequiredService<AnswerArtifactService>());
}

var app = builder.Build();

var fileLog = app.Services.GetRequiredService<RollingFileLogger>();
AppDomain.CurrentDomain.UnhandledException += (_, e) =>
    fileLog.Log($"FATAL: {e.ExceptionObject}");

// ── WebSocket middleware ──────────────────────────────────────
app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

var wsManager    = app.Services.GetRequiredService<WsManager>();
var orchestrator = app.Services.GetRequiredService<ScanOrchestrator>();

wsManager.OnClientMessage += async (type, section, extensions) =>
{
    if (type == "start")  await orchestrator.StartAsync(section, extensions);
    if (type == "cancel") orchestrator.Cancel(section);
};

app.Map("/ws", async ctx =>
{
    if (!ctx.WebSockets.IsWebSocketRequest) { ctx.Response.StatusCode = 400; return; }
    var ws = await ctx.WebSockets.AcceptWebSocketAsync();
    await wsManager.HandleAsync(ws, ctx.RequestAborted);
});

// ── Static files ─────────────────────────────────────────────
var contentTypes = new Microsoft.AspNetCore.StaticFiles.FileExtensionContentTypeProvider();
contentTypes.Mappings[".md"] = "text/markdown";
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = contentTypes,
    OnPrepareResponse = ctx =>
    {
        ctx.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        ctx.Context.Response.Headers.Pragma = "no-cache";
        ctx.Context.Response.Headers.Expires = "0";
    }
});

// ── API Endpoints ─────────────────────────────────────────────
app.MapCacheEndpoints(dataDir);
app.MapConfigEndpoints();
app.MapAiEndpoints();
app.MapAnswersEndpoints(dataDir);
app.MapKeepListEndpoints();
app.MapTrashEndpoints();
app.MapRecycleBinEndpoints();
app.MapDiagEndpoints(dataDir);
app.MapMetricsEndpoints();
app.MapFileEndpoints();
app.MapHtmlUtilityEndpoints();
app.MapTaskEndpoints();
app.MapScanLogEndpoints();

app.MapGet("/api/service/info", () => Results.Ok(new
{
    mode    = isScanMode ? "scan" : isServeMode ? "serve" : "console",
    dataDir,
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0",
    uptime  = (DateTime.UtcNow - Process.GetCurrentProcess().StartTime.ToUniversalTime()).ToString(@"d\.hh\:mm\:ss"),
}));

app.MapPost("/api/shutdown", (IHostApplicationLifetime lifetime) =>
{
    _ = Task.Run(async () => { await Task.Delay(500); lifetime.StopApplication(); });
    return Results.Ok(new { message = "Shutting down..." });
});

app.MapPost("/api/restart", () =>
{
    _ = Task.Run(async () => { await Task.Delay(500); Environment.Exit(1); });
    return Results.Ok(new { message = "Restarting..." });
});

app.MapFallbackToFile("index.html");

// ── Bind + start ─────────────────────────────────────────────
// Serve mode: port 0 → OS picks a free port → write to port.txt → open browser
// Console mode: fixed dev port for predictability
if (isServeMode)
{
    app.Urls.Add("http://127.0.0.1:0");
    await app.StartAsync();

    var address = app.Services.GetRequiredService<IServer>()
        .Features.Get<IServerAddressesFeature>()!
        .Addresses.First();
    var actualPort = new Uri(address).Port;

    // Write port so CVT extension (or any launcher) can find it
    var portFile = Path.Combine(dataDir, "dashboard-port.txt");
    await File.WriteAllTextAsync(portFile, actualPort.ToString());

    Console.WriteLine($"🧹 DiskCleanUp dashboard → http://127.0.0.1:{actualPort}  |  data: {dataDir}");

    Process.Start(new ProcessStartInfo
    {
        FileName = $"http://127.0.0.1:{actualPort}",
        UseShellExecute = true
    });

    await app.WaitForShutdownAsync();

    // Clean up port file on exit
    File.Delete(portFile);
}
else
{
    // Console (dev) mode — fixed port, opens browser after brief delay
    app.Urls.Add($"http://127.0.0.1:{Constants.DevPort}");

    var logger = app.Services.GetRequiredService<ILogger<Program>>();
    logger.LogInformation("🧹 DiskCleanUp starting — mode=console, port={Port}, data={DataDir}, CPUs={Cpus}",
        Constants.DevPort, dataDir, Environment.ProcessorCount);

    Console.WriteLine($"🧹 DiskCleanUp → http://127.0.0.1:{Constants.DevPort}  |  WS: /ws  |  data: {dataDir}  |  {Environment.ProcessorCount} CPUs");

    _ = Task.Run(async () =>
    {
        await Task.Delay(1200);
        Process.Start(new ProcessStartInfo
        {
            FileName = $"http://127.0.0.1:{Constants.DevPort}",
            UseShellExecute = true
        });
    });

    await app.RunAsync();
}


// ═══════════════════════════════════════════════════════════════
// Helper: Ensure data directory structure exists
// ═══════════════════════════════════════════════════════════════
static void EnsureDataDirectory(string dataDir)
{
    Directory.CreateDirectory(dataDir);
    Directory.CreateDirectory(Path.Combine(dataDir, Constants.ScanCacheDir));
    Directory.CreateDirectory(Path.Combine(dataDir, Constants.AnswersDir));
    Directory.CreateDirectory(Path.Combine(dataDir, Constants.LogDir));
}

// ═══════════════════════════════════════════════════════════════
// Simple rolling file logger (10MB × 3 files)
// ═══════════════════════════════════════════════════════════════
public class RollingFileLogger
{
    private readonly string _path;
    private readonly long   _maxBytes;
    private readonly int    _maxFiles;
    private readonly object _lock = new();

    public RollingFileLogger(string path, long maxBytes = 10 * 1024 * 1024, int maxFiles = 3)
    {
        _path     = path;
        _maxBytes = maxBytes;
        _maxFiles = maxFiles;
    }

    public void Log(string message)
    {
        lock (_lock)
        {
            try
            {
                var line = $"[{DateTime.UtcNow:O}] {message}{Environment.NewLine}";
                File.AppendAllText(_path, line);
                var fi = new FileInfo(_path);
                if (fi.Exists && fi.Length > _maxBytes) Rotate();
            }
            catch { /* logging must never crash the service */ }
        }
    }

    private void Rotate()
    {
        var oldest = $"{_path}.{_maxFiles}";
        if (File.Exists(oldest)) File.Delete(oldest);
        for (int i = _maxFiles - 1; i >= 1; i--)
        {
            var src = i == 1 ? _path : $"{_path}.{i}";
            var dst = $"{_path}.{i + 1}";
            if (File.Exists(src)) File.Move(src, dst, overwrite: true);
        }
    }
}
