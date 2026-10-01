-- Up Migration
--
-- ADR-0006 — bước 1/2: thêm trạng thái CANCELLED cho hóa đơn thuê slot (FR-SLT-06, FR-SLT-39).
--
-- Tách riêng khỏi 1790665960000_prepaid-rental-packages.sql theo docs/MIGRATIONS.md (mục "Bẫy: thêm
-- giá trị mới vào enum"). Lưu ý: node-pg-migrate 9 mặc định --single-transaction nên hai file vẫn có
-- thể chạy chung một transaction; file kia vì thế chỉ nhắc 'CANCELLED' qua status::text.
--
-- Không cần sửa uq_slot_active_rental hay excl_slot_rental_overlap: cả hai liệt kê trạng thái
-- tường minh nên CANCELLED tự động không chiếm slot.

ALTER TYPE slot_rental_status ADD VALUE IF NOT EXISTS 'CANCELLED';


-- Down Migration
--
-- Cố ý để trống. PostgreSQL không hỗ trợ xóa một giá trị khỏi enum; muốn lùi thật phải tạo kiểu
-- mới và chuyển toàn bộ cột slot_rentals.status sang — không đáng làm cho máy dev. Dùng `make reset`
-- nếu cần lược đồ sạch (docs/MIGRATIONS.md).
SELECT 1;
