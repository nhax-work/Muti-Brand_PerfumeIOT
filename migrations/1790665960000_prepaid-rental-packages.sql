-- Up Migration
--
-- ADR-0006 — bước 2/2: thuê slot tự phục vụ theo gói trả trước, gói bảo quản và hóa đơn.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.
--
-- Thứ tự: kiểu mới → bảng danh mục → cột mới trên bảng cũ → bảng bồi thường → ràng buộc, index
-- → trigger updated_at → COMMENT (đổi thuật ngữ "hợp đồng" thành "hóa đơn", đánh dấu DEPRECATED).

-- -------------------------------------------------------------------------------------
-- Kiểu mới
-- -------------------------------------------------------------------------------------

CREATE TYPE storage_compensation_status AS ENUM ('PENDING', 'PAID');

-- -------------------------------------------------------------------------------------
-- Danh mục do Platform Super Admin cấu hình (FR-SLT-30, FR-SLT-31, FR-SLT-32)
-- -------------------------------------------------------------------------------------

CREATE TABLE rental_packages (
    id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
    name             varchar(100) NOT NULL,
    duration_months  smallint     NOT NULL,
    discount_percent numeric(5,2) NOT NULL DEFAULT 0,
    is_active        boolean      NOT NULL DEFAULT true,
    created_at       timestamptz  NOT NULL DEFAULT now(),
    updated_at       timestamptz  NOT NULL DEFAULT now(),

    CONSTRAINT chk_package_duration_positive
        CHECK (duration_months > 0),
    CONSTRAINT chk_package_discount_percent
        CHECK (discount_percent >= 0 AND discount_percent <= 100)
);

CREATE UNIQUE INDEX uq_rental_package_name ON rental_packages (name);

CREATE TABLE storage_plans (
    id               uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    name             varchar(100)  NOT NULL,
    description      text,
    monthly_price    numeric(19,4) NOT NULL,
    currency         char(3)       NOT NULL DEFAULT 'VND',
    coverage_percent numeric(5,2)  NOT NULL,
    coverage_cap     numeric(19,4) NOT NULL,
    is_active        boolean       NOT NULL DEFAULT true,
    created_at       timestamptz   NOT NULL DEFAULT now(),
    updated_at       timestamptz   NOT NULL DEFAULT now(),

    CONSTRAINT chk_storage_plan_price_nonnegative
        CHECK (monthly_price >= 0),
    CONSTRAINT chk_storage_plan_coverage_percent
        CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
    CONSTRAINT chk_storage_plan_cap_nonnegative
        CHECK (coverage_cap >= 0)
);

CREATE UNIQUE INDEX uq_storage_plan_name ON storage_plans (name);

ALTER TABLE machine_slots
    ADD COLUMN monthly_rent_price numeric(19,4),
    ADD CONSTRAINT chk_slot_rent_price_nonnegative
        CHECK (monthly_rent_price IS NULL OR monthly_rent_price >= 0);

-- -------------------------------------------------------------------------------------
-- Hóa đơn thuê slot (slot_rentals)
--
-- Mọi cột mới đều nullable ở tầng cột vì hóa đơn tạo theo mô hình cũ (seed, test hiện có) không có
-- gói. chk_rental_package_snapshot_complete bảo đảm hóa đơn CÓ gói thì phải đủ bộ chụp giá.
-- -------------------------------------------------------------------------------------

