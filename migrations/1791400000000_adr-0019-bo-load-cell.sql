-- Up Migration
--
-- Contract ADR-0019 (đã duyệt 2026-10-28): máy không lắp load cell. Lượng còn lại của chai theo dõi
-- bằng số lượt xịt thành công × liều hiệu chuẩn (bottles.current_estimated_ml,
-- machine_slots.estimated_remaining_ml), nên bỏ mọi cột khối lượng đo được.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.
--
-- Các cột chỉ chứa NULL hoặc dữ liệu seed — không có dữ liệu thật cần giữ (ADR-0019, phương án 3).

ALTER TABLE bottles
    DROP COLUMN empty_weight_g,
    DROP COLUMN initial_measured_weight_g,
    DROP COLUMN current_measured_weight_g;

ALTER TABLE refill_sessions
    DROP COLUMN before_weight_g,
    DROP COLUMN after_weight_g;

ALTER TABLE dispense_results
    DROP COLUMN measured_quantity_ml;


-- Down Migration

-- Thêm lại ở cuối bảng, cho phép NULL; dữ liệu đã xóa không khôi phục được.
ALTER TABLE dispense_results
    ADD COLUMN measured_quantity_ml numeric(10,4);

ALTER TABLE refill_sessions
    ADD COLUMN before_weight_g numeric(14,4),
    ADD COLUMN after_weight_g  numeric(14,4);

ALTER TABLE bottles
    ADD COLUMN empty_weight_g            numeric(14,4),
    ADD COLUMN initial_measured_weight_g numeric(14,4),
    ADD COLUMN current_measured_weight_g numeric(14,4);
