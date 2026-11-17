-- Up Migration
--
-- Contract ADR-0032: bằng chứng hình ảnh từ camera an ninh độc lập với máy (FR-ORD-38, FR-ORD-39,
-- FR-INV-38, FR-INV-39, FR-MCH-20). Module EVD sở hữu hai bảng mới.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.

CREATE TYPE evidence_kind AS ENUM ('VIDEO', 'IMAGE');
CREATE TYPE footage_request_status AS ENUM ('OPEN', 'FULFILLED', 'UNAVAILABLE');

ALTER TABLE machines
    ADD COLUMN camera_label varchar(100);

COMMENT ON COLUMN machines.camera_label IS
    'Nhãn camera an ninh quay máy này (ADR-0032, FR-MCH-20) — để người đi lấy hình biết tua đầu ghi nào.';

-- Khóa ngoại kép của footage_requests cần UNIQUE (id, brand_id) ở bảng cha (§10b).
ALTER TABLE refill_sessions
    ADD CONSTRAINT uq_refill_session_id_brand UNIQUE (id, brand_id);

CREATE TABLE camera_evidence (
    id                 uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    refund_claim_id    uuid          REFERENCES refund_claims (id),
    refill_session_id  uuid          REFERENCES refill_sessions (id),
    kind               evidence_kind NOT NULL,
    storage_key        text,
    content_type       varchar(50)   NOT NULL,
    size_bytes         integer       NOT NULL,
    sha256             char(64)      NOT NULL,
    camera_label       varchar(100)  NOT NULL,
    recorded_from      timestamptz   NOT NULL,
    recorded_to        timestamptz   NOT NULL,
    clock_offset_sec   integer       NOT NULL DEFAULT 0,
    note               text,
    uploaded_by        uuid          NOT NULL REFERENCES users (id),
    uploaded_at        timestamptz   NOT NULL DEFAULT now(),
    removed_by         uuid          REFERENCES users (id),
    removed_at         timestamptz,
    removed_reason     text,
    purged_at          timestamptz,

    CONSTRAINT chk_evidence_one_target
        CHECK (num_nonnulls(refund_claim_id, refill_session_id) = 1),
    CONSTRAINT chk_evidence_recorded_range
        CHECK (recorded_to > recorded_from),
    CONSTRAINT chk_evidence_size_positive
        CHECK (size_bytes > 0),
    CONSTRAINT chk_evidence_sha256
        CHECK (sha256 ~ '^[0-9a-f]{64}$'),
    CONSTRAINT chk_evidence_removed
        CHECK ((removed_by IS NULL) = (removed_at IS NULL)
               AND (removed_by IS NULL) = (removed_reason IS NULL)),
    CONSTRAINT chk_evidence_file_present
        CHECK ((storage_key IS NULL) = (purged_at IS NOT NULL OR removed_by IS NOT NULL))
);

CREATE INDEX idx_evidence_claim ON camera_evidence (refund_claim_id)
    WHERE refund_claim_id IS NOT NULL;
CREATE INDEX idx_evidence_refill ON camera_evidence (refill_session_id)
    WHERE refill_session_id IS NOT NULL;
CREATE INDEX idx_evidence_stored ON camera_evidence (uploaded_at)
    WHERE storage_key IS NOT NULL;

COMMENT ON TABLE camera_evidence IS
    'Đoạn video hoặc ảnh trích từ camera an ninh độc lập với máy, gắn vào phiếu khiếu nại hoặc phiếu nạp '
    '(ADR-0032). Tệp nằm ở kho riêng tư, chỉ đọc qua đường dẫn ký có hạn. Xóa tệp thì giữ dòng: ai tải, lúc '
    'nào, SHA-256, purged_at.';
COMMENT ON COLUMN camera_evidence.storage_key IS
    'Khóa đối tượng ở kho riêng tư. NULL khi tệp đã bị gỡ (removed_*) hoặc job xóa theo hạn (purged_at).';
COMMENT ON COLUMN camera_evidence.sha256 IS
    'SHA-256 (hex) của đúng tệp đã lưu, tính lúc tải lên — chứng minh hình không bị sửa sau đó.';
COMMENT ON COLUMN camera_evidence.recorded_from IS
    'Đầu khoảng ghi, theo giờ hệ thống (đã trừ clock_offset_sec). Phải giao khung giờ hệ thống đề xuất.';
COMMENT ON COLUMN camera_evidence.clock_offset_sec IS
    'Giờ trên hình trừ giờ thật, giây — người tải đọc dấu giờ trên hình và đối chiếu khi tải lên.';

CREATE TABLE footage_requests (
    id                 uuid                   PRIMARY KEY DEFAULT gen_random_uuid(),
    refill_session_id  uuid                   NOT NULL,
    brand_id           uuid                   NOT NULL,
    status             footage_request_status NOT NULL DEFAULT 'OPEN',
    reason             text                   NOT NULL,
    requested_by       uuid                   NOT NULL REFERENCES users (id),
    response_note      text,
    resolved_by        uuid                   REFERENCES users (id),
    created_at         timestamptz            NOT NULL DEFAULT now(),
    resolved_at        timestamptz,

    CONSTRAINT fk_footage_request_session_same_brand
        FOREIGN KEY (refill_session_id, brand_id) REFERENCES refill_sessions (id, brand_id),
    CONSTRAINT chk_footage_request_unavailable_has_note
        CHECK (status <> 'UNAVAILABLE' OR response_note IS NOT NULL),
    CONSTRAINT chk_footage_request_resolved
        CHECK ((status = 'OPEN') = (resolved_at IS NULL)
               AND (status = 'OPEN') = (resolved_by IS NULL))
);

CREATE UNIQUE INDEX uq_footage_request_open
    ON footage_requests (refill_session_id) WHERE status = 'OPEN';
CREATE INDEX idx_footage_requests_brand ON footage_requests (brand_id, created_at);

COMMENT ON TABLE footage_requests IS
    'Yêu cầu trích hình camera cho một phiếu nạp, do Brand Admin gửi (ADR-0032, FR-INV-39). Đóng FULFILLED '
    'khi đã gắn bằng chứng, UNAVAILABLE khi không có hình (bắt buộc response_note).';


-- Down Migration

DROP TABLE footage_requests;
DROP TABLE camera_evidence;
ALTER TABLE refill_sessions DROP CONSTRAINT uq_refill_session_id_brand;
ALTER TABLE machines DROP COLUMN camera_label;
DROP TYPE footage_request_status;
DROP TYPE evidence_kind;
