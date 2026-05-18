// Program.cs — DiskCleanUp.Service
// Slim entry point: hosting, DI, middleware, endpoint mapping.
// All endpoint logic lives in Api/*.cs extension classes.
// All business logic lives in Services/*.cs.
//
// Phase 2: Windows Service support.
//   --console     Run as console app (dev mode, opens browser)
//   --install     Register + start as Windows Service
//   --uninstall   Stop + remove Windows Service
//   (no args)     Run as service if launched by SCM, else console mode

using System.Diagnostics;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text.Json;
using DiskCleanup;
using DiskCleanup.Api;
using DiskCleanup.Services;

// ── CLI args ─────────────────────────────────────────────────
var cliMode = args.Length > 0 ? args[0].ToLowerInvariant().TrimStart('-') : null;

if (cliMode == "install")  { InstallService(); return; }
if (cliMode == "uninstall") { UninstallService(); return; }

// Detect if launched by Service Control Manager (no console window)
bool isServiceMode = !Environment.UserInteractive && cliMode != "console";
bool isConsoleMode = !isServiceMode;

// ── Process tuning ───────────────────────────────────────────
Process.GetCurrentProcess().PriorityClass = ProcessPriorityClass.BelowNormal;
ThreadPool.SetMinThreads(
    workerThreads:         Environment.ProcessorCount * 4,
    completionPortThreads: Environment.ProcessorCount * 2);

// ── Data directory ───────────────────────────────────────────
// Always %ProgramData%\DiskCleanUp\ — one folder, one place.
var dataDir = Constants.DataDir;

EnsureDataDirectory(dataDir);

// ── Port ─────────────────────────────────────────────────────────────────
// Console mode (dev): always 5000 — predictable, never fights the service.
// Service mode (prod): reads from dashboard_config.json, falls back to 5100.
int port = isConsoleMode ? Constants.DevPort : ReadPortFromConfig(dataDir);

// ── Builder ──────────────────────────────────────────────────
var builder = WebApplication.CreateBuilder(args);

// Windows Service integration — when launched by SCM, hooks into
// service lifecycle (OnStart/OnStop). No-op when running as console.
builder.Host.UseWindowsService(options =>
{
    options.ServiceName = Constants.ServiceName;
});

builder.Services.ConfigureHttpJsonOptions(o =>
    o.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.CamelCase);

// Services
builder.Services.AddSingleton<ConfigService>(_ => new ConfigService(dataDir));
builder.Services.AddSingleton<WsManager>();
builder.Services.AddSingleton<ScanOrchestrator>();
builder.Services.AddSingleton<DiagService>(_ => new DiagService(dataDir));
builder.Services.AddSingleton<AnswerArtifactService>();
builder.Services.AddHostedService<MetricsService>();
builder.Services.AddHostedService<BackgroundScanService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<AnswerArtifactService>());

// ── Logging ──────────────────────────────────────────────────
builder.Logging.ClearProviders();

if (isConsoleMode)
{
    builder.Logging.AddConsole();
}

if (RuntimeInformation.IsOSPlatform(OSPlatform.Windows))
{
    builder.Logging.AddEventLog(settings =>
    {
        settings.SourceName = Constants.ServiceName;
        settings.LogName = "Application";
    });
}

builder.Logging.SetMinimumLevel(isServiceMode ? LogLevel.Information : LogLevel.Warning);

// Rolling file log → %DataDir%\logs\service.log
var logDir = Path.Combine(dataDir, Constants.LogDir);
Directory.CreateDirectory(logDir);
builder.Services.AddSingleton<RollingFileLogger>(_ =>
    new RollingFileLogger(Path.Combine(logDir, "service.log")));

var app = builder.Build();

// Wire up rolling file logger for unhandled exceptions
var fileLogger = app.Services.GetRequiredService<RollingFileLogger>();
AppDomain.CurrentDomain.UnhandledException += (_, e) =>
    fileLogger.Log($"FATAL: {e.ExceptionObject}");

// ── WebSocket middleware ─────────────────────────────────────
// 30-second TCP keep-alives let the server detect silently-dropped connections
// (VPN reconnect, laptop sleep/wake, router idle timeout) without waiting
// for the next send to fail. TimeSpan.Zero disables them entirely — don't use it.
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

// ── API Endpoints (each is a static extension method) ────────
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

