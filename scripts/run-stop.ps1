Stop-Service -Name "DiskCleanUp" -Force; Start-Sleep -Seconds 2; (Get-Service "DiskCleanUp").Status
