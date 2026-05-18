// Services/DiagService.cs
// Owns debug workflow log and trace log state.
// Extracted from inline Program.cs variables.

using System.Text.Json;
using DiskCleanup.Helpers;

namespace DiskCleanup.Services;

public class DiagService
{
    private readonly string _debugPath;
    private readonly string _tracePath;
    private readonly object _debugLock = new();
    private readonly object _traceLock = new();
    private int _debugSeq;

    public DiagService(string baseDir)
    {
        _debugPath = Path.Combine(baseDir, "debug.json");
        _tracePath = Path.Combine(baseDir, "trace.jsonl");

        // Reset debug.json on every server start — fresh workflow per session
        try { File.WriteAllText(_debugPath, "[\n"); }
        catch { /* best-effort */ }
    }

    public void WriteDebugEvents(List<JsonElement> events)
    {
        if (events.Count == 0) return;
        lock (_debugLock)
        {
            try
            {
                using var fs = new FileStream(_debugPath, FileMode.Open, FileAccess.Write,
                    FileShare.ReadWrite, bufferSize: 4096);
                fs.Seek(0, SeekOrigin.End);
                using var sw = new StreamWriter(fs, System.Text.Encoding.UTF8);
                foreach (var evt in events)
                {
                    var seq = Interlocked.Increment(ref _debugSeq);
                    sw.Write($"{{\"seq\":{seq},");
                    var raw = evt.GetRawText();
                    if (raw.StartsWith("{")) raw = raw.Substring(1);
                    sw.WriteLine(raw);
                }
            }
            catch { /* debug is best-effort */ }
        }
    }

    public object ReadDebugEvents()
    {
        if (!File.Exists(_debugPath)) return new { events = Array.Empty<object>(), count = 0 };
        lock (_debugLock)
        {
            try
            {
                using var fs = new FileStream(_debugPath, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite, bufferSize: 4096);
                using var sr = new StreamReader(fs, System.Text.Encoding.UTF8);
                var events = new List<object>();
                while (sr.ReadLine() is { } line)
                {
                    line = line.Trim();
                    if (string.IsNullOrWhiteSpace(line) || line == "[" || line == "]") continue;
                    if (line.EndsWith(",")) line = line[..^1];
                    try
                    {
                        var obj = JsonSerializer.Deserialize<object>(line);
                        if (obj != null) events.Add(obj);
                    }
                    catch { /* skip malformed lines */ }
                }
                return new { events, count = events.Count };
            }
            catch { return new { events = Array.Empty<object>(), count = 0 }; }
        }
    }

    public void ClearDebug()
    {
        lock (_debugLock)
        {
            try { File.WriteAllText(_debugPath, "[\n"); }
            catch { /* best-effort */ }
        }
        Interlocked.Exchange(ref _debugSeq, 0);
    }

    public void WriteTrace(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return;
        lock (_traceLock)
        {
            try
            {
                using var fs = new FileStream(_tracePath, FileMode.Append, FileAccess.Write,
                    FileShare.ReadWrite, bufferSize: 4096);
                using var sw = new StreamWriter(fs, System.Text.Encoding.UTF8);
                sw.WriteLine(body);
            }
            catch { /* trace is best-effort */ }
        }
    }

    public object ReadTrace(int? tail = null)
    {
        if (!File.Exists(_tracePath)) return new { lines = Array.Empty<string>(), total = 0 };
        lock (_traceLock)
        {
            try
            {
                using var fs = new FileStream(_tracePath, FileMode.Open, FileAccess.Read,
                    FileShare.ReadWrite, bufferSize: 4096);
                using var sr = new StreamReader(fs, System.Text.Encoding.UTF8);
                var lines = new List<string>();
                while (sr.ReadLine() is { } line)
                    if (!string.IsNullOrWhiteSpace(line)) lines.Add(line);
                var total = lines.Count;
                // Return only the last N lines when tail is specified (prevents browser hang)
                if (tail.HasValue && tail.Value > 0 && lines.Count > tail.Value)
                    lines = lines.GetRange(lines.Count - tail.Value, tail.Value);
                return new { lines, total };
            }
            catch { return new { lines = Array.Empty<string>(), total = 0 }; }
        }
    }

    public void ClearTrace()
    {
        lock (_traceLock) { SafeFileHelpers.SafeTruncate(_tracePath); }
    }
}
