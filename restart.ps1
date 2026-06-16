# restart.ps1 - Detiene procesos en puertos 3001/5173 y reinicia backend y frontend
# Para solo iniciar sin matar procesos, usá start.ps1

function Stop-ProcessOnPort {
    param(
        [int]$Port,
        [string]$Nombre
    )

    Write-Host "Deteniendo $Nombre (puerto $Port)..." -ForegroundColor Yellow

    $pids = netstat -ano |
        Select-String ":$Port\s" |
        ForEach-Object {
            if ($_ -match '\s(\d+)\s*$') { [int]$matches[1] }
        } |
        Sort-Object -Unique

    if (-not $pids) {
        Write-Host "        Ningún proceso escuchando en el puerto $Port." -ForegroundColor Gray
        return
    }

    foreach ($procId in $pids) {
        if ($procId -gt 0) {
            taskkill /PID $procId /F 2>$null | Out-Null
            Write-Host "        Proceso $procId terminado." -ForegroundColor Gray
        }
    }
}

Stop-ProcessOnPort -Port 3001 -Nombre "Backend"
Stop-ProcessOnPort -Port 5173 -Nombre "Frontend"

Write-Host ""
Write-Host "Esperando 1 segundo..." -ForegroundColor Gray
Start-Sleep -Seconds 1

Write-Host ""
Write-Host "Iniciando Backend (puerto 3001)..." -ForegroundColor Cyan
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\backend'; npm run dev"

Write-Host "Iniciando Frontend (puerto 5173)..." -ForegroundColor Green
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PSScriptRoot\frontend'; npm run dev"

Write-Host ""
Write-Host "Servidores reiniciados:" -ForegroundColor Yellow
Write-Host "  Backend:  http://localhost:3001" -ForegroundColor Cyan
Write-Host "  Frontend: http://localhost:5173" -ForegroundColor Green
Write-Host ""
