# Contract — ĐÓNG BĂNG

Bốn file trong thư mục này đóng băng cuối tuần 1. Agent **không được sửa**.

| File | Nội dung | Ai viết |
|---|---|---|
| `erd.md` | Sơ đồ thực thể quan hệ | TV1 + TV3 |
| `data-dictionary.md` | Bảng, cột, kiểu, ràng buộc, mô tả | TV3 |
| `schema.sql` | Lược đồ CSDL, index, ràng buộc | TV1 |
| `openapi.yaml` | Đặc tả REST API | TV1 + TV3 |
| `mqtt.md` | Topic, cấu trúc bản tin, chiều | TV2 + TV1 |

**Thứ tự làm:** ERD → data dictionary → schema.sql → openapi.yaml. MQTT làm song song.

## Muốn đổi contract

1. Dừng lại, không tự sửa
2. Mở file trong `spec/decisions/` mô tả vấn đề và phương án
3. TV1 duyệt
4. Sửa contract, chạy `make test-contract`, sửa hiện thực bị ảnh hưởng

## Index bắt buộc phải có trong schema.sql

> Cập nhật theo `spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`: tên bảng số nhiều,
> `command_status` dùng `ACKNOWLEDGED`, và quan hệ chai-đang-lắp nằm ở `machine_slots.active_bottle_id`.

```sql
-- Một hóa đơn thuê slot hiệu lực trên mỗi slot (FR-SLT-02)
CREATE UNIQUE INDEX uq_slot_active_rental ON slot_rentals (slot_id)
  WHERE status IN ('ACTIVE','EXPIRING','GRACE','LIQUIDATED');

-- Chống xử lý webhook trùng (FR-ORD-15)
CREATE UNIQUE INDEX uq_payment_event ON payment_events (provider, provider_event_id);

-- Một lệnh xịt hiệu lực trên mỗi đơn (FR-DSP-05)
CREATE UNIQUE INDEX uq_order_active_command ON dispense_commands (order_id)
  WHERE status IN ('CREATED','SENT','ACKNOWLEDGED');

-- Một chai hoạt động trên mỗi slot (FR-MCH-07)
CREATE UNIQUE INDEX uq_slot_active_bottle ON machine_slots (active_bottle_id)
  WHERE active_bottle_id IS NOT NULL;

-- Một thanh toán đang chờ trên mỗi phiên thanh toán thuê slot (FR-SLT-37, ADR-0008)
CREATE UNIQUE INDEX uq_checkout_payment_pending ON payments (rental_checkout_id)
  WHERE rental_checkout_id IS NOT NULL AND status = 'PENDING';
```

`excl_slot_rental_overlap` (exclusion constraint, tính cả hóa đơn `DRAFT`) là thứ giữ chỗ slot khi
thương hiệu đang thanh toán — hai thương hiệu không thể cùng giữ một slot (FR-SLT-35, ADR-0006). Với
giỏ nhiều slot, mọi hóa đơn tạo trong một transaction nên một slot bị chặn là cả giỏ bị từ chối
(ADR-0008).

Constraint trigger `trg_rental_checkouts_consistency` / `trg_slot_rentals_checkout_consistency`
(`schema.sql` §10d) kiểm lúc COMMIT: phiên có ít nhất một hóa đơn, tổng phiên = tổng các hóa đơn,
phiên và mọi hóa đơn cùng đã/chưa thanh toán và cùng đã/chưa hủy (ADR-0008).

## Cột không được NULL và không được sửa sau khi tạo

`order.brand_id` · `order.slot_rental_id` · `order.revenue_owner` · `order.price`

Ảnh chụp giá trên hóa đơn thuê slot (ADR-0006, FR-SLT-33) — không bắt buộc NOT NULL vì hóa đơn tạo
theo mô hình cũ không có gói, nhưng đã ghi thì không sửa: `slot_rentals.duration_months` ·
`monthly_rent_price` · `discount_percent` · `storage_monthly_price` · `storage_coverage_percent` ·
`storage_coverage_cap` · `rent_amount` · `storage_amount` · `grace_fee_amount` · `total_amount` ·
`invoice_number` · `checkout_id`

Phiên thanh toán (ADR-0008): `rental_checkouts.total_amount` chỉ ghi một lần lúc tạo phiên.