ALTER TABLE slot_rentals
    ALTER COLUMN price_per_spray DROP NOT NULL,
    ADD COLUMN invoice_number           varchar(30),
    ADD COLUMN rental_package_id        uuid REFERENCES rental_packages (id),
    ADD COLUMN storage_plan_id          uuid REFERENCES storage_plans (id),
    ADD COLUMN duration_months          smallint,
    ADD COLUMN monthly_rent_price       numeric(19,4),
    ADD COLUMN discount_percent         numeric(5,2),
    ADD COLUMN storage_monthly_price    numeric(19,4),
    ADD COLUMN storage_coverage_percent numeric(5,2),
    ADD COLUMN storage_coverage_cap     numeric(19,4),
    ADD COLUMN rent_amount              numeric(19,4),
    ADD COLUMN storage_amount           numeric(19,4),
    ADD COLUMN grace_fee_amount         numeric(19,4) NOT NULL DEFAULT 0,
    ADD COLUMN total_amount             numeric(19,4),
    ADD COLUMN hold_expires_at          timestamptz,
    ADD COLUMN paid_at                  timestamptz,
    ADD COLUMN cancelled_at             timestamptz,
    ADD CONSTRAINT uq_rental_invoice_number UNIQUE (invoice_number),
    ADD CONSTRAINT chk_rental_package_snapshot_complete
        CHECK (
            rental_package_id IS NULL
            OR num_nulls(
                storage_plan_id, duration_months, monthly_rent_price, discount_percent,
                storage_monthly_price, storage_coverage_percent, storage_coverage_cap,
                rent_amount, storage_amount, total_amount, hold_expires_at
            ) = 0
        ),
    ADD CONSTRAINT chk_rental_amounts_nonnegative
        CHECK (
            (monthly_rent_price IS NULL OR monthly_rent_price >= 0)
            AND (storage_monthly_price IS NULL OR storage_monthly_price >= 0)
            AND (storage_coverage_cap IS NULL OR storage_coverage_cap >= 0)
            AND (rent_amount IS NULL OR rent_amount >= 0)
            AND (storage_amount IS NULL OR storage_amount >= 0)
            AND grace_fee_amount >= 0
            AND (total_amount IS NULL OR total_amount >= 0)
        ),
    ADD CONSTRAINT chk_rental_percents
        CHECK (
            (discount_percent IS NULL OR (discount_percent >= 0 AND discount_percent <= 100))
            AND (storage_coverage_percent IS NULL
                 OR (storage_coverage_percent >= 0 AND storage_coverage_percent <= 100))
        ),
    ADD CONSTRAINT chk_rental_duration_positive
        CHECK (duration_months IS NULL OR duration_months > 0),
    -- FR-SLT-36: tổng = phí thuê + phí bảo quản + phí ân hạn chuyển sang.
    ADD CONSTRAINT chk_rental_total_amount
        CHECK (total_amount IS NULL OR total_amount = rent_amount + storage_amount + grace_fee_amount),
    -- FR-SLT-38: số hóa đơn cấp đúng lúc thanh toán thành công, không sớm hơn, không muộn hơn.
    ADD CONSTRAINT chk_rental_invoice_on_payment
        CHECK ((paid_at IS NULL) = (invoice_number IS NULL)),
    -- FR-SLT-06 AC4: đã thanh toán thì không hủy.
    --
    -- So sánh qua status::text, KHÔNG viết status <> 'CANCELLED': node-pg-migrate 9 mặc định
    -- --single-transaction, nên trên DB đã có lược đồ ban đầu thì file này chạy chung transaction
    -- với 1790665900000 vừa ADD VALUE 'CANCELLED'. Ép chuỗi 'CANCELLED' thành giá trị enum trong
    -- transaction đó sẽ lỗi "unsafe use of new value"; so sánh dạng text thì không ép gì cả.
    ADD CONSTRAINT chk_rental_cancelled_unpaid
        CHECK (status::text <> 'CANCELLED' OR paid_at IS NULL),
    ADD CONSTRAINT chk_rental_cancelled_at
        CHECK ((status::text = 'CANCELLED') = (cancelled_at IS NOT NULL));

-- Job hủy hóa đơn hết giờ giữ chỗ (FR-SLT-39) và job tự kích hoạt khi chờ nạp hàng quá lâu
-- (FR-SLT-42) quét đúng hai tập này mỗi lần chạy.
CREATE INDEX idx_rentals_draft_unpaid_hold ON slot_rentals (hold_expires_at)
    WHERE status = 'DRAFT' AND paid_at IS NULL;
