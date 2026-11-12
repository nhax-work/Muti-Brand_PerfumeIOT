# ADR-0017 — Hoàn thiện contract tuần 7: giấy tờ chính hãng, phiếu nạp, email thông báo, ép bảo trì

**Ngày:** 2026-10-24 · **Trạng thái:** đã duyệt (2026-10-24) · **Người quyết:** TV1

## Bối cảnh

Rà `dev` tại `2160f58` theo lộ trình tuần 7 (`docs/TUAN_7_CAN_SUA.md`, mục W7-09). Phần tồn kho, email và
ép bảo trì của TV4 đã có code và màn hình, nhưng contract chưa theo kịp hoặc còn lỗ hổng:

| # | Vấn đề | Hậu quả |
|---|---|---|
| 1 | FR-INV-33 ÷ 35 ghi API `/inventory-batches/{id}/authenticity-documents`, `…/approve-authenticity`, `…/reject-authenticity`, nhưng `openapi.yaml` không có, CSDL không có cột | Trạng thái chính hãng bị nhét vào JSONB `supplier_info`. Không ràng buộc được "duyệt thì phải có giấy tờ"; web gọi API không có kiểu |
| 2 | Không có gì chặn hai phiếu nạp `STARTED` trên cùng một slot | Hai người cùng lắp chai vào một slot |
| 3 | `brand_shipment_declarations` không có khóa ngoại kép sản phẩm–thương hiệu | Thương hiệu A khai báo được sản phẩm của B; lỗi chỉ nổ 500 lúc tiếp nhận, do `fk_batch_product_same_brand` |
| 4 | `POST /shipment-declarations/{id}/receive` khai `batch` bắt buộc, nhưng FR-INV-25 AC3 nói nhận 0 chai thì **không** tạo lô | Contract tự mâu thuẫn |
| 5 | FR-ALR-16 AC2, AC3 cần lưu phản hồi của dịch vụ email và tự thử lại, nhưng `notifications` không có chỗ ghi | Webhook ghi bản ghi `EMAIL` ở `SENT` mà không gửi gì — bằng chứng giả |
| 6 | `GET /notifications` là "thông báo của tôi", nhưng code lọc theo thương hiệu; Super Admin cần tra bằng chứng gửi của mọi thương hiệu; không có endpoint chi tiết hay gửi lại | Brand Admin thấy thông báo của người khác cùng thương hiệu; thông báo gửi Inventory Staff (mang `brand_id` thương hiệu khai báo) lộ sang Brand Admin |
| 7 | FR-MNT-17 ghi `POST /machines/{id}/force-maintenance`, contract đã chọn `PUT /machines/{id}/mode` với `force = true` | Hai đường cho cùng một việc |
| 8 | AC dùng mã chưa có trong `spec/errors.md`: `BATCH_NOT_APPROVED`, `DOCUMENT_SUBMISSION_EXPIRED`, `REASON_REQUIRED` | Code phải trả `VALIDATION_ERROR` chung chung |
| 9 | Web hiện số đơn còn phải phục vụ của máy `DRAINING` (FR-MCH-09) bằng trường không có trong schema `Machine` | Lệch contract |

## Phương án đã cân nhắc

1. **Bảng riêng cho giấy tờ chính hãng** (một lô nhiều lần nộp). Giữ lịch sử từng lần nộp, nhưng thêm
   một bảng và một vòng đời, trong khi FR-INV-33 ÷ 35 chỉ cần trạng thái hiện tại; lịch sử đã có ở
   AuditLog.
2. **Cột trên `inventory_batches`** kèm CHECK. Đủ cho AC, ràng buộc được ở CSDL. **Chọn.**
3. **Gửi email ngay trong webhook.** Đơn giản, nhưng gọi mạng trong transaction webhook: email chậm thì
   khóa đơn bị giữ, email lỗi thì phải chọn rollback hay không.
4. **Hàng đợi trên chính bảng `notifications`:** nghiệp vụ ghi `EMAIL` ở `PENDING` trong transaction của
   nó; job gửi sau khi commit và tự thử lại. Đúng FR-ALR-15 AC2 và FR-ALR-16 AC3. **Chọn.**

## Quyết định

### 1. Giấy tờ chính hãng của lô (FR-INV-33 ÷ 35)

