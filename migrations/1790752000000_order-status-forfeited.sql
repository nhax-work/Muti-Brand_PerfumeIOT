-- Up Migration
--
-- ADR-0007 — bước 1/2: thêm trạng thái FORFEITED cho đơn hàng (FR-ORD-10, FR-ORD-27): khách đã thanh
-- toán nhưng không bấm nút trong DISPENSE_PRESS_WINDOW_SEC, mất lượt, không hoàn tiền.
--
-- Chỉ thêm giá trị enum, không dùng nó ở đây (docs/MIGRATIONS.md, "Bẫy: thêm giá trị mới vào enum").
-- File 1790752060000 chạy sau không nhắc tới 'FORFEITED' nên an toàn dù hai file chạy chung một
-- transaction.

ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'FORFEITED';


-- Down Migration
--
-- Cố ý để trống: PostgreSQL không xóa được một giá trị khỏi enum. Dùng `make reset` nếu cần lược đồ
-- sạch (docs/MIGRATIONS.md).
SELECT 1;
