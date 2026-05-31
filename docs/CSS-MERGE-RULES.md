# CSS Merge Rules

## Purpose

This document defines when CSS files are candidates for merging, what "safe to merge" means,
and what the tool is allowed to do. No merge viewer work proceeds until these rules are settled.

---

## What the CSS scan section does

The `CssFilesRule` scanner finds CSS files that may be redundant — small files, files with
overlapping selectors, files that appear to be per-component stubs accumulated over time.
It reports them. That is its job.

Merging is a *follow-on action*, not a scan result. It is a refactoring operation.

---

## Rule 1 — Merge candidates are same-folder only

Two or more CSS files in the same directory are candidates. Files in different directories
are never merged. Cross-folder merging changes import paths and breaks references in ways
the tool cannot safely track.

**Not a candidate:**
```
pages/about/layout.css
pages/home/layout.css    ← different folder, separate group at best
```

**Candidate:**
```
pages/about/layout.css
pages/about/responsive.css
pages/about/print.css    ← same folder, one merge group
```

---

## Rule 2 — Excluded folders are never candidates

The following patterns are always excluded regardless of user settings:

- `node_modules`, `vendor`, `dist`, `build`, `out`, `bin`
- `_sass`, `sass`, `scss` (pre-processor source, not output)
- `bootstrap`, `font-awesome`, `tailwind`, any known library name
- Any folder containing a `.min.css` file

The user may add additional exclude patterns. Exclusion is folder-name based, not path-depth based.

---

## Rule 3 — Conflict detection granularity

The current implementation detects conflicts at the **selector string** level. This is too coarse.

### What is a real conflict

A real conflict is when the **same selector appears in two files AND the property sets overlap**.
Two files both defining `.btn { color: red }` and `.btn { font-size: 14px }` conflict on `.btn`
only if they define the same property.

### What is not a conflict

- `:root` — a custom property block, not a selector conflict. `:root { --color: blue }` in
  one file and `:root { --spacing: 8px }` in another do not conflict; they extend the same
  namespace.
- `*` — universal selector, structural, not a meaningful conflict.
- Media query wrappers — `@media (max-width: 768px) { .btn { ... } }` is a different context
  than `.btn { ... }` at root level. These are not conflicts.
- Pseudo-elements — `.btn::hover` and `.btn` are different selectors.

### Revised risk levels

| Level | Condition |
|-------|-----------|
| Low | No overlapping selectors with overlapping properties |
| Medium | 1–3 real conflicts (same selector + same property, different value) |
| High | 4+ real conflicts |
| Block | Any `@import` in source files — order-dependent, do not merge |

---

## Rule 4 — The tool is a candidate reporter, not a merger

The scan section reports CSS merge candidates. That is the scope of automated action.

**The tool MAY:**
- Report candidate groups with file list, size, and conflict count
- Show a read-only preview of what merged output would look like
- Tell the user which HTML/JS files reference each CSS file

**The tool MAY NOT (without explicit user action):**
- Write any files
- Delete any files
- Execute a merge automatically

Merge execution requires an explicit button press per group, never bulk-apply-all.

---

## Rule 5 — Undo window

If the tool executes a merge, it must:
1. Back up each source file to `filename.css.bak` before deleting
2. Show an undo bar with a 60-second window (current implementation uses 30s — extend to 60s)
3. Undo restores all `.bak` files and deletes `merged.css`

After the undo window closes, `.bak` files remain on disk. The user can restore manually.
The tool does not auto-delete `.bak` files.

---

## Rule 6 — Reference tracking scope

When reporting which HTML/JS files reference a CSS file, search:
- The CSS file's own folder
- One level up only

Do not recurse into sibling projects. A CSS file in `projects/app-a/styles/` should not
report references from `projects/app-b/`. The tool cannot know project boundaries, so
one-parent is the safe limit.

---

## What to build next (after these rules are accepted)

1. Fix conflict detection to use property-level overlap (Rule 3)
2. Fix `:root` false positive (Rule 3 — `:root` is not a conflict)
3. Add `@import` block detection (Rule 3)
4. Update risk level thresholds (Rule 3)
5. Read-only preview only — no write operations until user clicks Merge (Rule 4)
6. Remove bulk-merge-all; require per-group confirmation (Rule 4)
7. Extend undo window to 60s (Rule 5)

These map to ~3 issues, not 7.

---

## Open questions (decide before implementing)

1. Should the tool ever execute a merge, or should it stop at "here are candidates, open in
   your editor"? Merging is a refactoring operation. DiskCleanUp's job is disk space recovery,
   not code refactoring.

2. If we keep merge execution: should merged output preserve original file order, or sort
   by selector count (most rules first)?

3. Should the CSS section in the scan results link directly to the merge viewer, or just
   report file paths?
