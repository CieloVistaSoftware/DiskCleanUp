# Dev Cache Folders

## What are dev cache folders?

Developer tools create hidden cache directories as a side effect of running. These directories:

- Are **always safe to delete** — the tool recreates them automatically next time it runs
- Can grow to **hundreds of megabytes** per project
- Are **not tracked by git** (already in `.gitignore`)
- Cause **false duplicate alerts** in DiskCleanUp when the same tool is used in multiple projects

---

## Folders detected by the Dev Caches scanner

| Folder name | Created by | Why it exists | Size |
|---|---|---|---|
| `.vscode-test-web` | `@vscode/test-web` | Downloads the full VS Code web app for extension tests. One copy per project that has web extension tests. | 100–500 MB |
| `.vscode-test` | `@vscode/test-electron` | Downloads the VS Code desktop app for extension tests. | 50–200 MB |
| `.playwright` | Playwright | Downloads Chromium/Firefox/WebKit browser binaries for end-to-end tests. | 200–600 MB |
| `__pycache__` | Python interpreter | Compiled `.pyc` bytecode files. Speeds up Python imports. | 1–50 MB |
| `.pytest_cache` | pytest | Test result cache and markers for `--lf` (last-failed) flag. | < 5 MB |
| `.mypy_cache` | mypy | Type-check results cache. Speeds up incremental type checking. | 10–100 MB |
| `.ruff_cache` | Ruff linter | Lint result cache. Speeds up incremental linting. | < 5 MB |
| `.tox` | tox | Isolated Python test environments. One virtual env per tox factor. | 50–500 MB |
| `.nx` | Nx monorepo | Build and task execution cache. Can be very large in monorepos. | 100 MB–several GB |

---

## How the scanner works

The `DevCacheRule` (`Scanning/Rules/DevCacheRule.cs`) walks the file tree and matches directories by **exact folder name** (case-insensitive). It skips paths inside `node_modules` and `.git`.

Results appear in the **Dev Caches** section of the dashboard with:
- Cache type badge (the folder name)
- Full path
- Size on disk

The **Delete All Caches** button permanently deletes all found folders. Use **Select + Delete Selected** for individual control.

---

## Why these show up as duplicates

A `.vscode-test-web` folder downloaded for project A is byte-for-byte identical to the one downloaded for project B — they're the same VS Code release. DiskCleanUp's exact-duplicates scan correctly identifies these as wasted space.

The Dev Caches scanner is faster for this case: instead of hashing every file, it identifies the folder by name and removes the whole thing in one operation.

---

## Restoring after deletion

| Folder | How to restore |
|---|---|
| `.vscode-test-web` | Run the web extension tests again — `npm test` or `vscode-test-web ...` |
| `.vscode-test` | Run the desktop extension tests again |
| `.playwright` | `npx playwright install` |
| `__pycache__` | Run any Python file — recreated instantly |
| `.pytest_cache` | Run `pytest` |
| `.mypy_cache` | Run `mypy` |
| `.ruff_cache` | Run `ruff check` |
| `.tox` | Run `tox` |
| `.nx` | Run any Nx command |

---

## Adding new patterns

Edit `DiskCleanUp.Service/Scanning/Rules/DevCacheRule.cs` and add the folder name to `_cacheNames`:

```csharp
private static readonly HashSet<string> _cacheNames = new(StringComparer.OrdinalIgnoreCase)
{
    ".vscode-test-web",
    ".vscode-test",
    // add new patterns here
};
```

Rebuild and restart the service. No frontend changes needed.