CREATE INDEX idx_rentals_draft_awaiting_stock ON slot_rentals (paid_at)
    WHERE status = 'DRAFT' AND paid_at IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- Thanh toán hóa đơn đi chung bảng payments với đơn kiosk (FR-SLT-37, FR-SLT-38)
-- -------------------------------------------------------------------------------------

ALTER TABLE payments
    ALTER COLUMN order_id DROP NOT NULL,
    ADD COLUMN slot_rental_id uuid,
    ADD CONSTRAINT chk_payment_single_target
        CHECK (num_nonnulls(order_id, slot_rental_id) = 1),
    ADD CONSTRAINT fk_payment_rental_same_brand
        FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id);

CREATE UNIQUE INDEX uq_rental_payment_pending ON payments (slot_rental_id)
    WHERE slot_rental_id IS NOT NULL AND status = 'PENDING';
CREATE INDEX idx_payments_rental ON payments (slot_rental_id)
    WHERE slot_rental_id IS NOT NULL;

-- -------------------------------------------------------------------------------------
-- Bảo hiểm hàng hóa (FR-SLT-44, FR-SLT-45, FR-SLT-46)
-- -------------------------------------------------------------------------------------

ALTER TABLE bottles
    ADD CONSTRAINT uq_bottle_id_brand UNIQUE (id, brand_id);

CREATE TABLE storage_compensations (
    id                   uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
    brand_id             uuid                        NOT NULL REFERENCES brands (id),
    bottle_id            uuid                        NOT NULL,
    slot_rental_id       uuid                        NOT NULL,
    bottle_retail_price  numeric(19,4)               NOT NULL,
    coverage_percent     numeric(5,2)                NOT NULL,
    amount               numeric(19,4)               NOT NULL,
    currency             char(3)                     NOT NULL DEFAULT 'VND',
    status               storage_compensation_status NOT NULL DEFAULT 'PENDING',
    payout_reference     varchar(200),
    paid_by              uuid                        REFERENCES users (id),
    paid_at              timestamptz,
    created_at           timestamptz                 NOT NULL DEFAULT now(),
    updated_at           timestamptz                 NOT NULL DEFAULT now(),

    CONSTRAINT fk_compensation_bottle_same_brand
        FOREIGN KEY (bottle_id, brand_id) REFERENCES bottles (id, brand_id),
    CONSTRAINT fk_compensation_rental_same_brand
        FOREIGN KEY (slot_rental_id, brand_id) REFERENCES slot_rentals (id, brand_id),
    CONSTRAINT chk_compensation_amounts_nonnegative
        CHECK (bottle_retail_price >= 0 AND amount >= 0),
    CONSTRAINT chk_compensation_coverage_percent
        CHECK (coverage_percent >= 0 AND coverage_percent <= 100),
    CONSTRAINT chk_compensation_paid_fields
        CHECK ((status = 'PAID') = (paid_at IS NOT NULL AND paid_by IS NOT NULL
                                    AND payout_reference IS NOT NULL))
);

-- Một chai hư hỏng chỉ được bồi thường một lần.
CREATE UNIQUE INDEX uq_compensation_bottle ON storage_compensations (bottle_id);
CREATE INDEX idx_compensations_brand_status ON storage_compensations (brand_id, status, created_at);
CREATE INDEX idx_compensations_rental       ON storage_compensations (slot_rental_id);

-- -------------------------------------------------------------------------------------
-- Tự cập nhật updated_at cho ba bảng mới (cùng hàm fn_set_updated_at ở §10c của schema.sql)
-- -------------------------------------------------------------------------------------

CREATE TRIGGER trg_rental_packages_set_updated_at
    BEFORE UPDATE ON rental_packages
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_storage_plans_set_updated_at
    BEFORE UPDATE ON storage_plans
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_storage_compensations_set_updated_at
    BEFORE UPDATE ON storage_compensations
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ALTER DEFAULT PRIVILEGES ở §11 chỉ áp cho bảng do đúng role đó tạo. Cấp tường minh để không phụ
-- thuộc việc migration chạy bằng role nào.
GRANT SELECT, INSERT, UPDATE, DELETE
    ON rental_packages, storage_plans, storage_compensations TO scent_app;

