// Api/TaskEndpoints.cs
// GET /api/tasks — list system processes
// POST /api/tasks/kill — kill a process by PID
// POST /api/tasks/focus — bring a process window to the foreground

using System.Management;
using System.Runtime.InteropServices;
using DiskCleanup.Models;
using Microsoft.AspNetCore.Mvc;

namespace DiskCleanup.Api;

public static class TaskEndpoints
{
    public static void MapTaskEndpoints(this WebApplication app)
    {
        app.MapGet("/api/tasks", () =>
        {
            try
            {
                // Build parent PID lookup via WMI (one query for all processes)
                var parentMap = new Dictionary<int, int>();
                try
                {
                    using var searcher = new ManagementObjectSearcher(
                        "SELECT ProcessId, ParentProcessId FROM Win32_Process");
                    foreach (var obj in searcher.Get())
                    {
                        var pid = Convert.ToInt32(obj["ProcessId"]);
                        var ppid = Convert.ToInt32(obj["ParentProcessId"]);
                        parentMap[pid] = ppid;
                    }
                }
                catch { /* WMI unavailable — parentPid will be 0 */ }

                var procs = System.Diagnostics.Process.GetProcesses()
                    .Select(p =>
                    {
                        string? path = null, company = null, desc = null;
                        double cpu = 0;
                        try { path = p.MainModule?.FileName; } catch { }
                        try { company = p.MainModule?.FileVersionInfo?.CompanyName; } catch { }
                        try { desc = p.MainModule?.FileVersionInfo?.FileDescription; } catch { }
                        try { cpu = p.TotalProcessorTime.TotalMilliseconds; } catch { }
                        string? title = null;
                        try { title = p.MainWindowTitle; } catch { }
                        parentMap.TryGetValue(p.Id, out var ppid);
                        return new
                        {
                            pid = p.Id,
                            parentPid = ppid,
                            name = p.ProcessName,
                            memory = p.WorkingSet64,
                            cpu,
                            threads = p.Threads.Count,
                            path = path ?? "",
                            company = company ?? "",
                            description = desc ?? "",
                            title = title ?? "",
                            responding = true
                        };
                    })
                    .OrderBy(p => p.name, StringComparer.OrdinalIgnoreCase)
                    .ToArray();
                return Results.Ok(new { processes = procs, count = procs.Length });
            }
            catch (Exception ex) { return Results.Ok(new { processes = Array.Empty<object>(), count = 0, error = ex.Message }); }
        });

        app.MapPost("/api/tasks/focus", ([FromBody] FocusTaskRequest req) =>
        {
            if (req.Pid <= 0) return Results.BadRequest(new { error = "Invalid PID" });
            try
            {
                var proc = System.Diagnostics.Process.GetProcessById(req.Pid);
                var handle = proc.MainWindowHandle;
                if (handle == IntPtr.Zero)
                    return Results.Ok(new { ok = false, reason = "no-window" });
                Win32.ShowWindow(handle, 9); // SW_RESTORE — unminimize if needed
                Win32.SetForegroundWindow(handle);
                return Results.Ok(new { ok = true, name = proc.ProcessName });
            }
            catch (ArgumentException) { return Results.NotFound(new { error = $"PID {req.Pid} not found" }); }
            catch (Exception ex)      { return Results.Ok(new { ok = false, error = ex.Message }); }
        });

        app.MapPost("/api/tasks/kill", ([FromBody] KillTaskRequest req) =>
        {
            if (req.Pid <= 0) return Results.BadRequest(new { error = "Invalid PID" });
            try
            {
                var proc = System.Diagnostics.Process.GetProcessById(req.Pid);
                var name = proc.ProcessName;
                long memoryFreed = 0;
                try { memoryFreed = proc.WorkingSet64; } catch { }
                proc.Kill(entireProcessTree: false);
                return Results.Ok(new { ok = true, name, pid = req.Pid, memoryFreed });
            }
            catch (ArgumentException) { return Results.NotFound(new { error = $"PID {req.Pid} not found" }); }
            catch (Exception ex) { return Results.Ok(new { ok = false, error = ex.Message }); }
        });
    }
}

file static class Win32
{
    [DllImport("user32.dll")] internal static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] internal static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
