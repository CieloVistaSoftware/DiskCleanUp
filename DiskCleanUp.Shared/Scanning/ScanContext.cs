// DiskCleanUp.Shared/Scanning/ScanContext.cs
// Immutable context injected into every IScanRule.RunAsync call.
//
// Decouples rules from the channel/WS infrastructure — rules never touch
// the ChannelWriter directly; they call the typed helpers here.
//
// THREADING: PushAsync is thread-safe (ChannelWriter is).
//            PushProgress is thread-safe (Interlocked + TryWrite).
//            HashAsync / ConfirmHashAsync are thread-safe (gate is per-context).

using System.Collections.Concurrent;
using System.Threading.Channels;
using DiskCleanup.Models;

namespace DiskCleanup.Scanning;

public sealed class ScanContext
{
    // ── Public config ─────────────────────────────────────────
    public DashConfig      Config     { get; }
    public HashSet<string> KeepSet    { get; }

    /// <summary>
    /// Optional extension filter from the frontend (e.g. smart-dedup, tiny-files,
    /// ext-search). Already normalised to ".ext" lowercase form.
    /// Null = no filter (scan all extensions).
    /// </summary>
    public string[]?       Extensions { get; }

    // ── Internals ─────────────────────────────────────────────
    private readonly ChannelWriter<ScanEvent>                         _writer;
    private readonly Func<string, CancellationToken, Task<string>>    _hashFn;        // xxHash64
    private readonly Func<string, CancellationToken, Task<string>>    _confirmFn;     // SHA-256
    private readonly Func<string, CancellationToken, Task<ulong>>?    _pHashFn;       // perceptual hash
    private readonly ConcurrentDictionary<string, long>               _progressTicks = new();
    private const    long                                              ProgressIntervalMs = 150;

    public ScanContext(
        DashConfig                                               config,
        HashSet<string>                                          keepSet,
        ChannelWriter<ScanEvent>                                 writer,
        Func<string, CancellationToken, Task<string>>            hashFn,
        Func<string, CancellationToken, Task<string>>            confirmFn,
        string[]?                                                extensions = null,
        Func<string, CancellationToken, Task<ulong>>?            pHashFn    = null)
    {
        Config     = config;
        KeepSet    = keepSet;
        _writer    = writer;
        _hashFn    = hashFn;
        _confirmFn = confirmFn;
        Extensions = extensions;
        _pHashFn   = pHashFn;
    }

    // ── Event helpers ─────────────────────────────────────────

    /// <summary>Write any event to the scan channel. Never blocks the caller.</summary>
    public ValueTask PushAsync(string section, string type, object? data = null,
                               CancellationToken ct = default)
        => _writer.WriteAsync(new ScanEvent(section, type, data), ct);

    /// <summary>
    /// Fire-and-forget progress update.
    /// Throttled to once per 150 ms — drops silently when the channel is full
    /// or the interval has not elapsed. The scan worker never blocks.
    /// </summary>
    public void PushProgress(string section, object? data = null)
    {
        var now  = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
        var last = _progressTicks.GetOrAdd(section, 0L);
        if (now - last < ProgressIntervalMs) return;
        _progressTicks[section] = now;
        _writer.TryWrite(new ScanEvent(section, "progress", data));
    }

    // ── Hash helpers ──────────────────────────────────────────

    /// <summary>
    /// Fast first-pass hash (xxHash64).
    /// Use for initial grouping — O(1) per file, not cryptographically secure.
    /// </summary>
    public Task<string> HashAsync(string path, CancellationToken ct = default)
        => _hashFn(path, ct);

    /// <summary>
    /// Confirmation hash (SHA-256).
    /// Use only when xxHash64 groups produce candidates — avoids wasting
    /// CPU on the full corpus.
    /// </summary>
    public Task<string> ConfirmHashAsync(string path, CancellationToken ct = default)
        => _confirmFn(path, ct);

    /// <summary>
    /// Perceptual image hash (aHash). Returns 0UL if not wired or on error.
    /// Compare two hashes with FileUtilities.HammingDistance(a, b) &lt;= threshold.
    /// </summary>
    public Task<ulong> PHashAsync(string path, CancellationToken ct = default)
        => _pHashFn != null ? _pHashFn(path, ct) : Task.FromResult(0UL);
}
