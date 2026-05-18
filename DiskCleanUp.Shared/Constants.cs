// DiskCleanUp.Shared/Constants.cs
// Shared constants across Service, Tray, and any future projects.

namespace DiskCleanup;

public static class Constants
{
    /// <summary>Port used by the Windows Service (production).</summary>
    public const int ServicePort = 5100;

    /// <summary>Port used by console mode (dev). Always 5000 — never reads config.</summary>
    public const int DevPort = 5000;

    /// <summary>Windows Service registration name.</summary>
    public const string ServiceName = "DiskCleanUp";

    /// <summary>Display name in Services panel.</summary>
    public const string ServiceDisplayName = "DiskCleanUp Background Scanner";

    /// <summary>
    /// One data directory. Always. Both service and console mode.
    /// %ProgramData%\DiskCleanUp\
    /// </summary>
    public static string DataDir =>
        Path.Combine(Environment.GetFolderPath(
            Environment.SpecialFolder.CommonApplicationData), "DiskCleanUp");

    // ── Well-known file/folder names ─────────────────────────
    public const string ConfigFile     = "config.json";
    public const string KeepListFile   = "keep-list.json";
    public const string SavingsFile    = "savings.jsonl";
    public const string ErrorsFile     = "errors.jsonl";
    public const string SessionFile    = "session.json";
    public const string DebugFile      = "debug.json";
    public const string TraceFile      = "trace.jsonl";
    public const string ScanCacheDir   = "scan-cache";
    public const string AnswersDir     = "answers";
    public const string LogDir         = "logs";
    public const string SysmonConfig   = "sysmon-config.xml";

    // ── Section names (must match frontend section-handlers.js) ──
    public static readonly string[] AllSections = [
        "duplicates", "smart-dedup", "stale", "large", "node-modules",
        "venvs", "empty", "images", "backups", "tiny-files",
        "html-files", "css-files"
    ];
}