-- -------------------------------------------------------------------------------------
-- COMMENT — thuật ngữ "hóa đơn thuê slot" và các phần DEPRECATED
-- -------------------------------------------------------------------------------------

COMMENT ON TABLE rental_packages IS
    'Gói thuê niêm yết: thời hạn theo tháng và tỷ lệ ưu đãi (FR-SLT-30, ADR-0006). Ngừng mở bán '
    'bằng is_active = false; hóa đơn đã mua không bị ảnh hưởng vì giá đã được chụp (FR-SLT-33).';
COMMENT ON TABLE storage_plans IS
    'Gói bảo quản — bảo hiểm hàng hóa (FR-SLT-31, ADR-0006). Mỗi hóa đơn bắt buộc chọn đúng một gói. '
    'Domain service phải giữ ít nhất một gói is_active = true (FR-SLT-31 AC3).';
COMMENT ON COLUMN storage_plans.coverage_percent IS
    'Tỷ lệ bồi thường tính trên giá bán lẻ chai (fragrance_products.full_bottle_retail_price).';
COMMENT ON COLUMN storage_plans.coverage_cap IS
    'Hạn mức bồi thường tối đa cộng dồn cho MỘT hóa đơn.';
COMMENT ON COLUMN machine_slots.monthly_rent_price IS
    'Giá thuê niêm yết mỗi tháng (FR-SLT-32). NULL = slot chưa mở cho thuê, không hiện trong danh '
    'sách slot trống (FR-SLT-19).';

COMMENT ON TABLE slot_rentals IS
    'Hóa đơn thuê slot: một lần thương hiệu mua gói thuê một slot (ADR-0006). Một hóa đơn ứng với '
    'đúng một slot; thương hiệu thuê 3 slot có 3 hóa đơn độc lập (BR-009). Đây là đường duy nhất nối '
    'thương hiệu với máy.';
COMMENT ON COLUMN slot_rentals.fragrance_product_id IS
    'Nullable ở tầng CSDL CHỈ để phục vụ cửa sổ giữa lúc thanh toán (FR-SLT-38) và lúc Brand Admin '
    'cấu hình slot (FR-SLT-27). Domain service phải chặn tạo đơn khi cột này NULL (FR-SLT-29). Xem §13.';
COMMENT ON COLUMN slot_rentals.price_per_spray IS
    'Nullable từ ADR-0006: Brand Admin đặt giá ở bước cấu hình slot sau khi thanh toán (FR-SLT-08). '
    'Domain service phải chặn tạo đơn khi cột này NULL (FR-SLT-29).';
COMMENT ON COLUMN slot_rentals.previous_rental_id IS
    'Hóa đơn liền trước khi đây là hóa đơn gia hạn (FR-SLT-12).';
COMMENT ON COLUMN slot_rentals.starts_at IS
    'Hóa đơn DRAFT: mốc TẠM để excl_slot_rental_overlap giữ được slot. Ghi đè bằng thời điểm thật khi '
    'kích hoạt — lắp chai đầu tiên (FR-SLT-24), quá RENTAL_MAX_STOCKING_DAYS (FR-SLT-42), hoặc nối '
    'tiếp hóa đơn cũ (FR-SLT-12).';
COMMENT ON COLUMN slot_rentals.ends_at IS
    'Hóa đơn DRAFT: mốc TẠM = starts_at + RENTAL_MAX_STOCKING_DAYS + số tháng (hóa đơn mới) hoặc '
    'starts_at + số tháng (hóa đơn gia hạn). Khi kích hoạt: starts_at + duration_months.';
COMMENT ON COLUMN slot_rentals.invoice_number IS
    'Số hóa đơn, cấp đúng lúc thanh toán thành công và duy nhất toàn hệ thống (FR-SLT-38).';
COMMENT ON COLUMN slot_rentals.rental_package_id IS
    'Gói thuê đã mua. NULL với hóa đơn tạo theo mô hình cũ trước ADR-0006.';
