# ADR: Cấu trúc repo

> Trạng thái: 🟢 Accepted · Ngày: 2026-11-01

## 🧭 Bối cảnh

- [ADR tech stack](adr-tech-stack.md) chọn: backend FastAPI, dispatcher là tiến trình riêng, worker là Celery worker viết bằng Python, frontend Next.js, không đặt nghiệp vụ trong Next.js.
- Repo hiện có `backend/`, `frontend/`, `workers/` chỉ chứa CLAUDE.md khung, `infras/` rỗng, cùng `docs/` và `_reference/`.
- Backend có nhiều nhóm nghiệp vụ theo [glossary](../appendix/glossary.md): program, scope, tài sản, job, output thô, parser, finding, tài khoản, nhật ký thao tác.
- Backend gửi task Celery cho worker. Hai bên phải thống nhất contract: tên task, tham số, định dạng output thô gửi về.
- Thêm công cụ mới không được sửa lõi hệ thống (G4). Parser đặt ở backend, chạy sau khi lưu output thô (G8).
- Mẫu cấu trúc Next.js App Router phổ biến có `src/app/api/` cho route handler và `src/lib/db.ts` kết nối CSDL. Hai thành phần này đặt nghiệp vụ trong Next.js, trái ADR tech stack.

## ✅ Quyết định

Một repo chứa toàn bộ hệ thống. Ba package Python quản lý chung bằng uv workspace, frontend quản lý bằng pnpm.

```text
reconos/
├── pyproject.toml              # gốc uv workspace: backend, workers, contracts
├── uv.lock
├── Makefile                    # lệnh build, test, chạy cho toàn repo
├── CLAUDE.md
├── README.md
├── .gitignore
├── .claude/                    # rules, skills, settings của Claude Code
├── docs/                       # tài liệu, ADR, thiết kế màn hình
├── _reference/                 # mã tham khảo, chỉ đọc, không import
├── infras/                     # cấu hình hạ tầng và triển khai
│
├── contracts/                  # contract worker ↔ backend
│   ├── pyproject.toml
│   ├── contracts/
│   │   ├── tasks.py            # tên task Celery, schema tham số job
│   │   ├── raw_output.py       # schema output thô gửi về
│   │   └── job_status.py       # schema báo trạng thái job
│   └── tests/
│
├── backend/
│   ├── CLAUDE.md
│   ├── pyproject.toml
│   ├── alembic.ini
│   ├── migrations/             # migration CSDL
│   │   ├── env.py
│   │   └── versions/
│   ├── app/
│   │   ├── main.py             # khởi tạo FastAPI, gắn router các module
│   │   ├── core/               # dùng chung
│   │   │   ├── config.py       # cấu hình, nạp thông tin xác thực
│   │   │   ├── db.py           # kết nối CSDL, Base model
│   │   │   ├── models.py       # import model mọi module cho migration
│   │   │   ├── security.py     # xác thực, phân quyền
│   │   │   ├── storage.py      # client object storage MinIO
│   │   │   └── realtime.py     # WebSocket, Redis pub/sub
│   │   ├── program/            # mỗi module: router, service, models, schemas
│   │   │   ├── router.py
│   │   │   ├── service.py
│   │   │   ├── models.py
│   │   │   └── schemas.py
│   │   ├── scope/
│   │   ├── asset/              # domain, IP, URL, service
│   │   ├── screenshot/
│   │   ├── tag/
│   │   ├── tool_module/
│   │   ├── engine/             # cấu hình Osmedeus, Vigolium
│   │   ├── job/
│   │   ├── dispatcher/         # tiến trình riêng: python -m app.dispatcher
│   │   │   ├── __main__.py
│   │   │   └── service.py
│   │   ├── raw_output/
│   │   ├── parser/             # một file một công cụ
│   │   │   ├── base.py
│   │   │   ├── registry.py
│   │   │   ├── nuclei.py
│   │   │   └── gowitness.py
│   │   ├── finding/            # gồm triage
│   │   ├── report/
│   │   ├── dashboard/
│   │   ├── user/               # tài khoản, vai trò
│   │   └── audit_log/
│   └── tests/
│
├── workers/
│   ├── CLAUDE.md
│   ├── pyproject.toml
│   ├── worker/
│   │   ├── celery_app.py       # cấu hình Celery
│   │   ├── tasks.py            # nhận task theo contracts/
│   │   ├── client.py           # gọi API backend: trạng thái job, gửi output thô
│   │   └── runners/            # một file một công cụ, gọi qua tiến trình con
│   │       ├── base.py
│   │       ├── nuclei.py
│   │       └── gowitness.py
│   └── tests/
│
└── frontend/
    ├── CLAUDE.md
    ├── package.json
    ├── pnpm-lock.yaml
    ├── next.config.ts
    ├── tailwind.config.ts
    ├── postcss.config.mjs
    ├── tsconfig.json
    ├── public/                 # icon, ảnh, font
    ├── src/
    │   ├── app/                # route theo màn hình trong docs/design/screens/
    │   │   ├── layout.tsx
    │   │   ├── page.tsx        # dashboard
    │   │   ├── login/
    │   │   ├── programs/
    │   │   ├── findings/
    │   │   ├── error.tsx
    │   │   └── not-found.tsx
    │   ├── components/         # component dùng lại
    │   ├── lib/                # client gọi API backend, hàm tiện ích
    │   ├── styles/             # CSS toàn cục
    │   └── types/              # kiểu TypeScript
    └── tests/
```