| Hạng mục | Nội dung |
|---|---|
| Enum mới | `batch_authenticity_status`: `NOT_SUBMITTED`, `PENDING`, `APPROVED`, `REJECTED` |
| Cột mới trên `inventory_batches` | `authenticity_status` (mặc định `NOT_SUBMITTED`), `authenticity_document_url`, `authenticity_document_type`, `authenticity_submitted_by`, `authenticity_submitted_at`, `authenticity_verified_by`, `authenticity_verified_at`, `authenticity_rejection_reason` |
| Ràng buộc | Khác `NOT_SUBMITTED` thì phải có giấy tờ, người và thời điểm nộp; `APPROVED`/`REJECTED` thì phải có người và thời điểm duyệt; `REJECTED` thì phải có lý do |
| Dữ liệu cũ | Migration **chép** các khóa `authenticityStatus`, `documentUrl`, `documentType`, `submittedAt/By`, `verifiedAt/By`, `rejectionReason` từ `supplier_info` sang cột mới. Không xóa khóa khỏi JSONB — code hiện tại còn đọc; TV4 bỏ khi chuyển sang cột |
| Nộp | `POST /inventory-batches/{id}/authenticity-documents` — Brand Admin của thương hiệu sở hữu lô. Lô đang `APPROVED` không nộp lại được |
| Duyệt / từ chối | `POST /inventory-batches/{id}/approve-authenticity`, `…/reject-authenticity` — chỉ khi lô ở `PENDING`, nếu không trả `AUTHENTICITY_NOT_PENDING`. Từ chối thiếu lý do trả `REASON_REQUIRED` |
| Hạn nộp (FR-INV-33 AC3) | Lô không gắn hóa đơn, nên hạn tính theo thương hiệu: nộp được khi thương hiệu còn hóa đơn `ACTIVE`/`EXPIRING`/`GRACE`, hoặc có hóa đơn `DRAFT` đã thanh toán mà `paid_at + RENTAL_MAX_STOCKING_DAYS` chưa qua. Ngoài ra trả `DOCUMENT_SUBMISSION_EXPIRED`. Sau mốc đó FR-SLT-42 cũng tự kích hoạt hóa đơn, nên hai luật dùng chung một mốc |
| Lắp chai (FR-INV-35) | Đóng phiếu nạp với chai của lô khác `APPROVED` trả `BATCH_NOT_APPROVED` (409) |
| Lọc | `GET /inventory-batches?authenticityStatus=…` cho hàng chờ duyệt của Super Admin |

### 2. Phiếu nạp

- `uq_slot_open_refill_session ON refill_sessions (slot_id) WHERE status = 'STARTED'`: mỗi slot tối đa
  một phiếu đang mở. Mở trùng trả `REFILL_SESSION_OPEN`. Migration dọn dữ liệu cũ: mỗi slot chỉ giữ
  phiếu `STARTED` mới nhất, phiếu cũ hơn → `CANCELLED`.
- `machine_id` của phiếu **suy từ slot**, như `RefillSessionOpen` đã khai (chỉ có `slotId`).
- Đóng phiếu không ở `STARTED` trả `REFILL_SESSION_NOT_OPEN`. Chai không ở `IN_STOCK` trả
  `BOTTLE_NOT_IN_STOCK`.

### 3. Khai báo gửi hàng

- `fk_shipment_product_same_brand`: `(fragrance_product_id, brand_id)` tham chiếu
  `fragrance_products (id, brand_id)`. Service trả `PRODUCT_NOT_OWNED` trước khi chạm tới CSDL.
- Tiếp nhận khai báo không còn `DECLARED` trả `SHIPMENT_ALREADY_PROCESSED`.
- `receive` trả `batch` là `null` khi số thực nhận bằng 0 (FR-INV-25 AC3).
- `ShipmentDeclaration` thêm `productName`, `receivedBy`; `InventoryBatch` thêm `productName` — màn hình
  hiện tên sản phẩm thay vì mã.

### 4. Email thông báo (FR-ALR-16)

| Hạng mục | Nội dung |
|---|---|
| Cột mới trên `notifications` | `recipient_address` (hòm thư lúc gửi), `reference_id` (mã sự kiện, ví dụ id phiên thanh toán), `provider_message_id`, `delivery_attempts` (mặc định 0), `last_attempt_at`, `last_error` |
| Luồng | Nghiệp vụ ghi bản ghi `channel = 'EMAIL'`, `status = 'PENDING'` trong transaction của nó. Job ALR gửi các bản ghi `PENDING`, và `FAILED` còn lượt thử, mỗi lần ghi kết quả vào các cột trên |
| Thử lại | Tối đa `EMAIL_MAX_ATTEMPTS` lần, cách nhau ít nhất `EMAIL_RETRY_INTERVAL_MIN` phút |
| Kênh gửi | SMTP, cấu hình qua môi trường; dev/test chỉ ghi log; production bắt buộc gửi thật. Email xác minh tài khoản (FR-USR-07) dùng chung kênh |

### 5. Tra cứu thông báo

- `GET /notifications`: người dùng thường chỉ thấy thông báo **gửi cho mình**. Người có quyền
  `notification.manage` (Super Admin) thấy mọi thông báo và lọc được theo `brandId`, `channel`, `type`;
  người khác truyền các bộ lọc đó thì bị bỏ qua.
- Thêm `GET /notifications/{id}` (cùng phạm vi) và `POST /notifications/{id}/retry`
  (`notification.manage`): đưa email `FAILED` về `PENDING` để job gửi lại, kể cả khi đã hết lượt tự
  thử. Thông báo không phải email `FAILED` trả `NOTIFICATION_NOT_RETRYABLE`.

### 6. Ép bảo trì (FR-MNT-17)

