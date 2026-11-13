# ReconOS. Chạy từ gốc repo.
#
#   make init      cài đặt và dựng môi trường phát triển, chạy một lần
#   make backend   chạy Backend API, dispatcher, tiến trình nền, Celery Beat, frontend
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
# Next chuyển /api/* tới đây, nên frontend luôn gọi đúng Backend API mà make backend chạy.
RECONOS_API_URL ?= http://$(API_HOST):$(API_PORT)
# Python ghi log ngay thay vì giữ trong bộ đệm khi stdout là pipe tới bộ thêm tiền tố.
PYTHONUNBUFFERED := 1

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

backend: ## Chạy Backend API, dispatcher, tiến trình nền, Celery Beat, frontend. Ctrl-C dừng tất cả
	@# Mỗi tiến trình chạy trong nhóm tiến trình riêng (setsid) để dừng được cả tiến trình con
	@# của uvicorn --reload và next dev. Một tiến trình thoát thì dừng cả nhóm, trả mã lỗi của nó.
	@# Log mang tiền tố tên tiến trình. Celery Beat ghi file lịch vào data/, đã gitignore.
	@mkdir -p data
	@echo "Backend API  http://$(API_HOST):$(API_PORT)"
	@echo "Frontend     http://$(WEB_HOST):$(WEB_PORT)"
	@echo "Tiến trình   api, dispatcher, background (queue parse, schedule), beat, frontend"
	@echo
	@pids=(); names=(); \
	start() { \
		local name=$$1; shift; \
		setsid bash --noprofile --norc -o pipefail -c \
			'"$${@:2}" 2>&1 | sed -u "s/^/$$1 /"' _ "$$(printf '%-12s' "[$$name]")" "$$@" & \
		pids+=("$$!"); names+=("$$name"); \
	}; \
	stop() { \
		for p in "$${pids[@]}"; do kill -TERM -- "-$$p" 2>/dev/null || true; done; \
		for _ in $$(seq 100); do \
			if [ -z "$$(jobs -rp)" ]; then break; fi; sleep 0.1; \
		done; \
		for p in "$${pids[@]}"; do kill -KILL -- "-$$p" 2>/dev/null || true; done; \
	}; \
	trap 'stop; exit 0' INT TERM; \
	start api uv run uvicorn app.main:app --reload --app-dir backend --host $(API_HOST) --port $(API_PORT); \
	start dispatcher uv run --directory backend python -m app.dispatcher; \
	start background uv run --directory backend celery -A app.background.celery_app worker -Q parse,schedule; \
	start beat uv run --directory backend celery -A app.background.celery_app beat --schedule ../data/celerybeat-schedule; \
	start frontend $(PNPM_FE) dev --hostname $(WEB_HOST) --port $(WEB_PORT); \
	rc=0; dead=; wait -n -p dead || rc=$$?; \
	trap - INT TERM; \
	name=?; for i in "$${!pids[@]}"; do if [ "$${pids[$$i]}" = "$$dead" ]; then name=$${names[$$i]}; fi; done; \
	if [ "$$rc" -eq 0 ]; then rc=1; fi; \
	echo "make backend: tiến trình $$name thoát với mã $$rc, dừng các tiến trình còn lại" >&2; \
	stop; exit "$$rc"

lint: ## ruff format, ruff check, mypy, ESLint, Prettier, tsc
	uv run ruff format --check .
	uv run ruff check .
	uv run mypy backend workers contracts
	$(PNPM_FE) lint
	$(PNPM_FE) exec prettier --check .
	$(PNPM_FE) exec tsc --noEmit

test: ## pytest, Vitest, và kiểm tra dữ liệu mẫu không lọt vào bản build
	uv run pytest backend/tests workers/tests contracts/tests
	$(PNPM_FE) test
	@# Dữ liệu mẫu MSW lọt vào bản production là rò dữ liệu, không phải lỗi hiển thị.
	@# Build rồi quét: chỉ cách này thấy được, vì test unit chạy trên mã nguồn.
	$(PNPM_FE) build
	$(PNPM_FE) check:no-mocks
