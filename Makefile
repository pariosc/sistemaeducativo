.PHONY: setup principal dev

setup:
	@if [ ! -f .env ]; then install -m 600 .env.example .env; printf 'Creado .env con permisos restringidos. Configura INITIAL_ADMIN_PASSWORD antes de crear la cuenta.\n'; else printf '.env existente conservado.\n'; fi
	cd backend && uv sync --all-groups
	cd frontend && bun install --frozen-lockfile

principal:
	docker compose up -d --wait db
	cd backend && uv run python -m alembic upgrade head
	cd backend && uv run python -m app.cli create-principal

dev:
	python3 scripts/dev.py
