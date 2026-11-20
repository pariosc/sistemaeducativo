[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$processes = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()
$composeStarted = $false

function Stop-ProcessTree([System.Diagnostics.Process]$Process) {
    if ($null -ne $Process -and -not $Process.HasExited) {
        & taskkill.exe /PID $Process.Id /T /F | Out-Null
        $Process.WaitForExit()
    }
}

try {
    if (-not (Test-Path (Join-Path $root ".env"))) { throw "Falta .env. Ejecuta scripts/setup-windows.ps1." }
    Push-Location $root
    try {
        & docker compose up -d --wait db
        if ($LASTEXITCODE -ne 0) { throw "PostgreSQL no inició. Comprueba Docker Desktop." }
        $composeStarted = $true

        Push-Location (Join-Path $root "backend")
        try {
            & uv run alembic upgrade head
            if ($LASTEXITCODE -ne 0) { throw "Falló la aplicación de migraciones." }
        } finally { Pop-Location }

        $backend = Start-Process -FilePath "uv" -ArgumentList @("run", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8100") -WorkingDirectory (Join-Path $root "backend") -NoNewWindow -PassThru
        $processes.Add($backend)
        $frontend = Start-Process -FilePath "bun" -ArgumentList @("run", "dev") -WorkingDirectory (Join-Path $root "frontend") -NoNewWindow -PassThru
        $processes.Add($frontend)

        Write-Host "API:      http://127.0.0.1:8100/docs"
        Write-Host "Frontend: http://127.0.0.1:5173"
        Write-Host "PostgreSQL: 127.0.0.1:55432"
        Write-Host "Presiona Ctrl+C para detener los servidores y PostgreSQL (se conserva el volumen)."

        while ($true) {
            foreach ($process in $processes) {
                $process.Refresh()
                if ($process.HasExited) { throw "Un servidor terminó con código $($process.ExitCode)." }
            }
            Start-Sleep -Milliseconds 300
        }
    } finally { Pop-Location }
} catch [System.Management.Automation.PipelineStoppedException] {
    Write-Host "Deteniendo servidores..."
} finally {
    foreach ($process in $processes) { Stop-ProcessTree $process }
    if ($composeStarted) {
        Push-Location $root
        try { & docker compose down } finally { Pop-Location }
    }
}
