-- Up Migration
--
-- Contract của ba ADR rà soát nghiệp vụ 2026-10-13 (đã duyệt cùng ngày):
--   ADR-0013 — thương hiệu tự đăng ký, hợp đồng khung + phụ lục, kỳ chi trả doanh thu hằng tháng.
--   ADR-0014 — chủ động không gia hạn và phiếu trả hàng, đổi slot khi mua nhầm.
--   ADR-0015 — dừng bán an toàn: mỗi máy một đơn chờ thanh toán, job chờ lượt, tự tắt slot.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.
--
-- Hai giá trị enum mới (DRAINING, RETURNED_TO_BRAND) nằm ở file 1791100000000_* chạy ngay trước, và
-- có thể chạy chung một transaction với file này (docs/MIGRATIONS.md) — vì vậy ở đây CHỈ so sánh chúng
-- qua ::text, không ép chuỗi thành giá trị enum. Enum TẠO MỚI trong file này dùng ngay được.


-- =====================================================================================
-- ADR-0015 — dừng bán an toàn
-- =====================================================================================

-- Mỗi máy tối đa một đơn chờ thanh toán (FR-ORD-35). Dọn dữ liệu cũ trước khi tạo index: mỗi máy chỉ
-- giữ đơn mở mới nhất; các đơn mở cũ hơn (khách đã bỏ đi, job hết hạn chưa kịp quét) → EXPIRED, và
-- thanh toán PENDING của chúng → EXPIRED như job FR-ORD-16. Tiền về sau đó vẫn đi nhánh REFUND_PENDING.
WITH ranked AS (
    SELECT id, status,
           row_number() OVER (PARTITION BY machine_id ORDER BY created_at DESC, id DESC) AS rn
    FROM orders
    WHERE status IN ('CREATED', 'PENDING_PAYMENT')
), superseded AS (
    UPDATE orders o
    SET status = 'EXPIRED'
    FROM ranked r
    WHERE o.id = r.id AND r.rn > 1
    RETURNING o.id, o.brand_id, r.status AS from_status
), history AS (
    INSERT INTO order_status_histories (brand_id, order_id, from_status, to_status, reason, metadata,
                                        actor_type)
    SELECT brand_id, id, from_status, 'EXPIRED', 'ORDER_PAYMENT_TTL',
           jsonb_build_object('migration', '1791100060000_adr-0013-0014-0015-contract'), 'SYSTEM'
    FROM superseded
    RETURNING order_id
)
UPDATE payments p
SET status = 'EXPIRED'
FROM superseded s
WHERE p.order_id = s.id AND p.status = 'PENDING';

CREATE UNIQUE INDEX uq_machine_open_order ON orders (machine_id)
    WHERE status IN ('CREATED', 'PENDING_PAYMENT');

-- Job chờ lượt tối đa (FR-ORD-34) quét đúng tập này mỗi nhịp DSP.
CREATE INDEX idx_orders_paid_queue ON orders (paid_at)
    WHERE status = 'PAID';

-- Đếm lệnh khách hàng lỗi liên tiếp trên một slot (FR-ALR-04, FR-MCH-18).
CREATE INDEX idx_commands_slot_customer ON dispense_commands (slot_id, created_at)
    WHERE command_type = 'CUSTOMER';

COMMENT ON COLUMN machines.operating_mode IS
    'Trục chế độ, do người vận hành đặt (FR-MCH-09, FR-MNT-05/12). Độc lập với status. DRAINING '
    '(ADR-0015): đã yêu cầu bảo trì, không nhận đơn mới nhưng phục vụ nốt đơn đã trả tiền, rồi tự sang '
    'MAINTENANCE; chỉ tồn tại ở backend — thiết bị vẫn nhận chế độ NORMAL.';
