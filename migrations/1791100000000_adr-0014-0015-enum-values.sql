-- Up Migration
--
-- ADR-0014, ADR-0015 — hai giá trị enum mới, tách khỏi file dùng chúng (docs/MIGRATIONS.md "Bẫy: thêm
-- giá trị mới vào enum"). File sau (1791100060000_*) KHÔNG ép chuỗi thành hai giá trị này.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.

-- ADR-0015 mục 7: máy đang dừng bán chờ bảo trì. Đặt sau NORMAL để thứ tự enum khớp FR-MCH-09.
ALTER TYPE machine_operating_mode ADD VALUE IF NOT EXISTS 'DRAINING' AFTER 'NORMAL';

-- ADR-0014 mục 2: chai đã tháo của hóa đơn báo không gia hạn, nằm trên phiếu trả hàng chờ thương hiệu nhận.
ALTER TYPE bottle_status ADD VALUE IF NOT EXISTS 'RETURNED_TO_BRAND';


-- Down Migration
--
-- PostgreSQL không xóa được giá trị khỏi enum (docs/MIGRATIONS.md). Lùi file này không làm gì; hai giá
-- trị ở lại nhưng không cột nào dùng tới sau khi lùi file 1791100060000_*.
SELECT 1;