// Service info endpoint
app.MapGet("/api/service/info", () => Results.Ok(new
{
    mode = isServiceMode ? "service" : "console",
    port,
    dataDir,
    version = typeof(Program).Assembly.GetName().Version?.ToString() ?? "0.0.0",
    uptime = (DateTime.UtcNow - Process.GetCurrentProcess().StartTime.ToUniversalTime()).ToString(@"d\.hh\:mm\:ss"),
}));

// Graceful shutdown endpoint — used by kill-port.js to stop the service
// before rebuilding, without needing admin privileges for sc stop.
app.MapPost("/api/shutdown", (IHostApplicationLifetime lifetime) =>
{
    _ = Task.Run(async () =>
    {
        await Task.Delay(500);   // let the 200 response flush
        lifetime.StopApplication();
    });
    return Results.Ok(new { message = "Shutting down..." });
});

// Restart endpoint — no elevation needed.
// Exits with code 1 so the SCM recovery policy (restart/5s set during install)
// automatically brings the service back up. Works from any HTTP client.
app.MapPost("/api/restart", () =>
{
    _ = Task.Run(async () =>
    {
        await Task.Delay(500);   // let the 200 response flush
        Environment.Exit(1);     // non-zero → SCM sees failure → auto-restarts
    });
    return Results.Ok(new { message = "Restarting..." });
});

app.MapFallbackToFile("index.html");

// ── Start ────────────────────────────────────────────────────
app.Urls.Add($"http://127.0.0.1:{port}");

var logger = app.Services.GetRequiredService<ILogger<Program>>();
logger.LogInformation("🧹 DiskCleanUp starting — mode={Mode}, port={Port}, data={DataDir}, CPUs={Cpus}",
    isServiceMode ? "service" : "console", port, dataDir, Environment.ProcessorCount);

if (isConsoleMode)
{
    Console.WriteLine($"🧹 DiskCleanUp → http://localhost:{port}  |  WS: /ws  |  data: {dataDir}  |  {Environment.ProcessorCount} CPUs");

    _ = Task.Run(async () =>
    {
        await Task.Delay(1200);
        Process.Start(new ProcessStartInfo
        {
            FileName = $"http://localhost:{port}", UseShellExecute = true
        });
    });
}

await app.RunAsync();


