// Services/ScanOrchestrator.cs
// Coordinates all scan workers via the IScanRule plugin pipeline.
//
// BATCH ARCHITECTURE:
//   WebSocket is a SIGNAL CHANNEL, not a data pipe.
//   Result data flows: Worker → Channel → Disk (JSONL) → HTTP fetch by frontend.
//   WS carries only: started, progress, done, error, batch-ready.
//
//   Drain loop accumulates results to disk in batches of 50, then sends a
//   single "batch-ready" WS signal. Frontend calls /api/cache/{section} to
//   fetch the batch via page-loader.js (40KB paged reads).
//
// PLUGIN PIPELINE:
//   Each scan section is an IScanRule implementation registered in DI.
//   ScanPipeline resolves the rule by section name — no switch statement.
//   Adding a new scan section = implement IScanRule + register in Program.cs.
//
// HASH STRATEGY:
//   Pass 1: xxHash64  — fast first-pass grouping (non-cryptographic).
//   Pass 2: SHA-256   — confirmation only on duplicate candidates.
//   Both are rate-limited by _hashGate (SemaphoreSlim) to avoid CPU starvation.
//
// CPU LIMITING LAYERS:
//   1. SemaphoreSlim _hashGate  — limits simultaneous hash operations.
//   2. Parallel.ForEachAsync(MaxDegreeOfParallelism) — inside each IScanRule.
//   3. Process priority BelowNormal — set at startup.

using System.Collections.Concurrent;
using System.Text.Json;
using DiskCleanup.Models;
using DiskCleanup.Scanning;

namespace DiskCleanup.Services;

public class ScanOrchestrator
{
    private readonly WsManager     _ws;
    private readonly ConfigService _config;
    private readonly ScanPipeline  _pipeline;
    private readonly ILogger<ScanOrchestrator> _logger;

    // Per-section cancel tokens
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _tokens = new();

    // Disk is the only persistence layer — no in-memory cache.
    // Each section writes one JSON line per result event (JSONL).
    // On restore: read lines from disk, send to client. That's it.
    private static readonly string _cacheDir =
        Path.Combine(Constants.DataDir, Constants.ScanCacheDir);

    // Per-section write locks — one file per section, appended concurrently
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _writeLocks = new();

    // Hash concurrency gate — initialized once, never replaced.
    // Limits simultaneous xxHash64/SHA-256 operations across all rules.
    // BUG: previously recreated per-scan, causing Release() on wrong instance.
    private SemaphoreSlim? _hashGate;
    private readonly object _hashGateInit = new();

    public ScanOrchestrator(WsManager ws, ConfigService config, ScanPipeline pipeline, ILogger<ScanOrchestrator> logger)
    {
        _ws       = ws;
        _config   = config;
        _pipeline = pipeline;
        _logger   = logger;
        Directory.CreateDirectory(_cacheDir);
    }

    // ── Disk helpers — JSONL, one line per event ─────────────
    private string _CachePath(string section) =>
        Path.Combine(_cacheDir, $"{section}.json");

    private SemaphoreSlim _WriteLock(string section) =>
        _writeLocks.GetOrAdd(section, _ => new SemaphoreSlim(1, 1));

    private static readonly JsonSerializerOptions _jsonOpts =
        new(JsonSerializerDefaults.Web); // camelCase — matches JS property names

    private async Task _AppendAsync(string section, ScanEvent evt)
    {
        var line = JsonSerializer.Serialize(evt, _jsonOpts) + "\n";
        var lk   = _WriteLock(section);
        await lk.WaitAsync();
        try
        {
            await using var fs = new FileStream(_CachePath(section),
                FileMode.Append, FileAccess.Write, FileShare.ReadWrite,
                bufferSize: 4096, useAsync: true);
            await using var sw = new StreamWriter(fs, System.Text.Encoding.UTF8);
            await sw.WriteAsync(line);
        }
        catch (Exception ex)
        {
            // NEVER swallow this — a silent failure here means results vanish from the grid
            Console.Error.WriteLine($"[CRITICAL] _AppendAsync({section}) failed: {ex.GetType().Name}: {ex.Message}");
            await _ws.BroadcastAsync(section, "error", new { message = $"Cache write failed: {ex.Message}" });
        }
        finally { lk.Release(); }
    }

