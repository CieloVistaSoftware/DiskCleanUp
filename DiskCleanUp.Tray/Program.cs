// Program.cs — DiskCleanUp.Tray
// Single-instance system tray launcher for DiskCleanUp service.

using DiskCleanup.Tray;

var logFile = Path.Combine(Path.GetDirectoryName(Environment.ProcessPath) ?? ".", "tray-error.log");

try
{
    // Single instance guard
    using var mutex = new Mutex(true, "DiskCleanUp.Tray.SingleInstance", out bool isNew);
    if (!isNew)
    {
        File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss}] Already running - exiting\n");
        return;
    }

    File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss}] Starting tray app...\n");

    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);

    Application.ThreadException += (s, e) =>
        File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss}] ThreadException: {e.Exception}\n");

    AppDomain.CurrentDomain.UnhandledException += (s, e) =>
        File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss}] UnhandledException: {e.ExceptionObject}\n");

    File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss}] Creating TrayContext...\n");
    var ctx = new TrayContext();
    File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss}] Running Application.Run...\n");
    Application.Run(ctx);
}
catch (Exception ex)
{
    File.AppendAllText(logFile, $"[{DateTime.Now:HH:mm:ss}] FATAL: {ex}\n");
    MessageBox.Show($"DiskCleanUp Tray Error:\n{ex.Message}", "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
}
