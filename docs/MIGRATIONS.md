# Migration

Công cụ: **node-pg-migrate**, migration viết bằng **SQL thuần**
(quyết định ở `spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`, khép lại mục
"Quyết định tuần 2" trong `DEFINITION_OF_DONE.md`).

Chọn SQL thuần vì dự án cần những thứ không ORM nào khai báo trực tiếp được: 4 partial unique
index, exclusion constraint `EXCLUDE USING gist` chống chồng lấn kỳ hạn thuê, `citext`, trigger
append-only cho `audit_logs`, và về sau là Row-Level Security.

## Dùng hằng ngày

```bash
make migrate          # = npm run db:migrate  — chạy hết migration chưa áp dụng
make seed             # = npm run db:seed     — nạp dữ liệu mẫu
npm run db:migrate:down   # lùi 1 bước, chỉ dùng ở máy dev
```

Kết nối đọc từ biến môi trường `DATABASE_URL` trong `.env` (xem `.env.example`).

## Ba quy tắc không được phá

1. **Chỉ thêm, không sửa.** Không bao giờ sửa, xóa hay gộp một file migration đã commit. Đổi
   schema nghĩa là thêm một file migration mới chồng lên file mới nhất (`spec/PROJECT.md` §3).
   File đầu tiên là `migrations/1789516800000_initial-schema.sql`.
2. **`schema.sql` là contract, không phải nguồn chạy.** Sau `0001_`, file
   `spec/contracts/schema.sql` trở thành *bản mô tả* trạng thái schema. Nó không tự động được áp
   dụng. Migration mới nào đổi schema thì phải cập nhật `schema.sql` cho khớp — và vì đó là
   contract đóng băng, việc này cần ADR duyệt trước.
3. **Kiểm trên DB sạch trước khi commit.** `make reset && make migrate` phải chạy trọn không lỗi.

## Bẫy: thêm giá trị mới vào enum

Dự án có 24 kiểu enum. Khi cần thêm một trạng thái mới, **phải tách làm hai file migration**:

```sql
-- File 1: chỉ thêm giá trị
ALTER TYPE order_status ADD VALUE 'PARTIALLY_REFUNDED';
```

```sql
-- File 2 (file riêng, chạy sau): mới được dùng giá trị đó
UPDATE orders SET status = 'PARTIALLY_REFUNDED' WHERE ...;
CREATE INDEX ... WHERE status = 'PARTIALLY_REFUNDED';
```

Lý do: PostgreSQL không cho dùng một giá trị enum vừa thêm **trong cùng transaction** mà nó được
thêm. node-pg-migrate bọc mỗi migration trong một transaction, nên gộp hai việc vào một file sẽ
lỗi `unsafe use of new value ... of enum type` — thông báo khó đoán nếu chưa gặp bao giờ.

Cũng lưu ý: `ALTER TYPE ... ADD VALUE` **không có đường lùi**. PostgreSQL không hỗ trợ xóa một giá
trị khỏi enum. Phần Down của migration đó chỉ có thể để trống kèm ghi chú, hoặc phải tạo kiểu mới
và chuyển toàn bộ cột sang — rất đắt. Cân nhắc kỹ trước khi thêm.

## Tạo migration mới

```bash
npm run db:migrate:create -- ten-thay-doi-ngan-gon
```

Lệnh này sinh file `migrations/<timestamp>_ten-thay-doi-ngan-gon.sql` có sẵn hai khối
`-- Up Migration` và `-- Down Migration`. Luôn viết phần Down thật — không để trống.

## Thứ tự áp dụng

node-pg-migrate sắp xếp theo tiền tố timestamp trong tên file và ghi lại những gì đã chạy vào bảng
`pgmigrations`. `1789516800000_initial-schema.sql` là bản sao nguyên văn của
`spec/contracts/schema.sql`; các file sau do lệnh `db:migrate:create` sinh ra với timestamp lớn hơn
nên luôn chạy sau.

> Đừng đặt file migration trong `migrations/` với tên không có tiền tố timestamp, và đừng để file
> `.md` nào ở đó — node-pg-migrate coi **mọi** file trong thư mục là migration và sẽ cố `require`
> nó. Đó là lý do tài liệu này nằm ở `docs/` chứ không nằm cạnh các file migration.
