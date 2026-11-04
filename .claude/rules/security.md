---
paths:
  - "backend/**"
  - "frontend/**"
  - "workers/**"
  - "contracts/**"
  - "infras/**"
---
# Quy tắc viết mã an toàn

> Phiên bản: 1.3 · Ngày: 2026-11-04 · Trạng thái: 🔵 Chờ duyệt
> Mục 17: Bảo mật

## ✅ Bắt buộc

Mỗi quy tắc gắn với một mối đe dọa trong [threat-model.md](../../docs/security/threat-model.md).

**Đầu vào:**

- Kiểm tra mọi dữ liệu đầu vào bằng model Pydantic: request API, task Celery, response của engine.
- Chỉ lấy mục tiêu từ job đã qua kiểm tra scope.
- Chỉ chấp nhận tham số công cụ có trong allowlist của schema tool module.
- Coi output thô là dữ liệu không tin cậy: kiểm tra kiểu, độ dài trường trong parser, bỏ dòng sai định dạng.

**CSDL:**

- Dùng truy vấn tham số hóa của SQLAlchemy.
- Lọc mọi truy vấn dữ liệu thuộc program theo program đã gán cho tài khoản, dùng bộ lọc trong `core/security.py`.

**Thông tin xác thực:**

- Mã hóa cột `_encrypted` bằng AES-256-GCM qua `backend/app/core/crypto.py`, thư viện `cryptography`.
- Lưu ID khóa kèm mỗi bản mã.
- Nạp khóa từ `RECONOS_ENCRYPTION_KEYS`: [configuration.md](../../docs/ops/configuration.md).
- Sinh nonce ngẫu nhiên 96 bit cho mỗi lần mã hóa.
- Băm mật khẩu bằng Argon2id.
- Từ chối mật khẩu có điểm zxcvbn dưới 3: [authentication.md](../../docs/security/authentication.md).
- Băm session ID, token worker bằng SHA-256 trước khi lưu.
- So sánh giá trị băm, token bằng `hmac.compare_digest`.
- Sinh token, session ID bằng `secrets`.

**Gọi công cụ, engine:**

- Gọi tiến trình con bằng danh sách đối số, `shell=False`, thư mục làm việc riêng mỗi job.
- Chỉ gọi REST API từ runner tới `engine.base_url` nhận khi claim job.

**File và gói nén:**

- Chỉ chấp nhận tên file upload gồm chữ, số, `.`, `-`, `_`.
- Từ chối tên file upload chứa `/`, `\`, `..`.
- Khi đọc gói nén: bỏ mục có đường dẫn tuyệt đối hoặc `..`, dừng khi tổng dung lượng giải nén vượt giới hạn.
- Trả header `Content-Disposition: attachment` khi tải về output thô.
- Trả header `X-Content-Type-Options: nosniff` cho screenshot.

**Frontend:**

- Hiển thị dữ liệu từ output thô, tài sản, finding dưới dạng văn bản.
- Coi header, tiêu đề trang, banner là dữ liệu không tin cậy.
- Khi xuất CSV: thêm `'` trước ô bắt đầu bằng `=`, `+`, `-`, `@`.
- Khai báo `method="post"` cho form gửi thông tin xác thực. Bấm gửi trước khi trang hydrate làm trình duyệt gửi GET, đẩy tên đăng nhập và mật khẩu vào URL, vào lịch sử trình duyệt, log máy chủ và header `Referer` (G7).
- Để ô nhập mật khẩu ở dạng không kiểm soát, đọc giá trị qua `ref` khi gửi và xóa qua `ref` sau khi xong. React sao giá trị của ô có kiểm soát vào thuộc tính `value` trong DOM, nên mật khẩu nằm trong markup và lọt vào mọi thứ đọc được DOM (G7).
- Đặt `gcTime: 0` cho mutation nhận thông tin xác thực, để TanStack Query không giữ lại `variables` sau khi mutation kết thúc.

**Header response, đặt ở reverse proxy:**

- Đặt `Content-Security-Policy` chỉ cho script cùng origin.
- Đặt `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`, `X-Frame-Options: DENY`.

## ❌ Cấm

- Ghép chuỗi vào câu SQL, dùng `text()` có f-string.
- Dùng `shell=True`, `os.system`, ghép chuỗi lệnh.
- Dùng `pickle`, `yaml.load` không có `SafeLoader`, `eval`, `exec` trên dữ liệu ngoài.
- Dùng `dangerouslySetInnerHTML`, render HTML từ output thô.
- Ghi thông tin xác thực vào mã, log, response, `audit_log.detail`, `job.params`.
- Trả cột `_encrypted`, `_hash` qua API.
- Dùng `random` để sinh token, session ID, nonce.
- Tắt kiểm tra chứng chỉ TLS: `verify=False`.
- Gửi request HTTP từ backend tới mục tiêu hoặc URL lấy từ output thô.
- Import hoặc sửa mã trong `_reference/`.

## 💡 Ví dụ

✅ Đúng: tham số ràng buộc, lọc theo program được gán.

```python
stmt = select(Finding).where(
    Finding.program_id.in_(allowed_program_ids(current_user)),
    Finding.severity == severity,
)
```

❌ Sai: ghép chuỗi vào SQL, không lọc program.

```python
await session.execute(text(f"SELECT * FROM finding WHERE severity = '{severity}'"))
```

## 🔍 Cách kiểm tra

```bash
uv run ruff check --select S .
grep -rn "dangerouslySetInnerHTML" frontend/src     # phải rỗng
grep -rnE "verify=False|shell=True|pickle" backend workers --include=*.py   # phải rỗng
```

- Bật nhóm rule `S` của ruff trong `pyproject.toml`, chạy trong CI.
- Khi sửa `core/security.py`, `core/crypto.py`, `scope`, runner: rà soát theo [threat-model.md](../../docs/security/threat-model.md).
