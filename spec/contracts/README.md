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

```sql
-- Một hợp đồng hiệu lực trên mỗi slot (FR-SLT-02)
CREATE UNIQUE INDEX uq_slot_active_rental ON slot_rental (slot_id)
  WHERE status IN ('ACTIVE','EXPIRING','GRACE','LIQUIDATED');

-- Chống xử lý webhook trùng (FR-ORD-15)
CREATE UNIQUE INDEX uq_payment_event ON payment_event (provider, provider_event_id);

-- Một lệnh xịt hiệu lực trên mỗi đơn (FR-DSP-05)
CREATE UNIQUE INDEX uq_order_active_command ON dispense_command (order_id)
  WHERE status IN ('CREATED','SENT','ACKED');

-- Một chai hoạt động trên mỗi slot (FR-MCH-07)
CREATE UNIQUE INDEX uq_slot_active_bottle ON bottle (installed_slot_id)
  WHERE status IN ('INSTALLED','LOW');
```

## Cột không được NULL và không được sửa sau khi tạo

`order.brand_id` · `order.slot_rental_id` · `order.revenue_owner` · `order.price`
