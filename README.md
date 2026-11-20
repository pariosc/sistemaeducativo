# Sistema Web de Gestión Académica

Proyecto académico de Programación IV para gestionar procesos académicos de
carreras, planes, materias, periodos, paralelos, inscripciones y calificaciones.

La guía de desarrollo, arquitectura, reglas y fases está en [AGENTS.md](AGENTS.md).
Los cambios que se deben reflejar después en el informe están en
[CAMBIOS_PARA_INFORME.md](CAMBIOS_PARA_INFORME.md).
El contexto funcional y los diagramas vigentes están en
[CONTEXTO_COMPLETO_PROGRAMACION_IV.md](CONTEXTO_COMPLETO_PROGRAMACION_IV.md).

## Desarrollo en Windows

Esta guía prepara una computadora Windows nueva para desarrollar el proyecto
desde PowerShell. Se recomienda Windows 11 23H2 o posterior, 64 bits,
virtualización activada en BIOS/UEFI y al menos 8 GB de RAM. Docker Desktop usa
WSL 2; los requisitos exactos dependen de la edición y versión de Windows. Si
el equipo no cumple sus requisitos, será necesario actualizar Windows o
habilitar la virtualización antes de continuar.

### 1. Instalar Git y descargar el proyecto

En PowerShell instala Git con WinGet:

```powershell
winget install --id Git.Git --exact --source winget
```

Si no existe `winget`, instala o actualiza **App Installer** desde Microsoft
Store. Cierra y vuelve a abrir PowerShell después de instalar Git. Clona el
repositorio (se requiere acceso autorizado a GitHub):

```powershell
git clone https://github.com/pariosc/sistemaeducativo.git
Set-Location sistemaeducativo
```

### 2. Preparar herramientas y dependencias

Abre PowerShell **como administrador** y desde la raíz del repositorio ejecuta:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\scripts\setup-windows.ps1
```

El script instala o verifica WSL 2, Git, Docker Desktop, Visual Studio Code,
`uv` y Bun mediante WinGet. Descarga la versión estable 24.x más reciente de
Node.js desde el sitio oficial y verifica su SHA-256 antes de instalarla; `uv`
instala Python 3.14 y las dependencias de backend, y Bun instala las de
frontend. Si Windows pide reiniciar para habilitar WSL, reinicia, vuelve a
abrir PowerShell como administrador y ejecuta el script de nuevo. Al terminar,
abre Docker Desktop, acepta sus condiciones, espera a que el motor esté iniciado
y reabre una terminal normal para los siguientes pasos.

El script crea `.env` desde `.env.example` solo si aún no existe. Configura en
`.env` una contraseña propia de al menos ocho caracteres en
`INITIAL_ADMIN_PASSWORD`; ese archivo está excluido de Git y no debe compartirse.

### 3. Crear el administrador y arrancar

Desde PowerShell normal, en la raíz del repositorio:

```powershell
.\scripts\principal-windows.ps1
.\scripts\dev-windows.ps1
```

`principal-windows.ps1` inicia PostgreSQL, aplica migraciones y crea la cuenta
principal; se ejecuta una sola vez por base local. `dev-windows.ps1` inicia
PostgreSQL, aplica migraciones y levanta API y frontend. Direcciones: interfaz
`http://127.0.0.1:5173`, API `http://127.0.0.1:8100/docs` y PostgreSQL
`127.0.0.1:55432`. Presiona `Ctrl+C` para detener los servidores y PostgreSQL;
el volumen con los datos se conserva. Para apagar la base por separado:

```powershell
docker compose down
```

## Desarrollo en Linux y macOS

Requisitos: GNU Make, Docker Compose v2.17 o posterior, Python 3.14 con `uv`,
Node.js 24 y Bun. Los comandos se ejecutan desde la raíz del proyecto.

Prepara el entorno e instala las dependencias:

```sh
make setup
```

`make setup` crea `.env` solo si aún no existe y
prepara las dependencias de backend y frontend. Antes de crear la cuenta inicial,
define una contraseña propia de al menos ocho caracteres en
`INITIAL_ADMIN_PASSWORD` dentro de `.env`. No la guardes en Git.

```sh
make principal
```

`make principal` inicia PostgreSQL, aplica las migraciones y crea el administrador
principal. Ejecuta este comando una sola vez por base local. Después, inicia los
tres servidores con:

```sh
make dev
```

`make dev` espera que PostgreSQL esté saludable, aplica migraciones pendientes,
y levanta el backend y frontend a la vez. La interfaz queda en
`http://127.0.0.1:5173`; la API y su documentación OpenAPI, en
`http://127.0.0.1:8100/docs`. PostgreSQL se publica solo en
`127.0.0.1:55432`. Presiona `Ctrl+C` para detener la aplicación y PostgreSQL;
los datos se conservan en el volumen de Docker.

Los valores de `.env.example` son únicamente para desarrollo local. La puesta
en producción requiere definir infraestructura, secretos, dominio y HTTPS; no
está configurada en este repositorio.

Si PostgreSQL se inició aparte y deseas detenerlo sin borrar sus datos:

```sh
docker compose down
```

## Pruebas automatizadas

Desde `backend`, `uv run pytest` ejecuta la suite con SQLite en memoria por
defecto. Para verificar con PostgreSQL, define `TEST_DATABASE_URL` con una URL
que apunte a una base de pruebas dedicada cuyo nombre incluya `test` o
`prueba`, y luego ejecuta `uv run pytest`. El fixture crea y elimina tablas;
**no apuntes `TEST_DATABASE_URL` a la base académica local o a producción**.
La matriz `docs/MATRIZ_PRUEBAS.md` registra las verificaciones realizadas y la
cobertura parcial de cada caso T.
