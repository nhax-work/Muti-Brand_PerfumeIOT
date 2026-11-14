# ADR-0025 — Tự tạo chai khi tiếp nhận lô hàng

**Ngày:** 2026-11-12 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Luồng hàng hiện tại: thương hiệu khai báo gửi hàng (FR-INV-22) → Inventory Staff đối chiếu và tiếp
nhận (FR-INV-24, 25) → hệ thống tự tạo **lô** (FR-INV-26) → Super Admin duyệt giấy tờ lô (FR-INV-33,
34) → mở phiếu nạp, chọn **chai** trong kho để lắp (FR-INV-29 ÷ 32, 35).

Lô chỉ ghi `quantity_received`; **chai** thì chỉ sinh ra qua `POST /bottles` (FR-INV-02), đăng ký tay
từng chai một. Web quản trị không có màn hình đăng ký chai, nên khi thử luồng trên máy local
(2026-11-12), lô đã nhận 100 chai và đã duyệt giấy tờ nhưng ô "Chai mới" của phiếu nạp trống: không
có chai `IN_STOCK` nào của thương hiệu. Các lô seed có chai chỉ vì script seed tạo sẵn.

FR-INV-02 có từ trước luồng khai báo gửi hàng (ADR-0017), khi chai được nhập tay. Từ khi có khai báo,
lúc tiếp nhận hệ thống đã biết đủ để tạo chai: số chai thực nhận, dung tích mỗi chai
(`declared_bottle_volume_ml`), thương hiệu, sản phẩm và hạn dùng của lô. Bắt nhân viên kho gõ lại
100 mã chai là việc thừa và dễ sai.

## Phương án đã cân nhắc

1. **Giữ nguyên, thêm form đăng ký chai trên web quản trị.** Ít đổi contract nhưng giữ nguyên thao tác
   thủ công lặp N lần cho mỗi lô; lô có thể tồn tại mà không có chai.
2. **Thêm endpoint "sinh N chai cho lô" gọi riêng sau khi tiếp nhận.** Vẫn là một bước tay, và giữa
   hai bước có khoảng lô không có chai.
3. **Tạo chai ngay trong transaction tiếp nhận.** **Chọn.** Không thêm bước, không có lô nào đã nhận
   hàng mà thiếu chai; dữ liệu cần thiết đã có sẵn.

## Quyết định

### 1. Hành vi `POST /shipment-declarations/{id}/receive`

Khi `receivedQuantity = N > 0`, cùng transaction tạo lô thì tạo luôn `N` dòng `bottles`:

| Cột | Giá trị |
|---|---|
| `brand_id`, `fragrance_product_id`, `batch_id` | Theo lô vừa tạo |
| `owner` | `BRAND` (mặc định) |
| `status` | `IN_STOCK` (mặc định) |
| `identifier` | `{sku}-{batchNumber}-{số thứ tự}`, số thứ tự từ 1, đệm 0 ít nhất 3 chữ số (`TEST-1-001`); `N ≥ 1000` thì đệm theo số chữ số của `N` |
| `initial_volume_ml`, `current_estimated_ml` | `declared_bottle_volume_ml` của khai báo |
| `expires_at` | `expires_at` của lô |

- `batch_number` chỉ duy nhất theo `(brand_id, fragrance_product_id)`, còn mã chai phải duy nhất theo
  `brand_id` (`uq_bottle_brand_identifier`); ghép SKU (duy nhất trong thương hiệu) vào mã để hai sản
  phẩm cùng số lô không trùng mã chai.
- Mã sinh ra trùng chai đã có (thường là chai đăng ký tay trước đó) → `VALIDATION_ERROR` trên
  `batchNumber`, rollback cả khai báo, lô và chai. Nhân viên đổi số lô rồi xác nhận lại.
- Mã dài quá `varchar(150)` → `VALIDATION_ERROR` trên `batchNumber`, kiểm trước khi ghi.
- `receivedQuantity = 0` (FR-INV-25 AC3): không lô, không chai — như cũ.
- `AuditLog` của tiếp nhận ghi thêm `bottlesCreated`.

Response giữ nguyên (`{ declaration, batch }`); số chai bằng `batch.quantityReceived`.

### 2. Ngưỡng mới (`constraints.md`, nhóm Tồn kho)

| Hằng | Giá trị | FR |
|---|---|---|
| `SHIPMENT_RECEIVE_MAX_BOTTLES` | 2000 | FR-INV-26 |

Mỗi chai giờ là một dòng; ngưỡng chặn nhập nhầm số (thêm vài số 0) sinh hàng loạt dòng trong một
transaction. Vượt → `VALIDATION_ERROR` trên `receivedQuantity`.

### 3. FR-INV-02 giữ nguyên

`POST /bottles` vẫn dùng cho lô nhập tay (`POST /batches`, không qua khai báo) và chai lẻ bổ sung.

### 4. Lược đồ

Không đổi. Không có migration.

## Hệ quả

- **Contract:** `openapi.yaml` (mô tả `receiveShipmentDeclaration`, `ShipmentReceive.receivedQuantity`),
  `constraints.md`. Chạy `npm run spec:generate`, `npm run contracts:generate`.
- **Đặc tả:** FR-INV-26 thêm AC4 (tự tạo chai), AC5 (mã chai trùng).
- **API:** `InvService.receiveShipment` tạo chai bằng một câu `INSERT … SELECT generate_series`.
- **Web quản trị:** pop-up tiếp nhận báo trước hệ thống sẽ tạo N chai và cách đặt mã, để nhân viên kho
  dán nhãn đúng mã lên chai thật (luồng trả chai, chai hư hỏng tra theo mã này).
- **Dữ liệu cũ:** lô đã tiếp nhận trước ADR này vẫn không có chai; dùng `POST /bottles` cho các lô đó.
  Không chạy bù tự động.
- **Test:** `test_FR_INV_26_auto_create_bottles_on_receive` — đủ N chai đúng mã, dung tích, hạn dùng;
  nhận 0 chai không tạo chai; mã trùng thì rollback toàn bộ; vượt ngưỡng bị từ chối.