COMMENT ON COLUMN orders.needs_manual_review IS
    'Đặt true khi đã thanh toán nhưng lượt xịt thất bại, không xác định, bị thiết bị từ chối (kể cả '
    'trước khi đèn sáng) hoặc chờ lượt quá PAID_QUEUE_MAX_SEC (FR-ORD-19, FR-ORD-34, ADR-0015). Không '
    'đặt với đơn FORFEITED. Dẫn vào luồng hoàn tiền thủ công (FR-ORD-20, ADR-0012).';


-- =====================================================================================
-- ADR-0013 — tự đăng ký, hợp đồng hai lớp, chi trả doanh thu
-- =====================================================================================

CREATE TYPE agreement_kind AS ENUM ('FRAMEWORK', 'ANNEX');

CREATE TYPE brand_payout_status AS ENUM ('DRAFT', 'CONFIRMED', 'PAID');

-- Hồ sơ pháp nhân và tài khoản nhận doanh thu (FR-BND-09, 10).
ALTER TABLE brands
    ADD COLUMN tax_code                   varchar(20),
    ADD COLUMN business_license_number    varchar(100),
    ADD COLUMN payout_account_ciphertext  bytea,
    ADD COLUMN payout_account_key_version smallint,
    ADD COLUMN legal_verified_at          timestamptz,
    ADD COLUMN legal_verified_by          uuid REFERENCES users (id),
    ADD CONSTRAINT chk_brand_legal_verified_pair
        CHECK ((legal_verified_at IS NULL) = (legal_verified_by IS NULL)),
    ADD CONSTRAINT chk_brand_legal_verified_has_tax_code
        CHECK (legal_verified_at IS NULL OR tax_code IS NOT NULL),
    ADD CONSTRAINT chk_brand_payout_account_key
        CHECK ((payout_account_ciphertext IS NULL) = (payout_account_key_version IS NULL));

COMMENT ON COLUMN brands.tax_code IS
    'Mã số thuế do Brand Admin khai (FR-BND-09). Bắt buộc trước khi Super Admin xác minh pháp nhân.';
COMMENT ON COLUMN brands.payout_account_ciphertext IS
    'Tài khoản doanh nghiệp nhận doanh thu (mã ngân hàng, số tài khoản, tên chủ tài khoản), mã hóa '
    'tầng ứng dụng (FR-BND-09, ADR-0013). Tài khoản của THƯƠNG HIỆU, không thuộc phạm vi NFR-DAT-04.';
COMMENT ON COLUMN brands.payout_account_key_version IS
    'Phiên bản khóa đã mã hóa payout_account_ciphertext — để xoay khóa mà vẫn đọc được bản cũ.';
COMMENT ON COLUMN brands.legal_verified_at IS
    'Super Admin ghi nhận đã xác minh pháp nhân (FR-BND-10). NULL thì kỳ chi trả không chuyển được '
    'sang PAID (BRAND_NOT_VERIFIED, FR-SLT-53). Không chặn việc thuê slot.';

-- Xác minh email của tài khoản tự đăng ký (FR-USR-06, 07). Một dòng mỗi tài khoản: gửi lại mã thì
-- ghi đè token_hash và expires_at. Tài khoản do Super Admin tạo KHÔNG có dòng nào ở đây và không phải
-- xác minh; có dòng mà verified_at NULL thì POST /rental-checkouts trả EMAIL_NOT_VERIFIED.
CREATE TABLE email_verifications (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid        NOT NULL REFERENCES users (id),
    email       citext      NOT NULL,
    token_hash  char(64)    NOT NULL,
    expires_at  timestamptz NOT NULL,
    verified_at timestamptz,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT uq_email_verification_user UNIQUE (user_id),
    CONSTRAINT uq_email_verification_token UNIQUE (token_hash),
    CONSTRAINT chk_email_verification_expiry CHECK (expires_at > created_at)
);

COMMENT ON TABLE email_verifications IS
    'Xác minh email của tài khoản Brand Admin tự đăng ký (FR-USR-07, ADR-0013). Không có dòng = tài '
    'khoản do Super Admin tạo, không cần xác minh. Có dòng, verified_at NULL = chưa xác minh.';