    private void _DeleteCache(string section)
    {
        // Truncate instead of delete — avoids IOException if a reader holds the file
        try
        {
            var path = _CachePath(section);
            if (!File.Exists(path)) return;
            using var fs = new FileStream(path, FileMode.Truncate, FileAccess.Write,
                FileShare.ReadWrite);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"[ERROR] _DeleteCache({section}) failed: {ex.GetType().Name}: {ex.Message}");
        }
    }

    // ── Public API ───────────────────────────────────────────
    public async Task StartAsync(string section, string[]? extensions = null)
    {
        var cts = new CancellationTokenSource();
        if (!_tokens.TryAdd(section, cts)) { cts.Dispose(); return; }

        // ALWAYS clear cache on new scan start. If a previous scan was cancelled
        // or failed, stale results could remain. This ensures a clean slate.
        _DeleteCache(section);

        var cfg = await _config.LoadAsync();
        lock (_hashGateInit)
        {
            _hashGate ??= new SemaphoreSlim(cfg.MaxHashConcurrency, cfg.MaxHashConcurrency);
        }

        _ = RunWorker(section, cfg, cts.Token, extensions);
    }

    public void Cancel(string section)
    {
        if (_tokens.TryGetValue(section, out var cts))
            cts.Cancel();
    }

    // Read JSONL from disk, collapse result_updates to one record per hash
    public IEnumerable<object> GetCache(string section)
    {
        var path = _CachePath(section);
        if (!File.Exists(path)) return [];

        // Stream line-by-line — never load entire cache into memory (40KB rule)
        var lines = ReadLinesStreamed(path);

        // For hash-keyed sections collapse to final state per hash
        if (section is "duplicates" or "images")
        {
            var final = new Dictionary<string, ScanEvent>();
            foreach (var line in lines)
            {
                try
                {
                    var evt = JsonSerializer.Deserialize<ScanEvent>(line);
                    if (evt is null) continue;
                    // Skip done/started/progress events — those are real-time signals, not cache data
                    if (evt.Type is "done" or "started" or "progress") continue;
                    if (evt.Type is "result" or "result_update")
                    {
                        var hash = evt.Data is JsonElement je &&
                                   je.TryGetProperty("hash", out var hp)
                                   ? hp.GetString() ?? line.GetHashCode().ToString()
                                   : line.GetHashCode().ToString();
                        final[hash] = evt with { Type = "result" };
                    }
                }
                catch { }
            }
            return final.Values.Cast<object>();
        }

        // All other sections: deserialize lines as-is
        return lines.Select(l =>
        {
            try   { return (object?)JsonSerializer.Deserialize<ScanEvent>(l); }
            catch { return null; }
        }).Where(e => e != null).Cast<object>();
    }

    // ── Push → Channel → Hub ─────────────────────────────────
    // The channel absorbs bursts. The drain loop sends at hub speed.
    private async Task RunWorker(string section, DashConfig cfg, CancellationToken ct, string[]? extensions = null)
    {
        // Load keep-list ONCE per scan — O(1) lookups during the entire scan
        var keepSet = await _config.LoadKeepSetAsync();

        // Bounded channel provides backpressure — producer slows if hub is behind
        var channel = System.Threading.Channels.Channel.CreateBounded<ScanEvent>(
            new System.Threading.Channels.BoundedChannelOptions(500)
            {
                FullMode    = System.Threading.Channels.BoundedChannelFullMode.Wait,
                SingleWriter = false,   // multiple parallel tasks write concurrently
                SingleReader = true,
            });

        // Drain loop: reads events from channel, writes to disk, notifies clients.
        // BATCH ARCHITECTURE: result events are written to disk only. The WS
        // carries signals (started/progress/done/error/batch-ready), never data.
        // Frontend fetches batches from /api/cache/{section} on batch-ready signal.
        //
        // Each BroadcastAsync call is wrapped in try/catch so a transient send
        // failure (serialization error, dead socket) never kills the drain loop
        // and therefore never aborts an in-progress scan.
        const int BatchSize = 50;
        var drainTask = Task.Run(async () =>
        {
            int batchCount = 0;
            await foreach (var evt in channel.Reader.ReadAllAsync(CancellationToken.None))
            {
                if (evt.Type is "result" or "result_update")
                {
                    // Write to disk — skip result_update for hash sections
                    // (quadratic cache growth). Initial 'result' is sufficient.
                    if (evt.Type is "result")
                        await _AppendAsync(section, evt);

                    batchCount++;
                    if (batchCount >= BatchSize)
                    {
                        // Signal frontend: "50 new rows on disk, fetch them"
                        try { await _ws.BroadcastAsync(section, "batch-ready", new { count = batchCount }); }
                        catch (Exception ex) { _logger.LogWarning("BroadcastAsync(batch-ready) failed for {Section}: {Message}", section, ex.Message); }
                        batchCount = 0;
                    }
                }
                else
                {
                    // Flush any partial batch before sending done/error
                    if (batchCount > 0 && evt.Type is "done" or "error")
                    {
                        try { await _ws.BroadcastAsync(section, "batch-ready", new { count = batchCount }); }
                        catch (Exception ex) { _logger.LogWarning("BroadcastAsync(batch-ready/flush) failed for {Section}: {Message}", section, ex.Message); }
                        batchCount = 0;
                    }

                    // started/progress/done/error — signal only, no data payload over WS
                    try { await _ws.BroadcastAsync(evt.Section, evt.Type, evt.Data); }
                    catch (Exception ex) { _logger.LogWarning("BroadcastAsync({Type}) failed for {Section}: {Message}", evt.Type, section, ex.Message); }
                }
            }

            // Flush any remaining after channel completes
            if (batchCount > 0)
            {
                try { await _ws.BroadcastAsync(section, "batch-ready", new { count = batchCount }); }
                catch (Exception ex) { _logger.LogWarning("BroadcastAsync(batch-ready/final) failed for {Section}: {Message}", section, ex.Message); }
            }
        }, CancellationToken.None);

        // Worker: create ScanContext and dispatch to the IScanRule pipeline.
        // ScanContext carries config, keep-set, hash delegates, and the channel writer.
        // The pipeline resolves the rule by section name — no switch statement required.
        try
        {
            var ctx = new ScanContext(
                cfg, keepSet, channel.Writer,
                _GatedXxHashAsync,
                _GatedSha256Async,
                extensions,
                _GatedPHashAsync);
            await _pipeline.RunAsync(section, ctx, ct);
        }
        catch (OperationCanceledException)
        {
            await channel.Writer.WriteAsync(new ScanEvent(section, "error", new { message = "Cancelled" }));
        }
        catch (Exception ex)
        {
            await channel.Writer.WriteAsync(new ScanEvent(section, "error", new { message = ex.Message }));
        }
        finally
        {
            channel.Writer.Complete();
            await drainTask;
            _tokens.TryRemove(section, out var cts2);
            cts2?.Dispose();
        }
    }

    // ── Gated hash helpers ────────────────────────────────────
    // Both functions share _hashGate to cap total concurrent I/O hash load.
    // Passed as delegates into ScanContext — rules never call FileUtilities directly.

    private async Task<string> _GatedXxHashAsync(string path, CancellationToken ct)
    {
        await _hashGate!.WaitAsync(ct);
        try   { return await FileUtilities.XxHash64Async(path, ct); }
        finally { _hashGate.Release(); }
    }

    private async Task<string> _GatedSha256Async(string path, CancellationToken ct)
    {
        await _hashGate!.WaitAsync(ct);
        try   { return await FileUtilities.Sha256Async(path, ct); }
        finally { _hashGate.Release(); }
    }

    private async Task<ulong> _GatedPHashAsync(string path, CancellationToken ct)
    {
        await _hashGate!.WaitAsync(ct);
        try   { return await FileUtilities.PHashAsync(path, ct); }
        finally { _hashGate.Release(); }
    }

    // ── JSONL line streamer ───────────────────────────────────
    // Stream line-by-line from disk — 40KB rule: never load entire file.
    private static IEnumerable<string> ReadLinesStreamed(string path)
    {
        // FileShare.ReadWrite — don't fight the drain-loop writer or OS indexer
        using var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
            FileShare.ReadWrite, bufferSize: 4096);
        using var sr = new StreamReader(fs, System.Text.Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false, bufferSize: 4096);
        while (sr.ReadLine() is { } line)
        {
            if (!string.IsNullOrWhiteSpace(line))
                yield return line;
        }
    }
}
