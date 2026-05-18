Start-Service -Name "DiskCleanUp"; Start-Sleep -Seconds 3; (Get-Service "DiskCleanUp").Status