COMMENT ON COLUMN email_verifications.token_hash IS
    'SHA-256 (hex) của mã gửi trong email. Không lưu mã gốc (NFR-SEC-05).';
COMMENT ON COLUMN email_verifications.email IS
    'Địa chỉ đã gửi mã — đổi email thì phải xác minh lại địa chỉ mới.';

-- Hợp đồng khung có phiên bản (FR-SLT-48).
CREATE TABLE agreement_versions (
    id           uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    version      varchar(20)  NOT NULL,
    title        varchar(200) NOT NULL,
    content      text         NOT NULL,
    content_hash char(64)     NOT NULL,
    is_current   boolean      NOT NULL DEFAULT false,
    published_at timestamptz,
    created_by   uuid         NOT NULL REFERENCES users (id),
    created_at   timestamptz  NOT NULL DEFAULT now(),
    updated_at   timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT uq_agreement_version UNIQUE (version),
    CONSTRAINT chk_agreement_current_published
        CHECK (NOT is_current OR published_at IS NOT NULL)
);

-- Mỗi thời điểm đúng một phiên bản hiện hành (FR-SLT-48).
CREATE UNIQUE INDEX uq_agreement_version_current ON agreement_versions (is_current)
    WHERE is_current;

-- Đã công bố thì nội dung đứng yên: thương hiệu đồng ý trên mã băm của chính nội dung này (FR-SLT-49).
CREATE FUNCTION fn_agreement_versions_published_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF OLD.published_at IS NOT NULL
       AND (NEW.version      IS DISTINCT FROM OLD.version
            OR NEW.title        IS DISTINCT FROM OLD.title
            OR NEW.content      IS DISTINCT FROM OLD.content
            OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
            OR NEW.published_at IS DISTINCT FROM OLD.published_at)
    THEN
        RAISE EXCEPTION 'Hợp đồng khung % đã công bố, không sửa nội dung được (FR-SLT-48, ADR-0013)',
            OLD.version
            USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_agreement_published_immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agreement_versions_published_immutable
    BEFORE UPDATE ON agreement_versions
    FOR EACH ROW EXECUTE FUNCTION fn_agreement_versions_published_immutable();

COMMENT ON TABLE agreement_versions IS
    'Hợp đồng khung do nền tảng soạn, giống nhau cho mọi thương hiệu (ADR-0013). Bản nháp sửa được; '
    'đã công bố (published_at) thì nội dung bất biến. Đổi điều khoản = công bố phiên bản mới.';
COMMENT ON COLUMN agreement_versions.content_hash IS
    'SHA-256 (hex) của content — thứ được lưu lại trong agreement_acceptances làm bằng chứng.';

-- Bằng chứng đồng ý (FR-SLT-49, 50). CHỈ THÊM MỚI, như audit_logs.
CREATE TABLE agreement_acceptances (
    id                   uuid           PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             uuid           NOT NULL REFERENCES brands (id),
    accepted_by          uuid           NOT NULL REFERENCES users (id),
    kind                 agreement_kind NOT NULL,
    agreement_version_id uuid           NOT NULL REFERENCES agreement_versions (id),
    rental_checkout_id   uuid,
    content_hash         char(64)       NOT NULL,
    ip_address           inet           NOT NULL,
    user_agent           text,
    accepted_at          timestamptz    NOT NULL DEFAULT now(),

    CONSTRAINT chk_acceptance_annex_has_checkout
        CHECK ((kind = 'ANNEX') = (rental_checkout_id IS NOT NULL)),
    CONSTRAINT fk_acceptance_checkout_same_brand
        FOREIGN KEY (rental_checkout_id, brand_id) REFERENCES rental_checkouts (id, brand_id)
);

-- Một thương hiệu đồng ý mỗi phiên bản hợp đồng khung một lần; mỗi phiên thanh toán một phụ lục.
CREATE UNIQUE INDEX uq_acceptance_framework ON agreement_acceptances (brand_id, agreement_version_id)
    WHERE kind = 'FRAMEWORK';
