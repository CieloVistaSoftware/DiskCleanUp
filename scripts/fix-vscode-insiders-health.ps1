param(
    [switch]$Apply,
    [switch]$UninstallStaleExtensions
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "=== $Title ===" -ForegroundColor Cyan
}

function Get-ByteOrderMarkPresent {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) { return $false }
    $bytes = [System.IO.File]::ReadAllBytes($Path)
    return ($bytes.Length -ge 3 -and $bytes[0] -eq 239 -and $bytes[1] -eq 187 -and $bytes[2] -eq 191)
}

function Test-JsonValid {
    param([string]$Path)
    try {
        $raw = Get-Content -LiteralPath $Path -Raw -Encoding UTF8
        $null = $raw | ConvertFrom-Json
        return $true
    }
    catch {
        return $false
    }
}

function Get-CodeInsidersCli {
    $cmd = Get-Command code-insiders -ErrorAction SilentlyContinue
    if ($null -ne $cmd) { return $cmd.Source }

    # Common Windows install fallback
    $fallback = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd'
    if (Test-Path -LiteralPath $fallback) { return $fallback }

    return $null
}

$staleExtensionIds = @(
    'cielovistasoftware.vscode-claude-claudeclone',
    'jwpmi.npm-run-intellisense',
    'wb-starter.wb-server-opener'
)

$settingsPath = Join-Path $env:APPDATA 'Code - Insiders\User\settings.json'
$insidersAppPath = Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code Insiders'
$ligaturesPath = Join-Path $insidersAppPath 'resources\app\node_modules\@xterm\addon-ligatures\lib\addon-ligatures.js'

Write-Section 'VS Code Insiders Health Check'
Write-Host "Apply mode: $Apply"
Write-Host "Uninstall stale extensions: $UninstallStaleExtensions"

if (-not (Test-Path -LiteralPath $settingsPath)) {
    Write-Host "settings.json not found: $settingsPath" -ForegroundColor Yellow
}
else {
    Write-Section 'settings.json'
    $hasBomBefore = Get-ByteOrderMarkPresent -Path $settingsPath
    $jsonValidBefore = Test-JsonValid -Path $settingsPath
    Write-Host "Path: $settingsPath"
    Write-Host "Has UTF-8 BOM: $hasBomBefore"
    Write-Host "Valid JSON parse: $jsonValidBefore"

    if ($hasBomBefore -and $Apply) {
        $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
        $backupPath = "$settingsPath.bak-$stamp"
        Copy-Item -LiteralPath $settingsPath -Destination $backupPath -Force

        # Rewrite as UTF-8 without BOM to satisfy MCP migration parser.
        $text = [System.IO.File]::ReadAllText($settingsPath)
        $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
        [System.IO.File]::WriteAllText($settingsPath, $text, $utf8NoBom)

        $hasBomAfter = Get-ByteOrderMarkPresent -Path $settingsPath
        $jsonValidAfter = Test-JsonValid -Path $settingsPath
        Write-Host "BOM removed. Backup: $backupPath" -ForegroundColor Green
        Write-Host "Has UTF-8 BOM after rewrite: $hasBomAfter"
        Write-Host "Valid JSON parse after rewrite: $jsonValidAfter"
    }
    elseif ($hasBomBefore -and -not $Apply) {
        Write-Host 'BOM present. Re-run with -Apply to auto-fix.' -ForegroundColor Yellow
    }
}

Write-Section 'Extension IDs'
$cli = Get-CodeInsidersCli
if ($null -eq $cli) {
    Write-Host 'code-insiders CLI not found; cannot inspect/uninstall extensions automatically.' -ForegroundColor Yellow
}
else {
    Write-Host "Using CLI: $cli"
    $installed = @(& $cli --list-extensions 2>$null)
    if (-not $installed) {
        Write-Host 'No extensions returned by CLI, or CLI call failed.' -ForegroundColor Yellow
    }

    $foundStale = @($staleExtensionIds | Where-Object { $installed -contains $_ })
    if ($foundStale.Count -eq 0) {
        Write-Host 'Stale 404 extension IDs are not installed.' -ForegroundColor Green
    }
    else {
        Write-Host 'Installed stale IDs that can produce marketplace 404s:' -ForegroundColor Yellow
        $foundStale | ForEach-Object { Write-Host " - $_" }

        if ($Apply -and $UninstallStaleExtensions) {
            foreach ($id in $foundStale) {
                Write-Host "Uninstalling $id ..."
                & $cli --uninstall-extension $id | Out-Null
            }
            Write-Host 'Requested stale extension uninstall complete.' -ForegroundColor Green
        }
        elseif ($Apply -and -not $UninstallStaleExtensions) {
            Write-Host 'Re-run with -UninstallStaleExtensions to auto-uninstall found stale IDs.' -ForegroundColor Yellow
        }
    }
}

Write-Section 'xterm Ligatures File'
if (Test-Path -LiteralPath $ligaturesPath) {
    Write-Host "Present: $ligaturesPath" -ForegroundColor Green
}
else {
    Write-Host "Missing: $ligaturesPath" -ForegroundColor Yellow
    Write-Host 'If this keeps showing in logs, update or reinstall VS Code Insiders.' -ForegroundColor Yellow
}

Write-Section 'Next Step'
Write-Host 'In VS Code Insiders: run "Developer: Reload Window" and then "Developer: Restart Extension Host".'
