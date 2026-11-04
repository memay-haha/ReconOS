# ReconOS. Chạy từ gốc repo.
#
#   make init      cài đặt và dựng môi trường phát triển, chạy một lần
#   make backend   chạy Backend API và frontend cùng lúc
#   make lint      kiểm tra định dạng và kiểu
#   make test      chạy test
#
# Tên lệnh phải khớp bảng trong CLAUDE.md.

# --noprofile --norc giữ recipe độc lập với file khởi động shell của máy.
SHELL := /bin/bash
.SHELLFLAGS := --noprofile --norc -eu -o pipefail -c
.DEFAULT_GOAL := help

# Giá trị riêng của máy phát triển, không commit. Biến trong .env được truyền
# cho tiến trình con nhưng Makefile không bao giờ in ra.
-include .env
export

COMPOSE_DEV := docker compose -f infras/compose/compose.dev.yaml
ALEMBIC     := uv run alembic -c backend/alembic.ini
PNPM_FE     := pnpm --dir frontend
API_HOST    ?= 127.0.0.1
API_PORT    ?= 8000
WEB_HOST    ?= 127.0.0.1
WEB_PORT    ?= 3000

.PHONY: help init backend lint test

help: ## Liệt kê lệnh
	@# Chỉ đọc file này. `-include .env` cũng nằm trong MAKEFILE_LIST, và .env chứa thông tin xác thực.
	@grep -hE '^[a-z0-9-]+:.*## ' Makefile | awk -F':.*## ' '{printf "  %-10s %s\n", $$1, $$2}'

init: ## Cài phụ thuộc, bật container, chạy migration, tạo Superadmin đầu tiên
	uv sync
	$(PNPM_FE) install
	$(COMPOSE_DEV) up -d --wait
	infras/minio/init.sh infras/compose/compose.dev.yaml
	$(ALEMBIC) upgrade head
	$(ALEMBIC) -n log upgrade head
	uv run --directory backend python -m app.bootstrap
	@echo
	@echo "Xong. Chạy 'make backend' rồi mở http://$(WEB_HOST):$(WEB_PORT)"

backend: ## Chạy Backend API và frontend cùng lúc, Ctrl-C dừng cả hai
	@echo "Backend API  http://$(API_HOST):$(API_PORT)"
	@echo "Frontend     http://$(WEB_HOST):$(WEB_PORT)"
	@echo
	@trap 'kill 0' EXIT INT TERM; \
	uv run uvicorn app.main:app --reload --app-dir backend --host $(API_HOST) --port $(API_PORT) & \
	$(PNPM_FE) dev --hostname $(WEB_HOST) --port $(WEB_PORT) & \
	wait || true

lint: ## ruff format, ruff check, mypy, ESLint, Prettier, tsc
	uv run ruff format --check .
	uv run ruff check .
	uv run mypy backend workers contracts
	$(PNPM_FE) lint
	$(PNPM_FE) exec prettier --check .
	$(PNPM_FE) exec tsc --noEmit

test: ## pytest cho backend, workers, contracts và Vitest cho frontend
	uv run pytest backend/tests workers/tests contracts/tests
	$(PNPM_FE) test