**Quy tắc cấu trúc:**

- Tên thư mục module backend theo tên trong mã của glossary.
- Mỗi module backend tự chứa `router.py`, `service.py`, `models.py`, `schemas.py`. Module chỉ gọi module khác qua `service.py`.
- `dispatcher/` dùng chung mã với backend, chạy bằng lệnh riêng thành tiến trình riêng.
- `workers/` không import mã từ `backend/`, chỉ import `contracts/`. Không truy cập CSDL.
- `contracts/` chỉ chứa schema và hằng số. Không chứa mã xử lý, không chứa model CSDL.
- ❌ Frontend không có `src/app/api/`, không có kết nối CSDL.
- Thêm công cụ: thêm `backend/app/parser/<công cụ>.py` và `workers/worker/runners/<công cụ>.py`, khai báo tool module.
- File, thư mục con trong cây là bộ khung tối thiểu. Thêm file trong một module không cần ADR mới. Thêm, bỏ, đổi tên thư mục cấp 1 hoặc module backend cần ADR mới.

Mô tả contract worker ↔ backend: [external-services.md](../integrations/external-services.md). Vai trò từng thư mục: [directory-structure.md](../architecture/directory-structure.md).

## ❌ Phương án đã loại

| Thành phần | Phương án | Lý do loại |
|---|---|---|
| Repo | Tách nhiều repo: backend, frontend, workers riêng | Tài liệu, ADR, contract nằm rải rác. Đổi contract phải sửa và phát hành nhiều repo cùng lúc. |
| Dispatcher | Thư mục riêng `dispatcher/` ở gốc repo | Phải chia sẻ model CSDL và bảng job với backend qua package chung hoặc chép lại mã. |
| Contract | Độc lập hoàn toàn: không có mã dùng chung, contract chỉ mô tả trong tài liệu | Contract viết hai lần ở backend và workers. Lệch nhau chỉ phát hiện khi chạy: sai tên task thì job không có worker nhận, sai tham số thì job lỗi sau khi đã vào hàng đợi. Phải viết thêm test contract ở cả hai bên. |
| Backend | Tổ chức theo tầng: `api/`, `services/`, `models/`, `schemas/` | Mã cùng tính năng nằm rải rác ở nhiều thư mục. Không có ranh giới giữa module, service dễ phình to khi thêm tính năng. |
| Package Python | Poetry | Mỗi package một lock riêng, `contracts/` phải khai báo path dependency ở từng nơi dùng. |
| Package Python | pip và `requirements.txt` | Không có lock file chuẩn, không quản lý được nhiều package trong một repo. |
| Package Node | npm | Chậm hơn, tốn ổ đĩa hơn pnpm, kiểm soát phụ thuộc lỏng hơn. |
| Test | Đặt `tests/` cạnh từng module | Test nằm rải rác trong mã nguồn, khó tách khi đóng gói và chạy theo phần. |
| Frontend | Giữ `src/app/api/` làm proxy mỏng tới FastAPI | Mở đường đặt nghiệp vụ trong Next.js, trái ADR tech stack. |
| Frontend | Giữ nguyên mẫu Next.js có `src/app/api/` và `src/lib/db.ts` | Next.js truy cập thẳng CSDL, trái ADR tech stack và [ADR tự xây CSDL riêng](adr-own-database.md). |

## ⚖️ Hệ quả

**✅ Đạt được:**

- Một repo chứa mã, tài liệu, ADR. Thay đổi contract và tài liệu đi cùng một lần sửa.
- Một lock file Python cho cả backend, workers, contracts. Phiên bản thư viện dùng chung luôn khớp.
- Mã cùng tính năng nằm cùng thư mục, khớp thuật ngữ glossary và [modules.md](../architecture/modules.md).
- Thêm công cụ chỉ thêm file parser và runner, không sửa module khác (G4).
- Contract có một bản duy nhất. Đổi contract thì test và kiểm tra kiểu ở cả backend lẫn workers báo lỗi ngay.
- Workers không phụ thuộc mã backend, chỉ phụ thuộc `contracts/`.
- Frontend không chứa nghiệp vụ, mọi kiểm tra scope và phân quyền nằm ở backend.

**⚠️ Đánh đổi:**

- Cây thư mục nằm trong ADR. Thêm, bỏ, đổi tên thư mục cấp 1 hoặc module backend phải viết ADR mới thay thế.
- `contracts/` dễ bị thêm dần mã xử lý hoặc model CSDL. Quy tắc giữ `contracts/` chỉ chứa schema và hằng số: [design-patterns.md](../../.claude/rules/design-patterns.md).
- Đổi contract phải triển khai lại cả backend và workers.
- Model của các module có quan hệ chéo: finding, tài sản, output thô. Dễ phát sinh import vòng. Quy tắc phụ thuộc giữa module: [dependency-graph.md](../architecture/dependency-graph.md).
- Migration phải nạp đủ model từ mọi module qua `core/models.py`.
- Không có route handler trong Next.js, phần render phía server phải gọi thẳng API backend. Xử lý cookie phiên đăng nhập giữa frontend và backend: [authentication.md](../security/authentication.md).
- Máy phát triển phải cài uv và pnpm.
