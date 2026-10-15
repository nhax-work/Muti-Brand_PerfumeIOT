-- Up Migration
--
-- ADR-0012 — phiếu khiếu nại hoàn tiền thủ công (PayOS không dùng API hoàn tiền tự động) và chỗ chứa
-- hợp lệ duy nhất cho tài khoản nhận hoàn tiền của khách (NFR-DAT-04 viết lại).
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.
--
-- Tạo enum MỚI rồi dùng ngay trong cùng file là an toàn: bẫy "unsafe use of new value" chỉ xảy ra
-- khi ALTER TYPE ... ADD VALUE vào một enum đã có (docs/MIGRATIONS.md).

CREATE TYPE refund_claim_status AS ENUM ('OPEN', 'REFUNDED', 'REJECTED', 'EXPIRED');

-- Khóa ngoại kép cần UNIQUE (id, brand_id) ở bảng cha (§10b).
ALTER TABLE orders
    ADD CONSTRAINT uq_order_id_brand UNIQUE (id, brand_id);

CREATE TABLE refund_claims (
    id                  uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id            uuid                NOT NULL,
    brand_id            uuid                NOT NULL REFERENCES brands (id),
    status              refund_claim_status NOT NULL DEFAULT 'OPEN',
    refund_order        boolean             NOT NULL,
    amount              numeric(19,4)       NOT NULL,
    currency            char(3)             NOT NULL,
    account_ciphertext  bytea,
    contact_ciphertext  bytea,
    pii_key_version     smallint            NOT NULL,
    consented_at        timestamptz         NOT NULL,
    assigned_to         uuid                REFERENCES users (id),
    assigned_at         timestamptz,
    payout_reference    varchar(100),
    resolution_note     text,
    resolved_by         uuid                REFERENCES users (id),
    created_at          timestamptz         NOT NULL DEFAULT now(),
    updated_at          timestamptz         NOT NULL DEFAULT now(),
    closed_at           timestamptz,
    account_purged_at   timestamptz,
    contact_purged_at   timestamptz,

    CONSTRAINT uq_refund_claim_order UNIQUE (order_id),
    CONSTRAINT fk_refund_claim_order_same_brand
        FOREIGN KEY (order_id, brand_id) REFERENCES orders (id, brand_id),
    CONSTRAINT chk_refund_claim_amount_positive
        CHECK (amount > 0),
    CONSTRAINT chk_refund_claim_open_has_account
        CHECK (status <> 'OPEN' OR account_ciphertext IS NOT NULL),
    CONSTRAINT chk_refund_claim_account_purged_on_close
        CHECK (status = 'OPEN' OR (account_ciphertext IS NULL AND account_purged_at IS NOT NULL)),
    CONSTRAINT chk_refund_claim_contact_purge
        CHECK (contact_purged_at IS NULL OR contact_ciphertext IS NULL),
    CONSTRAINT chk_refund_claim_closed_at
        CHECK ((status = 'OPEN') = (closed_at IS NULL)),
    CONSTRAINT chk_refund_claim_refunded_has_payout
        CHECK (status <> 'REFUNDED' OR payout_reference IS NOT NULL),
    CONSTRAINT chk_refund_claim_rejected_has_note
        CHECK (status <> 'REJECTED' OR resolution_note IS NOT NULL),
    CONSTRAINT chk_refund_claim_assignment
        CHECK ((assigned_to IS NULL) = (assigned_at IS NULL))
);

CREATE INDEX idx_refund_claims_status ON refund_claims (status, created_at);
CREATE INDEX idx_refund_claims_assigned ON refund_claims (assigned_to, status);
CREATE INDEX idx_refund_claims_contact_purge ON refund_claims (closed_at)
    WHERE contact_ciphertext IS NOT NULL;

CREATE TRIGGER trg_refund_claims_set_updated_at
    BEFORE UPDATE ON refund_claims
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

COMMENT ON TABLE refund_claims IS
    'Phiếu khiếu nại hoàn tiền thủ công (ADR-0012). Chỗ DUY NHẤT được lưu tài khoản ngân hàng của '
    'khách (NFR-DAT-04): mã hóa tầng ứng dụng, xóa khi phiếu đóng. Không ghi dữ liệu tài khoản vào '
    'audit_logs, log, payment_events hay notifications.';
COMMENT ON COLUMN refund_claims.refund_order IS
    'TRUE: hoàn cả tiền đơn (khách không nhận được lượt xịt) — ghi nhận hoàn thì đơn chuyển REFUNDED. '
    'FALSE: chỉ hoàn tiền chuyển khoản thừa (EXTRA_TRANSFER), trạng thái đơn giữ nguyên.';
COMMENT ON COLUMN refund_claims.amount IS
    'Số tiền phải hoàn, tính lúc tạo phiếu: tiền đơn (nếu refund_order) cộng các khoản chuyển thừa.';
COMMENT ON COLUMN refund_claims.account_ciphertext IS
    'Tài khoản nhận hoàn tiền (mã ngân hàng, số tài khoản, tên chủ tài khoản), AES-256-GCM tầng ứng '
    'dụng. Chỉ Operations Staff được phân công giải mã, sau khi xác thực lại. NULL ngay khi phiếu đóng.';
COMMENT ON COLUMN refund_claims.contact_ciphertext IS
    'Số điện thoại hoặc email liên hệ, mã hóa riêng. Giữ thêm REFUND_CLAIM_CONTACT_RETENTION_DAYS ngày '
    'sau khi đóng phiếu rồi job xóa.';
COMMENT ON COLUMN refund_claims.pii_key_version IS
    'Phiên bản khóa đã mã hóa hai khối trên — để xoay khóa mà vẫn đọc được phiếu cũ.';
COMMENT ON COLUMN refund_claims.consented_at IS
    'Thời điểm khách tick đồng ý xử lý dữ liệu cá nhân trên trang khiếu nại.';
COMMENT ON COLUMN refund_claims.payout_reference IS
    'Mã giao dịch chuyển khoản hoàn tiền nhân viên nhập khi ghi nhận đã hoàn. Bắt buộc khi REFUNDED.';

COMMENT ON TABLE payments IS
    'Không lưu thông tin thẻ của khách, và không lưu tài khoản ngân hàng của khách — tài khoản nhận '
    'hoàn tiền chỉ nằm trong refund_claims (NFR-DAT-04, ADR-0012). raw_response chỉ chứa phản hồi của '
    'cổng thanh toán đã loại dữ liệu nhạy cảm, kể cả tài khoản người chuyển.';


-- Down Migration

COMMENT ON TABLE payments IS
    'Không lưu bất kỳ thông tin thẻ hay tài khoản ngân hàng nào của khách (NFR-DAT-04). '
    'raw_response chỉ chứa phản hồi của cổng thanh toán đã loại dữ liệu nhạy cảm.';
DROP TABLE refund_claims;
ALTER TABLE orders DROP CONSTRAINT uq_order_id_brand;
DROP TYPE refund_claim_status;
