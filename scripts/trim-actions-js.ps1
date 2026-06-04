$f = "DiskCleanUp.Service\wwwroot\js\actions.js"
$lines = Get-Content $f
$start = ($lines | Select-String '_PLACEHOLDER_START' | Select-Object -First 1).LineNumber - 1
$end = ($lines | Select-String '^function _showMergeUndoBar' | Select-Object -First 1).LineNumber - 2
Write-Host "Removing lines $($start+1) to $($end+1) (count $($end-$start))"
$out = $lines[0..($start-1)] + $lines[$end..($lines.Length-1)]
[System.IO.File]::WriteAllText((Resolve-Path $f).Path, ($out -join "`n"))
Write-Host "Done"
