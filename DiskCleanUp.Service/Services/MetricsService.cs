// MetricsService.cs
// Background service — broadcasts SYSTEM-WIDE CPU % and memory usage
// using the same Win32 APIs as Task Manager:
//   CPU:  GetSystemTimes() — kernel + user time deltas
//   MEM:  GlobalMemoryStatusEx() — physical memory usage

using System.Diagnostics;
using System.Runtime.InteropServices;

namespace DiskCleanup.Services;

public class MetricsService : BackgroundService
{
    private readonly WsManager _ws;

    // Previous CPU sample for delta calculation
    private long _prevIdle, _prevKernel, _prevUser;

    public MetricsService(WsManager ws)
    {
        _ws = ws;
        // Prime the first sample
        GetSystemTimes(out _prevIdle, out _prevKernel, out _prevUser);
    }

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        try { await Task.Delay(TimeSpan.FromSeconds(2), ct); }
        catch (OperationCanceledException) { return; }

        while (!ct.IsCancellationRequested)
        {
            double cpuPct = 0;
            double memUsedMb = 0;
            double totalRamMb = 0;
            double memPct = 0;
            int threads = 0;

            // ── CPU via GetSystemTimes ────────────────────────
            try
            {
                if (GetSystemTimes(out long idle, out long kernel, out long user))
                {
                    long idleDelta   = idle   - _prevIdle;
                    long kernelDelta = kernel - _prevKernel;
                    long userDelta   = user   - _prevUser;

                    // kernel time includes idle time
                    long totalDelta = kernelDelta + userDelta;
                    long busyDelta  = totalDelta - idleDelta;

                    cpuPct = totalDelta > 0
                        ? Math.Clamp((double)busyDelta / totalDelta * 100.0, 0, 100)
                        : 0;

                    _prevIdle   = idle;
                    _prevKernel = kernel;
                    _prevUser   = user;
                }
            }
            catch { }

            // ── Memory via GlobalMemoryStatusEx ───────────────
            try
            {
                var memInfo = new MEMORYSTATUSEX { dwLength = (uint)Marshal.SizeOf<MEMORYSTATUSEX>() };
                if (GlobalMemoryStatusEx(ref memInfo))
                {
                    totalRamMb = memInfo.ullTotalPhys / 1_048_576.0;
                    var usedBytes = memInfo.ullTotalPhys - memInfo.ullAvailPhys;
                    memUsedMb = usedBytes / 1_048_576.0;
                    memPct = memInfo.dwMemoryLoad; // Windows calculates this for us
                }
            }
            catch { }

            // ── Thread count (app only) ──────────────────────
            try { threads = Process.GetCurrentProcess().Threads.Count; }
            catch { }

            try
            {
                await _ws.BroadcastAsync("metrics", "update", new
                {
                    cpu_pct        = Math.Round(cpuPct, 1),
                    mem_pct        = Math.Round(memPct, 1),
                    working_set_mb = Math.Round(memUsedMb, 0),
                    total_ram_mb   = Math.Round(totalRamMb, 0),
                    thread_count   = threads
                });
            }
            catch { }

            try { await Task.Delay(TimeSpan.FromSeconds(5), ct); }
            catch (OperationCanceledException) { break; }
        }
    }

    // ── Win32 Interop ────────────────────────────────────────────────────

    [DllImport("kernel32.dll", SetLastError = true)]
    private static extern bool GetSystemTimes(
        out long idleTime, out long kernelTime, out long userTime);

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX lpBuffer);

    [StructLayout(LayoutKind.Sequential)]
    private struct MEMORYSTATUSEX
    {
        public uint  dwLength;
        public uint  dwMemoryLoad;       // % memory in use (0-100)
        public ulong ullTotalPhys;       // total physical RAM bytes
        public ulong ullAvailPhys;       // available physical RAM bytes
        public ulong ullTotalPageFile;
        public ulong ullAvailPageFile;
        public ulong ullTotalVirtual;
        public ulong ullAvailVirtual;
        public ulong ullAvailExtendedVirtual;
    }
}
