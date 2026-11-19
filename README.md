# Sistema Web de Gestión Académica

Proyecto académico de Programación IV para gestionar procesos académicos de
carreras, planes, materias, periodos, paralelos, inscripciones y calificaciones.

La guía de desarrollo, arquitectura, reglas y fases está en [AGENTS.md](AGENTS.md).
Los cambios que se deben reflejar después en el informe están en
[CAMBIOS_PARA_INFORME.md](CAMBIOS_PARA_INFORME.md).
El contexto funcional y los diagramas vigentes están en
[CONTEXTO_COMPLETO_PROGRAMACION_IV.md](CONTEXTO_COMPLETO_PROGRAMACION_IV.md).

## Ejecución local

Requisitos para desarrollo local: Docker Compose, Python 3.14 con `uv`, Node.js
24 y Bun. Desde la raíz del proyecto:

```sh
cp .env.example .env
```

Antes de crear la cuenta inicial, define una contraseña propia de al menos ocho
caracteres en `INITIAL_ADMIN_PASSWORD` dentro de `.env`. No la guardes en Git.

Inicia PostgreSQL y prepara el backend:

```sh
docker compose up -d db
cd backend
uv sync --all-groups
uv run alembic upgrade head
uv run python -m app.cli create-principal
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8100
```

En otra terminal, desde la raíz del proyecto:

```sh
cd frontend
bun install
bun run dev
```

La interfaz queda en `http://127.0.0.1:5173`; la API y su documentación OpenAPI
en `http://127.0.0.1:8100/docs`. PostgreSQL se publica solo en
`127.0.0.1:55432`. Los valores de `.env.example` son únicamente para desarrollo
local. La puesta en producción requiere definir infraestructura, secretos,
dominio y HTTPS; no está configurada en este repositorio.

Para detener la base local sin borrar sus datos:

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
