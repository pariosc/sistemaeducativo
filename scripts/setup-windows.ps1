[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$env:UV_LINK_MODE = "copy"
if (-not $env:UV_PROJECT_ENVIRONMENT) {
    $configuredVenv = [Environment]::GetEnvironmentVariable("UV_PROJECT_ENVIRONMENT", "User")
    if ($configuredVenv) {
        $env:UV_PROJECT_ENVIRONMENT = $configuredVenv
    } else {
        $env:UV_PROJECT_ENVIRONMENT = Join-Path $env:LOCALAPPDATA "sistemaeducativo\backend\.venv"
    }
}

function Assert-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Abre PowerShell como administrador y vuelve a ejecutar este script."
    }
}

function Refresh-Path {
    $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

Assert-Administrator

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    throw "No se encontró winget. Instala o actualiza 'App Installer' desde Microsoft Store y vuelve a intentarlo."
}

# WSL 2 es el backend de Docker Desktop en la configuración recomendada.
$wslStatus = & wsl.exe --status 2>&1 | Out-String
if ($LASTEXITCODE -ne 0 -or $wslStatus -match "not installed|no se ha instalado|WSL is not installed") {
    Write-Host "Instalando los componentes de WSL 2. Windows puede solicitar reinicio."
    & wsl.exe --install --no-distribution
    if ($LASTEXITCODE -ne 0) { throw "No se pudo instalar WSL. Revisa la salida de Windows y reinicia si lo solicita." }
    Write-Host "Si Windows solicitó reiniciar, hazlo y vuelve a ejecutar este script."
    return
}

& wsl.exe --update
if ($LASTEXITCODE -ne 0) { throw "No se pudo actualizar WSL 2. Reinicia Windows si se solicita y vuelve a ejecutar el script." }
& wsl.exe --set-default-version 2
if ($LASTEXITCODE -ne 0) { throw "No se pudo configurar WSL 2 como versión predeterminada." }

$packages = @(
    @{ Id = "Git.Git"; Name = "Git" },
    @{ Id = "astral-sh.uv"; Name = "uv" },
    @{ Id = "Oven-sh.Bun"; Name = "Bun" },
    @{ Id = "Docker.DockerDesktop"; Name = "Docker Desktop" },
    @{ Id = "Microsoft.VisualStudioCode"; Name = "Visual Studio Code" }
)

foreach ($package in $packages) {
    Write-Host "Instalando o verificando $($package.Name)..."
    & winget.exe install --id $package.Id --exact --source winget --accept-source-agreements --accept-package-agreements
    if ($LASTEXITCODE -ne 0) { throw "Falló la instalación de $($package.Name) (winget $($package.Id))." }
}

Refresh-Path

# Pin to the newest stable 24.x release from the official Node.js distribution
# index, so a future Node.js LTS major does not silently change this project.
$existingNode = Get-Command node -ErrorAction SilentlyContinue
$nodeMajor = 0
if ($existingNode) { $nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0]) }
if ($nodeMajor -ne 24) {
    Write-Host "Buscando la versión estable más reciente de Node.js 24..."
    $nodeReleases = Invoke-RestMethod "https://nodejs.org/dist/index.json"
    $nodeRelease = $nodeReleases | Where-Object { $_.version -match '^v24\.' -and $_.lts } | Select-Object -First 1
    if ($null -eq $nodeRelease) { throw "No se encontró una versión estable de Node.js 24." }
    $nodeVersion = $nodeRelease.version
    $nodeMsi = "node-$nodeVersion-x64.msi"
    $nodeBase = "https://nodejs.org/dist/$nodeVersion"
    $downloadPath = Join-Path $env:TEMP $nodeMsi
    $checksums = (Invoke-WebRequest "$nodeBase/SHASUMS256.txt").Content
    $checksumLine = $checksums -split "`n" | Where-Object { $_ -match "\s+$([regex]::Escape($nodeMsi))\s*$" } | Select-Object -First 1
    if (-not $checksumLine) { throw "No se encontró el checksum oficial de $nodeMsi." }
    $expectedHash = ($checksumLine -split '\s+')[0].ToLowerInvariant()
    Invoke-WebRequest "$nodeBase/$nodeMsi" -OutFile $downloadPath
    $actualHash = (Get-FileHash $downloadPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) { Remove-Item $downloadPath -Force; throw "El checksum del instalador de Node.js no coincide." }
    Write-Host "Instalando Node.js $nodeVersion desde el instalador oficial verificado..."
    $msiProcess = Start-Process -FilePath "msiexec.exe" -ArgumentList @("/i", $downloadPath, "/qn", "/norestart") -Wait -PassThru
    Remove-Item $downloadPath -Force
    if ($msiProcess.ExitCode -notin @(0, 3010)) { throw "Falló la instalación de Node.js (msiexec $($msiProcess.ExitCode))." }
    if ($msiProcess.ExitCode -eq 3010) { Write-Host "Node.js requiere reinicio para completar la instalación." }
} else {
    Write-Host "Node.js 24 ya está instalado; se conserva la versión existente."
}

Refresh-Path

$requiredCommands = @("uv", "bun", "node", "docker", "git")
foreach ($command in $requiredCommands) {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "No se encuentra '$command' en PATH. Cierra todas las terminales, abre una nueva y vuelve a ejecutar setup-windows.ps1."
    }
}

$nodeMajor = [int]((& node --version).TrimStart("v").Split(".")[0])
if ($nodeMajor -ne 24) { throw "El proyecto requiere Node.js 24; se encontró Node.js $nodeMajor." }

if (-not (Test-Path (Join-Path $root ".env"))) {
    Copy-Item (Join-Path $root ".env.example") (Join-Path $root ".env")
    Write-Host "Creado .env desde .env.example. Configura INITIAL_ADMIN_PASSWORD antes de crear el administrador."
} else {
    Write-Host ".env existente conservado."
}

Write-Host "Instalando Python 3.14 administrado por uv y dependencias del backend..."
Push-Location (Join-Path $root "backend")
try {
    & uv python install 3.14
    if ($LASTEXITCODE -ne 0) { throw "uv no pudo instalar Python 3.14." }
    & uv sync --all-groups
    if ($LASTEXITCODE -ne 0) { throw "Falló la instalación de dependencias Python." }
} finally { Pop-Location }

Write-Host "Instalando dependencias del frontend..."
Push-Location (Join-Path $root "frontend")
try {
    & bun install --frozen-lockfile
    if ($LASTEXITCODE -ne 0) { throw "Falló la instalación de dependencias Bun." }
} finally { Pop-Location }

Write-Host "Preparación terminada. Abre Docker Desktop, acepta sus términos e inicia su motor. Después configura .env y ejecuta scripts/principal-windows.ps1."
