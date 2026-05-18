// Services/FileUtilities.cs
// All filesystem operations — truly async where .NET supports it.
//
// HONEST ASYNC NOTES:
//   • Directory enumeration  → no native async API in .NET.
//     EnumerateFiles is sync. We call it from Task.Run so it runs on
//     a thread-pool thread and never blocks the ASP.NET request pipeline.
//   • File READING (MD5)     → fully async via FileStream + FileOptions.Asynchronous.
//     ReadAsync uses OS async I/O (IOCP on Windows), zero thread blocking.
//   • File metadata (Length, LastWriteTime) → sync FileInfo. Fast enough;
//     does not read file content, just queries directory entry.
//   • File move/delete       → sync. No native async delete in .NET.
//     Wrapped in Task.Run for callers that need fire-and-forget.

using System.Security.Cryptography;
using Microsoft.VisualBasic.FileIO;
using DiskCleanup.Models;

namespace DiskCleanup.Services;

public static class FileUtilities
{
    // ── Async MD5 ────────────────────────────────────────────
    // Uses FileOptions.Asynchronous so I/O completion ports handle the
    // read — no thread sits blocked waiting for disk.
    // 40KB buffer stays under .NET's 85KB Large Object Heap threshold.
    // 128KB was landing every concurrent hash buffer on the LOH, causing
    // GC pressure and heap fragmentation under parallel scans.
    public static async Task<string> Md5Async(string path, CancellationToken ct = default)
    {
        try
        {
            await using var fs = new FileStream(
                path,
                FileMode.Open, FileAccess.Read, FileShare.Read,
                bufferSize: 40_960,              // 40 KB — safely under 85KB LOH cutoff
                options: FileOptions.Asynchronous | FileOptions.SequentialScan
            );
            using var md5  = MD5.Create();
            var hash = await md5.ComputeHashAsync(fs, ct);
            return Convert.ToHexString(hash).ToLowerInvariant();
        }
        catch { return string.Empty; }
    }

    // ── File Size (sync — just reads directory entry) ────────
    public static long FileSize(string path)
    {
        try { return new FileInfo(path).Length; }
        catch { return 0L; }
    }

    // ── Directory Size (runs file enumeration on thread pool) ─
    public static Task<long> DirSizeAsync(string dir, CancellationToken ct = default)
        => Task.Run(() =>
            Directory.EnumerateFiles(dir, "*", System.IO.SearchOption.AllDirectories)
                     .Sum(f => { ct.ThrowIfCancellationRequested(); return FileSize(f); }), ct);

