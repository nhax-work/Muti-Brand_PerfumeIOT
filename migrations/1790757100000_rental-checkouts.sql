-- Up Migration
--
-- ADR-0008 — thanh toán một lần cho nhiều slot bằng phiên thanh toán (rental_checkouts).
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.
--
-- Mỗi slot vẫn là MỘT hóa đơn (slot_rentals) với ảnh chụp giá, số hóa đơn và vòng đời riêng — kích
-- hoạt khi lắp chai, hết hạn, ân hạn, gia hạn, thanh lý, hạn mức bồi thường đều tính theo từng slot.
-- Phiên thanh toán chỉ gom những hóa đơn tạo trong cùng một lần chọn: giữ chỗ chung, tổng tiền
-- chung, một thanh toán.
--
-- Thứ tự: bảng mới → chuyển hóa đơn đã có sang phiên → payments trỏ sang phiên → bỏ
-- slot_rentals.hold_expires_at → bất biến chéo bảng (constraint trigger) → trigger, quyền, COMMENT.

-- -------------------------------------------------------------------------------------
-- Phiên thanh toán
-- -------------------------------------------------------------------------------------

CREATE TABLE rental_checkouts (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id        uuid          NOT NULL REFERENCES brands (id),
    currency        char(3)       NOT NULL DEFAULT 'VND',
    total_amount    numeric(19,4) NOT NULL,
    hold_expires_at timestamptz   NOT NULL,
    paid_at         timestamptz,
    cancelled_at    timestamptz,
    created_by      uuid          NOT NULL REFERENCES users (id),
    created_at      timestamptz   NOT NULL DEFAULT now(),
    updated_at      timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_checkout_amount_nonnegative
        CHECK (total_amount >= 0),
    -- Đã thanh toán thì không hủy; tiền về sau khi đã hủy chỉ làm payment REFUND_PENDING, phiên
    -- không được khôi phục (FR-SLT-38 AC5).
    CONSTRAINT chk_checkout_paid_or_cancelled
        CHECK (paid_at IS NULL OR cancelled_at IS NULL)
);

-- Đích của các khóa ngoại cùng thương hiệu bên dưới (§10b của schema.sql).
ALTER TABLE rental_checkouts
    ADD CONSTRAINT uq_checkout_id_brand UNIQUE (id, brand_id);

CREATE INDEX idx_checkouts_brand ON rental_checkouts (brand_id, created_at);
-- Job hủy phiên hết giờ giữ chỗ (FR-SLT-39) quét đúng tập này mỗi lần chạy.
CREATE INDEX idx_checkouts_unpaid_hold ON rental_checkouts (hold_expires_at)
    WHERE paid_at IS NULL AND cancelled_at IS NULL;

-- -------------------------------------------------------------------------------------
-- Hóa đơn thuộc về một phiên
-- -------------------------------------------------------------------------------------

ALTER TABLE slot_rentals
    ADD COLUMN checkout_id uuid;

-- Chuyển dữ liệu: mỗi hóa đơn theo gói đã có (tạo sau ADR-0006, trước file này) thành một phiên một
-- hóa đơn. Dùng lại chính id hóa đơn làm id phiên để chuyển payments một-một mà không cần bảng ánh
-- xạ; hai id nằm ở hai bảng khác nhau nên không đụng nhau. Hóa đơn mô hình cũ (không gói) không có
-- phiên — checkout_id giữ NULL.
INSERT INTO rental_checkouts (id, brand_id, currency, total_amount, hold_expires_at, paid_at,
                              cancelled_at, created_by, created_at, updated_at)
SELECT id, brand_id, currency, total_amount, hold_expires_at, paid_at, cancelled_at, created_by,
       created_at, updated_at
  FROM slot_rentals
 WHERE rental_package_id IS NOT NULL;

UPDATE slot_rentals
   SET checkout_id = id
 WHERE rental_package_id IS NOT NULL;

ALTER TABLE slot_rentals
    ADD CONSTRAINT fk_rental_checkout_same_brand
        FOREIGN KEY (checkout_id, brand_id) REFERENCES rental_checkouts (id, brand_id);

