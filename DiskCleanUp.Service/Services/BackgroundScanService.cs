// BackgroundScanService.cs
// Runs scans automatically so the cache is always fresh.
//
// STARTUP SCAN:
//   On service start, queues ALL sections with a staggered delay
//   between each so we don't hammer the disk all at once.
//   Light scans run first, heavy scans (MD5-based) run last.
//   If the user manually kicks off a section before its turn,
//   the orchestrator's TryAdd guard skips the duplicate — no conflict.
//
// SCHEDULED SCAN:
//   After startup scans complete, enters the daily-schedule loop.
//   If "scheduled_scan_time" is configured (e.g. "02:00"), runs
//   all configured sections at that time daily.
//   If not configured, does nothing — startup scan already populated the cache.
//
// INTERVAL SCAN:
//   After the daily scheduled scan (or if none configured), waits
//   "scan_interval_hours" (default: 6) then runs all sections again.
//   This keeps the cache fresh even if no one opens the dashboard.

using DiskCleanup.Models;

namespace DiskCleanup.Services;

public class BackgroundScanService : BackgroundService
{
    private readonly ScanOrchestrator _orchestrator;
    private readonly ConfigService    _config;
    private readonly ILogger<BackgroundScanService> _logger;

    // Ordered light → heavy. Duplicates and images do MD5 hashing
    // so they go last to let the quick scans populate the cache first.
    private static readonly string[] AllSections =
    [
        "empty",        // fastest — just checks directory entries
        "large",        // fast — single stat per file
        "stale",        // fast — single stat per file
        "tiny-files",   // fast — single stat per file
        "html-files",   // fast — extension filter only
        "css-files",    // fast — extension filter only
        "backups",      // medium — directory size calculation
        "node-modules", // medium — directory size calculation
        "venvs",        // medium — directory size calculation
        "smart-dedup",  // medium — groups by name, no hashing
        "images",       // heavy — MD5 hashing
        "duplicates",   // heaviest — MD5 hashing all files
    ];

    // Default delay between sections during startup scan (seconds)
    private const int DelayBetweenSections = 30;

    // Default delay before starting the first scan after boot
    private const int StartupDelay = 15;

    // Default interval between full scan cycles (hours)
    private const double DefaultIntervalHours = 6.0;

    public BackgroundScanService(
        ScanOrchestrator orchestrator,
        ConfigService config,
        ILogger<BackgroundScanService> logger)
    {
        _orchestrator = orchestrator;
        _config       = config;
        _logger       = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("[Scheduler] Background scan service started");

        // ── Phase 1: Startup scan (staggered) ────────────────
        try
        {
            _logger.LogInformation(
                "[Scheduler] Startup scan in {Delay}s — {Count} sections, {Gap}s between each",
                StartupDelay, AllSections.Length, DelayBetweenSections);

            await Task.Delay(TimeSpan.FromSeconds(StartupDelay), stoppingToken);

            await RunStaggeredScan(AllSections, stoppingToken);

            _logger.LogInformation("[Scheduler] Startup scan complete — all sections queued");
        }
        catch (OperationCanceledException) { return; }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[Scheduler] Error during startup scan");
        }

        // ── Phase 2: Recurring loop ──────────────────────────
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                var cfg = await _config.LoadAsync();

                // Check for daily scheduled time first
                var scheduledDelay = GetDelayUntilNextRun(cfg.ScheduledScanTime);

                // Interval-based fallback (default 6 hours)
                var intervalHours = cfg.ScanIntervalHours > 0
                    ? cfg.ScanIntervalHours
                    : DefaultIntervalHours;
                var intervalDelay = TimeSpan.FromHours(intervalHours);

                // Use whichever comes first: scheduled time or interval
                TimeSpan waitTime;
                string reason;

                if (scheduledDelay != null && scheduledDelay.Value < intervalDelay)
                {
                    waitTime = scheduledDelay.Value;
                    reason = $"scheduled at {DateTime.Now.Add(waitTime):HH:mm}";
                }
                else
                {
                    waitTime = intervalDelay;
                    reason = $"interval ({intervalHours:F1}h)";
                }

                _logger.LogInformation(
                    "[Scheduler] Next scan cycle in {Hours:F1}h ({Reason})",
                    waitTime.TotalHours, reason);

                await Task.Delay(waitTime, stoppingToken);

                // Determine which sections to run
                var sections = cfg.ScheduledSections is { Length: > 0 }
                    ? cfg.ScheduledSections
                    : AllSections;

                _logger.LogInformation(
                    "[Scheduler] Starting scan cycle: {Sections}",
                    string.Join(", ", sections));

                await RunStaggeredScan(sections, stoppingToken);

                _logger.LogInformation("[Scheduler] Scan cycle complete");
            }
            catch (OperationCanceledException) { break; }
            catch (Exception ex)
            {
                _logger.LogError(ex, "[Scheduler] Error in scan loop");
                await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);
            }
        }

        _logger.LogInformation("[Scheduler] Background scan service stopped");
    }

    /// <summary>
    /// Run sections one at a time with a delay between each.
    /// If the orchestrator rejects a section (already running from a manual scan),
    /// we just skip it and move on.
    /// </summary>
    private async Task RunStaggeredScan(string[] sections, CancellationToken ct)
    {
        for (int i = 0; i < sections.Length; i++)
        {
            ct.ThrowIfCancellationRequested();

            var section = sections[i];
            _logger.LogInformation(
                "[Scheduler] Starting {Section} ({Index}/{Total})",
                section, i + 1, sections.Length);

            try
            {
                // StartAsync returns immediately — the scan runs on a background task.
                // If the section is already running (manual scan), TryAdd fails silently.
                await _orchestrator.StartAsync(section);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "[Scheduler] Failed to start {Section}", section);
            }

            // Wait between sections so we don't flood the disk with parallel scans.
            // The scan itself runs async — this delay spaces out the START times.
            if (i < sections.Length - 1)
            {
                try
                {
                    await Task.Delay(TimeSpan.FromSeconds(DelayBetweenSections), ct);
                }
                catch (OperationCanceledException) { break; }
            }
        }
    }

    /// <summary>
    /// Calculate delay from now until the next occurrence of the configured time.
    /// Returns null if schedule is disabled (empty string).
    /// </summary>
    private static TimeSpan? GetDelayUntilNextRun(string timeStr)
    {
        if (string.IsNullOrWhiteSpace(timeStr)) return null;

        if (!TimeSpan.TryParse(timeStr, out var targetTime))
            return null;

        var now  = DateTime.Now;
        var next = now.Date.Add(targetTime);

        // If the time already passed today, schedule for tomorrow
        if (next <= now)
            next = next.AddDays(1);

        return next - now;
    }
}
