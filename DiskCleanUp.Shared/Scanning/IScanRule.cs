// DiskCleanUp.Shared/Scanning/IScanRule.cs
// Plugin interface for all scan rules.
//
// DESIGN CONTRACT:
//   Every implementation MUST:
//     1. Push exactly one "started" event at the top of RunAsync.
//     2. Push any number of "result" events as results are found.
//     3. Push exactly one "done" OR "error" event before returning.
//   The ScanPipeline enforces the push helpers so rules don't touch the
//   ChannelWriter directly — they call ctx.PushAsync / ctx.PushProgress.

namespace DiskCleanup.Scanning;

public interface IScanRule
{
    /// <summary>Section key this rule handles (e.g. "duplicates", "stale").</summary>
    string Section { get; }

    /// <summary>
    /// Execute the scan, writing events to ctx.
    /// Cancellation is cooperative — check ct and respect it promptly.
    /// </summary>
    Task RunAsync(ScanContext ctx, CancellationToken ct);
}
