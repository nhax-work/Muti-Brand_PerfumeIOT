-- Up Migration
--
-- ADR-0009 — hai ràng buộc tầng CSDL mà luồng đơn hàng và webhook thanh toán (tuần 4) cần.
-- spec/contracts/schema.sql đã được cập nhật để mô tả trạng thái lược đồ sau file này.

-- -------------------------------------------------------------------------------------
-- (1) Ảnh chụp trên orders không sửa được (FR-REV-03 AC2, FR-ORD-05, FR-ORD-06, NFR-DAT-06)
--
-- FR-REV-03 AC2 đòi "tầng ứng dụng VÀ trigger CSDL từ chối cập nhật" revenue_owner. Trước file này
-- lược đồ chỉ có COMMENT "không có đường cập nhật" — một UPDATE viết tay trong psql, hay một hàm
-- quên kiểm, vẫn đổi được chủ sở hữu doanh thu của đơn đã bán. Trigger chặn mọi cột ảnh chụp, không
-- riêng revenue_owner: đổi amount hay slot_rental_id cũng làm sai đối soát y như vậy.
-- -------------------------------------------------------------------------------------

CREATE FUNCTION fn_orders_snapshot_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.brand_id              IS DISTINCT FROM OLD.brand_id
       OR NEW.slot_rental_id        IS DISTINCT FROM OLD.slot_rental_id
       OR NEW.revenue_owner         IS DISTINCT FROM OLD.revenue_owner
       OR NEW.machine_id            IS DISTINCT FROM OLD.machine_id
       OR NEW.slot_id               IS DISTINCT FROM OLD.slot_id
       OR NEW.fragrance_product_id  IS DISTINCT FROM OLD.fragrance_product_id
       OR NEW.product_name_snapshot IS DISTINCT FROM OLD.product_name_snapshot
       OR NEW.amount                IS DISTINCT FROM OLD.amount
       OR NEW.currency              IS DISTINCT FROM OLD.currency
       OR NEW.payment_reference     IS DISTINCT FROM OLD.payment_reference
       OR NEW.idempotency_key       IS DISTINCT FROM OLD.idempotency_key
    THEN
        RAISE EXCEPTION 'Đơn hàng %: cột ảnh chụp chỉ ghi một lần lúc tạo đơn (FR-REV-03, NFR-DAT-06)',
            OLD.id
            USING ERRCODE = 'check_violation', CONSTRAINT = 'chk_order_snapshot_immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_orders_snapshot_immutable
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION fn_orders_snapshot_immutable();

-- -------------------------------------------------------------------------------------
-- (2) Một mã tham chiếu gửi cổng thanh toán ứng với đúng một payment (FR-ORD-14, FR-SLT-38)
--
-- Webhook tìm payment bằng mã tham chiếu mà cổng gửi lại. Không có ràng buộc này thì hai payment
-- cùng mã là tình huống hợp lệ ở tầng CSDL, và webhook không biết ghi nhận tiền cho cái nào.
-- -------------------------------------------------------------------------------------

CREATE UNIQUE INDEX uq_payment_provider_reference ON payments (provider, provider_reference)
    WHERE provider_reference IS NOT NULL;

COMMENT ON COLUMN payments.provider_reference IS
    'Mã tham chiếu gửi cho cổng thanh toán, cổng gửi lại trong webhook (FR-ORD-14). Đơn kiosk: '
    'bằng orders.payment_reference. Phiên thuê slot: mã riêng cho MỖI payment. Duy nhất theo provider '
    '(uq_payment_provider_reference, ADR-0009).';


-- Down Migration

COMMENT ON COLUMN payments.provider_reference IS NULL;
DROP INDEX IF EXISTS uq_payment_provider_reference;
DROP TRIGGER IF EXISTS trg_orders_snapshot_immutable ON orders;
DROP FUNCTION IF EXISTS fn_orders_snapshot_immutable();