COMMENT ON COLUMN slot_rentals.monthly_rent_price IS
    'Ảnh chụp giá niêm yết của slot lúc tạo hóa đơn (FR-SLT-33). Cùng với duration_months, '
    'discount_percent, storage_* , rent_amount, storage_amount, total_amount: chỉ ghi một lần.';
COMMENT ON COLUMN slot_rentals.grace_fee_amount IS
    'Phí ân hạn của hóa đơn cũ chuyển sang hóa đơn gia hạn (FR-EXP-12, FR-SLT-36). 0 với hóa đơn mới.';
COMMENT ON COLUMN slot_rentals.hold_expires_at IS
    'Hết giờ giữ chỗ: tạo hóa đơn + RENTAL_CHECKOUT_HOLD_MIN. Quá mốc mà paid_at NULL thì hóa đơn '
    'chuyển CANCELLED (FR-SLT-39).';
COMMENT ON COLUMN slot_rentals.paid_at IS
    'Thời điểm thanh toán được xác nhận (FR-SLT-38). DRAFT + paid_at NULL = chờ thanh toán; '
    'DRAFT + paid_at khác NULL = chờ nạp hàng.';
COMMENT ON COLUMN slot_rentals.fixed_fee IS
    'DEPRECATED (ADR-0006): mô hình phí cố định theo kỳ đã bỏ. Giữ cột để không phá migration và test '
    'hiện có; hóa đơn mới để mặc định 0.';
COMMENT ON COLUMN slot_rentals.revenue_share_percent IS
    'DEPRECATED (ADR-0006): không còn ăn chia doanh thu lượt xịt. Giữ cột để không phá migration và '
    'test hiện có; hóa đơn mới để mặc định 0.';
COMMENT ON COLUMN slot_rentals.request_id IS
    'DEPRECATED (ADR-0006): luồng yêu cầu thuê và duyệt tay đã bãi bỏ. Hóa đơn mới để NULL.';

COMMENT ON TABLE slot_rental_requests IS
    'DEPRECATED (ADR-0006): luồng Brand Admin gửi yêu cầu thuê, Super Admin duyệt (FR-SLT-20 ÷ 26) '
    'đã bãi bỏ. Không ghi thêm bản ghi mới. Giữ bảng vì xóa là thay đổi phá hủy.';
COMMENT ON COLUMN slot_rental_requests.resulting_rental_id IS
    'DEPRECATED (ADR-0006). Trước đây: đặt khi yêu cầu được duyệt và hóa đơn DRAFT được tạo tự động.';

COMMENT ON COLUMN payments.order_id IS
    'Đơn kiosk được thanh toán. Đúng một trong order_id, slot_rental_id có giá trị '
    '(chk_payment_single_target).';
COMMENT ON COLUMN payments.slot_rental_id IS
    'Hóa đơn thuê slot được thanh toán (FR-SLT-37). Mỗi hóa đơn tối đa một payment PENDING '
    '(uq_rental_payment_pending).';

COMMENT ON COLUMN bottles.source_rental_id IS
    'Hóa đơn mà chai đang phục vụ tại thời điểm thanh lý (FR-EXP-16).';
COMMENT ON COLUMN dispense_commands.brand_id IS
    'Có giá trị với lệnh CUSTOMER (chép từ đơn). NULL với lệnh DIAGNOSTIC chạy trên slot chưa có '
    'hóa đơn nào.';

COMMENT ON TABLE storage_compensations IS
    'Khoản bồi thường khi chai của thương hiệu chuyển DAMAGED lúc nền tảng đang giữ (FR-SLT-44). '
    'Tiền chuyển ngoài hệ thống; Super Admin ghi nhận chi trả sau khi xác thực lại (FR-SLT-45).';
COMMENT ON COLUMN storage_compensations.slot_rental_id IS
    'Hóa đơn có gói bảo quản được áp: hóa đơn của slot chai đang lắp, hoặc — với chai trong kho — hóa '
    'đơn hiệu lực có coverage_percent cao nhất của thương hiệu. Hạn mức cộng dồn theo cột này.';
