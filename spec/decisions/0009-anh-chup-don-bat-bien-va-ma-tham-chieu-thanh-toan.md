# ADR-0009 — Ảnh chụp đơn hàng bất biến ở tầng CSDL và mã tham chiếu thanh toán duy nhất

**Ngày:** 2026-09-30 · **Trạng thái:** đề xuất — contract đã áp cùng ngày trên nhánh `feat/ord-webhook`
(xem "Nhật ký áp dụng"); review PR là bước duyệt · **Người quyết:** TV1

## Bối cảnh

Hiện thực tuần 4 của TV1 (đơn kiosk, webhook thanh toán, `revenue_owner`) lộ ra hai chỗ contract chưa
đủ:

1. **FR-REV-03 AC2** viết: *"Given có lệnh UPDATE cố tình thay đổi giá trị cột `revenue_owner` của
   đơn hàng đã tồn tại, When thực thi, Then tầng ứng dụng **và trigger CSDL** từ chối cập nhật."*
   `schema.sql` không có trigger nào như vậy — chỉ có COMMENT "không có đường cập nhật" và §13 mục 7
   (ràng buộc tầng domain). Một UPDATE viết tay trong psql, một script sửa dữ liệu, hay một hàm
   quên kiểm vẫn đổi được chủ sở hữu doanh thu hoặc số tiền của đơn đã bán. Vấn đề không riêng
   `revenue_owner`: `amount` (FR-ORD-06), `slot_rental_id`, `brand_id` cũng là ảnh chụp mà đổi đi là
   sai đối soát (FR-SLT-18, FR-REV-04).

2. **Webhook tìm payment bằng mã tham chiếu cổng gửi lại** (FR-ORD-14). Với đơn kiosk mã đó là
   `orders.payment_reference` (UNIQUE), nhưng phiên thuê slot (ADR-0008) không có cột tương ứng — mã
   nằm ở `payments.provider_reference`, cột không có ràng buộc duy nhất. Hai payment cùng mã là hợp
   lệ ở tầng CSDL, và khi đó webhook không biết ghi nhận tiền cho payment nào.

## Phương án đã cân nhắc

1. **Chỉ kiểm ở tầng ứng dụng.** Không đổi contract. Không đáp ứng chữ "và trigger CSDL" của
   FR-REV-03 AC2; lỗ ở mục 2 phụ thuộc việc mọi người tạo payment đều nhớ sinh mã duy nhất.
2. **Trigger chặn UPDATE cột ảnh chụp trên `orders` + unique index `payments (provider,
   provider_reference)`.** Đúng chữ FR-REV-03, và biến "một mã một payment" thành bất biến CSDL.
3. **REVOKE UPDATE trên các cột ảnh chụp cho role `scent_app`.** Chặn được ứng dụng nhưng không chặn
   superuser lúc dev — đúng lý do `audit_logs` dùng cả REVOKE lẫn trigger (schema.sql §11). Có thể
   bổ sung sau, không thay được trigger.

## Quyết định

Chọn **phương án 2**.

| Thay đổi | Chi tiết |
|---|---|
| `fn_orders_snapshot_immutable` + `trg_orders_snapshot_immutable` (BEFORE UPDATE ON orders) | Từ chối khi đổi `brand_id`, `slot_rental_id`, `revenue_owner`, `machine_id`, `slot_id`, `fragrance_product_id`, `product_name_snapshot`, `amount`, `currency`, `payment_reference`, `idempotency_key`. Lỗi `check_violation` mang tên ràng buộc `chk_order_snapshot_immutable`. Cột trạng thái (`status`, `paid_at`, `needs_manual_review`…) vẫn cập nhật bình thường |
| `uq_payment_provider_reference` | `UNIQUE (provider, provider_reference) WHERE provider_reference IS NOT NULL` |
| COMMENT `payments.provider_reference` | Đơn kiosk: bằng `orders.payment_reference`. Phiên thuê slot: mã riêng cho MỖI payment (`CHK-YYYYMMDD-XXXXXX`) |

Không thêm mã lỗi, không thêm hằng ngưỡng. Không đổi `openapi.yaml`.

## Hệ quả

**Mã nguồn:** `OrdQueries.applyTransition` chỉ ghi cột trạng thái — trigger là lưới đỡ, không phải
đường chính. Phiên thuê slot (TV3, tuần 5) sinh mã bằng `newPaymentReference('CHK', …)` từ
`modules/ord/index.ts` cho mỗi payment; thanh toán lại sau khi payment trước `FAILED` cần mã mới.

**Test người tự viết:** nhóm "quy kết `revenue_owner`" (`spec/testing.md`) nay có thể chứng minh
FR-REV-03 AC2 thẳng ở CSDL: `UPDATE orders SET revenue_owner = 'PLATFORM'` phải bị từ chối với
`chk_order_snapshot_immutable`. Agent không viết test đó.

**Dữ liệu cũ:** không có — trigger chỉ chặn UPDATE về sau; index mới tạo được trên dữ liệu hiện có vì
payment của đơn kiosk mang `payment_reference` vốn đã duy nhất.

## Nhật ký áp dụng — 2026-09-30

| Hạng mục | Đã làm |
|---|---|
| Migration | `1790760300000_order-snapshot-immutable.sql` |
| `schema.sql` | §10 thêm index; §10e mới cho trigger; §13 mục 7; COMMENT `payments.provider_reference` |
| Sinh lại | `data-dictionary.md`, `types.generated.ts` (chỉ COMMENT) |
| `README.md`, `erd.md`, `DB_DIAGRAM_MERMAID.md` | Ghi trigger và index mới |

**Đã kiểm trên PostgreSQL 16** (container riêng, không đụng `scent-db`/`scent-db-test`): chạy trọn trên
DB trống và DB có seed; Down rồi Up lại sạch; `pg_dump --schema-only` của DB nạp `schema.sql` trùng
khít DB chạy hết migration. `test_FR_ORD_06_order_price_immutability` chứng minh UPDATE `amount` bị
từ chối với `chk_order_snapshot_immutable`.
