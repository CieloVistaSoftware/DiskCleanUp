# Stop DiskCleanUp service - tries multiple methods
$name = 'DiskCleanUp.Service'
$svcName = 'DiskCleanUp'

# Method 1: sc stop (needs admin but might work)
try { sc.exe stop $svcName 2>$null } catch {}
Start-Sleep -Seconds 2

# Method 2: Stop-Process
try { Stop-Process -Name $name -Force -ErrorAction Stop; Write-Host "Stop-Process succeeded" } catch { Write-Host "Stop-Process failed: $_" }
Start-Sleep -Seconds 2

# Method 3: CIM/WMI Terminate 
try {
    $proc = Get-CimInstance Win32_Process -Filter "Name='DiskCleanUp.Service.exe'"
    if ($proc) {
        Invoke-CimMethod -InputObject $proc -MethodName Terminate | Out-Null
        Write-Host "CIM Terminate succeeded"
    }
} catch { Write-Host "CIM Terminate failed: $_" }
Start-Sleep -Seconds 2

# Check
$still = Get-Process -Name $name -ErrorAction SilentlyContinue
if ($still) {
    Write-Host "STILL RUNNING: PID $($still.Id) Session $($still.SessionId)"
    exit 1
} else {
    Write-Host "Service stopped successfully"
    exit 0
}
