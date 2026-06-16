# start.ps1 - Arranca backend y frontend en terminales separadas (sin detener procesos existentes)
# Para matar puertos 3001/5173 y reiniciar, usá restart.ps1

Write-Host "Iniciando Backend (puerto 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; npm run dev"

Write-Host "Iniciando Frontend (puerto 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host ""
Write-Host "Servidores iniciados:" -ForegroundColor Yellow
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""
