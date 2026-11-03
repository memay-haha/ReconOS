# ReconOS: build, test and dev commands. Run from the repo root.
# Command names must match the table in CLAUDE.md.

# --noprofile --norc keeps recipes independent of the developer's shell startup files.
SHELL := /bin/bash
.SHELLFLAGS := --noprofile --norc -eu -o pipefail -c
.DEFAULT_GOAL := help

# Optional local overrides (dev only, never committed). Credentials in .env are
# exported to child processes but never printed by this Makefile.
-include .env
export

COMPOSE_DEV   := docker compose -f infras/compose/compose.dev.yaml
ALEMBIC       := uv run alembic -c backend/alembic.ini
PNPM_FE       := pnpm --dir frontend
IMAGE_TAG     ?= dev
IMAGES        := backend frontend worker

# Engine servers in the worker zone. Override in .env or on the command line,
# e.g. `make engine-check VIGOLIUM_URL=http://127.0.0.1:9002`.
OSMEDEUS_URL  ?= http://192.168.80.133:8002
VIGOLIUM_URL  ?= http://192.168.80.133:9002
ENGINE_TIMEOUT ?= 5

.PHONY: help dev-up dev-down migrate lint test test-coverage e2e build engine-check

help: ## List available commands
	@grep -E '^[a-z0-9-]+:.*## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  %-15s %s\n", $$1, $$2}'

dev-up: ## Start core-zone containers for development
	$(COMPOSE_DEV) up -d --wait
	infras/minio/init.sh infras/compose/compose.dev.yaml

dev-down: ## Stop core-zone containers for development
	$(COMPOSE_DEV) down

migrate: ## Run alembic upgrade head on both dev databases
	$(ALEMBIC) upgrade head
	$(ALEMBIC) -n log upgrade head

lint: ## ruff format, ruff check, mypy, ESLint, Prettier, tsc
	uv run ruff format --check .
	uv run ruff check .
	uv run mypy backend workers contracts
	$(PNPM_FE) lint
	$(PNPM_FE) exec prettier --check .
	$(PNPM_FE) exec tsc --noEmit

test: ## pytest for backend, workers, contracts and Vitest for frontend (needs dev-up)
	uv run pytest backend/tests workers/tests contracts/tests
	$(PNPM_FE) test

test-coverage: ## 100% branch coverage for scope, authorization, parameter schemas
	@if [ ! -d backend/app/scope ]; then \
		echo "skip: module scope chưa có, xem đợt 3 trong docs/roadmap.md"; \
		exit 0; \
	fi; \
	uv run pytest \
		--cov=backend/app/scope \
		--cov=backend/app/core/security.py \
		--cov=contracts \
		--cov-branch --cov-fail-under=100 \
		backend/tests/scope backend/tests/core contracts/tests

e2e: ## Playwright end-to-end tests (needs dev-up)
	$(PNPM_FE) exec playwright test

build: ## Build reconos-backend, reconos-frontend, reconos-worker images
	@for svc in $(IMAGES); do \
		echo "==> reconos-$$svc:$(IMAGE_TAG)"; \
		docker build -f infras/docker/$$svc.Dockerfile -t reconos-$$svc:$(IMAGE_TAG) . ; \
	done

engine-check: ## Check that Osmedeus and Vigolium servers respond over HTTP
	@fail=0; \
	for pair in "osmedeus $(OSMEDEUS_URL)" "vigolium $(VIGOLIUM_URL)"; do \
		set -- $$pair ""; \
		if [ -z "$$2" ]; then \
			printf '[SKIP] %-9s chưa đặt URL trong .env\n' "$$1"; continue; \
		fi; \
		code=$$(curl -s -o /dev/null -w '%{http_code}' --max-time $(ENGINE_TIMEOUT) "$$2/" || true); \
		if [ "$$code" = "000" ] || [ -z "$$code" ]; then \
			printf '[FAIL] %-9s %s no response\n' "$$1" "$$2"; fail=1; \
		elif [ "$${code:0:1}" = "5" ]; then \
			printf '[FAIL] %-9s %s HTTP %s\n' "$$1" "$$2" "$$code"; fail=1; \
		else \
			printf '[OK]   %-9s %s HTTP %s\n' "$$1" "$$2" "$$code"; \
		fi; \
	done; \
	exit $$fail