COMMENT ON COLUMN storage_compensations.amount IS
    'min(coverage_percent × bottle_retail_price, hạn mức còn lại của hóa đơn). Domain service tính.';


-- Down Migration
--
-- Chỉ dùng ở máy dev. Giá trị enum CANCELLED do file 1790665900000 thêm và không lùi được.

DROP TABLE IF EXISTS storage_compensations;
ALTER TABLE bottles DROP CONSTRAINT IF EXISTS uq_bottle_id_brand;

DROP INDEX IF EXISTS idx_payments_rental;
DROP INDEX IF EXISTS uq_rental_payment_pending;
-- Thanh toán hóa đơn không có chỗ đứng trong lược đồ cũ; phải xóa thì order_id mới NOT NULL lại được.
DELETE FROM payment_events
    WHERE payment_id IN (SELECT id FROM payments WHERE slot_rental_id IS NOT NULL);
DELETE FROM payments WHERE slot_rental_id IS NOT NULL;
ALTER TABLE payments
    DROP CONSTRAINT IF EXISTS fk_payment_rental_same_brand,
    DROP CONSTRAINT IF EXISTS chk_payment_single_target,
    DROP COLUMN IF EXISTS slot_rental_id,
    ALTER COLUMN order_id SET NOT NULL;

DROP INDEX IF EXISTS idx_rentals_draft_awaiting_stock;
DROP INDEX IF EXISTS idx_rentals_draft_unpaid_hold;
-- Lược đồ cũ bắt buộc có giá; hóa đơn chưa cấu hình được điền 0 để SET NOT NULL không lỗi.
UPDATE slot_rentals SET price_per_spray = 0 WHERE price_per_spray IS NULL;
ALTER TABLE slot_rentals
    DROP CONSTRAINT IF EXISTS chk_rental_cancelled_at,
    DROP CONSTRAINT IF EXISTS chk_rental_cancelled_unpaid,
    DROP CONSTRAINT IF EXISTS chk_rental_invoice_on_payment,
    DROP CONSTRAINT IF EXISTS chk_rental_total_amount,
    DROP CONSTRAINT IF EXISTS chk_rental_duration_positive,
    DROP CONSTRAINT IF EXISTS chk_rental_percents,
    DROP CONSTRAINT IF EXISTS chk_rental_amounts_nonnegative,
    DROP CONSTRAINT IF EXISTS chk_rental_package_snapshot_complete,
    DROP CONSTRAINT IF EXISTS uq_rental_invoice_number,
    DROP COLUMN IF EXISTS cancelled_at,
    DROP COLUMN IF EXISTS paid_at,
    DROP COLUMN IF EXISTS hold_expires_at,
    DROP COLUMN IF EXISTS total_amount,
    DROP COLUMN IF EXISTS grace_fee_amount,
    DROP COLUMN IF EXISTS storage_amount,
    DROP COLUMN IF EXISTS rent_amount,
    DROP COLUMN IF EXISTS storage_coverage_cap,
    DROP COLUMN IF EXISTS storage_coverage_percent,
    DROP COLUMN IF EXISTS storage_monthly_price,
    DROP COLUMN IF EXISTS discount_percent,
    DROP COLUMN IF EXISTS monthly_rent_price,
    DROP COLUMN IF EXISTS duration_months,
    DROP COLUMN IF EXISTS storage_plan_id,
    DROP COLUMN IF EXISTS rental_package_id,
    DROP COLUMN IF EXISTS invoice_number,
    ALTER COLUMN price_per_spray SET NOT NULL;

ALTER TABLE machine_slots
    DROP CONSTRAINT IF EXISTS chk_slot_rent_price_nonnegative,
    DROP COLUMN IF EXISTS monthly_rent_price;

DROP TABLE IF EXISTS storage_plans;
DROP TABLE IF EXISTS rental_packages;
DROP TYPE IF EXISTS storage_compensation_status;