-- Hóa đơn theo gói BẮT BUỘC thuộc một phiên: checkout_id thay chỗ hold_expires_at trong danh sách
-- cột phải đủ. Giờ giữ chỗ là thuộc tính của phiên, không còn nằm trên từng hóa đơn.
ALTER TABLE slot_rentals
    DROP CONSTRAINT chk_rental_package_snapshot_complete;
ALTER TABLE slot_rentals
    ADD CONSTRAINT chk_rental_package_snapshot_complete
        CHECK (
            rental_package_id IS NULL
            OR num_nulls(
                storage_plan_id, duration_months, monthly_rent_price, discount_percent,
                storage_monthly_price, storage_coverage_percent, storage_coverage_cap,
                rent_amount, storage_amount, total_amount, checkout_id
            ) = 0
        );

DROP INDEX idx_rentals_draft_unpaid_hold;
ALTER TABLE slot_rentals
    DROP COLUMN hold_expires_at;

CREATE INDEX idx_rentals_checkout ON slot_rentals (checkout_id)
    WHERE checkout_id IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- Thanh toán trỏ tới phiên, không tới từng hóa đơn (FR-SLT-37, FR-SLT-38)
-- -------------------------------------------------------------------------------------

ALTER TABLE payments
    ADD COLUMN rental_checkout_id uuid;

-- Phiên chuyển đổi ở trên mang đúng id hóa đơn cũ nên ánh xạ là một-một.
UPDATE payments
   SET rental_checkout_id = slot_rental_id
 WHERE slot_rental_id IS NOT NULL;

DROP INDEX uq_rental_payment_pending;
DROP INDEX idx_payments_rental;
ALTER TABLE payments
    DROP CONSTRAINT chk_payment_single_target,
    DROP CONSTRAINT fk_payment_rental_same_brand,
    DROP COLUMN slot_rental_id;

ALTER TABLE payments
    ADD CONSTRAINT chk_payment_single_target
        CHECK (num_nonnulls(order_id, rental_checkout_id) = 1),
    ADD CONSTRAINT fk_payment_checkout_same_brand
        FOREIGN KEY (rental_checkout_id, brand_id) REFERENCES rental_checkouts (id, brand_id);

-- Mỗi phiên tối đa một thanh toán đang chờ (FR-SLT-37 AC3).
CREATE UNIQUE INDEX uq_checkout_payment_pending ON payments (rental_checkout_id)
    WHERE rental_checkout_id IS NOT NULL AND status = 'PENDING';
CREATE INDEX idx_payments_checkout ON payments (rental_checkout_id)
    WHERE rental_checkout_id IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- Bất biến chéo bảng giữa phiên và các hóa đơn của nó
--
-- CHECK không nhìn sang bảng khác được, nên dùng constraint trigger HOÃN tới lúc COMMIT: trong
-- transaction, domain service tạo phiên rồi mới tạo hóa đơn (hoặc cập nhật phiên rồi mới cập nhật
-- hóa đơn), chỉ trạng thái cuối cùng bị kiểm. Ba điều được bảo đảm:
--   1. Phiên có ít nhất một hóa đơn.
--   2. total_amount của phiên = tổng total_amount các hóa đơn (FR-SLT-36) — số tiền webhook đối
--      chiếu là số của phiên, nên lệch ở đây là thu sai tiền.
--   3. Phiên và mọi hóa đơn của nó cùng đã thanh toán hoặc cùng chưa (FR-SLT-38), cùng đã hủy hoặc
--      cùng chưa (FR-SLT-39) — không có phiên đã trả tiền mà còn hóa đơn "chờ thanh toán".
-- -------------------------------------------------------------------------------------

