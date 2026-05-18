$paths = @(
    'DiskCleanUp.Service\wwwroot\lib\wb-core\utils\error-logger.js',
    'DiskCleanUp.Service\bin\Debug\net8.0\wwwroot\lib\wb-core\utils\error-logger.js',
    'DiskCleanUp.Service\bin\Fresh\wwwroot\lib\wb-core\utils\error-logger.js',
    'DiskCleanUp.Service\bin\Release\net8.0\wwwroot\lib\wb-core\utils\error-logger.js',
    'bin\Fresh\wwwroot\lib\wb-core\utils\error-logger.js'
)
foreach ($p in $paths) {
    if (Test-Path $p) {
        $content = Get-Content $p -Raw
        if ($content -match 'data/errors\.json') {
            $fixed = $content -replace 'data/errors\.json', 'api/errors'
            Set-Content $p $fixed -NoNewline
            Write-Host "Fixed: $p"
        } else {
            Write-Host "Already correct: $p"
        }
    } else {
        Write-Host "Not found: $p"
    }
}
Write-Host "Done"
