$exe = "C:\Users\jwpmi\source\repos\DiskCleanUp\DiskCleanUp.Service\bin\Debug\net8.0\DiskCleanUp.Service.exe"
$outFile = "C:\Users\jwpmi\source\repos\DiskCleanUp\install-out.txt"
$p = Start-Process -FilePath $exe -ArgumentList "--install" -Wait -NoNewWindow -PassThru -RedirectStandardOutput $outFile -RedirectStandardError "C:\Users\jwpmi\source\repos\DiskCleanUp\install-err.txt"
