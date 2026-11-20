[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not (Test-Path (Join-Path $root ".env"))) { throw "Falta .env. Ejecuta primero scripts/setup-windows.ps1." }

Push-Location $root
try {
    & docker compose up -d --wait db
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL no inició. Comprueba que Docker Desktop esté abierto y saludable." }
    Push-Location (Join-Path $root "backend")
    try {
        & uv run alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Falló la aplicación de migraciones." }
        & uv run python -m app.cli create-principal
        if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el administrador principal." }
    } finally { Pop-Location }
} finally { Pop-Location }

Write-Host "Cuenta principal procesada. Este comando se ejecuta una sola vez por base local."
