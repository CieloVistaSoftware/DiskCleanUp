$root = "C:\Users\jwpmi\source\repos\DiskCleanUp\DiskCleanUp.Service\wwwroot"
$files = Get-ChildItem -Recurse -Filter "*.ts" $root | Where-Object { $_.FullName -notlike "*node_modules*" }
$fixed = 0
foreach ($f in $files) {
    $lines = Get-Content $f.FullName
    $content = $lines -join "`n"
    # Match duplicate consecutive ErrLog import lines
    $pattern = "(import \{ ErrLog \} from '[^']+';)\s*`n(import \{ ErrLog \} from '[^']+';)"
    if ($content -match $pattern) {
        $newContent = $content -replace $pattern, '$1'
        [System.IO.File]::WriteAllText($f.FullName, $newContent, [System.Text.Encoding]::UTF8)
        Write-Host "Fixed duplicate import: $($f.Name)"
        $fixed++
    }
}
Write-Host "Total files fixed: $fixed"
