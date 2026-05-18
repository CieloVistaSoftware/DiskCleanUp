# Fix export-in-try: remove the wrapping try{ ... } catch(ex) { ErrLog.log(...) }
# at module level, promoting all exports to top-level.
# Strategy: find files where the ENTIRE module body is wrapped in a single try-catch,
# and strip just the try{ and } catch(ex) { ... } wrapper lines.

$baseDir = 'C:\Users\jwpmi\source\repos\DiskCleanUp\DiskCleanUp.Service\wwwroot'
$files = Get-ChildItem -Path $baseDir -Include '*.ts' -Recurse |
    Where-Object { $_.FullName -notmatch 'node_modules' -and $_.Name -ne 'window.d.ts' }

$fixedCount = 0

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8

    # Check for the module-level try { pattern followed by export keyword inside
    # Only process if file contains "export" inside a try block at top level
    if ($content -notmatch '(?ms)^try \{' ) { continue }
    if ($content -notmatch 'export ') { continue }

    $lines = $content -split "`r?`n"

    # Find the line with "try {" at column 0 (module-level try)
    $tryLineIdx = -1
    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($lines[$i] -match '^\s*try \{\s*$') {
            $tryLineIdx = $i
            break
        }
    }
    if ($tryLineIdx -lt 0) { continue }

    # Find the matching closing "} catch (ex) {" and "}" at the end
    # Look for the last line that matches "} catch" pattern
    $catchLineIdx = -1
    $finalBraceIdx = -1
    for ($i = $lines.Length - 1; $i -gt $tryLineIdx; $i--) {
        if ($lines[$i] -match '^\s*ErrLog\.log\(') {
            $finalBraceIdx = $i + 1  # line after ErrLog.log is the closing }
            $catchLineIdx = $i - 1   # line before is "} catch ..."
            break
        }
    }
    if ($catchLineIdx -lt 0) { continue }

    # Build new lines: skip tryLineIdx, dedent content between try{ and }catch, skip catch block
    $newLines = [System.Collections.Generic.List[string]]::new()

    for ($i = 0; $i -lt $lines.Length; $i++) {
        if ($i -eq $tryLineIdx) {
            # Skip the "try {" line
            continue
        }
        if ($i -ge ($catchLineIdx) -and $i -le ($finalBraceIdx)) {
            # Skip the "} catch (ex) {", "ErrLog.log(...)", "}" lines
            continue
        }
        # Dedent lines that were inside the try block (remove 2 spaces of indent)
        if ($i -gt $tryLineIdx -and $i -lt $catchLineIdx) {
            if ($lines[$i] -match '^  ') {
                $newLines.Add($lines[$i].Substring(2))
            } else {
                $newLines.Add($lines[$i])
            }
        } else {
            $newLines.Add($lines[$i])
        }
    }

    $newContent = $newLines -join "`n"
    Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
    $fixedCount++
    Write-Host "Unwrapped try: $($file.Name)"
}

Write-Host "--- Total files unwrapped: $fixedCount ---"
