$wwwroot = "DiskCleanUp.Service\wwwroot"
$binDebug = "DiskCleanUp.Service\bin\Debug\net8.0\wwwroot"

$files = Get-ChildItem -Path $wwwroot -Recurse -Filter "*.js" | Where-Object { $_.FullName -notmatch '\\lib\\' }

foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    if ($content -match "from '\./error-logger\.js'") {
        $fixed = $content -replace "from '\./error-logger\.js'", "from '/js/error-logger.js'"
        Set-Content $f.FullName $fixed -NoNewline
        Write-Host "Fixed source: $($f.FullName)"

        $rel = $f.FullName.Substring((Resolve-Path $wwwroot).Path.Length + 1)
        $binTarget = Join-Path $binDebug $rel
        if (Test-Path $binTarget) {
            Set-Content $binTarget $fixed -NoNewline
            Write-Host "Fixed bin:    $binTarget"
        }
    }
}
Write-Host "All done"
