@echo off
echo Starting monster curve visualizer...
echo Opening browser in 2 seconds...
timeout /t 2 /nobreak >nul
start "" http://localhost:8080
python -m http.server 8080 -d dist
pause
