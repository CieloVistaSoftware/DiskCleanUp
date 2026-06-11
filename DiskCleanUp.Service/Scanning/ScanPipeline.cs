// DiskCleanUp.Service/Scanning/ScanPipeline.cs
// Resolves an IScanRule by section name and runs it.
//
// DESIGN:
//   All IScanRule implementations are registered via DI. ScanPipeline is
//   injected with IEnumerable<IScanRule> so adding a new rule is just
//   implementing IScanRule and registering it — no switch statement required.
//
// USAGE (in ScanOrchestrator.RunWorker):
//   await _pipeline.RunAsync(section, ctx, ct);

using DiskCleanup.Scanning;
using Microsoft.Extensions.Logging;

namespace DiskCleanup.Scanning;

public sealed class ScanPipeline
{
    private readonly IReadOnlyDictionary<string, IScanRule> _rules;
    private readonly ILogger<ScanPipeline>                  _log;

    public ScanPipeline(IEnumerable<IScanRule> rules, ILogger<ScanPipeline> log)
    {
        _rules = rules.ToDictionary(r => r.Section, StringComparer.OrdinalIgnoreCase);
        _log   = log;
    }

    /// <summary>
    /// Dispatch section to its IScanRule.
    /// Pushes an "error" event and returns normally on unknown sections so the
    /// drain loop is never left waiting for an event that never arrives.
    /// </summary>
    public async Task RunAsync(string section, ScanContext ctx, CancellationToken ct)
    {
        if (!_rules.TryGetValue(section, out var rule))
        {
            _log.LogWarning("ScanPipeline: no rule registered for section '{Section}'", section);
            await ctx.PushAsync(section, "error",
                new { message = $"Unknown section: {section}" }, ct);
            return;
        }

        try
        {
            await rule.RunAsync(ctx, ct);
        }
        catch (OperationCanceledException)
        {
            await ctx.PushAsync(section, "error", new { message = "Scan cancelled" }, ct);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "ScanPipeline: unhandled error in rule '{Section}'", section);
            await ctx.PushAsync(section, "error", new { message = ex.Message }, ct);
        }
    }

    /// All registered section names (useful for "scan all" operations).
    public IEnumerable<string> Sections => _rules.Keys;
}