CREATE UNIQUE INDEX uq_acceptance_annex ON agreement_acceptances (rental_checkout_id)
    WHERE kind = 'ANNEX';

CREATE FUNCTION fn_agreement_acceptances_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'agreement_acceptances chỉ cho phép thêm mới (FR-SLT-49, ADR-0013); % bị từ chối',
        TG_OP;
END;
$$;

CREATE TRIGGER trg_agreement_acceptances_append_only
    BEFORE UPDATE OR DELETE ON agreement_acceptances
    FOR EACH ROW EXECUTE FUNCTION fn_agreement_acceptances_append_only();

REVOKE UPDATE, DELETE, TRUNCATE ON agreement_acceptances FROM scent_app;

COMMENT ON TABLE agreement_acceptances IS
    'Bằng chứng thương hiệu đồng ý hợp đồng khung (FRAMEWORK) hoặc phụ lục của một phiên thanh toán '
    '(ANNEX) — ADR-0013. Chỉ thêm mới: trigger và REVOKE như audit_logs.';
COMMENT ON COLUMN agreement_acceptances.agreement_version_id IS
    'FRAMEWORK: phiên bản được đồng ý. ANNEX: phiên bản hợp đồng khung mà phụ lục thuộc về '
    '(= rental_checkouts.agreement_version_id).';
COMMENT ON COLUMN agreement_acceptances.content_hash IS
    'SHA-256 (hex) của đúng văn bản người dùng đã thấy: nội dung hợp đồng khung, hoặc phụ lục sinh '
    'từ ảnh chụp giá của các hóa đơn trong phiên (FR-SLT-50).';

-- Phiên thanh toán gắn với phiên bản hợp đồng khung đang hiện hành lúc tạo (FR-SLT-49, 50).
ALTER TABLE rental_checkouts
    ADD COLUMN agreement_version_id uuid REFERENCES agreement_versions (id);

COMMENT ON COLUMN rental_checkouts.agreement_version_id IS
    'Hợp đồng khung hiện hành lúc tạo phiên — thương hiệu phải đã đồng ý phiên bản này '
    '(AGREEMENT_NOT_ACCEPTED). Phụ lục của phiên là phụ lục của phiên bản này. NULL với phiên tạo '
    'trước ADR-0013.';

-- Kỳ chi trả doanh thu hằng tháng (FR-SLT-52 ÷ 54).
CREATE TABLE brand_payouts (
    id                  uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id            uuid                NOT NULL REFERENCES brands (id),
    period_month        date                NOT NULL,
    status              brand_payout_status NOT NULL DEFAULT 'DRAFT',
    currency            char(3)             NOT NULL DEFAULT 'VND',
    order_count         int                 NOT NULL DEFAULT 0,
    amount              numeric(19,4)       NOT NULL DEFAULT 0,
    confirmed_at        timestamptz,
    paid_at             timestamptz,
    paid_by             uuid                REFERENCES users (id),
    transfer_reference  varchar(100),
    dispute_note        text,
    disputed_at         timestamptz,
    disputed_by         uuid                REFERENCES users (id),
    dispute_response    text,
    dispute_resolved_at timestamptz,
    dispute_resolved_by uuid                REFERENCES users (id),
    created_at          timestamptz         NOT NULL DEFAULT now(),
    updated_at          timestamptz         NOT NULL DEFAULT now(),

    CONSTRAINT uq_brand_payout_period UNIQUE (brand_id, period_month),
    CONSTRAINT chk_payout_period_first_day
        CHECK (extract(day FROM period_month) = 1),
    CONSTRAINT chk_payout_amounts_nonnegative
        CHECK (amount >= 0 AND order_count >= 0),
    CONSTRAINT chk_payout_confirmed_at
        CHECK ((status = 'DRAFT') = (confirmed_at IS NULL)),
    CONSTRAINT chk_payout_paid
        CHECK ((status = 'PAID') = (paid_at IS NOT NULL)
               AND (status <> 'PAID' OR (paid_by IS NOT NULL AND transfer_reference IS NOT NULL))),
    CONSTRAINT chk_payout_dispute_fields
        CHECK (num_nulls(dispute_note, disputed_at, disputed_by) IN (0, 3)
               AND num_nulls(dispute_response, dispute_resolved_at, dispute_resolved_by) IN (0, 3)),
    CONSTRAINT chk_payout_dispute_on_confirmed
        CHECK (disputed_at IS NULL OR status <> 'DRAFT'),
    CONSTRAINT chk_payout_dispute_resolution_after_dispute
        CHECK (dispute_resolved_at IS NULL OR disputed_at IS NOT NULL),
    -- FR-SLT-54: khiếu nại chưa được trả lời thì không chuyển PAID.
    CONSTRAINT chk_payout_paid_dispute_resolved
        CHECK (status <> 'PAID' OR disputed_at IS NULL OR dispute_resolved_at IS NOT NULL)
);

