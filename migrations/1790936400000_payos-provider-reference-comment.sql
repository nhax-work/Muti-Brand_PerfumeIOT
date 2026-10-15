-- Up Migration
--
-- ADR-0016 — tích hợp PayOS. PayOS bắt orderCode là số nguyên và chỉ trả lại orderCode trong
-- webhook, nên với payment của PayOS, provider_reference là orderCode chứ không phải mã ORD-/CHK-.
-- Chỉ sửa COMMENT; lược đồ không đổi.

COMMENT ON COLUMN payments.provider_reference IS
    'Mã tham chiếu cổng thanh toán gửi lại trong webhook (FR-ORD-14). Cổng có mã riêng thì lưu mã của '
    'cổng — PayOS: orderCode (số nguyên, ADR-0016); cổng không có (mock) thì lưu mã hệ thống: đơn kiosk '
    'bằng orders.payment_reference, phiên thuê slot mã riêng cho MỖI payment. Duy nhất theo provider '
    '(uq_payment_provider_reference, ADR-0009).';


-- Down Migration

COMMENT ON COLUMN payments.provider_reference IS
    'Mã tham chiếu gửi cho cổng thanh toán, cổng gửi lại trong webhook (FR-ORD-14). Đơn kiosk: '
    'bằng orders.payment_reference. Phiên thuê slot: mã riêng cho MỖI payment. Duy nhất theo provider '
    '(uq_payment_provider_reference, ADR-0009).';
