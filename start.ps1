Write-Host "Starting monster curve visualizer..."
Start-Sleep -Seconds 2
Start-Process "http://localhost:8080"
python -m http.server 8080 -d dist
