---
paths:
  - "backend/**"
  - "frontend/**"
  - "workers/**"
  - "contracts/**"
---
# Mẫu thiết kế

> Phiên bản: 1.0 · Ngày: 2026-11-01 · Trạng thái: 🟢 Xong
> Mục 23: Mẫu thiết kế

## ✅ Bắt buộc

**Backend, tầng trong module:**

- Giới hạn router ở phần HTTP: nhận request, khai báo quyền qua dependency, gọi service, trả response.
- Đặt nghiệp vụ trong service.
- Truy vấn CSDL trực tiếp trong service bằng SQLAlchemy `AsyncSession`.
- Nhận `AsyncSession` qua `Depends` của FastAPI.
- Dùng một transaction cho mỗi request: dependency commit khi request thành công, rollback khi có lỗi.
- Mở session riêng trong dispatcher và task của tiến trình nền, mỗi đơn vị công việc một transaction.
- Gọi module khác theo tầng trong [dependency-graph.md](../../docs/architecture/dependency-graph.md).
- Khai báo khóa ngoại tới bảng của module tầng trên hoặc cùng tầng bằng tên bảng dạng chuỗi.

**Tool module, dạng plugin:**

- Cho parser kế thừa lớp cơ sở trong `parser/base.py`.
- Đăng ký parser theo tên tool module trong `parser/registry.py`.
- Cho runner kế thừa lớp cơ sở trong `runners/base.py`.
- Đăng ký runner theo tên tool module.
- Khi thêm tool module: chỉ thêm file và một dòng đăng ký, không sửa parser hay runner khác.

**Contract:**

- Định nghĩa task, tham số job, output thô, trạng thái job bằng model Pydantic trong `contracts/`.
- Kiểm tra dữ liệu ở cả backend và workers bằng cùng model trong `contracts/`.

**Chống xử lý trùng:**

- Chuyển trạng thái job bằng câu `UPDATE` có điều kiện trạng thái hiện tại. Không đổi được dòng nào thì coi là đã xử lý.
- Gửi `NOTIFY` trong cùng transaction với thay đổi job.
- Ghi tài sản, finding từ parser bằng upsert theo khóa tự nhiên hoặc chuỗi khử trùng lặp.

**Frontend:**

- Lấy dữ liệu của trang trong client component qua hook TanStack Query.
- Đặt hook gọi API theo tài nguyên trong `src/lib/`, ví dụ `useJobs`, `useFindings`.
- Đặt query key theo tài nguyên.
- Khi có sự kiện WebSocket: cập nhật hoặc làm mới query tương ứng.
- Chỉ dùng server component cho layout và kiểm tra phiên để chuyển hướng tới S01.
- Giới hạn component trong `src/components/` ở việc nhận props và hiển thị, không gọi API.

## ❌ Cấm

- Tạo tầng repository riêng, file `repository.py`.
- Viết truy vấn CSDL hoặc nghiệp vụ trong `router.py`.
- Tự `commit` hoặc `rollback` trong service ở luồng request.
- Import module tầng trên.
- Gọi service của module cùng tầng.
- Import model SQLAlchemy của module khác để khai báo quan hệ ngược.
- Đọc trạng thái job rồi ghi ở câu lệnh riêng mà không có điều kiện.
- Rẽ nhánh theo tên tool module trong mã lõi, ví dụ `if tool == "nuclei"`.
- Gọi API trong `useEffect` hoặc bằng `fetch` trực tiếp trong component.
- Đặt nghiệp vụ trong Next.js: kiểm tra scope, kiểm tra quyền, tính trạng thái.

## 💡 Ví dụ

✅ Đúng: chuyển trạng thái có điều kiện, task giao lại không chạy job hai lần.

```python
async def mark_running(session: AsyncSession, job_id: UUID) -> bool:
    result = await session.execute(
        update(Job)
        .where(Job.id == job_id, Job.status == JobStatus.DISPATCHED)
        .values(status=JobStatus.RUNNING)
    )
    return result.rowcount == 1
```

❌ Sai: đọc rồi ghi, hai worker cùng thấy `dispatched` và cùng chạy.

```python
job = await session.get(Job, job_id)
if job.status == JobStatus.DISPATCHED:
    job.status = JobStatus.RUNNING
```

## 🔍 Cách kiểm tra

```bash
find backend/app -name "repository.py"                       # phải rỗng
grep -rn "session.commit\|session.rollback" backend/app/*/service.py | grep -v "dispatcher/"   # phải rỗng
grep -rnE "== \"(nuclei|gowitness|sqlmap|dalfox|vigolium|osmedeus)" backend/app workers/worker --include=*.py | grep -v "parser/\|runners/"   # phải rỗng
grep -rn "fetch(" frontend/src --include=*.tsx --include=*.ts | grep -v "src/lib/"   # phải rỗng
```

- Thứ tự tầng giữa module: rà soát theo bảng tầng trong [dependency-graph.md](../../docs/architecture/dependency-graph.md).