CREATE FUNCTION fn_check_rental_checkout(p_checkout_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
    v_checkout    rental_checkouts%ROWTYPE;
    v_count       integer;
    v_total       numeric(19,4);
    v_out_of_sync integer;
BEGIN
    IF p_checkout_id IS NULL THEN
        RETURN;
    END IF;

    SELECT * INTO v_checkout FROM rental_checkouts WHERE id = p_checkout_id;
    IF NOT FOUND THEN
        -- Phiên đã bị xóa cùng transaction; khóa ngoại của hóa đơn tự chặn nếu còn hóa đơn trỏ tới.
        RETURN;
    END IF;

    SELECT count(*),
           coalesce(sum(total_amount), 0),
           count(*) FILTER (
               WHERE (paid_at IS NULL) <> (v_checkout.paid_at IS NULL)
                  OR (cancelled_at IS NULL) <> (v_checkout.cancelled_at IS NULL)
           )
      INTO v_count, v_total, v_out_of_sync
      FROM slot_rentals
     WHERE checkout_id = p_checkout_id;

    IF v_count = 0 THEN
        RAISE EXCEPTION 'Phiên thanh toán % không có hóa đơn nào (ADR-0008)', p_checkout_id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_checkout_has_invoices';
    END IF;
    IF v_total <> v_checkout.total_amount THEN
        RAISE EXCEPTION 'Phiên thanh toán %: tổng tiền % khác tổng các hóa đơn % (FR-SLT-36)',
            p_checkout_id, v_checkout.total_amount, v_total
            USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_checkout_total_matches_invoices';
    END IF;
    IF v_out_of_sync > 0 THEN
        RAISE EXCEPTION 'Phiên thanh toán %: % hóa đơn lệch trạng thái thanh toán/hủy với phiên '
            '(FR-SLT-38, FR-SLT-39)', p_checkout_id, v_out_of_sync
            USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_checkout_invoice_state_sync';
    END IF;
END;
$$;

CREATE FUNCTION fn_rental_checkout_consistency()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF TG_TABLE_NAME = 'rental_checkouts' THEN
        PERFORM fn_check_rental_checkout(NEW.id);
        RETURN NULL;
    END IF;

    -- slot_rentals: kiểm phiên mới, và cả phiên cũ khi hóa đơn rời khỏi nó (đổi checkout_id, xóa).
    IF TG_OP IN ('INSERT', 'UPDATE') THEN
        PERFORM fn_check_rental_checkout(NEW.checkout_id);
    END IF;
    IF TG_OP = 'DELETE'
       OR (TG_OP = 'UPDATE' AND OLD.checkout_id IS DISTINCT FROM NEW.checkout_id) THEN
        PERFORM fn_check_rental_checkout(OLD.checkout_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER trg_rental_checkouts_consistency
    AFTER INSERT OR UPDATE OF total_amount, paid_at, cancelled_at ON rental_checkouts
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_rental_checkout_consistency();

CREATE CONSTRAINT TRIGGER trg_slot_rentals_checkout_consistency
    AFTER INSERT OR DELETE OR UPDATE OF checkout_id, total_amount, paid_at, cancelled_at
    ON slot_rentals
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_rental_checkout_consistency();

-- -------------------------------------------------------------------------------------
-- updated_at và quyền (cùng hàm fn_set_updated_at ở §10c của schema.sql)
-- -------------------------------------------------------------------------------------

CREATE TRIGGER trg_rental_checkouts_set_updated_at
    BEFORE UPDATE ON rental_checkouts
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON rental_checkouts TO scent_app;

-- -------------------------------------------------------------------------------------
-- COMMENT
-- -------------------------------------------------------------------------------------

COMMENT ON TABLE rental_checkouts IS
    'Phiên thanh toán thuê slot (ADR-0008): một lần Brand Admin chọn một hoặc nhiều slot rồi trả '
    'tiền một lần. Mỗi slot vẫn là một hóa đơn (slot_rentals) có số hóa đơn, ảnh chụp giá và vòng '
    'đời riêng; phiên chỉ gom giữ chỗ, tổng tiền và thanh toán. Trạng thái suy ra từ paid_at và '
    'cancelled_at: cả hai NULL = chờ thanh toán.';
COMMENT ON COLUMN rental_checkouts.total_amount IS
    'Tổng total_amount của mọi hóa đơn trong phiên (FR-SLT-36), chỉ ghi một lần lúc tạo. Số tiền '
    'webhook đối chiếu (FR-SLT-38). trg_rental_checkouts_consistency kiểm lúc COMMIT.';
COMMENT ON COLUMN rental_checkouts.hold_expires_at IS
    'Hết giờ giữ chỗ cho MỌI slot trong phiên: lúc tạo + RENTAL_CHECKOUT_HOLD_MIN (FR-SLT-35). Quá '
    'mốc mà paid_at NULL thì phiên và mọi hóa đơn của nó chuyển CANCELLED (FR-SLT-39).';
COMMENT ON COLUMN rental_checkouts.paid_at IS
    'Thời điểm thanh toán được xác nhận (FR-SLT-38). Cùng transaction: mọi hóa đơn của phiên nhận '
    'paid_at và mỗi hóa đơn một số hóa đơn riêng.';
COMMENT ON COLUMN rental_checkouts.cancelled_at IS
    'Hết giờ giữ chỗ mà chưa thanh toán (FR-SLT-39). Cùng transaction: mọi hóa đơn của phiên → '
    'CANCELLED và payment PENDING của phiên → EXPIRED.';

COMMENT ON TABLE slot_rentals IS
    'Hóa đơn thuê slot: một lần thương hiệu mua gói thuê một slot (ADR-0006). Một hóa đơn ứng với '
    'đúng một slot; thương hiệu thuê 3 slot có 3 hóa đơn độc lập (BR-009), có thể thanh toán chung '
    'trong một phiên (rental_checkouts, ADR-0008). Đây là đường duy nhất nối thương hiệu với máy.';
COMMENT ON COLUMN slot_rentals.checkout_id IS
    'Phiên thanh toán sinh ra hóa đơn (ADR-0008). Bắt buộc với hóa đơn theo gói '
    '(chk_rental_package_snapshot_complete); NULL với hóa đơn mô hình cũ trước ADR-0006.';
COMMENT ON COLUMN slot_rentals.paid_at IS
    'Thời điểm thanh toán được xác nhận (FR-SLT-38) — ghi cùng lúc với rental_checkouts.paid_at của '
    'phiên. DRAFT + paid_at NULL = chờ thanh toán; DRAFT + paid_at khác NULL = chờ nạp hàng.';

COMMENT ON COLUMN payments.order_id IS
    'Đơn kiosk được thanh toán. Đúng một trong order_id, rental_checkout_id có giá trị '
    '(chk_payment_single_target).';
COMMENT ON COLUMN payments.rental_checkout_id IS
    'Phiên thanh toán thuê slot được thanh toán (FR-SLT-37, ADR-0008) — một thanh toán cho mọi hóa '
    'đơn trong phiên. Mỗi phiên tối đa một payment PENDING (uq_checkout_payment_pending).';


-- Down Migration
--
-- Chỉ dùng ở máy dev. Lược đồ trước file này không biểu diễn được phiên nhiều hóa đơn: thanh toán
-- của những phiên đó bị xóa, như cách 1790665960000 xử lý thanh toán hóa đơn khi lùi. Cột
-- slot_rentals.hold_expires_at khi khôi phục nằm ở cuối bảng thay vì trước paid_at.

DROP TRIGGER IF EXISTS trg_slot_rentals_checkout_consistency ON slot_rentals;
DROP TRIGGER IF EXISTS trg_rental_checkouts_consistency ON rental_checkouts;
DROP FUNCTION IF EXISTS fn_rental_checkout_consistency();
DROP FUNCTION IF EXISTS fn_check_rental_checkout(uuid);

-- payments trỏ lại từng hóa đơn
ALTER TABLE payments
    ADD COLUMN slot_rental_id uuid;

DELETE FROM payment_events
 WHERE payment_id IN (
     SELECT p.id
       FROM payments p
      WHERE p.rental_checkout_id IN (
          SELECT checkout_id FROM slot_rentals
           WHERE checkout_id IS NOT NULL
           GROUP BY checkout_id HAVING count(*) > 1));
DELETE FROM payments
 WHERE rental_checkout_id IN (
     SELECT checkout_id FROM slot_rentals
      WHERE checkout_id IS NOT NULL
      GROUP BY checkout_id HAVING count(*) > 1);
UPDATE payments p
   SET slot_rental_id = r.id
  FROM slot_rentals r
 WHERE r.checkout_id = p.rental_checkout_id;

DROP INDEX IF EXISTS idx_payments_checkout;
DROP INDEX IF EXISTS uq_checkout_payment_pending;
ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS fk_payment_checkout_same_brand,
    DROP CONSTRAINT IF EXISTS chk_payment_single_target,
    DROP COLUMN IF EXISTS rental_checkout_id;
ALTER TABLE payments
    ADD CONSTRAINT chk_payment_single_target
        CHECK (num_nonnulls(order_id, slot_rental_id) = 1),
    ADD CONSTRAINT fk_payment_rental_same_brand
        FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id);
CREATE UNIQUE INDEX uq_rental_payment_pending ON payments (slot_rental_id)
    WHERE slot_rental_id IS NOT NULL AND status = 'PENDING';
CREATE INDEX idx_payments_rental ON payments (slot_rental_id)
    WHERE slot_rental_id IS NOT NULL;

-- Giờ giữ chỗ quay về từng hóa đơn
ALTER TABLE slot_rentals
    ADD COLUMN hold_expires_at timestamptz;
UPDATE slot_rentals r
   SET hold_expires_at = c.hold_expires_at
  FROM rental_checkouts c
 WHERE c.id = r.checkout_id;

DROP INDEX IF EXISTS idx_rentals_checkout;
ALTER TABLE slot_rentals
    DROP CONSTRAINT IF EXISTS chk_rental_package_snapshot_complete,
    DROP CONSTRAINT IF EXISTS fk_rental_checkout_same_brand,
    DROP COLUMN IF EXISTS checkout_id;
ALTER TABLE slot_rentals
    ADD CONSTRAINT chk_rental_package_snapshot_complete
        CHECK (
            rental_package_id IS NULL
            OR num_nulls(
                storage_plan_id, duration_months, monthly_rent_price, discount_percent,
                storage_monthly_price, storage_coverage_percent, storage_coverage_cap,
                rent_amount, storage_amount, total_amount, hold_expires_at
            ) = 0
        );
CREATE INDEX idx_rentals_draft_unpaid_hold ON slot_rentals (hold_expires_at)
    WHERE status = 'DRAFT' AND paid_at IS NULL;

DROP TABLE IF EXISTS rental_checkouts;

COMMENT ON TABLE slot_rentals IS
    'Hóa đơn thuê slot: một lần thương hiệu mua gói thuê một slot (ADR-0006). Một hóa đơn ứng với '
    'đúng một slot; thương hiệu thuê 3 slot có 3 hóa đơn độc lập (BR-009). Đây là đường duy nhất nối '
    'thương hiệu với máy.';
COMMENT ON COLUMN slot_rentals.hold_expires_at IS
    'Hết giờ giữ chỗ: tạo hóa đơn + RENTAL_CHECKOUT_HOLD_MIN. Quá mốc mà paid_at NULL thì hóa đơn '
    'chuyển CANCELLED (FR-SLT-39).';
COMMENT ON COLUMN slot_rentals.paid_at IS
    'Thời điểm thanh toán được xác nhận (FR-SLT-38). DRAFT + paid_at NULL = chờ thanh toán; '
    'DRAFT + paid_at khác NULL = chờ nạp hàng.';
COMMENT ON COLUMN payments.order_id IS
    'Đơn kiosk được thanh toán. Đúng một trong order_id, slot_rental_id có giá trị '
    '(chk_payment_single_target).';
COMMENT ON COLUMN payments.slot_rental_id IS
    'Hóa đơn thuê slot được thanh toán (FR-SLT-37). Mỗi hóa đơn tối đa một payment PENDING '
    '(uq_rental_payment_pending).';
