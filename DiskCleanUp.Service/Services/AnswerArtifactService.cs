// Services/AnswerArtifactService.cs
// Continuously materializes scan-cache state into JSON answer artifacts.
//
// Output:
//   %ProgramData%/DiskCleanUp/answers/manifest.json
//   %ProgramData%/DiskCleanUp/answers/<section>.json

using System.Diagnostics;
using System.Text.Json;
using DiskCleanup.Helpers;

namespace DiskCleanup.Services;

public class AnswerArtifactService : BackgroundService
{
    private readonly ScanOrchestrator _orchestrator;
    private readonly ConfigService _config;
    private readonly ILogger<AnswerArtifactService> _logger;

    private readonly SemaphoreSlim _generationLock = new(1, 1);
    private readonly string _answersDir = Path.Combine(Constants.DataDir, Constants.AnswersDir);
    private readonly string _manifestPath;

    private static readonly JsonSerializerOptions JsonOpts = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
    };

    private const int StartupDelaySeconds = 8;
    private const int DefaultRefreshSeconds = 60;

    public AnswerArtifactService(
        ScanOrchestrator orchestrator,
        ConfigService config,
        ILogger<AnswerArtifactService> logger)
    {
        _orchestrator = orchestrator;
        _config = config;
        _logger = logger;
        _manifestPath = Path.Combine(_answersDir, "manifest.json");
    }

    public async Task<object> RefreshNowAsync(CancellationToken cancellationToken = default)
    {
        return await GenerateArtifactsAsync("manual", cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        Directory.CreateDirectory(_answersDir);

        try
        {
            await Task.Delay(TimeSpan.FromSeconds(StartupDelaySeconds), stoppingToken);
            await GenerateArtifactsAsync("startup", stoppingToken);
        }
        catch (OperationCanceledException)
        {
            return;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Answers] Startup artifact generation failed");
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var cfg = await _config.LoadAsync();
                var refreshSeconds = cfg.AnswerRefreshSeconds > 0
                    ? cfg.AnswerRefreshSeconds
                    : DefaultRefreshSeconds;

                await Task.Delay(TimeSpan.FromSeconds(refreshSeconds), stoppingToken);
                await GenerateArtifactsAsync("interval", stoppingToken);
            }
            catch (OperationCanceledException)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Answers] Artifact loop iteration failed");
                await Task.Delay(TimeSpan.FromSeconds(10), stoppingToken);
            }
        }
    }

    private async Task<object> GenerateArtifactsAsync(string trigger, CancellationToken cancellationToken)
    {
        await _generationLock.WaitAsync(cancellationToken);
        var started = DateTime.UtcNow;
        var runId = Guid.NewGuid().ToString("n");
        var sw = Stopwatch.StartNew();

        try
        {
            Directory.CreateDirectory(_answersDir);
            var sections = new Dictionary<string, object>(StringComparer.OrdinalIgnoreCase);

            foreach (var section in Constants.AllSections)
            {
                cancellationToken.ThrowIfCancellationRequested();

                var generatedAt = DateTime.UtcNow;
                var rows = _orchestrator.GetCache(section).ToList();
                var fileName = $"{section}.json";
                var filePath = Path.Combine(_answersDir, fileName);

                var payload = new
                {
                    section,
                    generatedAtUtc = generatedAt.ToString("o"),
                    rowCount = rows.Count,
                    rows,
                };

                await WriteJsonAtomicAsync(filePath, payload, cancellationToken);

                sections[section] = new
                {
                    rowCount = rows.Count,
                    generatedAtUtc = generatedAt.ToString("o"),
                    file = fileName,
                };
            }

            sw.Stop();

            var manifest = new
            {
                generatedAtUtc = DateTime.UtcNow.ToString("o"),
                runId,
                trigger,
                durationMs = sw.ElapsedMilliseconds,
                status = "ok",
                error = (string?)null,
                sections,
            };

            await WriteJsonAtomicAsync(_manifestPath, manifest, cancellationToken);
            _logger.LogInformation("[Answers] Generated artifacts runId={RunId} durationMs={Duration}", runId, sw.ElapsedMilliseconds);
            return manifest;
        }
        catch (OperationCanceledException)
        {
            throw;
        }
        catch (Exception ex)
        {
            sw.Stop();
            _logger.LogError(ex, "[Answers] Artifact generation failed runId={RunId}", runId);

            var errorManifest = new
            {
                generatedAtUtc = DateTime.UtcNow.ToString("o"),
                runId,
                trigger,
                durationMs = sw.ElapsedMilliseconds,
                status = "error",
                error = ex.Message,
                sections = new Dictionary<string, object>(),
                startedAtUtc = started.ToString("o"),
            };

            await WriteJsonAtomicAsync(_manifestPath, errorManifest, CancellationToken.None);
            return errorManifest;
        }
        finally
        {
            _generationLock.Release();
        }
    }

    private static async Task WriteJsonAtomicAsync(string destinationPath, object payload, CancellationToken ct)
    {
        var tmpPath = destinationPath + ".tmp";
        var json = JsonSerializer.Serialize(payload, JsonOpts);
        await File.WriteAllTextAsync(tmpPath, json, ct);
        await SafeFileHelpers.SafeAtomicMoveAsync(tmpPath, destinationPath);
    }
}