CREATE INDEX idx_brand_payouts_status ON brand_payouts (status, period_month);

COMMENT ON TABLE brand_payouts IS
    'Kỳ chi trả doanh thu lượt xịt hằng tháng cho một thương hiệu (ADR-0013): DRAFT → CONFIRMED → '
    'PAID. Tính đơn revenue_owner = BRAND ở DISPENSED hoặc FORFEITED; không trừ phí cổng hay khoản đã '
    'hoàn cho khách (FR-SLT-18).';
COMMENT ON COLUMN brand_payouts.period_month IS
    'Ngày đầu tháng dương lịch của kỳ, theo giờ Việt Nam (Asia/Ho_Chi_Minh).';
COMMENT ON COLUMN brand_payouts.amount IS
    'DRAFT: số cộng dồn tạm, tính lại mỗi lần cập nhật. Từ CONFIRMED trở đi: số đã khóa, không đổi.';
COMMENT ON COLUMN brand_payouts.transfer_reference IS
    'Mã giao dịch chuyển khoản Super Admin nhập khi chuyển PAID, sau khi xác thực lại (FR-SLT-53).';
COMMENT ON COLUMN brand_payouts.dispute_note IS
    'Khiếu nại số liệu của Brand Admin trên kỳ CONFIRMED (FR-SLT-54) — mỗi kỳ một khiếu nại.';


-- =====================================================================================
-- ADR-0014 — chủ động không gia hạn, phiếu trả hàng, đổi slot
-- =====================================================================================

CREATE TYPE bottle_return_method AS ENUM ('WAREHOUSE_PICKUP', 'SHIP_TO_BRAND');

ALTER TABLE slot_rentals
    ADD COLUMN non_renewal_requested_at timestamptz,
    ADD COLUMN non_renewal_requested_by uuid REFERENCES users (id),
    ADD COLUMN return_method            bottle_return_method,
    ADD COLUMN swapped_from_slot_id     uuid REFERENCES machine_slots (id),
    ADD COLUMN swapped_at               timestamptz,
    ADD CONSTRAINT chk_rental_non_renewal_fields
        CHECK (num_nulls(non_renewal_requested_at, non_renewal_requested_by, return_method) IN (0, 3)),
    ADD CONSTRAINT chk_rental_swap_fields
        CHECK ((swapped_from_slot_id IS NULL) = (swapped_at IS NULL)),
    ADD CONSTRAINT chk_rental_swap_other_slot
        CHECK (swapped_from_slot_id IS NULL OR swapped_from_slot_id <> slot_id);

COMMENT ON COLUMN slot_rentals.non_renewal_requested_at IS
    'Brand Admin báo không gia hạn (FR-EXP-23): hóa đơn không vào GRACE, không tính phí ân hạn, giữ '
    'ACTIVE/EXPIRING tới khi Inventory Staff tháo chai (FR-EXP-25). Rút lại trước ends_at thì về NULL '
    '(FR-EXP-24).';
