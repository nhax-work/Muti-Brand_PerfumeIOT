-- Up Migration
--
-- Contract ADR-0029: thông báo cho nhân sự nền tảng không gắn thương hiệu — phân công cảnh báo mức máy
-- (FR-ALR-11) và phiếu bảo trì (FR-MNT-02). brand_id NULL nghĩa là thông báo nội bộ nền tảng.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.

ALTER TABLE notifications ALTER COLUMN brand_id DROP NOT NULL;

COMMENT ON COLUMN notifications.brand_id IS
    'Thương hiệu của sự kiện — để Super Admin lọc bằng chứng gửi (ADR-0017). NULL = thông báo nội bộ '
    'nền tảng, ví dụ phân công cảnh báo mức máy hay phiếu bảo trì (ADR-0029).';


-- Down Migration

-- Thông báo nội bộ không có thương hiệu để gán lại — xóa trước khi khôi phục NOT NULL.
DELETE FROM notifications WHERE brand_id IS NULL;
COMMENT ON COLUMN notifications.brand_id IS NULL;
ALTER TABLE notifications ALTER COLUMN brand_id SET NOT NULL;