// ═══════════════════════════════════════════════════════════════
// Port reader — synchronous, runs before the host builds.
// Reads dashboard_config.json and returns DashConfig.Port.
// Falls back to Constants.ServicePort if file is missing or corrupt.
// This is the ONLY place the port decision is made.
// ═══════════════════════════════════════════════════════════════
static int ReadPortFromConfig(string dataDir)
{
    try
    {
        var configFile = Path.Combine(dataDir, "dashboard_config.json");
        if (!File.Exists(configFile)) return Constants.ServicePort;
        var json = File.ReadAllText(configFile);
        using var doc  = JsonDocument.Parse(json);
        if (doc.RootElement.TryGetProperty("port", out var el) && el.TryGetInt32(out var p) && p > 0)
            return p;
    }
    catch { /* corrupt config — use fallback */ }
    return Constants.ServicePort;
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
// Service install / uninstall via sc.exe
// ═══════════════════════════════════════════════════════════════
static void InstallService()
{
    var exePath = Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName;
    if (exePath == null) { Console.Error.WriteLine("❌ Cannot determine executable path."); return; }

    Console.WriteLine($"📦 Installing {Constants.ServiceName}...");

    // Ensure data directory exists before first run
    EnsureDataDirectory(Constants.DataDir);

    // Migrate data from old location if needed
    MigrateData(Constants.DataDir);

    // Create the service
    RunSc($"create {Constants.ServiceName} binPath= \"{exePath}\" start= auto DisplayName= \"{Constants.ServiceDisplayName}\"");

    // Set description
    RunSc($"description {Constants.ServiceName} \"Background disk scanner and cleanup service. Dashboard at http://localhost:{Constants.ServicePort}\"");

    // Recovery policy: restart after 5s, 30s, 60s
    RunSc($"failure {Constants.ServiceName} reset= 86400 actions= restart/5000/restart/30000/restart/60000");

    // Start it
    RunSc($"start {Constants.ServiceName}");

    Console.WriteLine($"✅ Service installed and started. Dashboard: http://localhost:{Constants.ServicePort}");
}

static void UninstallService()
{
    Console.WriteLine($"🗑️ Uninstalling {Constants.ServiceName}...");

    RunSc($"stop {Constants.ServiceName}");
    Thread.Sleep(2000); // Give it time to stop
    RunSc($"delete {Constants.ServiceName}");

    Console.WriteLine("✅ Service removed. Data in %ProgramData%\\DiskCleanUp\\ preserved.");
}

static void RunSc(string arguments)
{
    Console.WriteLine($"  sc.exe {arguments}");
    var p = Process.Start(new ProcessStartInfo
    {
        FileName = "sc.exe",
        Arguments = arguments,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
    });
    p?.WaitForExit(15_000);
    var stdout = p?.StandardOutput.ReadToEnd();
    var stderr = p?.StandardError.ReadToEnd();
    if (!string.IsNullOrWhiteSpace(stdout)) Console.WriteLine($"    {stdout.Trim()}");
    if (!string.IsNullOrWhiteSpace(stderr)) Console.Error.WriteLine($"    {stderr.Trim()}");
}

// ═══════════════════════════════════════════════════════════════
// Data migration: copy config/cache from old bin/ location
// ═══════════════════════════════════════════════════════════════
static void MigrateData(string targetDir)
{
    if (File.Exists(Path.Combine(targetDir, "dashboard_config.json"))) return; // Already migrated

    // Search for old data in likely locations:
    // 1. AppContext.BaseDirectory (same project rebuilt)
    // 2. Sibling old project output (DiskCleanupDashboard)
    // 3. Parent repo's bin output
    string? oldDir = null;
    string[] candidates = [
        AppContext.BaseDirectory,
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "bin", "Debug", "net8.0")),
        Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "bin", "Release", "net8.0")),
    ];

    foreach (var candidate in candidates)
    {
        if (File.Exists(Path.Combine(candidate, "dashboard_config.json")))
        {
            oldDir = candidate;
            break;
        }
    }

    if (oldDir == null) return; // Nothing to migrate

    Console.WriteLine("📋 Migrating data from old location...");

    string[] filesToCopy = [
        "dashboard_config.json",
        "keep-list.json",
        "savings_log.jsonl",
        "current_session.json",
        "errors.jsonl",
        "debug.json",
        "trace.jsonl",
    ];

    foreach (var file in filesToCopy)
    {
        var src = Path.Combine(oldDir, file);
        var dst = Path.Combine(targetDir, file);
        if (File.Exists(src) && !File.Exists(dst))
        {
            File.Copy(src, dst);
            Console.WriteLine($"  ✅ {file}");
        }
    }

    // Copy scan-cache directory
    var oldCache = Path.Combine(oldDir, "scan-cache");
    var newCache = Path.Combine(targetDir, "scan-cache");
    if (Directory.Exists(oldCache))
    {
        Directory.CreateDirectory(newCache);
        foreach (var file in Directory.GetFiles(oldCache))
        {
            var dst = Path.Combine(newCache, Path.GetFileName(file));
            if (!File.Exists(dst))
            {
                File.Copy(file, dst);
                Console.WriteLine($"  ✅ scan-cache/{Path.GetFileName(file)}");
            }
        }
    }

    Console.WriteLine("📋 Migration complete.");
}


// ═══════════════════════════════════════════════════════════════
// Simple rolling file logger (10MB × 3 files)
// ═══════════════════════════════════════════════════════════════
public class RollingFileLogger
{
    private readonly string _path;
    private readonly long _maxBytes;
    private readonly int _maxFiles;
    private readonly object _lock = new();

    public RollingFileLogger(string path, long maxBytes = 10 * 1024 * 1024, int maxFiles = 3)
    {
        _path = path;
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
                if (fi.Exists && fi.Length > _maxBytes)
                    Rotate();
            }
            catch { /* logging must never crash the service */ }
        }
    }

    private void Rotate()
    {
        // Delete oldest
        var oldest = $"{_path}.{_maxFiles}";
        if (File.Exists(oldest)) File.Delete(oldest);

        // Shift existing: .2 → .3, .1 → .2
        for (int i = _maxFiles - 1; i >= 1; i--)
        {
            var src = i == 1 ? _path : $"{_path}.{i}";
            var dst = $"{_path}.{i + 1}";
            if (File.Exists(src))
                File.Move(src, dst, overwrite: true);
        }
    }
}
