# CLAUDE.md — DiskCleanUp

## Session Start (DO THIS FIRST)

1. Read this file top to bottom
2. Run `git status` and `git log --oneline -5` to orient yourself
3. Check `data/` for any runtime error logs worth reviewing
4. Start working — no questions

## Project

**Name:** DiskCleanUp
**Type:** .NET 8 Windows Service + Web Dashboard + WinForms Tray App
**Location:** `C:\Users\jwpmi\source\repos\DiskCleanUp`
**Owner:** John Peters — CieloVista Software

Disk cleanup dashboard. Scans drives for waste (duplicates, empties, backups, etc.) and lets the user delete from a real-time web UI at `http://localhost:5100`.

---

## Architecture

```
DiskCleanUp.Service/    ← ASP.NET Core 8, SignalR, REST API, serves wwwroot/
DiskCleanUp.Shared/     ← shared models, scanner interfaces
DiskCleanUp.Tray/       ← WinForms tray icon (start/stop service)
others/                 ← Node.js: npm scripts, Playwright tests, package.json
mcp-server/             ← MCP server for Claude/AI integration
data/                   ← runtime JSON (scan results, error logs)
```

## Build & Run

```powershell
# Start service (from repo root)
dotnet run --project DiskCleanUp.Service

# Or via npm
cd others && npm start

# Build solution
dotnet build others/DiskCleanUp.sln

# Tray app
cd others && npm run tray

# Run JS/Playwright tests
cd others && npm test
cd others && npx playwright test

# Audit JS errors
cd others && npm run audit:errors
```

Dashboard opens at `http://localhost:5100`.

## Key Files

| File | Purpose |
|---|---|
| `DiskCleanUp.Service/Program.cs` | Service entry point, DI, SignalR hub |
| `DiskCleanUp.Service/Scanning/` | Scanner implementations (one file per scan type) |
| `DiskCleanUp.Service/Api/` | REST controllers |
| `DiskCleanUp.Service/wwwroot/` | Web dashboard HTML/JS/CSS |
| `DiskCleanUp.Shared/` | Models and shared scanner contracts |
| `others/scripts/start.js` | Node start script |
| `others/tests/` | Playwright UI tests |

## CieloVista Tools Integration

This project is in the CVT project registry and has launcher commands:
- `cvs.launch.diskcleanup.start` — `dotnet run` the service
- `cvs.launch.diskcleanup.build` — `dotnet build DiskCleanUp.sln`

The dashboard is launched by the CVT "Open Dashboard" command (issue #528: should open inside VS Code tab, not browser).

## Conventions

- C# follows standard .NET naming (PascalCase, nullable enabled)
- JS uses vanilla ES modules in `wwwroot/` — no build step for frontend
- Error logging via `data/error-log.json`
- SignalR hub at `/hub` for real-time scan progress

## What NOT To Do

- Never use `dotnet publish` without checking the output path — the service self-hosts
- Never `npm install` in the root — Node deps are in `others/`
- Don't add npm dependencies without checking if they survive the `audit:errors` pass