COMMENT ON COLUMN slot_rentals.return_method IS
    'Cách nhận hàng trả về, chọn lúc báo không gia hạn (FR-EXP-23).';
COMMENT ON COLUMN slot_rentals.swapped_from_slot_id IS
    'Slot cũ khi hóa đơn đã đổi slot (FR-SLT-55). Khác NULL nghĩa là đã dùng lượt đổi duy nhất.';

-- Phiếu trả hàng (FR-EXP-26 ÷ 28). Một hóa đơn tối đa một phiếu.
CREATE TABLE bottle_returns (
    id               uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
    slot_rental_id   uuid                 NOT NULL,
    brand_id         uuid                 NOT NULL REFERENCES brands (id),
    return_method    bottle_return_method NOT NULL,
    shipping_address text,
    ready_at         timestamptz          NOT NULL,
    pickup_deadline  timestamptz          NOT NULL,
    reminder_sent_at timestamptz,
    handed_over_at   timestamptz,
    handed_over_by   uuid                 REFERENCES users (id),
    recipient_name   varchar(200),
    tracking_number  varchar(100),
    forfeited_at     timestamptz,
    created_by       uuid                 NOT NULL REFERENCES users (id),
    created_at       timestamptz          NOT NULL DEFAULT now(),
    updated_at       timestamptz          NOT NULL DEFAULT now(),

    CONSTRAINT uq_bottle_return_rental UNIQUE (slot_rental_id),
    CONSTRAINT uq_bottle_return_id_brand UNIQUE (id, brand_id),
    CONSTRAINT fk_bottle_return_rental_same_brand
        FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id),
    CONSTRAINT chk_bottle_return_deadline
        CHECK (pickup_deadline > ready_at),
    CONSTRAINT chk_bottle_return_ship_address
        CHECK (return_method <> 'SHIP_TO_BRAND' OR shipping_address IS NOT NULL),
    CONSTRAINT chk_bottle_return_handover_fields
        CHECK (num_nulls(handed_over_at, handed_over_by, recipient_name) IN (0, 3)),
    CONSTRAINT chk_bottle_return_shipped_has_tracking
        CHECK (return_method <> 'SHIP_TO_BRAND' OR handed_over_at IS NULL
               OR tracking_number IS NOT NULL),
    CONSTRAINT chk_bottle_return_closed_once
        CHECK (handed_over_at IS NULL OR forfeited_at IS NULL)
);

-- Job quá hạn nhận hàng (FR-EXP-28) quét đúng tập này.
CREATE INDEX idx_bottle_returns_pending ON bottle_returns (pickup_deadline)
    WHERE handed_over_at IS NULL AND forfeited_at IS NULL;
CREATE INDEX idx_bottle_returns_brand ON bottle_returns (brand_id, created_at);

COMMENT ON TABLE bottle_returns IS
    'Phiếu trả hàng khi thương hiệu chủ động không gia hạn (ADR-0014). Lập lúc Inventory Staff tháo '
    'chai (FR-EXP-26); đóng bằng bàn giao (FR-EXP-27) hoặc quá hạn nhận → chuyển sở hữu về nền tảng '
    'như thanh lý (FR-EXP-28). Chai trên phiếu trỏ về đây qua bottles.bottle_return_id.';
COMMENT ON COLUMN bottle_returns.pickup_deadline IS
    'ready_at + RETURN_PICKUP_MAX_DAYS. Báo trước cho Brand Admin 3 ngày (reminder_sent_at).';
COMMENT ON COLUMN bottle_returns.shipping_address IS
    'Địa chỉ gửi hàng khi SHIP_TO_BRAND — ảnh chụp lúc lập phiếu; phí vận chuyển thu ngoài hệ thống.';
COMMENT ON COLUMN bottle_returns.forfeited_at IS
    'Quá hạn nhận hàng: mọi chai trên phiếu chuyển owner = PLATFORM, status LIQUIDATED (FR-EXP-28).';

