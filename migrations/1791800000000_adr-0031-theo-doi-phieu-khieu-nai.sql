-- Up Migration
--
-- Contract ADR-0031: khách theo dõi phiếu khiếu nại bằng mã khiếu nại và email (FR-ORD-36, FR-ORD-37).
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.

ALTER TABLE refund_claims
    ADD COLUMN public_code char(10),
    ADD COLUMN locale      varchar(5) NOT NULL DEFAULT 'vi';

-- Phiếu đã có trước ADR này: sinh mã bằng random() của PostgreSQL. Phiếu mới do API sinh bằng bộ sinh
-- số mật mã (node:crypto). Điều kiện tham chiếu refund_claims.id buộc subquery chạy lại cho từng dòng.
UPDATE refund_claims rc
   SET public_code = (
       SELECT string_agg(substr('0123456789ABCDEFGHJKMNPQRSTVWXYZ', 1 + floor(random() * 32)::int, 1), '')
         FROM generate_series(1, 10)
        WHERE rc.id IS NOT NULL
   );

ALTER TABLE refund_claims
    ALTER COLUMN public_code SET NOT NULL,
    ADD CONSTRAINT uq_refund_claim_public_code UNIQUE (public_code),
    ADD CONSTRAINT chk_refund_claim_public_code
        CHECK (public_code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
    ADD CONSTRAINT chk_refund_claim_locale
        CHECK (locale IN ('vi', 'en'));

COMMENT ON COLUMN refund_claims.contact_ciphertext IS
    'Email liên hệ (phiếu trước ADR-0031 có thể là số điện thoại), mã hóa riêng. Giữ thêm '
    'REFUND_CLAIM_CONTACT_RETENTION_DAYS ngày sau khi đóng phiếu rồi job xóa.';
COMMENT ON COLUMN refund_claims.public_code IS
    'Mã khiếu nại khách dùng để tra cứu (ADR-0031): 10 ký tự Crockford Base32 ngẫu nhiên, hiển thị '
    'dạng KN-XXXXX-XXXXX. Không phải dữ liệu cá nhân — không bị xóa khi xóa khối tài khoản hay liên hệ.';
COMMENT ON COLUMN refund_claims.locale IS
    'Ngôn ngữ trang khiếu nại lúc khách gửi — email gửi khách theo ngôn ngữ này (FR-ORD-37).';


-- Down Migration

COMMENT ON COLUMN refund_claims.contact_ciphertext IS
    'Số điện thoại hoặc email liên hệ, mã hóa riêng. Giữ thêm REFUND_CLAIM_CONTACT_RETENTION_DAYS ngày '
    'sau khi đóng phiếu rồi job xóa.';

ALTER TABLE refund_claims
    DROP COLUMN locale,
    DROP COLUMN public_code;