    // ── Send to Recycle Bin (Windows shell operation) ─────────
    public static TrashResult SendToRecycleBin(string path)
    {
        if (!File.Exists(path) && !Directory.Exists(path))
            return new TrashResult(false, 0, "Not found");

        long size;
        if (File.Exists(path))
        {
            size = FileSize(path);
            FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs,
                RecycleOption.SendToRecycleBin);
        }
        else
        {
            size = Directory.EnumerateFiles(path, "*", System.IO.SearchOption.AllDirectories)
                            .Sum(FileSize);
            FileSystem.DeleteDirectory(path, UIOption.OnlyErrorDialogs,
                RecycleOption.SendToRecycleBin);
        }
        return new TrashResult(true, size, null);
    }

    // ── Permanent Delete (async-wrapped) ─────────────────────
    public static Task<(long Freed, string? Error)> DeleteAsync(string path)
        => Task.Run<(long, string?)>(() =>
        {
            try
            {
                long size = File.Exists(path)
                    ? FileSize(path)
                    : Directory.EnumerateFiles(path, "*", System.IO.SearchOption.AllDirectories).Sum(FileSize);

                if (File.Exists(path))           File.Delete(path);
                else if (Directory.Exists(path)) Directory.Delete(path, recursive: true);

                return (size, null);
            }
            catch (Exception ex) { return (0, ex.Message); }
        });

    // ── Recycle Bin enumeration (Shell32 COM, STA thread) ──────
    public static List<RecycleBinItem> EnumerateRecycleBin(int maxItems = 2000)
    {
        var items = new List<RecycleBinItem>();
        var thread = new Thread(() =>
        {
            try
            {
                var shellType = Type.GetTypeFromProgID("Shell.Application");
                if (shellType == null) return;
                dynamic shell = Activator.CreateInstance(shellType)!;
                dynamic bin = shell.Namespace(10); // 10 = Recycle Bin
                if (bin == null) return;
                int count = 0;
                foreach (dynamic item in bin.Items())
                {
                    if (count >= maxItems) break;
                    try
                    {
                        string name = item.Name ?? "";
                        string origDir = bin.GetDetailsOf(item, 1) ?? "";
                        string dateStr = bin.GetDetailsOf(item, 2) ?? "";
                        string typeStr = bin.GetDetailsOf(item, 4) ?? "";
                        long size = 0;
                        try { size = (long)item.Size; } catch { }

                        items.Add(new RecycleBinItem(
                            Name: name,
                            OriginalPath: string.IsNullOrEmpty(origDir) ? name : Path.Combine(origDir, name),
                            DateDeleted: dateStr,
                            Size: size,
                            FileType: typeStr,
                            RecyclePath: item.Path ?? ""
                        ));
                        count++;
                    }
                    catch { /* skip unreadable items */ }
                }
            }
            catch { /* COM failure */ }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join(TimeSpan.FromSeconds(30));
        return items;
    }

    public static bool RestoreFromRecycleBin(string recyclePath, string originalPath)
    {
        bool ok = false;
        var thread = new Thread(() =>
        {
            try
            {
                var shellType = Type.GetTypeFromProgID("Shell.Application");
                if (shellType == null) return;
                dynamic shell = Activator.CreateInstance(shellType)!;
                dynamic bin = shell.Namespace(10);
                if (bin == null) return;

                // Find the item by its recycle bin path
                foreach (dynamic item in bin.Items())
                {
                    try
                    {
                        if (string.Equals((string)item.Path, recyclePath, StringComparison.OrdinalIgnoreCase))
                        {
                            // Ensure target directory exists
                            var targetDir = Path.GetDirectoryName(originalPath);
                            if (!string.IsNullOrEmpty(targetDir) && !Directory.Exists(targetDir))
                                Directory.CreateDirectory(targetDir);

                            // Use Shell MoveHere to restore
                            dynamic destFolder = shell.Namespace(targetDir);
                            if (destFolder != null)
                            {
                                destFolder.MoveHere(item, 0x14); // 0x14 = no UI + yes to all
                                ok = true;
                            }
                            break;
                        }
                    }
                    catch { }
                }
            }
            catch { }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join(TimeSpan.FromSeconds(30));
        return ok;
    }

    // ── Helpers ──────────────────────────────────────────────
    public static bool IsNodeModules(string path)
        => path.Contains(Path.DirectorySeparatorChar + "node_modules" + Path.DirectorySeparatorChar)
        || path.EndsWith(Path.DirectorySeparatorChar + "node_modules");

    public static bool IsTrash(string path)
        => path.Contains(".trash");

    private static readonly HashSet<string> _venvNames = new(StringComparer.OrdinalIgnoreCase)
        { "venv", ".venv", "env", ".env" };

    public static bool IsVenv(string path)
    {
        foreach (var part in path.Split(Path.DirectorySeparatorChar))
            if (_venvNames.Contains(part)) return true;
        return false;
    }

    private static readonly HashSet<string> _tempNames = new(StringComparer.OrdinalIgnoreCase)
        { "tmp", "temp", ".tmp", ".temp" };

    public static bool IsTempFolder(string path)
    {
        foreach (var part in path.Split(Path.DirectorySeparatorChar))
            if (_tempNames.Contains(part)) return true;
        return false;
    }

    /// <summary>
    /// Restore multiple items from the Recycle Bin in a single STA pass.
    /// Returns (restoredCount, errorMessages).
    /// </summary>
    public static (int Restored, string[] Errors) RestoreBatch(string[] recyclePaths)
    {
        int restored = 0;
        var errors = new List<string>();
        var pathSet = new HashSet<string>(recyclePaths, StringComparer.OrdinalIgnoreCase);

        var thread = new Thread(() =>
        {
            try
            {
                var shellType = Type.GetTypeFromProgID("Shell.Application");
                if (shellType == null) { errors.Add("Shell.Application not available"); return; }
                dynamic shell = Activator.CreateInstance(shellType)!;
                dynamic bin = shell.Namespace(10);
                if (bin == null) { errors.Add("Cannot open Recycle Bin"); return; }

                foreach (dynamic item in bin.Items())
                {
                    if (pathSet.Count == 0) break;
                    try
                    {
                        string itemPath = (string)item.Path;
                        if (!pathSet.Contains(itemPath)) continue;
                        pathSet.Remove(itemPath);

                        string name = item.Name ?? "";
                        string origDir = bin.GetDetailsOf(item, 1) ?? "";
                        string originalPath = string.IsNullOrEmpty(origDir) ? name : Path.Combine(origDir, name);
                        var targetDir = Path.GetDirectoryName(originalPath);

                        if (!string.IsNullOrEmpty(targetDir) && !Directory.Exists(targetDir))
                            Directory.CreateDirectory(targetDir);

                        dynamic destFolder = shell.Namespace(targetDir);
                        if (destFolder != null)
                        {
                            destFolder.MoveHere(item, 0x14);
                            restored++;
                        }
                        else
                        {
                            errors.Add($"Cannot restore: {originalPath}");
                        }
                    }
                    catch (Exception ex) { errors.Add(ex.Message); }
                }
            }
            catch (Exception ex) { errors.Add(ex.Message); }
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join(TimeSpan.FromSeconds(60));

        return (restored, errors.ToArray());
    }

}
