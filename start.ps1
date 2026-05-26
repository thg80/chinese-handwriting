# start_server.ps1
Write-Host "Starting HTTP server on port 8080..." -ForegroundColor Green
Write-Host "Directory: $PWD"
Write-Host "URL: http://localhost:8080"
Write-Host ""
Write-Host "Press Ctrl+C to stop the server"
Write-Host ""

# 启动服务器
python -m http.server 8080

Write-Host ""
Write-Host "Server stopped" -ForegroundColor Yellow
