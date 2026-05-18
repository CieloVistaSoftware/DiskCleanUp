# fix-cache-perms.ps1
# Grants Users:Modify on all files in C:\ProgramData\DiskCleanUp\scan-cache
# that were created by SYSTEM (service) and are now read-only for user accounts.

$cacheDir = 'C:\ProgramData\DiskCleanUp\scan-cache'

if (-not (Test-Path $cacheDir)) {
    Write-Host "Cache dir not found: $cacheDir"
    exit 0
}

$files = Get-ChildItem $cacheDir -File
if ($files.Count -eq 0) {
    Write-Host "No files found in $cacheDir"
    exit 0
}

$ok = 0
$fail = 0

foreach ($f in $files) {
    try {
        $acl  = Get-Acl -LiteralPath $f.FullName
        $rule = New-Object System.Security.AccessControl.FileSystemAccessRule(
            'BUILTIN\Users', 'Modify', 'Allow'
        )
        $acl.AddAccessRule($rule)
        Set-Acl -LiteralPath $f.FullName -AclObject $acl
        Write-Host "  OK  $($f.Name)"
        $ok++
    } catch {
        Write-Host "  ERR $($f.Name): $_"
        $fail++
    }
}

Write-Host ""
Write-Host "Done. Fixed: $ok   Failed: $fail"
