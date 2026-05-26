# DiskCleanUp

Disk cleanup dashboard with Windows Service backend and SignalR real-time scanning.

A .NET 8 web service + Windows tray app that scans your drives for disk waste — duplicate files, empty folders, large images, backup files, tiny files, HTML files, CSS files, and more — and lets you delete them from a web dashboard at `http://localhost:5100`.

## Architecture

| Component | Tech | Purpose |
|---|---|---|
| `DiskCleanUp.Service` | ASP.NET Core 8 + SignalR | REST API + real-time scan events, serves the web dashboard |
| `DiskCleanUp.Shared` | C# class library | Shared models, scanner logic |
| `DiskCleanUp.Tray` | WinForms | Windows system tray icon — start/stop service |
| `others/` | Node.js | Scripts, Playwright tests, MCP server |

## Quick Start

```powershell
# Start the service (port 5100)
dotnet run --project DiskCleanUp.Service

# Or via npm scripts
cd others
npm start
```

Open `http://localhost:5100` in a browser to use the dashboard.

## Commands (via CieloVista Tools)

| Command | Action |
|---|---|
| **DiskCleanUp — Start Service** | `dotnet run` in the service project |
| **DiskCleanUp — Console Mode** | Starts with console output |
| **DiskCleanUp — Build** | `dotnet build DiskCleanUp.sln` |
| **DiskCleanUp — Open Dashboard** | Opens dashboard in browser |

## Development

```powershell
# Build the solution
dotnet build others/DiskCleanUp.sln

# Run tests
cd others && npm test

# Run Playwright UI tests
cd others && npx playwright test

# Audit JS errors
cd others && npm run audit:errors
```

## Project Structure

```
DiskCleanUp.Service/    ← ASP.NET Core web service
  Api/                  ← REST controllers
  Scanning/             ← scanner implementations
  wwwroot/              ← web dashboard (HTML/JS/CSS)
DiskCleanUp.Shared/     ← shared models and utilities
DiskCleanUp.Tray/       ← Windows tray application
others/                 ← Node.js scripts and tests
  scripts/              ← start, tray, build scripts
  tests/                ← Playwright tests
mcp-server/             ← MCP server for AI integration
data/                   ← runtime scan data
```

## License

Proprietary — CieloVista Software. See [LICENSE](others/LICENSE).