ALTER TABLE bottles
    ADD COLUMN bottle_return_id uuid,
    ADD CONSTRAINT fk_bottle_return_same_brand
        FOREIGN KEY (bottle_return_id, brand_id) REFERENCES bottle_returns (id, brand_id),
    -- So sánh qua ::text: RETURNED_TO_BRAND vừa thêm ở file trước, có thể chung transaction.
    ADD CONSTRAINT chk_bottle_returned_has_return
        CHECK (status::text <> 'RETURNED_TO_BRAND' OR bottle_return_id IS NOT NULL);

CREATE INDEX idx_bottles_return ON bottles (bottle_return_id)
    WHERE bottle_return_id IS NOT NULL;

COMMENT ON COLUMN bottles.bottle_return_id IS
    'Phiếu trả hàng chứa chai này (FR-EXP-26). Bắt buộc khi status = RETURNED_TO_BRAND.';


-- =====================================================================================
-- Chung
-- =====================================================================================

DO $$
DECLARE
    t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['email_verifications', 'agreement_versions', 'brand_payouts', 'bottle_returns']
    LOOP
        EXECUTE format(
            'CREATE TRIGGER trg_%1$s_set_updated_at
                 BEFORE UPDATE ON %1$I
                 FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at()', t
        );
    END LOOP;
END;
$$;


-- Down Migration

DROP INDEX IF EXISTS idx_bottles_return;
ALTER TABLE bottles
    DROP CONSTRAINT chk_bottle_returned_has_return,
    DROP CONSTRAINT fk_bottle_return_same_brand,
    DROP COLUMN bottle_return_id;
DROP TABLE bottle_returns;
ALTER TABLE slot_rentals
    DROP CONSTRAINT chk_rental_swap_other_slot,
    DROP CONSTRAINT chk_rental_swap_fields,
    DROP CONSTRAINT chk_rental_non_renewal_fields,
    DROP COLUMN swapped_at,
    DROP COLUMN swapped_from_slot_id,
    DROP COLUMN return_method,
    DROP COLUMN non_renewal_requested_by,
    DROP COLUMN non_renewal_requested_at;
DROP TYPE bottle_return_method;

DROP TABLE brand_payouts;
ALTER TABLE rental_checkouts DROP COLUMN agreement_version_id;
DROP TABLE agreement_acceptances;
DROP FUNCTION fn_agreement_acceptances_append_only();
DROP TABLE agreement_versions;
DROP FUNCTION fn_agreement_versions_published_immutable();
DROP TABLE email_verifications;
ALTER TABLE brands
    DROP CONSTRAINT chk_brand_payout_account_key,
    DROP CONSTRAINT chk_brand_legal_verified_has_tax_code,
    DROP CONSTRAINT chk_brand_legal_verified_pair,
    DROP COLUMN legal_verified_by,
    DROP COLUMN legal_verified_at,
    DROP COLUMN payout_account_key_version,
    DROP COLUMN payout_account_ciphertext,
    DROP COLUMN business_license_number,
    DROP COLUMN tax_code;
DROP TYPE brand_payout_status;
DROP TYPE agreement_kind;

COMMENT ON COLUMN orders.needs_manual_review IS
    'Đặt true khi đã thanh toán nhưng lượt xịt thất bại hoặc không xác định (FR-ORD-19). Dẫn vào '
    'luồng hoàn tiền và hỗ trợ (FR-ORD-20/21).';
COMMENT ON COLUMN machines.operating_mode IS
    'Trục chế độ, do người vận hành đặt (FR-MCH-09, FR-MNT-05/12). Độc lập với status.';
DROP INDEX IF EXISTS idx_commands_slot_customer;
DROP INDEX IF EXISTS idx_orders_paid_queue;
-- Đơn đã chuyển EXPIRED lúc Up không được mở lại: đó là dữ liệu nghiệp vụ, không phải lược đồ.
DROP INDEX IF EXISTS uq_machine_open_order;
