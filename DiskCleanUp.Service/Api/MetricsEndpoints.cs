// Api/MetricsEndpoints.cs
// GET /api/metrics — process metrics (memory, threads, uptime)
// POST /api/gc — force garbage collection

namespace DiskCleanup.Api;

public static class MetricsEndpoints
{
    public static void MapMetricsEndpoints(this WebApplication app)
    {
        app.MapGet("/api/metrics", () =>
        {
            try
            {
                var proc = System.Diagnostics.Process.GetCurrentProcess();
                return Results.Ok(new
                {
                    process_mb   = Math.Round(proc.WorkingSet64 / 1_048_576.0, 1),
                    thread_count = proc.Threads.Count,
                    uptime_s     = Math.Round((DateTime.Now - proc.StartTime).TotalSeconds, 0),
                    timestamp    = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds()
                });
            }
            catch { return Results.Ok(new { process_mb = 0, thread_count = 0, uptime_s = 0, timestamp = 0L }); }
        });

        app.MapPost("/api/gc", () =>
        {
            GC.Collect(2, GCCollectionMode.Aggressive, true, true);
            GC.WaitForPendingFinalizers();
            GC.Collect(2, GCCollectionMode.Aggressive, true, true);
            var proc = System.Diagnostics.Process.GetCurrentProcess();
            return Results.Ok(new
            {
                ok = true,
                process_mb = Math.Round(proc.WorkingSet64 / 1_048_576.0, 1)
            });
        });
    }
}
