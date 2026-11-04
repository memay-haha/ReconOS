# Mẫu review PR

Chép mẫu này khi viết kết quả review cho một PR. Mức nghiêm trọng theo thang P0-P3 trong [SKILL.md](../SKILL.md).

## Tóm tắt

[Tổng quan phần đã review, 1-2 câu]

**Kích thước PR:** [Nhỏ/Vừa/Lớn] (~X dòng)
**Thời gian review:** [X phút]

## Điểm tốt

- [Phần làm tốt]
- [Pattern hoặc cách làm hay]
- [Cải thiện so với code cũ]

## Kiến trúc và hiệu năng

**Đánh giá kiến trúc**

- [ ] Separation of concerns: trách nhiệm chia rõ ràng?
- [ ] Trách nhiệm module: mỗi module có một mục đích?
- [ ] Hướng phụ thuộc: phụ thuộc hướng về phía ổn định?
- [ ] Khớp với pattern và quy ước đang có.

> Phân tích SOLID, anti-pattern, coupling chi tiết: [architecture-solid.md](../references/architecture-solid.md).

**Đánh giá hiệu năng**

- [ ] Độ phức tạp thuật toán: có O(n²) hoặc tệ hơn trên đầu vào lớn?
- [ ] Bộ nhớ: cấp phát lớn, rò rỉ, tăng không giới hạn?
- [ ] I/O: gọi API quá nhiều, ghi không gộp lô, thiếu cache?
- [ ] Truy vấn CSDL: rủi ro N+1, thiếu index, join chưa tối ưu?

> Hướng dẫn đầy đủ về Web Vitals, N+1, cache: [performance.md](../references/performance.md).

## Phải sửa

P0 🔴 **[Mô tả vấn đề]**
> [Vị trí code hoặc ví dụ]
> [Cách sửa đề xuất hoặc giải thích]

P1 🔴 **[Mô tả vấn đề]**
> [Chi tiết]

## Đề xuất quan trọng

P2 🟡 **[Mô tả vấn đề]**
> [Vì sao quan trọng]
> [Hướng xử lý đề xuất]

## Đề xuất nhỏ

P3 🟢 **[Đề xuất cải thiện nhỏ]**

💡 **[Cách làm khác để cân nhắc]**

## Ghi chú kiến thức

📚 [Ngữ cảnh đáng chia sẻ về X]

📚 [Lý do đằng sau quyết định thiết kế Y]

## Bảo mật

- [ ] Không hard-code secret.
- [ ] Có validate đầu vào.
- [ ] Có kiểm tra phân quyền.
- [ ] Không có rủi ro SQL injection, XSS.
- [ ] Có chống CSRF cho thao tác đổi trạng thái.
- [ ] Dữ liệu nhạy cảm không lộ qua log hoặc thông báo lỗi.
- [ ] Đã kiểm tra lỗ hổng thư viện phụ thuộc (`npm audit` / `pip audit` / `cargo audit`).

> Checklist đầy đủ về injection, XSS, CSRF, secret, xác thực: [security.md](../references/security.md).

## Độ phủ test

- [ ] Đã thêm hoặc cập nhật unit test.
- [ ] Đã phủ điều kiện biên.
- [ ] Đã test trường hợp lỗi.

## Kết luận

**[ ] ✅ Approve**: sẵn sàng merge.
**[ ] 💬 Comment**: góp ý nhỏ, merge được.
**[ ] 🔄 Request Changes**: phải xử lý vấn đề P0, P1.

## Mẫu chép nhanh

### Vấn đề chặn merge (P0, P1)

````markdown
P0 🔴 **[Tiêu đề]**

[Mô tả vấn đề]

**Vị trí:** `file.ts:123`

**Cách sửa đề xuất:**
```typescript
// Code đề xuất
```
````

### Đề xuất quan trọng (P2)

```markdown
P2 🟡 **[Tiêu đề]**

[Vì sao quan trọng]

**Cân nhắc:**
- Phương án A: [mô tả]
- Phương án B: [mô tả]
```

### Đề xuất nhỏ (P3)

```markdown
P3 🟢 **[Đề xuất]**

Không chặn merge, nhưng cân nhắc [cải thiện].
```

### Khen

```markdown
🎉 Làm tốt phần [việc cụ thể]!

[Vì sao tốt]
```

### Kiến thức

```markdown
📚 [Ghi chú kiến thức]

Để hiểu ngữ cảnh: [X] hoạt động như vậy vì [Y]. Không cần hành động, chỉ chia sẻ.
```
