// Services/ScanOrchestrator.cs
// Coordinates all scan workers.
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
//   This eliminates the 2000+ individual WS messages that caused PUBSUB
//   memory pressure drops. Now: 2000 results = 40 WS signals + 40 HTTP fetches.
//
// ASYNC QUEUING DESIGN:
//   Each scan section gets a bounded Channel<ScanEvent>.
//   The worker is the PRODUCER  — writes events without caring about clients.
//   The drain loop is the CONSUMER — reads from the channel, writes to disk.
//   They are completely decoupled: producer can't block waiting for a slow
//   network client because the channel absorbs the burst.
//
//   Bounded(capacity: 500) means:
//     - Results/done/error use WriteAsync (Wait mode) — never lost, apply backpressure
//     - Progress uses TryWrite (fire-and-forget) — dropped if full, scan never blocks
//     - No unbounded memory growth during fast directory scans
//
// CPU LIMITING LAYERS:
//   1. SemaphoreSlim _hashGate  — limits simultaneous MD5 operations.
//      MD5 is the only truly CPU-bound work. Everything else is I/O-bound.
//   2. Parallel.ForEachAsync(MaxDegreeOfParallelism) — limits concurrent
//      file enumeration threads (thread-pool saturation guard).
//   3. Process priority BelowNormal — set at startup so the OS won't let
//      this process starve your IDE, browser, or other tools.

using System.Collections.Concurrent;
using System.Text.Json;
using System.Text.RegularExpressions;
using DiskCleanup.Models;

namespace DiskCleanup.Services;

public class ScanOrchestrator
{
    private readonly WsManager     _ws;
    private readonly ConfigService _config;

    // Per-section cancel tokens
    private readonly ConcurrentDictionary<string, CancellationTokenSource> _tokens = new();

    // Disk is the only persistence layer — no in-memory cache.
    // Each section writes one JSON line per result event (JSONL).
    // On restore: read lines from disk, send to client. That's it.
    private static readonly string _cacheDir =
        Path.Combine(Constants.DataDir, Constants.ScanCacheDir);

    // Per-section write locks — one file per section, appended concurrently
    private readonly ConcurrentDictionary<string, SemaphoreSlim> _writeLocks = new();

    // Scan log — one plain-text line per file visited, written during scan
    private static readonly string _scanLogDir =
        Path.Combine(Constants.DataDir, "scan-logs");

    private string _ScanLogPath(string section) =>
        Path.Combine(_scanLogDir, $"{section}.log");

    // One open StreamWriter per active scan — closed when scan finishes
    private readonly ConcurrentDictionary<string, StreamWriter> _logWriters = new();

    private void _LogFile(string section, string path)
    {
        if (_logWriters.TryGetValue(section, out var sw))
            lock (sw) { try { sw.WriteLine(path); } catch { } }
    }

    private void _OpenScanLog(string section)
    {
        Directory.CreateDirectory(_scanLogDir);
        var fs = new FileStream(_ScanLogPath(section),
            FileMode.Create, FileAccess.Write, FileShare.ReadWrite, 4096, true);
        var sw = new StreamWriter(fs, System.Text.Encoding.UTF8, 4096) { AutoFlush = false };
        _logWriters[section] = sw;
    }

    private void _CloseScanLog(string section)
    {
        if (_logWriters.TryRemove(section, out var sw))
            try { sw.Flush(); sw.Dispose(); } catch { }
    }

    // MD5 concurrency gate — initialized once, never replaced.
    // BUG FIX: previously recreated per-scan, causing Release() on wrong instance.
    private SemaphoreSlim? _hashGate;
    private readonly object _hashGateInit = new();

