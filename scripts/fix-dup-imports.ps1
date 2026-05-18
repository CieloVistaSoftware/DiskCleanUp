$baseDir = 'C:\Users\jwpmi\source\repos\DiskCleanUp\DiskCleanUp.Service\wwwroot'
$files = Get-ChildItem -Path $baseDir -Include '*.ts' -Recurse | Where-Object { $_.FullName -notmatch 'node_modules' -and $_.Name -ne 'window.d.ts' }
$fixedCount = 0
foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $matchList = [regex]::Matches($content, 'import \{ ErrLog \}')
    if ($matchList.Count -gt 1) {
        $secondMatch = $matchList[1]
        $lineStart = $content.LastIndexOf("`n", $secondMatch.Index) + 1
        $lineEnd = $content.IndexOf("`n", $secondMatch.Index)
        if ($lineEnd -lt 0) { $lineEnd = $content.Length - 1 }
        $newContent = $content.Substring(0, $lineStart) + $content.Substring($lineEnd + 1)
        Set-Content -Path $file.FullName -Value $newContent -Encoding UTF8 -NoNewline
        $fixedCount++
        Write-Host "Fixed: $($file.Name)"
    }
}
Write-Host "Total: $fixedCount"
