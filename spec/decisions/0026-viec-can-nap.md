# ADR-0026 — Việc cần nạp cho Inventory Staff

**Ngày:** 2026-11-12 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Muốn lắp hay thay chai, Inventory Staff mở phiếu nạp (FR-INV-29): chọn máy, chọn "Slot 1…N", rồi
khi đóng phiếu thì chọn chai trong kho. Màn hình không cho biết slot nào cần nạp, của thương hiệu
nào, cần lắp sản phẩm gì, hay vì sao chưa nạp được.

| Tình huống | Hiện có gì báo cho kho |
|---|---|
| Thương hiệu yêu cầu bổ sung (FR-RFQ-01) | Trang Yêu cầu bổ sung — có máy, slot, sản phẩm |
| Slot đang bán sắp hết | Báo cáo tồn kho (FR-INV-21), phải tự dò |
| **Slot vừa thuê, đã thanh toán, chờ lắp chai đầu tiên** | **Không có gì.** Yêu cầu bổ sung chỉ cho hóa đơn `ACTIVE` (FR-RFQ-01 AC3), còn slot này đang `DRAFT` đã trả tiền |

Khi thử luồng trên máy local (2026-11-12), kho đã nhận hàng và giấy tờ lô đã duyệt nhưng Thủ Kho
không có cách nào biết ba slot của "test brand" đang chờ mình. Pop-up đóng phiếu còn lọc chai chỉ
theo thương hiệu, nên chọn nhầm sản phẩm thì máy chủ mới chặn (`PRODUCT_MISMATCH`). Từ ADR-0025 mỗi
lô tự sinh hàng trăm chai, nên lấy 200 chai đầu của cả kho rồi lọc ở trình duyệt có thể mất đúng chai
cần.

## Phương án đã cân nhắc

1. **Tự tạo yêu cầu bổ sung lý do `FIRST_INSTALL` cho lần lắp đầu.** Dùng lại luồng RFQ, nhưng phải
   sinh và hủy yêu cầu ở nhiều chỗ (gán sản phẩm, duyệt giấy tờ, đổi sản phẩm, đổi slot), dễ lệch
   trạng thái; yêu cầu còn phải qua Super Admin duyệt (FR-RFQ-06), không cần cho lần lắp đầu.
2. **Bảng `refill_tasks` lưu từng việc.** Thêm một nguồn trạng thái song song với hóa đơn, yêu cầu
   bổ sung và tồn kho — phải giữ khớp, hội đồng sẽ hỏi bảng nào là nguồn thật.
3. **Máy chủ tính danh sách việc từ dữ liệu sẵn có.** **Chọn.** Mọi dữ kiện đã nằm ở `slot_rentals`,
   `refill_requests`, `bottles`, `inventory_batches`, `refill_sessions`; danh sách luôn đúng hiện
   trạng, không có gì để đồng bộ.

## Quyết định

### 1. `GET /refill-worklist` (quyền `inventory.manage`)

Mỗi slot có hóa đơn đã thanh toán (đang hiệu lực, hoặc `DRAFT` có `paid_at`) được xếp loại:

| Loại | Điều kiện |
|---|---|
| `FIRST_INSTALL` | Hóa đơn `DRAFT` đã thanh toán — chưa lắp chai đầu tiên |
| `REFILL_REQUEST` | Slot có yêu cầu bổ sung `SUBMITTED`, `ACCEPTED` hoặc `SCHEDULED` |
| `LOW_STOCK` | Slot đang bán, sắp hết (cùng điều kiện `lowStock` của FR-RPT-12) hoặc không còn chai, chưa có yêu cầu |

Slot đang bán bình thường không có trong danh sách. Mỗi việc kèm lý do chưa làm được (`blocker`),
xét theo thứ tự người phải xử lý trước:

| `blocker` | Khi nào |
|---|---|
| `PRODUCT_NOT_ASSIGNED` | Thương hiệu chưa gán sản phẩm cho slot |
| `REQUEST_NOT_APPROVED` | Yêu cầu bổ sung còn `SUBMITTED` |
| `NO_STOCK` | Không có chai `IN_STOCK` còn hạn của sản phẩm (`pendingShipment` cho biết hàng đã khai báo, chờ kho nhận) |
| `DOCS_NOT_APPROVED` | Có chai nhưng không lô nào đã duyệt giấy tờ (FR-INV-35) |

**Chai gợi ý** dùng đúng điều kiện máy chủ kiểm khi đóng phiếu (`assertInstallable`): đúng thương
hiệu, `owner = BRAND`, đúng sản phẩm của hóa đơn, `IN_STOCK`, lô `APPROVED`, còn hạn — hết hạn sớm
nhất trước (FEFO). Kèm `availableBottleCount` và `openRefillSessionId` nếu slot đang có phiếu mở.

Thứ tự: phiếu đang mở → việc làm được → việc bị chặn; trong mỗi nhóm: yêu cầu bổ sung (lịch hẹn sớm
trước), lắp chai đầu tiên, sắp hết; rồi theo máy và số slot.

### 2. `RefillSession` thêm trường hiển thị

`slotNumber`, `brandName`, `fragranceProductId`, `productName` — sản phẩm của hóa đơn mới nhất cùng
thương hiệu trên slot, tức sản phẩm chai cần lắp. Chỉ thêm trường, không đổi trường cũ.

### 3. `GET /bottles` thêm lọc `fragranceProductId`

Pop-up đóng phiếu hỏi đúng chai của sản phẩm cần lắp thay vì cả kho.

### 4. Lược đồ

Không đổi. Không có migration.

## Hệ quả

- **Contract:** `openapi.yaml` — path `/refill-worklist`, schema `RefillWorkItem`, `RefillWorkKind`,
  `RefillWorkBlocker`, `RefillWorkBottle`; 4 trường mới của `RefillSession`; tham số
  `fragranceProductId` của `listBottles`. Chạy `npm run contracts:generate`.
- **Đặc tả:** thêm FR-INV-36 (việc cần nạp).
- **API:** `InvQueries.refillWorklist` (một truy vấn, mỗi slot một dòng), luật xếp loại ở
  `refill-worklist.ts` (hàm thuần).
- **Web quản trị:** tab nạp là tab mặc định của Inventory Staff; bảng Việc cần nạp trên bảng phiếu
  nạp; bấm "Mở phiếu nạp" từ việc thì chọn sẵn máy, slot và gắn yêu cầu bổ sung (FR-RFQ-08); pop-up
  mở phiếu tự chọn hiện thương hiệu, sản phẩm, loại việc cạnh từng slot; pop-up đóng phiếu chọn sẵn
  chai gợi ý, chỉ liệt kê chai lắp được; bảng phiếu nạp thêm cột Slot, Thương hiệu · Sản phẩm.
- **Test:** `test_FR_INV_36_*` tích hợp (quyền, slot bình thường không vào danh sách, từng loại việc
  và lý do chặn, chai gợi ý FEFO lắp được thật, lọc chai theo sản phẩm) và test giao diện.
- **Bảo trì định kỳ** cho Operations Staff là câu hỏi tương tự nhưng cần dữ liệu mới (chu kỳ bảo trì
  không suy ra được) — tách thành ADR-0027.
