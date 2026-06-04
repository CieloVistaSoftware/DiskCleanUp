// Services/ConfigService.cs
// Async config and savings log service.
// Uses SemaphoreSlim(1,1) as a simple async reader/writer lock
// so concurrent requests don't shred the log file.

using System.Text.Json;
using DiskCleanup.Models;

namespace DiskCleanup.Services;

public class ConfigService
{
    private readonly string _configFile;
    private readonly string _logFile;
    private readonly string _sessionFile;
    private readonly SemaphoreSlim _lock = new(1, 1);

    private static readonly JsonSerializerOptions JsonOpts = new()
    {
        PropertyNamingPolicy   = JsonNamingPolicy.SnakeCaseLower,
        WriteIndented          = true,
        PropertyNameCaseInsensitive = true,
    };

    private static readonly JsonSerializerOptions JsonCompact = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
        WriteIndented        = false,
    };

    private static readonly DashConfig Defaults = new()
    {
        Root          = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads"),
        ExtraRoots    = [],
        StaleDays     = 90,
        LargeFileMb   = 50,
        MaxParallelism     = Math.Max(1, Environment.ProcessorCount / 2),
        MaxHashConcurrency = Math.Max(1, Environment.ProcessorCount / 4),
    };

    private readonly string _errorLogFile;
    private readonly string _scanCacheDir;
    private readonly string _keepListFile;

    public ConfigService(string baseDir)
    {
        _configFile   = Path.Combine(baseDir, "dashboard_config.json");
        _logFile      = Path.Combine(baseDir, "savings_log.jsonl");
        _sessionFile  = Path.Combine(baseDir, "current_session.json");
        _errorLogFile = Path.Combine(baseDir, "errors.jsonl");
        _scanCacheDir = Path.Combine(baseDir, "scan-cache");
        _keepListFile = Path.Combine(baseDir, "keep-list.json");
        Directory.CreateDirectory(_scanCacheDir);
    }

    // ── Session ─────────────────────────────────────────
    // Sessions survive server restarts. A session is started once
    // (at first use or when the user explicitly requests a new one).
    // All savings entries are tagged with the current session_id so
    // the log can be grouped by session without any schema migration.

    public async Task<SessionInfo> GetCurrentSessionAsync()
    {
        if (File.Exists(_sessionFile))
        {
            try
            {
                var json = await SafeReadAllTextAsync(_sessionFile);
                if (json != null)
                {
                    var s = JsonSerializer.Deserialize<SessionInfo>(json, JsonOpts);
                    if (s != null) return s;
                }
            }
            catch { }
        }
        return await NewSessionAsync("Session 1");
    }

    public async Task<SessionInfo> NewSessionAsync(string? label = null)
    {
        int num = 1;
        if (File.Exists(_sessionFile))
        {
            try
            {
                var json = await SafeReadAllTextAsync(_sessionFile);
                if (json != null)
                {
                    var prev = JsonSerializer.Deserialize<SessionInfo>(json, JsonOpts);
                    if (prev?.Label != null)
                    {
                        var m = System.Text.RegularExpressions.Regex.Match(prev.Label, @"\d+$");
                        if (m.Success) num = int.Parse(m.Value) + 1;
                    }
                }
            }
            catch { }
        }

        var session = new SessionInfo(
            Id:        DateTime.UtcNow.ToString("yyyyMMddHHmmss"),
            StartedAt: DateTime.Now.ToString("o"),
            Label:     label ?? $"Session {num}"
        );

        await _lock.WaitAsync();
        try   { await SafeWriteAllTextAsync(_sessionFile, JsonSerializer.Serialize(session, JsonOpts)); }
        finally { _lock.Release(); }

        return session;
    }

    // ── Config ───────────────────────────────────────────────
    public async Task<DashConfig> LoadAsync()
    {
        if (!File.Exists(_configFile)) return Defaults with { };
        try
        {
            var json = await SafeReadAllTextAsync(_configFile);
            if (json == null) return Defaults with { };
            return JsonSerializer.Deserialize<DashConfig>(json, JsonOpts) ?? Defaults with { };
        }
        catch { return Defaults with { }; }
    }

    public async Task SaveAsync(DashConfig cfg)
    {
        var json = JsonSerializer.Serialize(cfg, JsonOpts);
        await _lock.WaitAsync();
        try   { await SafeWriteAllTextAsync(_configFile, json); }
        finally { _lock.Release(); }
    }

    // ── Safe I/O helpers ─────────────────────────────────────
    // Every file op uses FileShare.ReadWrite so we never crash
    // from Windows Search indexer, Defender, trace-viewer, or
    // concurrent requests holding the file. (DCU-001)

    private static async Task<string?> SafeReadAllTextAsync(string path)
    {
        if (!File.Exists(path)) return null;
        try
        {
            await using var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                FileShare.ReadWrite, bufferSize: 4096, useAsync: true);
            using var sr = new StreamReader(fs, System.Text.Encoding.UTF8);
            return await sr.ReadToEndAsync();
        }
        catch { return null; }
    }

    private static async Task SafeWriteAllTextAsync(string path, string text)
    {
        await using var fs = new FileStream(path, FileMode.Create, FileAccess.Write,
            FileShare.ReadWrite, bufferSize: 4096, useAsync: true);
        await using var sw = new StreamWriter(fs, System.Text.Encoding.UTF8);
        await sw.WriteAsync(text);
    }

    private static async Task AppendTextAsync(string path, string text)
    {
        await using var fs = new FileStream(
            path,
            FileMode.Append, FileAccess.Write, FileShare.ReadWrite,
            bufferSize: 4096, useAsync: true);
        await using var sw = new StreamWriter(fs, System.Text.Encoding.UTF8);
        await sw.WriteAsync(text);
    }

    // ── Savings Log ──────────────────────────────────────────
    public async Task AppendSavingsAsync(string action, long bytes, string detail = "")
    {
        var session = await GetCurrentSessionAsync();
        var entry   = new SavingsEntry(
            Ts:        DateTime.Now.ToString("o"),
            Action:    action,
            Bytes:     bytes,
            Mb:        Math.Round(bytes / 1_048_576.0, 2),
            Detail:    detail,
            SessionId: session.Id
        );
        var line = JsonSerializer.Serialize(entry, JsonCompact) + "\n";

        await _lock.WaitAsync();
        try   { await AppendTextAsync(_logFile, line); }
        finally { _lock.Release(); }
    }

    // Batch version — ONE lock acquisition for N entries.
    // Critical for bulk trash operations: 120 files = 1 lock, not 120.
    public async Task AppendSavingsBatchAsync(string action, IEnumerable<(long bytes, string detail)> items)
    {
        var session = await GetCurrentSessionAsync();
        var now     = DateTime.Now;
        var sb      = new System.Text.StringBuilder();
        foreach (var (bytes, detail) in items)
        {
            var entry = new SavingsEntry(
                Ts:        now.ToString("o"),
                Action:    action,
                Bytes:     bytes,
                Mb:        Math.Round(bytes / 1_048_576.0, 2),
                Detail:    detail,
                SessionId: session.Id
            );
            sb.AppendLine(JsonSerializer.Serialize(entry, JsonCompact));
        }
        if (sb.Length == 0) return;
        await _lock.WaitAsync();
        try   { await AppendTextAsync(_logFile, sb.ToString()); }
        finally { _lock.Release(); }
    }

    public async Task<List<SavingsEntry>> ReadSavingsAsync()
    {
        if (!File.Exists(_logFile)) return [];
        var result = new List<SavingsEntry>();
        // Stream line-by-line — never load entire JSONL into memory (40KB rule)
        // FileShare.ReadWrite — don't fight the writer or OS indexer (DCU-001)
        await using var fs = new FileStream(_logFile, FileMode.Open, FileAccess.Read,
            FileShare.ReadWrite, bufferSize: 4096);
        using var sr = new StreamReader(fs, System.Text.Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false, bufferSize: 4096);
        while (await sr.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var e = JsonSerializer.Deserialize<SavingsEntry>(line, JsonCompact);
                if (e != null) result.Add(e);
            }
            catch { }
        }
        return result;
    }

    /// <summary>
    /// Paginated savings — returns newest entries first.
    /// offset=0 → most recent `limit` entries.
    /// </summary>
    public async Task<(List<SavingsEntry> Entries, int Total)> ReadSavingsPagedAsync(int limit, int offset)
    {
        var all = await ReadSavingsAsync();
        var total = all.Count;
        // Reverse so newest comes first, then skip/take
        var page = all
            .AsEnumerable()
            .Reverse()
            .Skip(offset)
            .Take(limit)
            .ToList();
        return (page, total);
    }

    /// <summary>
    /// Totals only — streams the full log but returns no entry payloads.
    /// Fast even on 13K+ entry files.
    /// </summary>
    public async Task<(long TotalBytes, int TotalCount)> ReadSavingsSummaryAsync()
    {
        if (!File.Exists(_logFile)) return (0L, 0);
        long bytes = 0L;
        int  count = 0;
        await using var fs = new FileStream(_logFile, FileMode.Open, FileAccess.Read,
            FileShare.ReadWrite, bufferSize: 4096);
        using var sr = new StreamReader(fs, System.Text.Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false, bufferSize: 4096);
        while (await sr.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var e = JsonSerializer.Deserialize<SavingsEntry>(line, JsonCompact);
                if (e is null) continue;
                bytes += e.Bytes;
                count++;
            }
            catch { }
        }
        return (bytes, count);
    }

    // ── Error Log ────────────────────────────────────────────────
    // Append-only JSONL — one error per line. Same philosophy as
    // savings_log.jsonl: never truncated, never reset automatically.
    // High hit counts on the same error ID over time = hot spot.

    public async Task AppendErrorAsync(ClientErrorEntry entry)
    {
        var line = JsonSerializer.Serialize(entry, JsonCompact) + "\n";
        await _lock.WaitAsync();
        try   { await AppendTextAsync(_errorLogFile, line); }
        finally { _lock.Release(); }
    }

    public async Task<List<ClientErrorEntry>> ReadErrorsAsync()
    {
        if (!File.Exists(_errorLogFile)) return [];
        var result = new List<ClientErrorEntry>();
        // Stream line-by-line — never load entire JSONL into memory (40KB rule)
        // FileShare.ReadWrite — don't fight the writer or OS indexer (DCU-001)
        await using var fs = new FileStream(_errorLogFile, FileMode.Open, FileAccess.Read,
            FileShare.ReadWrite, bufferSize: 4096);
        using var sr = new StreamReader(fs, System.Text.Encoding.UTF8,
            detectEncodingFromByteOrderMarks: false, bufferSize: 4096);
        while (await sr.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line)) continue;
            try
            {
                var e = JsonSerializer.Deserialize<ClientErrorEntry>(line, JsonCompact);
                if (e != null) result.Add(e);
            }
            catch { }
        }
        return result;
    }

    public async Task ClearErrorsAsync()
    {
        await _lock.WaitAsync();
        try
        {
            if (File.Exists(_errorLogFile))
                File.Delete(_errorLogFile);
        }
        finally { _lock.Release(); }
    }

    // ── Scan Result Cache ────────────────────────────────────
    // One JSON file per section in scan-cache/.
    // Written when a scan completes, read back on startup.
    // Survives server restarts so users never lose their scan results.
    // Overwritten (not appended) each scan — always reflects the last run.

    public async Task SaveScanCacheAsync(string section, IEnumerable<ScanEvent> events)
    {
        var path = Path.Combine(_scanCacheDir, $"{section}.json");
        var json = JsonSerializer.Serialize(events.ToList(), JsonCompact);
        await _lock.WaitAsync();
        try   { await SafeWriteAllTextAsync(path, json); }
        finally { _lock.Release(); }
    }

    public async Task<List<ScanEvent>> LoadScanCacheAsync(string section)
    {
        var path = Path.Combine(_scanCacheDir, $"{section}.json");
        if (!File.Exists(path)) return [];
        try
        {
            // Stream-deserialize — never load entire cache file as a string (40KB rule)
            await using var fs = new FileStream(path, FileMode.Open, FileAccess.Read,
                FileShare.ReadWrite, bufferSize: 4096, useAsync: true);
            return await JsonSerializer.DeserializeAsync<List<ScanEvent>>(fs, JsonCompact) ?? [];
        }
        catch { return []; }
    }

    public string[] GetCachedSections()
        => Directory.EnumerateFiles(_scanCacheDir, "*.json")
                    .Select(f => Path.GetFileNameWithoutExtension(f))
                    .ToArray();

    // ── Keep List ────────────────────────────────────────────
    // Paths the user marked as "keep" — excluded from all scan results.
    // Cached in memory for O(1) lookups during scans.
    // Persisted to keep-list.json so it survives restarts.

    private HashSet<string>? _keepCache;

    /// Fast check for scanners — O(1) lookup.
    public bool IsKept(string path)
        => _keepCache?.Contains(path) == true;

    /// Load keep set from disk (lazy, cached after first call).
    public async Task<HashSet<string>> LoadKeepSetAsync()
    {
        if (_keepCache != null) return _keepCache;

        var json = await SafeReadAllTextAsync(_keepListFile);
        if (json != null)
        {
            try
            {
                var list = JsonSerializer.Deserialize<string[]>(json);
                _keepCache = new HashSet<string>(list ?? [], StringComparer.OrdinalIgnoreCase);
                return _keepCache;
            }
            catch { }
        }
        _keepCache = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        return _keepCache;
    }

    /// Return full list for UI display.
    public async Task<string[]> GetKeepListAsync()
    {
        var set = await LoadKeepSetAsync();
        return [.. set.Order()];
    }

    /// Add paths to keep list.
    public async Task AddKeepPathsAsync(string[] paths)
    {
        var set = await LoadKeepSetAsync();
        foreach (var p in paths)
            if (!string.IsNullOrWhiteSpace(p)) set.Add(p);
        await _SaveKeepListAsync(set);
    }

    /// Remove paths from keep list.
    public async Task RemoveKeepPathsAsync(string[] paths)
    {
        var set = await LoadKeepSetAsync();
        foreach (var p in paths) set.Remove(p);
        await _SaveKeepListAsync(set);
    }

    /// Clear entire keep list.
    public async Task ClearKeepListAsync()
    {
        _keepCache = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        await _SaveKeepListAsync(_keepCache);
    }

    private async Task _SaveKeepListAsync(HashSet<string> set)
    {
        _keepCache = set;
        var json = JsonSerializer.Serialize(set.Order().ToArray(), JsonCompact);
        await _lock.WaitAsync();
        try   { await SafeWriteAllTextAsync(_keepListFile, json); }
        finally { _lock.Release(); }
    }
}
