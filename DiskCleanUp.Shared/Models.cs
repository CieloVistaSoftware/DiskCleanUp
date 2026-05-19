// Models/Models.cs
// All domain records used across the dashboard.

using System.Text.Json.Serialization;

namespace DiskCleanup.Models;

// ── Scan Event (sent to all SignalR clients) ─────────────────
public record ScanEvent(
    string Section,
    string Type,
    object? Data = null
);

// ── File Record ──────────────────────────────────────────────
public record FileRecord(
    string Path,
    long   Size,
    string Modified
);

// ── Dashboard Config ─────────────────────────────────────────
public record DashConfig
{
    /// <summary>
    /// The port Kestrel binds on and the browser connects to.
    /// This is the ONE source of truth for the port — read by the
    /// backend before starting, and by the tray before launching.
    /// Default 5100. Change here, everything follows.
    /// </summary>
    [JsonPropertyName("port")]
    public int Port { get; init; } = 5100;

    [JsonPropertyName("root")]
    public string Root { get; init; } = string.Empty;

    [JsonPropertyName("extra_roots")]
    public string[] ExtraRoots { get; init; } = [];

    [JsonPropertyName("stale_days")]
    public int StaleDays { get; init; } = 90;

    [JsonPropertyName("large_file_mb")]
    public int LargeFileMb { get; init; } = 50;

    // Max parallel file workers. Defaults to half logical CPUs.
    // Increase for faster scans, decrease to stay out of the way.
    [JsonPropertyName("max_parallelism")]
    public int MaxParallelism { get; init; } = Math.Max(1, Environment.ProcessorCount / 2);

    // Max concurrent MD5 hashes. MD5 is the most CPU-intensive op.
    // Separate from MaxParallelism so you can tune them independently.
    [JsonPropertyName("max_hash_concurrency")]
    public int MaxHashConcurrency { get; init; } = Math.Max(1, Environment.ProcessorCount / 4);

    [JsonPropertyName("shared_venv")]
    public string SharedVenv { get; init; } = string.Empty;

    // Scheduled scan: "02:00" = run daily at 2am, "" = disabled
    [JsonPropertyName("scheduled_scan_time")]
    public string ScheduledScanTime { get; init; } = "";

    // Which sections to run in scheduled scan (empty = all)
    [JsonPropertyName("scheduled_sections")]
    public string[] ScheduledSections { get; init; } = ["duplicates", "backups", "large", "stale", "empty"];

    // Hours between automatic scan cycles (0 = use scheduled time only)
    [JsonPropertyName("scan_interval_hours")]
    public double ScanIntervalHours { get; init; } = 6.0;

    // Anthropic API key — stored server-side, never sent to the browser.
    // Used by the /api/ai/chat proxy endpoint.
    [JsonPropertyName("anthropic_api_key")]
    public string AnthropicApiKey { get; init; } = "";

    // Seconds between background JSON answer artifact generations.
    [JsonPropertyName("answer_refresh_seconds")]
    public int AnswerRefreshSeconds { get; init; } = 60;
}

// ── Savings Log Entry ────────────────────────────────────────
public record SavingsEntry(
    [property: JsonPropertyName("ts")]         string Ts,
    [property: JsonPropertyName("action")]     string Action,
    [property: JsonPropertyName("bytes")]      long   Bytes,
    [property: JsonPropertyName("mb")]         double Mb,
    [property: JsonPropertyName("detail")]     string Detail    = "",
    [property: JsonPropertyName("session_id")] string SessionId = ""
);

// ── Session ───────────────────────────────────────────────────
public record SessionInfo(
    [property: JsonPropertyName("id")]         string Id,
    [property: JsonPropertyName("started_at")] string StartedAt,
    [property: JsonPropertyName("label")]      string Label
);

// ── API Request Bodies ───────────────────────────────────────
public record PathsRequest(
    [property: JsonPropertyName("paths")] string[]? Paths
);

public record SmartDedupItem(
    [property: JsonPropertyName("delete")] string[]? Delete
);

public record SmartDedupApplyRequest(
    [property: JsonPropertyName("items")] SmartDedupItem[]? Items
);

public record NewSessionRequest(
    [property: JsonPropertyName("label")] string? Label
);

// ── Client-side Error Log Entry ─────────────────────────────────────
// Posted from the browser ErrLog system. Stored as JSONL so each
// line is a standalone record — easy to grep, easy to tail.
public record ClientErrorEntry(
    [property: JsonPropertyName("id")]          string  Id,
    [property: JsonPropertyName("ts")]          string  Ts,
    [property: JsonPropertyName("type")]        string  Type,
    [property: JsonPropertyName("prefix")]      string  Prefix,
    [property: JsonPropertyName("message")]     string  Message,
    [property: JsonPropertyName("loc")]         string  Loc,
    [property: JsonPropertyName("stack")]       string  Stack,
    [property: JsonPropertyName("hits")]        int     Hits,
    [property: JsonPropertyName("session_id")] string  SessionId,
    [property: JsonPropertyName("url")]         string  Url
);

public record TrashResult(bool Ok, long Freed, string? Error);

public record ResolveFixRequest(
    [property: JsonPropertyName("id")] string Id
);

public record SectionRequest(
    [property: JsonPropertyName("section")] string Section
);

public record RemovePathsRequest(
    [property: JsonPropertyName("paths")]   string[]? Paths,
    [property: JsonPropertyName("trash")]   bool      Trash = true   // also send to recycle bin
);

public record OpenFileRequest(
    [property: JsonPropertyName("path")] string Path
);

public record HtmlUtilityRequest(
    [property: JsonPropertyName("paths")] string[]? Paths,
    [property: JsonPropertyName("utility")] string Utility
);

public record RecycleBinItem(
    string Name,
    string OriginalPath,
    string DateDeleted,
    long Size,
    string FileType,
    string RecyclePath
);

public record RestoreRequest(
    string[] Items  // array of RecyclePath values
);

public record KeepPathsRequest(
    [property: JsonPropertyName("paths")] string[]? Paths
);

public record KillTaskRequest(
    [property: JsonPropertyName("pid")] int Pid
);

public record FocusTaskRequest(
    [property: JsonPropertyName("pid")] int Pid
);

// ── AI Chat ─────────────────────────────────────────────────
public record AiMessage(
    [property: JsonPropertyName("role")]    string Role,
    [property: JsonPropertyName("content")] string Content
);

public record AiChatRequest(
    [property: JsonPropertyName("messages")] AiMessage[] Messages,
    [property: JsonPropertyName("context")]  AiContext?  Context
);

public record AiContext(
    [property: JsonPropertyName("section")]     string? Section,
    [property: JsonPropertyName("root")]        string? Root,
    [property: JsonPropertyName("files")]       long    Files,
    [property: JsonPropertyName("results")]     long    Results,
    [property: JsonPropertyName("status")]      string? Status,
    [property: JsonPropertyName("samplePaths")] string[]? SamplePaths
);
