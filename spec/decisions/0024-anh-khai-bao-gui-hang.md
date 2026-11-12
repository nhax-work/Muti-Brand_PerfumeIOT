# ADR-0024 — Ảnh lô hàng và kiện hàng khi khai báo gửi hàng

**Ngày:** 2026-11-12 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Khai báo gửi hàng (FR-INV-22, ADR-0017) hiện chỉ có số liệu: sản phẩm, số chai, dung tích chai, ngày
gửi dự kiến. Khi kho nhận hàng (FR-INV-24, 25), Inventory Staff chỉ có số liệu đó để đối chiếu với
thùng hàng thực tế. Nếu thiếu chai, chai vỡ hay hàng không đúng, không bên nào có bằng chứng hàng đã
được đóng gói ra sao trước khi rời tay thương hiệu, nên tranh chấp lệch số lượng (`DISCREPANCY`) chỉ
dựa vào lời của hai bên.

Khi thử luồng Brand Admin trên staging (2026-11-12), nhóm thống nhất yêu cầu thương hiệu chụp ảnh
**lô hàng trước khi đóng gói** (thấy rõ số chai và nhãn) và **kiện hàng đã đóng gói** khi khai báo.

Hạ tầng ảnh đã có từ ADR-0020 và ADR-0022: kho ảnh `MediaStorage`, bước kiểm tra và mã hóa lại ảnh,
đọc tệp multipart. Điều còn thiếu là chỗ lưu nhiều ảnh cho một khai báo.

Việc này **đổi lược đồ CSDL trong giai đoạn đóng băng code** (từ 08/11), nên cần ADR này được duyệt
trước khi merge.

## Phương án đã cân nhắc

1. **Thêm một cột `jsonb` danh sách URL vào `brand_shipment_declarations`.** Ít bảng hơn nhưng không
   ràng buộc được loại ảnh, người upload hay số lượng ở tầng CSDL; xóa một ảnh phải ghi đè cả mảng.
2. **Dùng lại `inventory_batches.authenticity_document_url`.** Sai thời điểm: lô chỉ có sau khi kho
   nhận hàng, còn ảnh cần có lúc khai báo, trước khi gửi.
3. **Bảng con `shipment_declaration_photos`, mỗi dòng một ảnh có loại.** **Chọn.** Đúng chuẩn hóa,
   đếm được số ảnh theo loại, xóa từng ảnh độc lập, có người upload và thời điểm.

## Quyết định

### 1. Lược đồ (`schema.sql`, migration mới)

```sql
CREATE TYPE shipment_photo_kind AS ENUM ('BEFORE_PACKING', 'PACKED');

CREATE TABLE shipment_declaration_photos (
    id              uuid                PRIMARY KEY DEFAULT gen_random_uuid(),
    declaration_id  uuid                NOT NULL REFERENCES brand_shipment_declarations (id)
                                            ON DELETE CASCADE,
    kind            shipment_photo_kind NOT NULL,
    url             text                NOT NULL,
    uploaded_by     uuid                NOT NULL REFERENCES users (id),
    created_at      timestamptz         NOT NULL DEFAULT now()
);
CREATE INDEX idx_shipment_photo_declaration
    ON shipment_declaration_photos (declaration_id, kind, created_at);
```

Phạm vi thương hiệu đi qua `declaration_id → brand_shipment_declarations.brand_id`, như các bảng con
khác.

### 2. Contract HTTP (`openapi.yaml`, tag INV)

| Thao tác | Mô tả |
|---|---|
| `POST /shipment-declarations/{id}/photos?kind=BEFORE_PACKING\|PACKED` | `multipart/form-data`, một trường `file`. Trả `ShipmentDeclaration` kèm danh sách ảnh. |
| `DELETE /shipment-declarations/{id}/photos/{photoId}` | Xóa một ảnh. Trả `ShipmentDeclaration`. |

- Quyền `inventory.declare`, chỉ trên khai báo của thương hiệu mình (khai báo của thương hiệu khác trả
  như không tồn tại, FR-AUTH-08 AC2).
- Chỉ thêm hoặc xóa ảnh khi khai báo còn `DECLARED`; sau khi kho đã nhận, ảnh là bằng chứng nên bị
  khóa — trả `SHIPMENT_ALREADY_PROCESSED` (409).
