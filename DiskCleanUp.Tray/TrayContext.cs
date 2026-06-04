// TrayContext.cs — System tray for DiskCleanUp (dev/console mode only).
//
// DESIGN RULES:
//   - Always port 5000 (Constants.DevPort). Never 5100. Never reads config for port.
//   - Start = launch DiskCleanUp.Service.exe --console. No sc.exe, no UAC.
//   - Stop  = POST /api/shutdown. No sc.exe, no UAC.
//   - Poll /api/service/info on 5000 every 5s to update icon colour.

using System.Diagnostics;
using System.Net.Http;
using System.Text.Json;
using System.Drawing;
using System.Windows.Forms;
using DiskCleanup;
using Microsoft.Win32;
using System.Drawing;
using System.Windows.Forms;

namespace DiskCleanup.Tray;

public class TrayContext : ApplicationContext
{
    // ── Constants ─────────────────────────────────────────────────────────
    private static readonly string ServiceExe = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..",          // up to repo root
            "DiskCleanUp.Service", "bin", "Debug", "net8.0",
            "DiskCleanUp.Service.exe"));

    private static readonly string ServiceWorkDir = Path.GetFullPath(
        Path.Combine(AppContext.BaseDirectory,
            "..", "..", "..", "..", "..",
            "DiskCleanUp.Service"));

    private static readonly string DashboardUrl     = $"http://localhost:{Constants.DevPort}";
    private static readonly string ServiceUrl        = $"http://localhost:{Constants.ServicePort}";

    // ── Fields ────────────────────────────────────────────────────────────

    private readonly NotifyIcon        _tray;
    private readonly System.Windows.Forms.Timer _pollTimer;
    private readonly HttpClient        _http;
    private readonly ContextMenuStrip  _menu;
    private readonly ToolStripMenuItem _startItem;
    private readonly ToolStripMenuItem _stopItem;
    private readonly Icon _iconGreen;   // running
    private readonly Icon _iconRed;     // stopped

    private ServiceState _state   = ServiceState.Unknown;
    private string       _tooltip = "DiskCleanUp — Checking...";

    // ── Constructor ───────────────────────────────────────────────────────

    public TrayContext()
    {
        this._http = new HttpClient { Timeout = TimeSpan.FromSeconds(4) };
        this._iconGreen = IconGenerator.CreateCircleIcon(Color.FromArgb(76, 175, 80));
        this._iconRed   = IconGenerator.CreateCircleIcon(Color.FromArgb(244, 67, 54));
        this._startItem = new ToolStripMenuItem("▶  Start Service",  null, OnStart) { Enabled = false };
        this._stopItem  = new ToolStripMenuItem("⏹  Stop Service",   null, OnStop)  { Enabled = false };
        this._menu = new ContextMenuStrip();
        _menu.Items.Add("📊  Open Dashboard", null, OnOpenDashboard);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add(_startItem);
        _menu.Items.Add(_stopItem);
        _menu.Items.Add(new ToolStripMenuItem("♻  Restart Service", null, OnRestart));
        _menu.Items.Add(new ToolStripSeparator());
        var autoStart = new ToolStripMenuItem("Start with Windows", null, OnToggleAutoStart)
            { Checked = IsAutoStartEnabled() };
        _menu.Items.Add(autoStart);
        _menu.Items.Add(new ToolStripSeparator());
        // ── Dev tools submenu ─────────────────────────────────────────
        var devMenu = new ToolStripMenuItem("🛠  Dev Tools");
        devMenu.DropDownItems.Add("🧊  Real FREEZE 5s",   null, (_, _) => OpenFreezeTest(5000));
        devMenu.DropDownItems.Add("🧊  Real FREEZE 10s",  null, (_, _) => OpenFreezeTest(10000));
        devMenu.DropDownItems.Add("🧊  Real FREEZE 20s",  null, (_, _) => OpenFreezeTest(20000));
        _menu.Items.Add(devMenu);
        _menu.Items.Add(new ToolStripSeparator());
        _menu.Items.Add("❌  Exit", null, OnExit);
        // Add Help menu item (after dev tools, before Exit)
        var helpItem = new ToolStripMenuItem("❓  Help", null, OnHelp);
        _menu.Items.Insert(_menu.Items.Count - 1, helpItem);
        this._tray = new NotifyIcon
        {
            Icon             = _iconRed,
            Text             = _tooltip,
            Visible          = true,
            ContextMenuStrip = _menu,
        };
        _tray.DoubleClick += OnOpenDashboard;
        this._pollTimer = new System.Windows.Forms.Timer { Interval = 5_000 };
        _pollTimer.Tick += async (_, _) => await PollAsync();
        _pollTimer.Start();
        _ = PollAsync();
        
        // Auto-start service on tray launch if not already running
        _ = AutoStartServiceAsync();
    }

    // ── Auto-start on launch ──────────────────────────────────────────────
    private async Task AutoStartServiceAsync()
    {
        // Wait a moment for initial poll to complete
        await Task.Delay(1000);
        
        // If service is not running, start it automatically
        if (_state != ServiceState.Running)
        {
            OnStart(null, EventArgs.Empty);
        }
    }

    // Handler for Help menu item
    private void OnHelp(object? sender, EventArgs e)
    {
        var helpPath = Path.Combine(AppContext.BaseDirectory, "..", "..", "..", "..", "..", "DiskCleanUp.Tray", "TRAY-HELP.md");
        try
        {
            Process.Start(new ProcessStartInfo {
                FileName = helpPath,
                UseShellExecute = true
            });
        }
        catch (Exception ex)
        {
            System.Windows.Forms.MessageBox.Show($"Could not open help file:\n{ex.Message}", "Help Error");
        }
    }

    // ── Poll ──────────────────────────────────────────────────────────────
    private async Task PollAsync()
    {
        try
        {
            var resp = await _http.GetAsync($"{DashboardUrl}/api/service/info");
            if (!resp.IsSuccessStatusCode) { SetState(ServiceState.Stopped); return; }
            var info = JsonSerializer.Deserialize<ServiceInfo>(
                await resp.Content.ReadAsStringAsync());
            SetState(ServiceState.Running,
                $"DiskCleanUp — Running · Up {info?.uptime ?? "?"}");
        }
        catch
        {
            SetState(ServiceState.Stopped);
        }
    }

    private void SetState(ServiceState state, string? tip = null)
    {
        var tooltip = (tip ?? "DiskCleanUp — Not running");
        if (tooltip.Length > 63) tooltip = tooltip[..63];

        if (state == _state && tooltip == _tooltip) return;
        _state   = state;
        _tooltip = tooltip;

        bool running = state == ServiceState.Running;
        _tray.Icon        = running ? _iconGreen : _iconRed;
        _tray.Text        = _tooltip;
        _startItem.Enabled = !running;
        _stopItem.Enabled  =  running;
    }

    // ── Start ─────────────────────────────────────────────────────────────
    private async void OnStart(object? sender, EventArgs e)
    {
        _startItem.Enabled = false;
        _tray.Text = "DiskCleanUp — Starting...";

        // Kill anything already on 5000
        KillPort(Constants.DevPort);
        await Task.Delay(500);

        // Launch console mode — no UAC, no sc.exe
        if (!File.Exists(ServiceExe))
        {
            ShowBalloon("Start Failed",
                $"Build not found:\n{ServiceExe}\nRun: npm start", ToolTipIcon.Error);
            await PollAsync();
            return;
        }

        Process.Start(new ProcessStartInfo
        {
            FileName         = ServiceExe,
            Arguments        = "--console",
            WorkingDirectory = ServiceWorkDir,
            UseShellExecute  = false,
            CreateNoWindow   = false,
        });

        // Wait up to 15s for it to respond
        for (int i = 0; i < 30; i++)
        {
            await Task.Delay(500);
            try
            {
                var r = await _http.GetAsync($"{DashboardUrl}/api/service/info");
                if (r.IsSuccessStatusCode)
                {
                    await PollAsync();
                    OpenUrl(DashboardUrl);
                    return;
                }
            }
            catch { }
        }

        ShowBalloon("Start", "Started but dashboard didn't respond in time.", ToolTipIcon.Warning);
        await PollAsync();
    }

    // ── Restart ───────────────────────────────────────────────────────────
    // POSTs to the Windows Service (5100). Environment.Exit(1) causes SCM
    // recovery policy to restart it automatically — no elevation needed.
    private async void OnRestart(object? sender, EventArgs e)
    {
        _tray.Text = "DiskCleanUp — Restarting...";
        try { await _http.PostAsync($"{ServiceUrl}/api/restart", null); } catch { }
        // SCM restarts the service automatically (recovery policy: restart/5s).
        // Poll port 5100 until it comes back up (up to 30s).
        await Task.Delay(2000);
        for (int i = 0; i < 28; i++)
        {
            await Task.Delay(1000);
            try
            {
                var r = await _http.GetAsync($"{ServiceUrl}/api/service/info");
                if (r.IsSuccessStatusCode) { await PollAsync(); return; }
            }
            catch { }
        }
        await PollAsync();
    }

    // ── Stop ──────────────────────────────────────────────────────────────
    private async void OnStop(object? sender, EventArgs e)
    {
        _stopItem.Enabled = false;
        try { await _http.PostAsync($"{DashboardUrl}/api/shutdown", null); } catch { }

        // Wait up to 5s for port to clear
        for (int i = 0; i < 10; i++)
        {
            await Task.Delay(500);
            try { await _http.GetAsync($"{DashboardUrl}/api/service/info"); }
            catch { break; }
        }

        await PollAsync();
    }

    // ── Open Dashboard ────────────────────────────────────────────────────
    private void OnOpenDashboard(object? sender, EventArgs e) => OpenUrl(DashboardUrl);

    // ── Exit ──────────────────────────────────────────────────────────────
    private void OnExit(object? sender, EventArgs e)
    {
        _pollTimer.Stop();
        _tray.Visible = false;
        _tray.Dispose();
        _http.Dispose();
        Application.Exit();
    }

    // ── Auto-start ────────────────────────────────────────────────────────
    private const string RunKey  = @"Software\Microsoft\Windows\CurrentVersion\Run";
    private const string AppName = "DiskCleanUp Tray";

    private static bool IsAutoStartEnabled()
    {
        using var k = Registry.CurrentUser.OpenSubKey(RunKey, false);
        return k?.GetValue(AppName) != null;
    }

    private static void SetAutoStart(bool enable)
    {
        using var k = Registry.CurrentUser.OpenSubKey(RunKey, true);
        if (k == null) return;
        if (enable)
        {
            var exe = Environment.ProcessPath ?? Process.GetCurrentProcess().MainModule?.FileName;
            if (exe != null) k.SetValue(AppName, $"\"{exe}\"");
        }
        else k.DeleteValue(AppName, throwOnMissingValue: false);
    }

    private void OnToggleAutoStart(object? sender, EventArgs e)
    {
        if (sender is not ToolStripMenuItem item) return;
        item.Checked = !item.Checked;
        SetAutoStart(item.Checked);
        ShowBalloon("Auto-Start",
            item.Checked ? "Tray starts with Windows." : "Auto-start disabled.",
            ToolTipIcon.Info);
    }

    // ── Real FREEZE test ────────────────────────────────────────────────
    private void OpenFreezeTest(int durationMs)
    {
        if (_state != ServiceState.Running)
        {
            ShowBalloon("FREEZE Test", "Service is not running.", ToolTipIcon.Warning);
            return;
        }
        OpenUrl($"{DashboardUrl}/freeze-test.html?ms={durationMs}");
    }

    // ── Helpers ───────────────────────────────────────────────────────────
    private static void KillPort(int port)
    {
        try
        {
            var p = Process.Start(new ProcessStartInfo
            {
                FileName               = "netstat.exe",
                Arguments              = "-ano",
                UseShellExecute        = false,
                RedirectStandardOutput = true,
                CreateNoWindow         = true,
            });
            if (p == null) return;
            var output = p.StandardOutput.ReadToEnd();
            p.WaitForExit(5000);

            foreach (var line in output.Split('\n'))
            {
                if (!line.Contains($":{port} ") && !line.Contains($":{port}\t")) continue;
                if (!line.Contains("LISTENING")) continue;
                var parts = line.Trim().Split(' ', StringSplitOptions.RemoveEmptyEntries);
                if (parts.Length < 5 || !int.TryParse(parts[^1], out var pid) || pid <= 0) continue;
                Process.Start(new ProcessStartInfo
                {
                    FileName        = "taskkill.exe",
                    Arguments       = $"/F /PID {pid}",
                    UseShellExecute = false,
                    CreateNoWindow  = true,
                })?.WaitForExit(3000);
            }
        }
        catch { }
    }

    private static void OpenUrl(string url)
    {
        try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
        catch { }
    }

    private void ShowBalloon(string title, string text, ToolTipIcon icon) =>
        _tray.ShowBalloonTip(3000, title, text, icon);

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _pollTimer.Dispose();
            _tray.Dispose();
            _http.Dispose();
            _iconGreen.Dispose();
            _iconRed.Dispose();
        }
        base.Dispose(disposing);
    }
}

internal enum ServiceState { Unknown, Running, Stopped }

internal record ServiceInfo
{
    public string mode   { get; init; } = "";
    public int    port   { get; init; }
    public string uptime { get; init; } = "";
}