- Giữ một đường: `PUT /machines/{id}/mode` với `force = true` (đã có trong contract). Bỏ
  `POST /machines/{id}/force-maintenance` khỏi FR-MNT-17. Thiếu lý do trả `REASON_REQUIRED`.
- Đơn bị ảnh hưởng **đi qua ORD**, không do MCH tự ghi bảng `orders`. ORD cung cấp:
  - `failQueuedOrdersOnMachine(tx, machineId)`: đơn `PAID` đang chờ lượt → `FAILED`, mã
    `FORCED_MAINTENANCE`, cắm cờ kiểm tra thủ công. Chạy trong transaction đổi chế độ máy.
  - `cancelUnpaidOrdersOnMachine(machineId, actorId)`: đơn `PENDING_PAYMENT` → hủy link ở cổng rồi
    `EXPIRED`, lý do `MACHINE_FORCED_MAINTENANCE`, như khách hủy trên kiosk (FR-ORD-33). Gọi sau khi
    commit chế độ `MAINTENANCE`.
  - Đơn `DISPENSE_REQUESTED` không đụng: thiết bị có thể vẫn đang xịt. Máy nhận cấu hình `MAINTENANCE`
    thì từ chối lệnh chưa sáng đèn, và DSP xử lý theo FR-ORD-19.
- Máy `DRAINING` hiện `drainingOrdersCount` (chỉ đọc, FR-MCH-09). Việc tự sang `MAINTENANCE` thuộc DSP
  (`completeDraining`), không xảy ra trong lời gọi đọc.

### 7. Mã lỗi, ngưỡng và quyền mới

| Mã | HTTP | Khi nào |
|---|---|---|
| `REASON_REQUIRED` | 400 | Từ chối giấy tờ chính hãng hoặc ép bảo trì mà thiếu lý do |
| `BATCH_NOT_APPROVED` | 409 | Lắp chai thuộc lô chưa duyệt giấy tờ chính hãng |
| `DOCUMENT_SUBMISSION_EXPIRED` | 409 | Nộp giấy tờ quá hạn |
| `AUTHENTICITY_NOT_PENDING` | 409 | Duyệt/từ chối lô không ở `PENDING`, hoặc nộp lại cho lô đã `APPROVED` |
| `SHIPMENT_ALREADY_PROCESSED` | 409 | Tiếp nhận khai báo không còn `DECLARED` |
| `REFILL_SESSION_OPEN` | 409 | Slot đã có phiếu nạp đang mở |
| `REFILL_SESSION_NOT_OPEN` | 409 | Đóng phiếu nạp không ở `STARTED` |
| `BOTTLE_NOT_IN_STOCK` | 409 | Chai chọn để lắp không ở `IN_STOCK` |
| `NOTIFICATION_NOT_RETRYABLE` | 409 | Gửi lại thông báo không phải email `FAILED` |
| `FORCED_MAINTENANCE` | — | Mã thất bại ghi trên đơn, không qua HTTP |

| Hằng | Giá trị |
|---|---|
| `EMAIL_MAX_ATTEMPTS` | 5 |
| `EMAIL_RETRY_INTERVAL_MIN` | 10 |

| Quyền | Vai trò | Dùng cho |
|---|---|---|
| `inventory.declare` | Brand Admin | Khai báo gửi hàng, nộp giấy tờ chính hãng (FR-INV-22, 33) |
| `inventory.verify` | Super Admin | Duyệt/từ chối giấy tờ chính hãng (FR-INV-34) |
| `notification.manage` | Super Admin | Tra bằng chứng gửi của mọi thương hiệu, gửi lại email (FR-ALR-16) |

Inventory Staff được thêm `machine.view` để chọn máy, slot khi mở phiếu nạp. Tiếp nhận lô, đăng ký chai,
mở/đóng phiếu nạp dùng quyền có sẵn `inventory.manage`.

## Hệ quả

| Phần | Thay đổi |
|---|---|
| Migration | `1791200000000_adr-0017-inventory-notification-contract.sql`: enum, cột, CHECK, index, FK kép, chép dữ liệu `supplier_info` |
| `schema.sql`, `data-dictionary.md` | Mô tả trạng thái sau migration trên |
| `openapi.yaml` | Mục 1 ÷ 6 |
| `spec/errors.md`, `spec/constraints.md` | Mục 7 |
| `spec/modules/MNT.md` | FR-MNT-17 đổi API sang `PUT /machines/{id}/mode` |
| Seed | Ba quyền mới, `machine.view` cho Inventory Staff |
| ORD | Hai hàm cho máy bị ép bảo trì (mục 6) — TV1 làm cùng ADR này |
| INV, ALR, MCH, web | TV4 chuyển code theo contract mới — `TV4_TUAN_7.md` |

## Nhật ký áp dụng — 2026-10-24

Áp contract, migration, seed quyền và hai hàm ORD trên nhánh `fix/week7-gaps`. Phần code INV, ALR,
MCH, web để TV4 làm.
