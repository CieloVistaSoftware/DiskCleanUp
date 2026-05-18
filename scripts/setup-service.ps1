# setup-service.ps1
# ONE-TIME elevated setup for DiskCleanUp Windows Service.
# Run this once from an elevated PowerShell prompt.
# After this: npm start never needs elevation to start/stop/restart the service.

$ServiceName = "DiskCleanUp"

Write-Host "=== DiskCleanUp Service One-Time Setup ===" -ForegroundColor Cyan

# 1. Set to Automatic start (starts with Windows)
Write-Host "`n[1] Setting service to Automatic start..." -ForegroundColor Yellow
sc.exe config $ServiceName start= auto
if ($LASTEXITCODE -eq 0) {
    Write-Host "    OK - Service will now start with Windows" -ForegroundColor Green
} else {
    Write-Host "    FAILED (is the service installed? Run: npm run install-service)" -ForegroundColor Red
    exit 1
}

# 2. Grant BUILTIN\Users start/stop/query rights (no elevation needed after this)
# SDDL breakdown:
#   SY = SYSTEM       - full control
#   BA = Administrators - full control  
#   IU = Interactive Users - start/stop/query
#   BU = Built-in Users   - start (RP), stop (WP), query (RC), pause (DT)
Write-Host "`n[2] Granting Users group start/stop rights (no elevation needed after this)..." -ForegroundColor Yellow
$sddl = "D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)(A;;RPWPDTRC;;;BU)"
sc.exe sdset $ServiceName $sddl
if ($LASTEXITCODE -eq 0) {
    Write-Host "    OK - Users can now start/stop service without elevation" -ForegroundColor Green
} else {
    Write-Host "    FAILED" -ForegroundColor Red
    exit 1
}

# 3. Start it now if not running
Write-Host "`n[3] Starting service..." -ForegroundColor Yellow
$status = (sc.exe query $ServiceName | Select-String "RUNNING")
if ($status) {
    Write-Host "    Already running on http://localhost:5100" -ForegroundColor Green
} else {
    sc.exe start $ServiceName
    if ($LASTEXITCODE -eq 0) {
        Write-Host "    Started on http://localhost:5100" -ForegroundColor Green
    } else {
        Write-Host "    FAILED to start" -ForegroundColor Red
    }
}

Write-Host "`n=== Setup complete. npm start will never need elevation for the service. ===" -ForegroundColor Cyan
