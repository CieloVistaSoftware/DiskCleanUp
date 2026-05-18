# Rename all locked DiskCleanUp files so dotnet build can write fresh copies
$binDir = "DiskCleanUp.Service\bin\Debug\net8.0"
$targets = @(
    "DiskCleanUp.Service.exe",
    "DiskCleanUp.Service.dll",
    "DiskCleanUp.Service.pdb",
    "DiskCleanUp.Shared.dll",
    "DiskCleanUp.Shared.pdb"
)

foreach ($f in $targets) {
    $path = Join-Path $binDir $f
    if (Test-Path $path) {
        $old = $path + ".old"
        try {
            if (Test-Path $old) { Remove-Item $old -Force -ErrorAction SilentlyContinue }
            Rename-Item $path $old -Force -ErrorAction Stop
            Write-Host "Renamed: $f -> $f.old"
        } catch {
            Write-Host "LOCKED:  $f (could not rename)"
        }
    }
}
Write-Host "Done - build should now succeed"
