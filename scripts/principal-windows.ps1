[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:Path = "$([Environment]::GetEnvironmentVariable('Path', 'Machine'));$([Environment]::GetEnvironmentVariable('Path', 'User'))"
$env:UV_LINK_MODE = "copy"
if (-not $env:UV_PROJECT_ENVIRONMENT) {
    $configuredVenv = [Environment]::GetEnvironmentVariable("UV_PROJECT_ENVIRONMENT", "User")
    if ($configuredVenv) {
        $env:UV_PROJECT_ENVIRONMENT = $configuredVenv
    } else {
        $env:UV_PROJECT_ENVIRONMENT = Join-Path $env:LOCALAPPDATA "sistemaeducativo\backend\.venv"
    }
}
if (-not (Test-Path (Join-Path $root ".env"))) { throw "Falta .env. Ejecuta primero scripts/setup-windows.ps1." }

Push-Location $root
try {
    & docker compose up -d --wait db
    if ($LASTEXITCODE -ne 0) { throw "PostgreSQL no inició. Comprueba que Docker Desktop esté abierto y saludable." }
    Push-Location (Join-Path $root "backend")
    try {
        & uv run python -m alembic upgrade head
        if ($LASTEXITCODE -ne 0) { throw "Falló la aplicación de migraciones." }
        & uv run python -m app.cli create-principal
        if ($LASTEXITCODE -ne 0) { throw "No se pudo crear el administrador principal." }
    } finally { Pop-Location }
} finally { Pop-Location }

Write-Host "Cuenta principal procesada. Este comando se ejecuta una sola vez por base local."
