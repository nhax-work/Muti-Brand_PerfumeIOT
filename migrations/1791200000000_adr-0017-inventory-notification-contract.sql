-- Up Migration
--
-- Contract ADR-0017 (đã duyệt 2026-10-24): giấy tờ chính hãng của lô, một phiếu nạp mở mỗi slot,
-- khai báo gửi hàng cùng thương hiệu với sản phẩm, bằng chứng gửi email thông báo.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.
--
-- Enum batch_authenticity_status TẠO MỚI trong file này nên dùng ngay được (docs/MIGRATIONS.md chỉ cấm
-- dùng giá trị vừa ADD VALUE vào enum đã có).


-- =====================================================================================
-- 1. Giấy tờ chính hãng của lô (FR-INV-33 ÷ 35)
-- =====================================================================================

CREATE TYPE batch_authenticity_status AS ENUM ('NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE inventory_batches
    ADD COLUMN authenticity_status           batch_authenticity_status NOT NULL DEFAULT 'NOT_SUBMITTED',
    ADD COLUMN authenticity_document_url     varchar(1000),
    ADD COLUMN authenticity_document_type    varchar(50),
    ADD COLUMN authenticity_submitted_by     uuid REFERENCES users (id),
    ADD COLUMN authenticity_submitted_at     timestamptz,
    ADD COLUMN authenticity_verified_by      uuid REFERENCES users (id),
    ADD COLUMN authenticity_verified_at      timestamptz,
    ADD COLUMN authenticity_rejection_reason text;

-- Bản hiện thực đầu (PR #38) lưu trạng thái trong supplier_info. Chép sang cột; KHÔNG xóa khóa khỏi
-- JSONB vì code INV hiện tại còn đọc — TV4 bỏ khi chuyển sang cột. Bản ghi thiếu dữ liệu cho trạng thái
-- của nó thì lùi về trạng thái gần nhất còn hợp lệ, để CHECK bên dưới không chặn migration.
WITH src AS (
    SELECT id,
           created_by,
           created_at,
           supplier_info ->> 'authenticityStatus'          AS status,
           NULLIF(supplier_info ->> 'documentUrl', '')     AS document_url,
           NULLIF(supplier_info ->> 'documentType', '')    AS document_type,
           CASE WHEN (supplier_info ->> 'submittedBy') ~* '^[0-9a-f-]{36}$'
                THEN (supplier_info ->> 'submittedBy')::uuid END AS submitted_by,
           CASE WHEN (supplier_info ->> 'submittedAt') ~ '^\d{4}-\d{2}-\d{2}'
                THEN (supplier_info ->> 'submittedAt')::timestamptz END AS submitted_at,
           CASE WHEN (supplier_info ->> 'verifiedBy') ~* '^[0-9a-f-]{36}$'
                THEN (supplier_info ->> 'verifiedBy')::uuid END AS verified_by,
           CASE WHEN (supplier_info ->> 'verifiedAt') ~ '^\d{4}-\d{2}-\d{2}'
                THEN (supplier_info ->> 'verifiedAt')::timestamptz END AS verified_at,
           NULLIF(supplier_info ->> 'rejectionReason', '') AS rejection_reason
    FROM inventory_batches
    WHERE supplier_info ? 'authenticityStatus'
), resolved AS (
    SELECT src.*,
           CASE
               WHEN document_url IS NULL THEN 'NOT_SUBMITTED'
               WHEN status = 'APPROVED' AND verified_by IS NOT NULL THEN 'APPROVED'
               WHEN status = 'REJECTED' AND verified_by IS NOT NULL
                    AND rejection_reason IS NOT NULL THEN 'REJECTED'
               ELSE 'PENDING'
           END AS final_status
    FROM src
)
UPDATE inventory_batches b
SET authenticity_status = r.final_status::batch_authenticity_status,
    authenticity_document_url  = CASE WHEN r.final_status <> 'NOT_SUBMITTED' THEN r.document_url END,
    authenticity_document_type = CASE WHEN r.final_status <> 'NOT_SUBMITTED' THEN r.document_type END,
    authenticity_submitted_by  = CASE WHEN r.final_status <> 'NOT_SUBMITTED'
                                      THEN COALESCE(r.submitted_by, r.created_by) END,
    authenticity_submitted_at  = CASE WHEN r.final_status <> 'NOT_SUBMITTED'
                                      THEN COALESCE(r.submitted_at, r.created_at) END,
    authenticity_verified_by   = CASE WHEN r.final_status IN ('APPROVED', 'REJECTED')
                                      THEN r.verified_by END,
    authenticity_verified_at   = CASE WHEN r.final_status IN ('APPROVED', 'REJECTED')
                                      THEN COALESCE(r.verified_at, r.created_at) END,
    authenticity_rejection_reason = CASE WHEN r.final_status = 'REJECTED'
                                         THEN r.rejection_reason END
FROM resolved r
WHERE b.id = r.id;

ALTER TABLE inventory_batches
    ADD CONSTRAINT chk_batch_authenticity_submitted CHECK (
        authenticity_status = 'NOT_SUBMITTED'
        OR (authenticity_document_url IS NOT NULL
            AND authenticity_submitted_by IS NOT NULL
            AND authenticity_submitted_at IS NOT NULL)),
    ADD CONSTRAINT chk_batch_authenticity_verified CHECK (
        (authenticity_status IN ('APPROVED', 'REJECTED'))
        = (authenticity_verified_by IS NOT NULL AND authenticity_verified_at IS NOT NULL)),
    ADD CONSTRAINT chk_batch_authenticity_rejection CHECK (
        (authenticity_status = 'REJECTED') = (authenticity_rejection_reason IS NOT NULL));

CREATE INDEX idx_batches_authenticity ON inventory_batches (authenticity_status, brand_id);

COMMENT ON COLUMN inventory_batches.authenticity_status IS
    'Xác minh giấy tờ chính hãng của lô (FR-INV-33 ÷ 35, ADR-0013, ADR-0017). Chỉ chai thuộc lô '
    'APPROVED mới được lắp vào slot (BATCH_NOT_APPROVED).';


-- =====================================================================================
-- 2. Một phiếu nạp đang mở mỗi slot (FR-INV-29, ADR-0017)
-- =====================================================================================

-- Dọn dữ liệu cũ: mỗi slot chỉ giữ phiếu STARTED mới nhất, phiếu cũ hơn → CANCELLED.
WITH ranked AS (
    SELECT id, row_number() OVER (PARTITION BY slot_id ORDER BY started_at DESC, id DESC) AS rn
    FROM refill_sessions
    WHERE status = 'STARTED'
)
UPDATE refill_sessions rs
SET status = 'CANCELLED', completed_at = now()
FROM ranked r
WHERE rs.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX uq_slot_open_refill_session ON refill_sessions (slot_id)
    WHERE status = 'STARTED';


-- =====================================================================================
-- 3. Khai báo gửi hàng cùng thương hiệu với sản phẩm (FR-INV-22 AC2, ADR-0017)
-- =====================================================================================

ALTER TABLE brand_shipment_declarations
    ADD CONSTRAINT fk_shipment_product_same_brand
    FOREIGN KEY (fragrance_product_id, brand_id) REFERENCES fragrance_products (id, brand_id);


-- =====================================================================================
-- 4. Bằng chứng gửi email thông báo (FR-ALR-16, ADR-0017)
-- =====================================================================================

ALTER TABLE notifications
    ADD COLUMN recipient_address   varchar(320),
    ADD COLUMN reference_id        varchar(100),
    ADD COLUMN provider_message_id varchar(255),
    ADD COLUMN delivery_attempts   int NOT NULL DEFAULT 0,
    ADD COLUMN last_attempt_at     timestamptz,
    ADD COLUMN last_error          text,
    ADD CONSTRAINT chk_notification_attempts_nonnegative CHECK (delivery_attempts >= 0);

CREATE INDEX idx_notifications_email_outbox ON notifications (status, last_attempt_at)
    WHERE channel = 'EMAIL' AND status IN ('PENDING', 'FAILED');

COMMENT ON COLUMN notifications.recipient_address IS
    'Hòm thư nhận tại thời điểm gửi (FR-ALR-16 AC2) — chụp lại, không đọc lại từ users.';
COMMENT ON COLUMN notifications.reference_id IS
    'Mã sự kiện nghiệp vụ sinh ra thông báo, ví dụ id phiên thanh toán thuê slot (FR-ALR-16 AC2).';
COMMENT ON COLUMN notifications.provider_message_id IS
    'Mã thư do dịch vụ email trả về khi nhận gửi (FR-ALR-16 AC2).';
COMMENT ON COLUMN notifications.delivery_attempts IS
    'Số lần đã thử gửi email. Job dừng tự thử khi đạt EMAIL_MAX_ATTEMPTS (FR-ALR-16 AC3).';
COMMENT ON COLUMN notifications.last_error IS
    'Phản hồi lỗi của dịch vụ email ở lần thử gần nhất (FR-ALR-16 AC2).';


-- Down Migration

DROP INDEX IF EXISTS idx_notifications_email_outbox;
ALTER TABLE notifications
    DROP CONSTRAINT chk_notification_attempts_nonnegative,
    DROP COLUMN last_error,
    DROP COLUMN last_attempt_at,
    DROP COLUMN delivery_attempts,
    DROP COLUMN provider_message_id,
    DROP COLUMN reference_id,
    DROP COLUMN recipient_address;

ALTER TABLE brand_shipment_declarations DROP CONSTRAINT fk_shipment_product_same_brand;

DROP INDEX IF EXISTS uq_slot_open_refill_session;

DROP INDEX IF EXISTS idx_batches_authenticity;
ALTER TABLE inventory_batches
    DROP CONSTRAINT chk_batch_authenticity_rejection,
    DROP CONSTRAINT chk_batch_authenticity_verified,
    DROP CONSTRAINT chk_batch_authenticity_submitted,
    DROP COLUMN authenticity_rejection_reason,
    DROP COLUMN authenticity_verified_at,
    DROP COLUMN authenticity_verified_by,
    DROP COLUMN authenticity_submitted_at,
    DROP COLUMN authenticity_submitted_by,
    DROP COLUMN authenticity_document_type,
    DROP COLUMN authenticity_document_url,
    DROP COLUMN authenticity_status;
DROP TYPE batch_authenticity_status;
