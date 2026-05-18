// IconGenerator.cs — Generates tray icons at runtime using GDI+.
// CRITICAL: do NOT use 'using' on the Bitmap before the Icon is done with it.
// Icon.FromHandle() does not copy pixel data — it references the HICON which
// references the Bitmap. Dispose the Bitmap early = invisible/blank icon.
// Fix: Clone() the Icon (makes a self-contained copy), then destroy the raw
// HICON handle and dispose the Bitmap. The cloned Icon owns itself.

namespace DiskCleanup.Tray;

internal static class IconGenerator
{
    [System.Runtime.InteropServices.DllImport("user32.dll")]
    private static extern bool DestroyIcon(IntPtr hIcon);

    public static Icon CreateCircleIcon(Color color)
    {
        const int size = 16;

        var bmp = new Bitmap(size, size);
        var g   = Graphics.FromImage(bmp);

        g.Clear(Color.Transparent);
        g.SmoothingMode = System.Drawing.Drawing2D.SmoothingMode.AntiAlias;

        using var brush = new SolidBrush(color);
        g.FillEllipse(brush, 1, 1, size - 2, size - 2);
        g.Dispose();

        // Clone makes a self-contained Icon — safe to destroy handle + bitmap after
        var hIcon = bmp.GetHicon();
        var icon  = (Icon)Icon.FromHandle(hIcon).Clone();
        DestroyIcon(hIcon);
        bmp.Dispose();

        return icon;
    }
}
