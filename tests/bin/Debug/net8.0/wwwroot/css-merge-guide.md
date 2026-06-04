# CSS Merge Guide

## What is CSS merging?

CSS merging combines multiple `.css` files that live in the **same folder** into one file called `merged.css`. The originals are removed and replaced by a single file with all their rules concatenated.

**Why would you do this?** Fewer HTTP requests, one place to edit, less duplication. It is common to accumulate several small CSS files per page or component and then want to consolidate them.

---

## What does each group in the viewer represent?

The analyzer scans all the CSS files you passed it, then **groups them by folder**. Each card in the viewer = one folder that has two or more CSS files in it.

```
C:\MyProject\pages\about\
    about.css      ← group member
    layout.css     ← group member
    responsive.css ← group member

Output:
    merged.css     ← replaces all three
```

Every group merges into its own `merged.css` **inside its own folder**. A project with CSS files in five different folders will produce five separate `merged.css` files — not one big file at the root.

---

## What does `→ merged.css` mean on each card?

The green `→ merged.css` badge shows the **output file name**. Because each group belongs to a different folder, every card's `merged.css` is a different physical file. The full path is shown in small monospace text just below the flow row on each card.

> **Example:** Two cards both say `→ merged.css`, but one resolves to `C:\proj\pages\merged.css` and the other to `C:\proj\components\merged.css`. They do not overwrite each other.

---

## What happens to the original files?

When you click **▶ Merge This** (or Merge Selected):

1. Each source file is copied to `filename.css.bak` (backup).
2. All source files are deleted.
3. A new `merged.css` is written with all the rules concatenated in order, separated by `/* === filename.css === */` comment headers so you can see where each file's rules begin.

The **↩ Undo** bar appears immediately. Click it within 30 seconds to restore all `.bak` files and delete `merged.css`.

---

## What is a Dry Run?

**🧪 Dry Run** writes a `merged.PREVIEW.css` file next to the originals. The originals are **not touched at all**. This lets you:

- Open the preview file in your editor and inspect the combined output
- Load it in a browser to test it
- Then click **Apply** (which does the real merge) or **Discard** (which deletes the preview file)

Use Dry Run any time you are not sure about a group.

---

## What are selector conflicts?

A conflict means the **same CSS selector appears in two or more files** in the group. For example, `.btn` defined in both `buttons.css` and `layout.css`.

In a merged file, the last definition wins (CSS cascade). If `buttons.css` is appended before `layout.css`, then `layout.css`'s `.btn` rules apply. This may or may not be what you want.

- **Low risk** — no conflicts. Safe to merge.
- **Medium risk** — 1–5 conflicts. Review the conflict list before merging.
- **High risk** — 6+ conflicts. Carefully inspect the preview before merging.

The conflict list on each card shows the duplicate selectors and which files own them.

---

## What should I NOT merge?

**Library or framework folders** — do not merge files from `_sass`, `bootstrap`, `font-awesome`, `vendor`, `node_modules`, `dist`, or similar. These are third-party files you did not write. The exclude-patterns field (next to the Analyze Merge button) is pre-filled with the common ones.

**Files with the same name in different subfolders** — these are separate groups; the tool handles them independently. No cross-folder merging happens.

**Minified files** — if the folder already contains a `.min.css` you probably do not want another merged file alongside it.

---

## Workflow summary

```
Analyze Merge
    ↓
Review each group card
    → Check risk badge
    → Expand conflict list if medium/high
    ↓
👁 Preview (read-only, no files written)
    ↓
🧪 Dry Run (writes merged.PREVIEW.css, originals safe)
    → Open in editor / browser
    → Apply (real merge) or Discard (delete preview)
    ↓
▶ Merge This  (originals → .bak, merged.css written)
    ↓
↩ Undo (within 30 s) — restores .bak, deletes merged.css
```

---

## FAQ

**Q: What if merged.css already exists in the folder?**  
A: The tool overwrites it. Back up manually first if it already contains work you care about.

**Q: Can I merge across folders?**  
A: No. The tool only merges files within the same folder. Files in sub-folders are their own groups.

**Q: Where are the .bak files?**  
A: Next to their originals, e.g. `about.css.bak`. The Undo button moves them back automatically.

**Q: What if I closed the viewer before clicking Undo?**  
A: The `.bak` files are still on disk. Run Restore from the API manually, or rename them back by hand: remove the `.bak` extension and delete `merged.css`.

**Q: Does the tool minify or optimize the CSS?**  
A: No. It concatenates with comment headers only. Whitespace and comments in the originals are preserved.