    public ScanOrchestrator(WsManager ws, ConfigService config)
    {
        _ws     = ws;
        _config = config;
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

        var cfg = await _config.LoadAsync();
        lock (_hashGateInit)
        {
            _hashGate ??= new SemaphoreSlim(cfg.MaxHashConcurrency, cfg.MaxHashConcurrency);
        }

        _DeleteCache(section);  // clear old results before new scan
        _OpenScanLog(section);    // fresh log for this scan
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
                        await _ws.BroadcastAsync(section, "batch-ready", new { count = batchCount });
                        batchCount = 0;
                    }
                }
                else
                {
                    // Flush any partial batch before sending done/error
                    if (batchCount > 0 && evt.Type is "done" or "error")
                    {
                        await _ws.BroadcastAsync(section, "batch-ready", new { count = batchCount });
                        batchCount = 0;
                    }

                    // started/progress/done/error — signal only, no data payload over WS
                    await _ws.BroadcastAsync(evt.Section, evt.Type, evt.Data);
                }
            }

            // Flush any remaining after channel completes
            if (batchCount > 0)
                await _ws.BroadcastAsync(section, "batch-ready", new { count = batchCount });
        }, CancellationToken.None);

        // Worker writes to channel — fires the right scan based on section
        try
        {
            await (section switch
            {
                "duplicates"    => ScanDuplicates(channel.Writer, cfg, keepSet, ct),
                "smart-dedup"   => ScanSmartDedup(channel.Writer, cfg, keepSet, ct, extensions),
                "stale"         => ScanStale(channel.Writer, cfg, keepSet, ct),
                "large"         => ScanLarge(channel.Writer, cfg, keepSet, ct),
                "node-modules"  => Task.Run(async () => { await Push(channel.Writer, "node-modules", "started"); await Push(channel.Writer, "node-modules", "done", new { results = 0, message = "node_modules scanning disabled" }); }),
                "empty"         => ScanEmpty(channel.Writer, cfg, keepSet, ct),
                "venvs"         => ScanVenvs(channel.Writer, cfg, keepSet, ct),
                "images"        => ScanImages(channel.Writer, cfg, keepSet, ct),
                "backups"       => ScanBackups(channel.Writer, cfg, keepSet, ct),
                "tiny-files"    => ScanTinyFiles(channel.Writer, cfg, keepSet, ct, extensions),
                "html-files"    => ScanHtmlFiles(channel.Writer, cfg, keepSet, ct),
                "css-files"     => ScanCssFiles(channel.Writer, cfg, keepSet, ct),
                "ext-search"    => ScanByExtension(channel.Writer, cfg, keepSet, ct, extensions),
                _               => Task.CompletedTask
            });
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
            _CloseScanLog(section);  // flush + close the scan log
            _tokens.TryRemove(section, out var cts);
            cts?.Dispose();
        }
    }

    private async Task Push(
        System.Threading.Channels.ChannelWriter<ScanEvent> writer,
        string section, string type, object? data = null,
        CancellationToken ct = default)
    {
        await writer.WriteAsync(new ScanEvent(section, type, data), ct);
    }

    // ── Throttled progress push ───────────────────────────────
    // Sends progress at most once per 150ms so the file counter is always
    // accurate without flooding SignalR with tens-of-thousands of messages.
    // result/done/error events are never throttled — they go straight through.
    private readonly ConcurrentDictionary<string, long> _lastProgressTick = new();
    private const long ProgressIntervalMs = 150;

    private void PushProgress(
        System.Threading.Channels.ChannelWriter<ScanEvent> writer,
        string section, object data,
        CancellationToken ct = default)
    {
        var now  = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var last = _lastProgressTick.GetOrAdd(section, 0);
        if (now - last < ProgressIntervalMs) return;          // too soon — skip
        _lastProgressTick[section] = now;

        // TryWrite: never blocks the scan worker.
        // Progress is informational — dropping a tick is fine.
        // Results, done and error always use WriteAsync so they never get lost.
        writer.TryWrite(new ScanEvent(section, "progress", data));
    }

    // ── Helpers ──────────────────────────────────────────────
    private async Task<string> HashAsync(string path, CancellationToken ct)
    {
        await _hashGate!.WaitAsync(ct);
        try   { return await FileUtilities.Md5Async(path, ct); }
        finally { _hashGate.Release(); }
    }

    // ── Shared file filter chain (CR-013) ─────────────────────
    // Base exclusion chain used by all file-enumerating scanners.
    // Centralizes the IsNodeModules/IsTrash/IsVenv/IsTempFolder/keepSet checks.
    private static IEnumerable<string> FilteredFiles(
        DashConfig cfg, HashSet<string> keepSet, bool filterTempFolders = true)
        => AllRoots(cfg).SelectMany(EnumerateSafe)
            .Where(f => !FileUtilities.IsNodeModules(f)
                     && !FileUtilities.IsTrash(f)
                     && !FileUtilities.IsVenv(f)
                     && (!filterTempFolders || !FileUtilities.IsTempFolder(f))
                     && !keepSet.Contains(f));

    // Stream JSONL line-by-line from disk — 40KB rule: never load entire file.
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

    // ═══════════════════════════════════════════════════════════════
    //  SAFE ENUMERATION — depth-limited BFS
    //
    //  We do NOT use RecurseSubdirectories = true because the OS
    //  enumerator descends into directories BEFORE we can filter.
    //  A recursive backup folder (backup/backup/backup/...) exceeds
    //  MAX_PATH and crashes the process.
    //
    //  Instead: BFS with a queue, depth cap, and loop detection.
    //  We never descend past MaxDepth, so infinite recursion is
    //  impossible regardless of filesystem structure.
    // ═══════════════════════════════════════════════════════════════
    private const int MaxDepth = 20;
    private static readonly EnumerationOptions _shallowOpts =
        new() { RecurseSubdirectories = false, IgnoreInaccessible = true };

    private static IEnumerable<string> EnumerateSafe(string root)
    {
        // BFS queue: (directoryPath, depth)
        var queue = new Queue<(string Dir, int Depth)>();
        queue.Enqueue((root, 0));

        while (queue.Count > 0)
        {
            var (dir, depth) = queue.Dequeue();

            // Yield files in this directory
            IEnumerable<string> files;
            try { files = Directory.EnumerateFiles(dir, "*", _shallowOpts); }
            catch { continue; } // access denied, path too long, etc.

            foreach (var f in files)
            {
                yield return f;
            }

            // Don't descend further than MaxDepth
            if (depth >= MaxDepth) continue;

            // Queue child directories — skip backup folders + loop detection
            IEnumerable<string> subdirs;
            try { subdirs = Directory.EnumerateDirectories(dir, "*", _shallowOpts); }
            catch { continue; }

            foreach (var sub in subdirs)
            {
                var dirName = Path.GetFileName(sub);
                // Backup folders are handled by the backup scanner as whole units.
                // No other scanner should descend into them.
                if (IsBackupDir(dirName)) continue;
                if (IsRecursiveLoop(sub)) continue;
                queue.Enqueue((sub, depth + 1));
            }
        }
    }

    private static IEnumerable<string> EnumerateDirsSafe(string root, ConcurrentBag<string>? runaways = null)
    {
        var queue = new Queue<(string Dir, int Depth)>();
        queue.Enqueue((root, 0));

        while (queue.Count > 0)
        {
            var (dir, depth) = queue.Dequeue();

            IEnumerable<string> subdirs;
            try { subdirs = Directory.EnumerateDirectories(dir, "*", _shallowOpts); }
            catch { continue; }

            foreach (var sub in subdirs)
            {
                if (IsRecursiveLoop(sub))
                {
                    var runawayRoot = FindRunawayRoot(sub);
                    if (runawayRoot != null) runaways?.Add(runawayRoot);
                    continue;
                }

                var dirName = Path.GetFileName(sub);
                yield return sub;

                // Found a backup dir — yield it (so backup scanner sees it)
                // but do NOT descend into it. It’s a deletable unit.
                if (IsBackupDir(dirName)) continue;

                if (depth + 1 < MaxDepth)
                    queue.Enqueue((sub, depth + 1));
            }
        }
    }

    /// Detect 3 consecutive identical directory names in a path.
    /// backup\backup\backup = loop. Short paths skip the check.
    private static bool IsRecursiveLoop(string path)
    {
        if (path.Length < 150) return false;

        var parts = path.Split(Path.DirectorySeparatorChar);
        if (parts.Length < 4) return false;

        // Check last 3 segments (the deepest part of the path)
        // This is O(1) — no need to scan the whole path
        int n = parts.Length;
        for (int i = n - 3; i >= 1; i--)
        {
            if (parts[i].Length > 0 &&
                string.Equals(parts[i], parts[i + 1], StringComparison.OrdinalIgnoreCase) &&
                string.Equals(parts[i], parts[i + 2], StringComparison.OrdinalIgnoreCase))
                return true;
        }
        return false;
    }

    /// Given a path like A\B\B\B, find the first pair of repeated segments.
    /// Returns path up to the FIRST duplicate so user can inspect/delete.
    private static string? FindRunawayRoot(string loopPath)
    {
        var parts = loopPath.Split(Path.DirectorySeparatorChar);
        for (int i = 1; i < parts.Length; i++)
        {
            if (parts[i].Length > 0 &&
                string.Equals(parts[i], parts[i - 1], StringComparison.OrdinalIgnoreCase))
            {
                return string.Join(Path.DirectorySeparatorChar.ToString(),
                    parts.Take(i + 1));
            }
        }
        return null;
    }

    // ── Scan Workers ─────────────────────────────────────────
    // Pattern in every worker:
    //   • Parallel.ForEachAsync with MaxDegreeOfParallelism from config
    //   • HashAsync (gated by _hashGate semaphore) for MD5
    //   • CancellationToken respected everywhere
    //   • Push to channel — channel handles backpressure, hub handles clients

    private async Task ScanDuplicates(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        const string sec = "duplicates";
        await Push(ch, sec, "started", new { root = cfg.Root });
        var seen    = new ConcurrentDictionary<string, System.Collections.Generic.List<Models.FileRecord>>();
        var lockObj = new object();
        long files  = 0, results = 0;

            // No .ToList() — stream files as found so results appear immediately
        var allFiles = FilteredFiles(cfg, keepSet);

        // _preferredExts is a static readonly field — no per-scan allocation

        await Parallel.ForEachAsync(allFiles,
            new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    _LogFile(sec, fp);
                    var h = await HashAsync(fp, token);
                    if (string.IsNullOrEmpty(h)) return;

                    var fi    = new FileInfo(fp);
                    if (!fi.Exists) return;
                    var entry = new Models.FileRecord(fp, fi.Length, fi.LastWriteTime.ToString("yyyy-MM-dd"));

                    System.Collections.Generic.List<Models.FileRecord> group;
                    lock (lockObj)
                    {
                        group = seen.GetOrAdd(h, _ => new System.Collections.Generic.List<Models.FileRecord>());
                        group.Add(entry);
                        // Always sort group so preferred extension is first
                        group.Sort((a, b) =>
                        {
                            var extA = Path.GetExtension(a.Path);
                            var extB = Path.GetExtension(b.Path);
                            var aPref = _preferredExts.Contains(extA) ? 0 : (extA.Equals(".tmp", StringComparison.OrdinalIgnoreCase) ? 2 : 1);
                            var bPref = _preferredExts.Contains(extB) ? 0 : (extB.Equals(".tmp", StringComparison.OrdinalIgnoreCase) ? 2 : 1);
                            if (aPref != bPref) return aPref.CompareTo(bPref);
                            // If same preference, keep by newest modified
                            return String.Compare(b.Modified, a.Modified, StringComparison.OrdinalIgnoreCase);
                        });
                    }

                    var count = Interlocked.Increment(ref files);
                    if (group.Count == 2)
                    {
                        var r = Interlocked.Increment(ref results);
                        await Push(ch, sec, "result", new { hash = h, files = group.ToArray() }, token);
                    }
                    else if (group.Count > 2)
                    {
                        await Push(ch, sec, "result_update", new { hash = h, files = group.ToArray() }, token);
                    }
                    // Always attempt progress — PushProgress throttles to 150ms
                    PushProgress(ch, sec, new { files = count, results, folder = Path.GetDirectoryName(fp) }, token);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FileNotFoundException)
                {
                    Interlocked.Increment(ref files); // still count it
                }
            });

        await Push(ch, sec, "done", new { files, results });
    }

    private async Task ScanSmartDedup(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct,
        string[]? extensions = null)
    {
        const string sec    = "smart-dedup";
        // root captured below after cfg is available
        // Matches both Windows Explorer copies  "name (N).ext"
        // and underscore-numbered variants        "name_N.ext" (e.g. icon_1.svg)
        var copyRe = new Regex(@"^(.+?)(?:\s*\((\d+)\)|_(\d+))$", RegexOptions.Compiled);

        // FEAT-018: optional extension filter from frontend
        HashSet<string>? extFilter = extensions is { Length: > 0 }
            ? new HashSet<string>(extensions.Select(e => e.StartsWith('.') ? e : "." + e),
                                  StringComparer.OrdinalIgnoreCase)
            : null;

        await Push(ch, sec, "started", new { root = cfg.Root });

        // byBase groups files by their base name (strips copy suffix).
        // fileCache stores size+mtime collected during the scan so the
        // post-processing loop never needs to touch the filesystem again.
        var byBase    = new ConcurrentDictionary<string, System.Collections.Generic.List<string>>();
        var fileCache = new ConcurrentDictionary<string, (long Size, DateTime Modified)>();
        var lockObj   = new object();
        long files    = 0;

        // FEAT-018: apply extension filter to file enumeration
        var allFiles = FilteredFiles(cfg, keepSet);
        if (extFilter != null)
            allFiles = allFiles.Where(f => extFilter.Contains(Path.GetExtension(f)));

        await Parallel.ForEachAsync(allFiles,
            new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
            (fp, token) =>
            {
                try
                {
                    _LogFile(sec, fp);
                    var fi   = new FileInfo(fp);
                    if (!fi.Exists) return new System.Threading.Tasks.ValueTask();

                    // Cache size + mtime NOW — avoid a second filesystem hit later
                    fileCache[fp] = (fi.Length, fi.LastWriteTime);

                    var stem = Path.GetFileNameWithoutExtension(fp);
                    var ext  = Path.GetExtension(fp).ToLower();
                    var m    = copyRe.Match(stem);
                    var key  = (m.Success ? m.Groups[1].Value : stem) + ext;
                    lock (lockObj) { byBase.GetOrAdd(key, _ => new()).Add(fp); }

                    var c = Interlocked.Increment(ref files);
                    PushProgress(ch, sec, new { files = c, folder = Path.GetDirectoryName(fp) }, token);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FileNotFoundException)
                {
                    Interlocked.Increment(ref files);
                }
                return new System.Threading.Tasks.ValueTask();
            });

        // Post-process: use cached values — zero extra disk I/O
        long results = 0;
        foreach (var (_, flist) in byBase)
        {
            if (flist.Count <= 1) continue;

            var sorted = flist
                .OrderByDescending(f => fileCache.TryGetValue(f, out var info) ? info.Modified : DateTime.MinValue)
                .ToList();

            var deletes = sorted.Skip(1).ToArray();
            var savings = deletes.Sum(f => fileCache.TryGetValue(f, out var info) ? info.Size : 0L);

            results++;
            await Push(ch, sec, "result", new { keep = sorted[0], delete = deletes, size = savings }, ct);
        }

        await Push(ch, sec, "done", new { files, results });
    }

    // ── Generic file-scan template ────────────────────────────
    // Covers stale, large, tiny-files, html-files, css-files.
    // Each follows the same pattern: enumerate → filter → test → push result → push progress.
    private async Task ScanFilesGeneric(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct,
        string section,
        Func<FileInfo, bool> predicate,
        Func<string, FileInfo, object> mapResult,
        Func<IEnumerable<string>, IEnumerable<string>>? extraFileFilter = null,
        bool filterTempFolders = false)
    {
        await Push(ch, section, "started", new { root = cfg.Root });
        long files = 0, results = 0;

        var allFiles = FilteredFiles(cfg, keepSet, filterTempFolders);

        if (extraFileFilter != null)
            allFiles = extraFileFilter(allFiles);

        await Parallel.ForEachAsync(allFiles,
            new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return;
                    _LogFile(section, fp);   // log every visited file
                    var c = Interlocked.Increment(ref files);
                    if (predicate(fi))
                    {
                        Interlocked.Increment(ref results);
                        await Push(ch, section, "result", mapResult(fp, fi), token);
                    }
                    PushProgress(ch, section, new { files = c, results, folder = Path.GetDirectoryName(fp) }, token);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                    or FileNotFoundException or DirectoryNotFoundException)
                {
                    Interlocked.Increment(ref files);
                }
            });

        await Push(ch, section, "done", new { files, results });
    }

    // Shared result mapper — path + size + modified date
    private static object _ResultWithDate(string fp, FileInfo fi) => new
    {
        path     = fp,
        size     = fi.Length,
        modified = fi.LastWriteTime.ToString("yyyy-MM-dd")
    };

    // Extension sets used by file-type scanners (CR-014: centralized)
    private static readonly HashSet<string> _htmlExts = new(StringComparer.OrdinalIgnoreCase)
        { ".html", ".htm", ".xhtml", ".mhtml", ".mht" };

    private static readonly HashSet<string> _cssExts = new(StringComparer.OrdinalIgnoreCase)
        { ".css", ".scss", ".sass", ".less" };

    private static readonly HashSet<string> _imageExts = new(StringComparer.OrdinalIgnoreCase)
        { ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp" };

    private static readonly HashSet<string> _preferredExts = new(StringComparer.OrdinalIgnoreCase)
    {
        ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".doc", ".docx", ".xls", ".xlsx",
        ".ppt", ".pptx", ".pdf", ".txt", ".rtf", ".csv", ".zip", ".rar", ".7z", ".mp3",
        ".wav", ".mp4", ".avi", ".mov", ".mkv", ".html", ".xml", ".json", ".js", ".ts",
        ".css", ".cpp", ".c", ".h", ".py", ".java", ".cs"
    };

    // ── Stale files ───────────────────────────────────────────
    private async Task ScanStale(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        var cutoff = DateTime.Now.AddDays(-cfg.StaleDays);
        await ScanFilesGeneric(ch, cfg, keepSet, ct, "stale",
            predicate: fi => fi.LastWriteTime < cutoff,
            mapResult: _ResultWithDate);
    }

    // ── Large files ───────────────────────────────────────────
    private async Task ScanLarge(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        var limit = (long)cfg.LargeFileMb * 1_048_576;
        await ScanFilesGeneric(ch, cfg, keepSet, ct, "large",
            predicate: fi => fi.Length >= limit,
            mapResult: (fp, fi) => new { path = fp, size = fi.Length });
    }

    private async Task ScanNodeModules(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        const string sec = "node-modules";
        await Push(ch, sec, "started", new { root = cfg.Root });
        long results = 0;

        foreach (var root in AllRoots(cfg))
        {
            // SAFE: use depth-limited BFS instead of RecurseSubdirectories.
            // The old code used RecurseSubdirectories = true which descended
            // into runaway recursive folders (backup\backup\backup\...) and
            // crashed with PathTooLongException, killing the WebSocket.
            var runaways = new ConcurrentBag<string>();
            var nmDirs = EnumerateDirsSafe(root, runaways)
                         .Where(d => Path.GetFileName(d).Equals("node_modules", StringComparison.OrdinalIgnoreCase)
                                  && !FileUtilities.IsNodeModules(Path.GetDirectoryName(d) ?? string.Empty)
                                  && !keepSet.Contains(d))
                         .ToList();

            // Surface runaway folders as actionable results the user can delete
            var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var rp in runaways)
            {
                if (!seen.Add(rp)) continue;  // deduplicate
                Interlocked.Increment(ref results);
                long rpSize = 0;
                try { rpSize = new DirectoryInfo(rp).EnumerateFiles("*", _shallowOpts).Sum(f => f.Length); }
                catch { }
                await Push(ch, sec, "result", new { path = rp, size = rpSize, runaway = true }, ct);
            }

            await Parallel.ForEachAsync(nmDirs,
                new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
                async (dp, token) =>
                {
                    var size = await FileUtilities.DirSizeAsync(dp, token);
                    Interlocked.Increment(ref results);
                    await Push(ch, sec, "result",   new { path = dp, size }, token);
                    await Push(ch, sec, "progress", new { results }, token);
                });
        }
        await Push(ch, sec, "done", new { results });
    }

    private async Task ScanEmpty(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        const string sec = "empty";
        await Push(ch, sec, "started", new { root = cfg.Root });
        long scanned = 0, results = 0;

        foreach (var root in AllRoots(cfg))
        {
            // Deepest-first so inner empties are found before outer
            var allDirs = EnumerateDirsSafe(root)
                         .Where(d => !FileUtilities.IsTrash(d)
                                  && !keepSet.Contains(d))
                         .OrderByDescending(d => d.Length)
                         .ToList();

            foreach (var dp in allDirs)
            {
                ct.ThrowIfCancellationRequested();
                var c = Interlocked.Increment(ref scanned);
                try
                {
                    if (!Directory.EnumerateFileSystemEntries(dp).Any())
                    {
                        Interlocked.Increment(ref results);
                        await Push(ch, sec, "result", new { path = dp }, ct);
                    }
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                {
                    // Access denied or path too long — skip this folder, keep scanning
                    Console.Error.WriteLine($"[WARN] ScanEmpty skipped {dp}: {ex.Message}");
                }

            }
        }
        await Push(ch, sec, "done", new { scanned, results });
    }

    private async Task ScanVenvs(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        const string sec      = "venvs";
        var          venvNames = new HashSet<string> { "venv", ".venv", "env", ".env" };
        await Push(ch, sec, "started", new { root = cfg.Root });
        long results = 0;

        foreach (var root in AllRoots(cfg))
        {
            var venvDirs = EnumerateDirsSafe(root)
                          .Where(d => venvNames.Contains(Path.GetFileName(d))
                                   && File.Exists(Path.Combine(d, "pyvenv.cfg"))
                                   && !keepSet.Contains(d))
                          .ToList();

            await Parallel.ForEachAsync(venvDirs,
                new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
                async (dp, token) =>
                {
                    var size = await FileUtilities.DirSizeAsync(dp, token);
                    Interlocked.Increment(ref results);
                    await Push(ch, sec, "result", new { path = dp, size, project = Path.GetDirectoryName(dp) }, token);
                });
        }
        await Push(ch, sec, "done", new { results });
    }

    private async Task ScanImages(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        const string sec = "images";
        await Push(ch, sec, "started", new { root = cfg.Root });

        var seen    = new ConcurrentDictionary<string, System.Collections.Generic.List<string>>();
        var lockObj = new object();

        // _imageExts is a static readonly field — no per-scan allocation
        var allImages = FilteredFiles(cfg, keepSet)
            .Where(f => _imageExts.Contains(Path.GetExtension(f)));

        await Parallel.ForEachAsync(allImages,
            new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    await Push(ch, sec, "progress", new { folder = Path.GetDirectoryName(fp) }, token);
                    var h = await HashAsync(fp, token);
                    if (string.IsNullOrEmpty(h)) return;

                    lock (lockObj) { seen.GetOrAdd(h, _ => new()).Add(fp); }
                    var group = seen[h];
                    if      (group.Count == 2) await Push(ch, sec, "result",        new { hash = h, files = group.ToArray() }, token);
                    else if (group.Count >  2) await Push(ch, sec, "result_update", new { hash = h, files = group.ToArray() }, token);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or FileNotFoundException)
                {
                    // skip unreadable images silently
                }
            });

        await Push(ch, sec, "done", new { results = seen.Values.Count(v => v.Count > 1) });
    }

    // ── Backup Folders ─────────────────────────────────────────
    private static readonly Regex _backupRe = new(
        @"(?i)^(bak|bck|backup|backups|back-?up|old|archive|archives|copy|copies|" +
        @"\.bak|\.backup|\.old|~backup|~bak|_bak|_backup|_old|" +
        @"before[-_ ]|pre[-_ ]|orig|original|originals|" +
        @"save|saved|snapshot|snapshots|previous|retired)$",
        RegexOptions.Compiled | RegexOptions.IgnoreCase);

    private static bool IsBackupDir(string dirName)
    {
        if (_backupRe.IsMatch(dirName)) return true;
        // Also match dirs that contain "backup" or "bak" as a substring
        var lower = dirName.ToLowerInvariant();
        return lower.Contains("backup") || lower.Contains("_bak")
            || lower.Contains("-bak")   || lower.Contains(".bak")
            || lower.Contains("_old")   || lower.Contains("-old")
            || (lower.EndsWith(" copy") || lower.EndsWith("_copy") || lower.EndsWith("-copy"));
    }

    private async Task ScanBackups(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
    {
        const string sec = "backups";
        await Push(ch, sec, "started", new { root = cfg.Root });
        long scanned = 0, results = 0;
        long totalBytes = 0;

        foreach (var root in AllRoots(cfg))
        {
            // Find all backup-like directories via depth-limited BFS.
            var runaways   = new ConcurrentBag<string>();
            var candidates = new List<string>();
            foreach (var d in EnumerateDirsSafe(root, runaways))
            {
                ct.ThrowIfCancellationRequested();
                if (!FileUtilities.IsTrash(d) && IsBackupDir(Path.GetFileName(d)) && !keepSet.Contains(d))
                    candidates.Add(d);
            }

            // Surface runaway folders as actionable results the user can delete
            var seenRunaways = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var rp in runaways)
            {
                if (!seenRunaways.Add(rp)) continue;  // deduplicate
                Interlocked.Increment(ref results);
                long rpSize = 0;
                try { rpSize = new DirectoryInfo(rp).EnumerateFiles("*", _shallowOpts).Sum(f => f.Length); }
                catch { }
                await Push(ch, sec, "result", new { path = rp, size = rpSize, runaway = true }, ct);
            }

            // Remove subdirectories of already-found backup dirs
            // (don't double-count /backup/old)
            var filtered = candidates
                .Where(c => !candidates.Any(p => p != c
                    && c.StartsWith(p + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase)))
                .ToList();

            await Parallel.ForEachAsync(filtered,
                new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
                async (dp, token) =>
                {
                    var c = Interlocked.Increment(ref scanned);
                    try
                    {
                        var size = await FileUtilities.DirSizeAsync(dp, token);
                        var fileCount = 0;
                        try { fileCount = EnumerateSafe(dp).Count(); }
                        catch { }

                        Interlocked.Increment(ref results);
                        Interlocked.Add(ref totalBytes, size);

                        var dirName = Path.GetFileName(dp);
                        var parent  = Path.GetDirectoryName(dp) ?? "";

                        await Push(ch, sec, "result", new
                        {
                            path      = dp,
                            size      = size,
                            fileCount = fileCount,
                            dirName   = dirName,
                            parent    = parent
                        }, token);
                    }
                    catch (Exception ex) when (ex is IOException or UnauthorizedAccessException)
                    {
                        // skip inaccessible
                    }

                    PushProgress(ch, sec, new { scanned = c, results, folder = dp }, token);
                });
        }

        await Push(ch, sec, "done", new { scanned, results, totalBytes });
    }

    // ── Tiny Files (≤1 KB) ─────────────────────────────────────
    private async Task ScanTinyFiles(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct,
        string[]? extensions = null)
    {
        const long limit = 1024;
        // Optional extension filter — when user selects specific types in the UI
        HashSet<string>? extFilter = extensions is { Length: > 0 }
            ? new HashSet<string>(extensions.Select(e => e.StartsWith('.') ? e : "." + e),
                                  StringComparer.OrdinalIgnoreCase)
            : null;

        await ScanFilesGeneric(ch, cfg, keepSet, ct, "tiny-files",
            predicate: fi => fi.Length <= limit && fi.Length > 0
                          && (extFilter == null || extFilter.Contains(fi.Extension)),
            mapResult: _ResultWithDate,
            filterTempFolders: true);
    }

    // ── HTML Files ───────────────────────────────────────────────
    private Task ScanHtmlFiles(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
        => ScanFilesGeneric(ch, cfg, keepSet, ct, "html-files",
            predicate:       _ => true,
            mapResult:       _ResultWithDate,
            extraFileFilter: files => files.Where(f => _htmlExts.Contains(Path.GetExtension(f))),
            filterTempFolders: true);

    // ── CSS Files ───────────────────────────────────────────────
    private Task ScanCssFiles(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct)
        => ScanFilesGeneric(ch, cfg, keepSet, ct, "css-files",
            predicate:       _ => true,
            mapResult:       _ResultWithDate,
            extraFileFilter: files => files.Where(f => _cssExts.Contains(Path.GetExtension(f))),
            filterTempFolders: true);

    // ── Extension Search (live typed query) ─────────────────────
    // Query comes from WS start message extensions[0], e.g. "cs" or ".log".
    // We normalize to a lowercase extension fragment and match against file
    // extensions without the leading dot.
    private async Task ScanByExtension(
        System.Threading.Channels.ChannelWriter<ScanEvent> ch,
        DashConfig cfg, HashSet<string> keepSet, CancellationToken ct,
        string[]? extensions = null)
    {
        var raw = extensions?.FirstOrDefault() ?? string.Empty;
        var query = raw.Trim().TrimStart('.').ToLowerInvariant();
        var rootOverride = extensions is { Length: > 1 } ? extensions[1]?.Trim() : null;
        var scanRoot = !string.IsNullOrWhiteSpace(rootOverride) && Directory.Exists(rootOverride)
            ? rootOverride!
            : cfg.Root;

        // Empty query should not trigger a full-disk scan.
        if (string.IsNullOrWhiteSpace(query))
        {
            await Push(ch, "ext-search", "started", new { root = scanRoot });
            await Push(ch, "ext-search", "done", new { files = 0, results = 0 });
            return;
        }

        await Push(ch, "ext-search", "started", new { root = scanRoot });

        bool IsAllowedPath(string f)
            => !FileUtilities.IsNodeModules(f)
               && !FileUtilities.IsTrash(f)
               && !FileUtilities.IsVenv(f)
               && !FileUtilities.IsTempFolder(f)
               && !keepSet.Contains(f);

        bool ExtMatches(FileInfo fi)
        {
            var ext = fi.Extension.TrimStart('.');
            // Exact match only — "exe" finds ".exe" files, nothing else.
            return !string.IsNullOrWhiteSpace(ext)
                   && ext.Equals(query, StringComparison.OrdinalIgnoreCase);
        }

        async Task EmitResult(string fp, FileInfo fi, CancellationToken token)
        {
            await Push(ch, "ext-search", "result", new
            {
                path = fp,
                ext = fi.Extension,
                size = fi.Length,
                modified = fi.LastWriteTime.ToString("yyyy-MM-dd")
            }, token);
        }

        long files = 0, results = 0;

        // 1) Root-level files first (non-recursive) for immediate, expected ordering.
        IEnumerable<string> rootFiles;
        try { rootFiles = Directory.EnumerateFiles(scanRoot, "*", _shallowOpts); }
        catch { rootFiles = []; }

        foreach (var fp in rootFiles.Where(IsAllowedPath).OrderBy(Path.GetFileName, StringComparer.OrdinalIgnoreCase))
        {
            ct.ThrowIfCancellationRequested();
            try
            {
                _LogFile("ext-search", fp);
                var fi = new FileInfo(fp);
                if (!fi.Exists) continue;

                var c = Interlocked.Increment(ref files);
                if (ExtMatches(fi))
                {
                    Interlocked.Increment(ref results);
                    await EmitResult(fp, fi, ct);
                }
                PushProgress(ch, "ext-search", new { files = c, results, folder = scanRoot }, ct);
            }
            catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                or FileNotFoundException or DirectoryNotFoundException)
            {
                Interlocked.Increment(ref files);
            }
        }

        // 2) Then recurse into subfolders.
        var subFiles = EnumerateSafe(scanRoot)
            .Where(IsAllowedPath)
            .Where(f => !string.Equals(Path.GetDirectoryName(f), scanRoot, StringComparison.OrdinalIgnoreCase));

        await Parallel.ForEachAsync(subFiles,
            new ParallelOptions { MaxDegreeOfParallelism = cfg.MaxParallelism, CancellationToken = ct },
            async (fp, token) =>
            {
                try
                {
                    _LogFile("ext-search", fp);
                    var fi = new FileInfo(fp);
                    if (!fi.Exists) return;

                    var c = Interlocked.Increment(ref files);
                    if (ExtMatches(fi))
                    {
                        Interlocked.Increment(ref results);
                        await EmitResult(fp, fi, token);
                    }
                    PushProgress(ch, "ext-search", new { files = c, results, folder = Path.GetDirectoryName(fp) }, token);
                }
                catch (Exception ex) when (ex is IOException or UnauthorizedAccessException
                    or FileNotFoundException or DirectoryNotFoundException)
                {
                    Interlocked.Increment(ref files);
                }
            });

        await Push(ch, "ext-search", "done", new { files, results });
    }

    // ── Root resolver ────────────────────────────────────────
    private static IEnumerable<string> AllRoots(DashConfig cfg)
        => new[] { cfg.Root }.Concat(cfg.ExtraRoots ?? [])
           .Where(r => !string.IsNullOrWhiteSpace(r) && Directory.Exists(r));
}
