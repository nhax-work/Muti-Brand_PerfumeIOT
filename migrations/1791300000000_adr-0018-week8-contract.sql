-- Up Migration
--
-- Contract ADR-0018 (đã duyệt 2026-10-26): ghi nhận chai hư hỏng (FR-SLT-44), ghi chú của yêu cầu bổ
-- sung, và đưa luật "COMPLETED phải có phiên nạp" (FR-RFQ-09) xuống CSDL.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.
--
-- Không thêm giá trị enum nào, nên so sánh enum ở đây không cần lo vấn đề transaction của
-- docs/MIGRATIONS.md; vẫn so qua ::text cho thống nhất với các CHECK có sẵn.


-- =====================================================================================
-- 1. Chai hư hỏng (FR-SLT-44, ADR-0018 mục 1)
-- =====================================================================================

ALTER TABLE bottles
    ADD COLUMN damaged_at    timestamptz,
    ADD COLUMN damage_reason text;

COMMENT ON COLUMN bottles.damaged_at IS
    'Thời điểm Inventory Staff ghi nhận chai hư hỏng (POST /bottles/{id}/mark-damaged, ADR-0018).';
COMMENT ON COLUMN bottles.damage_reason IS
    'Lý do hư hỏng do Inventory Staff nhập — căn cứ của khoản bồi thường (FR-SLT-44).';


-- =====================================================================================
-- 2. Yêu cầu bổ sung (FR-RFQ-01, FR-RFQ-09, ADR-0018 mục 2)
-- =====================================================================================

ALTER TABLE refill_requests
    ADD COLUMN note text;

COMMENT ON COLUMN refill_requests.note IS
    'Ghi chú của Brand Admin khi tạo yêu cầu (RefillRequestCreate.note).';

-- Chưa có API nào ghi COMPLETED trước file này; dữ liệu tay lệch luật (nếu có) lùi về CANCELLED để CHECK
-- không chặn migration.
UPDATE refill_requests
   SET status = 'CANCELLED'
 WHERE status::text = 'COMPLETED'
   AND refill_session_id IS NULL;

ALTER TABLE refill_requests
    ADD CONSTRAINT chk_refill_request_completed_has_session
        CHECK (status::text <> 'COMPLETED' OR refill_session_id IS NOT NULL);

COMMENT ON COLUMN refill_requests.refill_session_id IS
    'Phiên nạp thực tế liên kết (FR-RFQ-08). Chỉ đặt được COMPLETED khi cột này có giá trị '
    '(FR-RFQ-09) — chk_refill_request_completed_has_session.';


-- Down Migration

ALTER TABLE refill_requests
    DROP CONSTRAINT chk_refill_request_completed_has_session,
    DROP COLUMN note;

ALTER TABLE bottles
    DROP COLUMN damage_reason,
    DROP COLUMN damaged_at;
