# ADR-0018 — Hoàn thiện contract tuần 8: chai hư hỏng, yêu cầu bổ sung, gợi ý nạp

**Ngày:** 2026-10-26 · **Trạng thái:** đã duyệt (2026-10-26) · **Người quyết:** TV1

## Bối cảnh

Lộ trình tuần 8 giao TV1 bảo hiểm hàng hóa (FR-SLT-44 ÷ 46), RefillRequest (FR-RFQ-01 ÷ 12), báo cáo
doanh thu bán gói (FR-SLT-47), truy vết đơn (FR-AUD-11), telemetry (FR-IOT-04 ÷ 06) và xếp hạng sản
phẩm (FR-RPT-06). Đối chiếu AC với `openapi.yaml` và `schema.sql` cho thấy:

| # | Vấn đề | Hậu quả |
|---|---|---|
| 1 | FR-SLT-44 bắt đầu bằng "Inventory Staff chuyển chai sang `DAMAGED`", nhưng contract không có đường nào đổi trạng thái chai sang `DAMAGED` | Không sinh được khoản bồi thường; Gate 5 "một chai DAMAGED sinh đúng một khoản bồi thường" không chạy được |
| 2 | FR-RFQ-04 AC2 và FR-RFQ-07 cho chuyển `ACCEPTED → SCHEDULED/CANCELLED`, nhưng contract chỉ có `accept` và `reject` | Yêu cầu không bao giờ tới `SCHEDULED` hay `CANCELLED` được |
| 3 | `RefillRequestCreate.note` có trong contract, `refill_requests` không có cột lưu | Ghi chú của thương hiệu bị bỏ âm thầm |
| 4 | FR-RFQ-09 AC2 đòi từ chối mọi thao tác đặt `COMPLETED` khi chưa liên kết phiên nạp, nhưng `schema.sql` §13 mục 4 để ở tầng service | Một câu UPDATE tay đi qua được |
| 5 | FR-RFQ-03 cần biết slot nào sắp hết, nhưng `MachineMapSlot` (nguồn dữ liệu màn "Slot của tôi") không có cờ nào | Web phải tự so ngưỡng — trái FE5 |
| 6 | `RefillRequest`, `StorageCompensation` chỉ có id; màn hình cần máy, slot, sản phẩm, thương hiệu, số hóa đơn | Web phải gọi thêm N lần để hiện một bảng |

## Phương án đã cân nhắc

1. **Đổi trạng thái chai qua `POST /inventory-adjustments`.** Endpoint đó ghi số ml sau điều chỉnh
   (FR-INV-16), không có trạng thái; nhồi thêm nghĩa "hỏng" làm một endpoint mang hai nghiệp vụ.
2. **Endpoint riêng `POST /bottles/{id}/mark-damaged`**, xác thực lại như điều chỉnh tồn kho, tạo khoản
   bồi thường trong cùng transaction. **Chọn.**
3. **Trigger CSDL tạo khoản bồi thường** khi `bottles.status` sang `DAMAGED`. Gọn nhưng công thức cần hạn
   mức còn lại và luật chọn gói (FR-SLT-44 AC2, AC3) — đặt trong trigger thì không unit test được, và
   `schema.sql` đã ghi "domain service tính" ở `storage_compensations.amount`.

## Quyết định

### 1. Chai hư hỏng và bồi thường (FR-SLT-44 ÷ 46)

