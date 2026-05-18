Add-Type -AssemblyName System.IO.Compression.FileSystem
$docxPath = "C:\Users\jwpmi\source\repos\DiskCleanUp\resume.docx"
$zip = [System.IO.Compression.ZipFile]::OpenRead($docxPath)
$entry = $zip.GetEntry("word/document.xml")
$reader = New-Object System.IO.StreamReader($entry.Open())
$xml = $reader.ReadToEnd()
$reader.Close()
$zip.Dispose()
$xml | Out-File "C:\Users\jwpmi\source\repos\DiskCleanUp\resume-raw.xml" -Encoding UTF8
Write-Host "Done"
