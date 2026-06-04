$f = "DiskCleanUp.Service\wwwroot\js\actions.js"
$content = [System.IO.File]::ReadAllText((Resolve-Path $f).Path, [System.Text.Encoding]::UTF8)
$fixed = $content -replace "â ", "⚠"
[System.IO.File]::WriteAllText((Resolve-Path $f).Path, $fixed, [System.Text.Encoding]::UTF8)
Write-Host "Done"