- Mỗi loại tối đa `SHIPMENT_PHOTO_MAX_PER_KIND` ảnh; vượt thì `VALIDATION_ERROR` trên trường `kind`.
- `ShipmentDeclaration` thêm `photos: ShipmentPhoto[]` (`id`, `kind`, `url`, `createdAt`) — mọi tài
  khoản đọc được khai báo đều thấy ảnh, gồm Inventory Staff khi tiếp nhận.
- `kind` đặt ở query thay vì trong form: `@fastify/multipart` chỉ đọc được trường đứng **trước** tệp,
  để ở query thì thứ tự trường không còn là chỗ dễ sai.

### 3. Bắt buộc ảnh

Web quản trị bắt thương hiệu chọn **ít nhất 1 ảnh mỗi loại** trước khi gửi khai báo; khai báo được
tạo trước rồi upload ảnh (giống ảnh sản phẩm, ADR-0020). Upload lỗi thì khai báo vẫn còn và thương
hiệu thêm ảnh lại được từ danh sách khai báo. Máy chủ **không** chặn tiếp nhận khi thiếu ảnh — kho vẫn
phải nhận được hàng đã tới; màn tiếp nhận hiện rõ "Thương hiệu chưa gửi ảnh" để nhân viên ghi chú khi
đối chiếu.

### 4. Xử lý và lưu ảnh

Giống ADR-0020 mục 2 (kiểm theo nội dung tệp, mã hóa lại WebP, bỏ metadata gồm GPS). Khóa
`shipments/{declarationId}-{sha256 rút gọn}.webp`. Xóa ảnh: xóa dòng trước, đối tượng sau (lỗi chỉ ghi
log). Ghi `AuditLog` `inv.shipment.photo_added` / `inv.shipment.photo_removed`.

Ảnh nằm trên cùng kho công khai với ảnh sản phẩm. Khóa chứa UUID của khai báo và mã băm nội dung nên
không đoán được, và URL chỉ trả cho người được xem khai báo. Ảnh gói hàng không chứa dữ liệu cá nhân;
nếu sau này cần riêng tư thật thì chuyển sang presigned URL như ADR-0020 đã để ngỏ, không đổi contract.

### 5. Ngưỡng mới (`constraints.md`, nhóm Tồn kho)

| Hằng | Giá trị đề xuất | FR |
|---|---|---|
| `SHIPMENT_PHOTO_MAX_PER_KIND` | 3 | FR-INV-22 |
| `SHIPMENT_PHOTO_MAX_BYTES` | 5242880 (5 MB) | FR-INV-22 |
| `SHIPMENT_PHOTO_MAX_EDGE_PX` | 1600 | FR-INV-22 |

Cạnh lớn hơn ảnh sản phẩm để đọc được nhãn chai trên ảnh chụp cả lô.

### 6. Mã lỗi

Không thêm mã. `SHIPMENT_ALREADY_PROCESSED` mở rộng mô tả sang thêm/xóa ảnh; `FILE_TOO_LARGE`,
`UNSUPPORTED_MEDIA_TYPE` thêm `SHIPMENT_PHOTO_MAX_BYTES` vào mô tả.

## Hệ quả

- **Contract:** `schema.sql` (1 enum, 1 bảng), `erd.md`, `data-dictionary.md`, `openapi.yaml`
  (2 thao tác, schema `ShipmentPhoto`, trường `photos`), `constraints.md`, `errors.md`. Migration
  `migrations/1791600000000_adr-0024-anh-khai-bao-gui-hang.sql`. Chạy `npm run db:types`,
  `npm run spec:generate`, `make test-contract`.
- **Sơ đồ SDD:** ERD trong `docs/diagrams/` thêm bảng mới.
- **API:** module INV thêm endpoint ảnh, đọc ảnh kèm khai báo; dùng chung `normalizeImage`,
  `readImageFile` (ADR-0022).
- **Web quản trị:** pop-up khai báo gửi hàng thêm hai ô ảnh bắt buộc; danh sách khai báo hiện số ảnh và
  cho bổ sung ảnh khi còn `DECLARED`; pop-up tiếp nhận của kho hiện ảnh.
- **Test:** `test_FR_INV_22_*` trên driver `local`: thêm ảnh từng loại, vượt số ảnh, sai loại tệp,
  khóa ảnh sau khi nhận, thương hiệu khác không thêm được, xóa ảnh dọn đối tượng.
