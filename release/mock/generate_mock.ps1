$ErrorActionPreference = 'Stop'
try {
    $outFile = "mock_data.js"
    $enc = [System.Text.UTF8Encoding]::new($false)

    [System.IO.File]::WriteAllText($outFile, "window.MOCK_FILES = {};`n", $enc)

    $csvFiles = Get-ChildItem -Filter *.csv
    foreach ($file in $csvFiles) {
        $name = $file.Name
        $content = [System.IO.File]::ReadAllText($file.FullName, [System.Text.Encoding]::UTF8)
        $jsonString = $content | ConvertTo-Json
        $js = "window.MOCK_FILES['$name'] = $jsonString;`n"
        [System.IO.File]::AppendAllText($outFile, $js, $enc)
    }
    Write-Host "Done! Opening app..."
    Start-Process "..\index.html"
} catch {
    Write-Host "Error: $_"
    Read-Host "Press Enter to exit"
}