| Hạng mục | Nội dung |
|---|---|
| Endpoint | `POST /bottles/{id}/mark-damaged`, thân `{ reason }` bắt buộc. Quyền `inventory.adjust`, cần `X-Reauth-Token` (nhóm "điều chỉnh tồn kho" của FR-AUTH-09) |
| Cột mới trên `bottles` | `damaged_at`, `damage_reason` — ghi lúc chuyển `DAMAGED` |
| Trạng thái nguồn | Mọi trạng thái trừ `DAMAGED` (lặp lại trả `VALIDATION_ERROR`) và chai `RETURNED_TO_BRAND` đã bàn giao (hàng đã rời nền tảng — `VALIDATION_ERROR`) |
| Chai đang lắp | Máy phải rảnh (`MACHINE_BUSY` như mở phiếu nạp); slot gỡ `active_bottle_id`, lượng tồn về 0 — slot không bán tiếp chai hỏng |
| Phản hồi | `{ bottle, compensation }`, `compensation` là `null` khi không bồi thường |
| Chọn hóa đơn áp gói | Chai đang lắp: hóa đơn đang giữ slot của chai. Chai trong kho: hóa đơn `ACTIVE`/`EXPIRING`/`GRACE` — hoặc `DRAFT` đã thanh toán đang chờ nạp hàng, vì gói bảo quản đã được trả tiền và hàng nằm kho chính là lúc đó — của thương hiệu có `storage_coverage_percent` cao nhất (AC2); hòa thì lấy hóa đơn còn hạn mức lớn hơn. Chai `RETURNED_TO_BRAND` chưa bàn giao: hóa đơn của phiếu trả hàng |
| Số tiền | `min(storage_coverage_percent × full_bottle_retail_price, storage_coverage_cap − tổng bồi thường đã ghi của hóa đơn)`, phần tỷ lệ làm tròn nửa lên tới đồng. Khóa hóa đơn trước khi cộng phần đã dùng — hai chai cùng hóa đơn hỏng đồng thời không vượt hạn mức |
| Không bồi thường (AC4) | Chai `EXPIRED` (hoặc đã quá `expires_at`), `LIQUIDATED`, `EMPTY` (không còn hàng để mất), `owner = PLATFORM`, không có hóa đơn áp được, hóa đơn không chụp gói bảo quản, sản phẩm chưa khai giá bán lẻ (chưa chứng minh được giá trị), hoặc hạn mức đã hết |
| Chi trả | Như contract: `POST /storage-compensations/{id}/payout`, quyền `revenue.manage` (cùng nhóm tiền với kỳ chi trả — chỉ Super Admin) |
| Thông báo | Brand Admin nhận thông báo trong ứng dụng khi có khoản bồi thường và khi đã chi trả. Không thuộc 8 sự kiện email của FR-ALR-16 |
| Hiển thị | `StorageCompensation` thêm `brandName`, `invoiceNumber`, `damagedAt`; `GET /storage-compensations` thêm lọc `brandId` cho tài khoản nền tảng |

### 2. Yêu cầu bổ sung (FR-RFQ-01 ÷ 12)

| Hạng mục | Nội dung |
|---|---|
| Endpoint mới | `POST /refill-requests/{id}/schedule` thân `{ scheduledAt }`: `ACCEPTED → SCHEDULED` (FR-RFQ-07). `POST /refill-requests/{id}/cancel`: `ACCEPTED`/`SCHEDULED → CANCELLED` (FR-RFQ-04 AC2). Cả hai quyền `refill.fulfill` |
| Duyệt | `accept`/`reject` dùng `refill.fulfill` như mô tả quyền ở seed |
| Chuyển sai trạng thái | `VALIDATION_ERROR` (FR-RFQ-04 AC4) |
| Cột mới | `refill_requests.note` (lưu `RefillRequestCreate.note`) |
| Ràng buộc mới | `chk_refill_request_completed_has_session`: `COMPLETED` thì `refill_session_id` khác NULL — đưa §13 mục 4 xuống CSDL (FR-RFQ-09 AC2) |
| Liên kết phiên nạp | `RefillSessionOpen.refillRequestId` (đã có trong contract): yêu cầu phải cùng slot, ở `ACCEPTED`/`SCHEDULED`; đóng phiếu nạp thì yêu cầu liên kết sang `COMPLETED` trong cùng transaction (FR-RFQ-08, 09) |
| Hiển thị | `RefillRequest` thêm `note`, `machineId`, `machineSerial`, `slotNumber`, `productName`, `brandName`, `updatedAt` |

### 3. Gợi ý nạp (FR-RFQ-03)

`MachineMapSlot` thêm `lowStock` (chỉ có trên slot của người gọi): `true` khi chai đang lắp ở `LOW`/`EMPTY`,
hoặc `estimated_remaining_ml ≤ low_stock_threshold_ml` của slot. Màn "Slot của tôi" hiện nút tạo yêu cầu
bổ sung điền sẵn slot theo cờ này.

## Hệ quả

| Phần | Thay đổi |
|---|---|
| Migration | `1791300000000_adr-0018-week8-contract.sql`: cột `bottles.damaged_at`, `bottles.damage_reason`, `refill_requests.note`, CHECK `chk_refill_request_completed_has_session` |
| `schema.sql`, `data-dictionary.md` | Mô tả trạng thái sau migration; §13 bỏ mục 4 |
| `openapi.yaml` | Mục 1 ÷ 3 |
| `spec/modules/AUTH.md` | FR-AUTH-09 AC4 liệt kê lại toàn bộ endpoint khai `X-Reauth-Token` |
| `spec/modules/RFQ.md`, `SLT.md` | API của FR-RFQ-04, 07 và FR-SLT-44 |
| INV | Endpoint chai hư hỏng; mở/đóng phiếu nạp nối yêu cầu bổ sung — TV1 làm, TV4 review |
| Mã lỗi, ngưỡng, quyền | Không thêm |

## Nhật ký áp dụng — 2026-10-26

Áp contract, migration và toàn bộ hiện thực trên nhánh `feat/tv1-week8`: bảo hiểm hàng hóa (SLT +
endpoint chai hư hỏng ở INV), module RFQ và phần nối phiếu nạp ở INV, cờ `lowStock` ở RPT, kèm màn
hình. Phần sửa trong INV (module của TV4) cần TV4 review.
