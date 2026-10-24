# TV4 — việc cần sửa để hoàn chỉnh tuần 7

Rà ngày **24/10/2026** trên `dev` tại `2160f58` (đã gồm PR #38 `feat/week-7-tasks`). Bản tổng hợp cả
nhóm ở `docs/TUAN_7_CAN_SUA.md`. Số dòng ghi trong file này tính theo commit `2160f58`.

Phần lớn hướng sửa đã được chạy thử trên nhánh `fix/week7-gaps` và qua test trên CSDL thật. Bản thử
đã được bỏ để TV4 tự sửa; các mục ghi **Đã thử** là hướng đã chạy được.

**Cách dùng với agent.** Giao **từng mục** `W7-xx`, không giao cả file. Câu mở đầu gợi ý:

```
Đọc spec/PROJECT.md và TV4_TUAN_7.md. Làm mục W7-<xx>. Dừng ở mọi điểm ghi DỪNG.
```

Mỗi PR ghi mã `W7-xx` trong mô tả.

---

## 1. Thứ tự làm

| Bước | Mục | Vì sao |
|---|---|---|
| 1 | **W7-19** | Seed đang chặn luồng vàng — làm trước Integration Day 30/10 |
| 2 | W7-02, W7-04, W7-05, W7-06, W7-07, W7-08, W7-20 (phần quyền vào màn hình) | Sai nghiệp vụ, không phải chờ contract |
| 3 | W7-01, W7-03, W7-10, W7-11, phần còn lại của W7-06 và W7-20, W7-21 | **Chờ TV1 xong W7-09** (contract, cột, mã lỗi, quyền) |
| 4 | W7-13, W7-22, W7-23 | Test, công cụ, email xác minh |

**Chờ TV1 (W7-09)** trước khi làm bước 3:
- Cột giấy tờ chính hãng trên `inventory_batches`, unique index một phiếu nạp mở mỗi slot, FK kép
  khai báo–sản phẩm.
- Cột bằng chứng gửi email trên `notifications`, hai hằng `EMAIL_*` trong `spec/constraints.md`.
- Ba endpoint giấy tờ chính hãng trong `openapi.yaml`, `GET /notifications/{id}`,
  `POST /notifications/{id}/retry`, `drainingOrdersCount` trong `Machine`.
- Mã lỗi mới và tên ba quyền mới.

Không tự sửa `spec/contracts/*`, `spec/errors.md`, `spec/constraints.md` — đó là phần của TV1
(`spec/PROJECT.md` Mục 4).

---

## 2. Việc cần sửa

### P0 — sai nghiệp vụ hoặc chặn G4/G5

#### W7-19 · Seed tạo phiếu nạp mở làm M001 dừng bán

- **Chỗ:** `scripts/seed.ts`, hàm `seedInventory` (phiếu `ffffffff-…-000000000001`) và
  `seedNotifications`.
- **Lỗi:**
  - Seed chèn một phiếu nạp `STARTED` trên slot 1 của M001. Phiếu mở thì cả máy dừng nhận đơn
    (FR-INV-30, ADR-0015), nên sau `make seed` kiosk chỉ còn màn tạm ngưng — **luồng vàng (Gate 4) không
    chạy được**.
  - Seed chèn hai email ở `SENT` dù chưa từng gửi — cùng lỗi "bằng chứng giả" như W7-01.
- **Sửa:**
  - Không seed phiếu `STARTED`. Thêm một lệnh đóng phiếu cũ cho DB đã seed:
    `UPDATE refill_sessions SET status = 'CANCELLED', completed_at = now() WHERE id = … AND status = 'STARTED'`.
  - Email mẫu để ở `FAILED`/`PENDING`, không để `SENT`.
  - Sau W7-09: trạng thái giấy tờ chính hãng của lô mẫu ghi vào cột mới, không vào `supplier_info`.
- **Xong khi:** `make seed` xong thì tạo được đơn kiosk trên M001.

#### W7-01 · Email thanh toán thuê slot chưa được gửi, nhưng vẫn ghi `SENT`

- **Chỗ:** `apps/api/src/modules/slt/checkout-payment.handler.ts:100`, `apps/api/src/modules/alr/alr.service.ts`
- **Lỗi:**
  - Webhook chèn thẳng bản ghi `channel = 'EMAIL'`, `status = 'SENT'` mà không gọi nhà cung cấp email
    nào.
  - `AlrService` (`sendBrandEmailNotification`, `notifyRentalCheckoutPaid`) không được module nào gọi.
  - Provider duy nhất là `ConsoleEmailProvider`, chỉ ghi log.
  - Vì vậy "bằng chứng gửi" của FR-ALR-16 hiện là giả.
- **Sửa:**
  - Trong transaction webhook chỉ ghi bản ghi `EMAIL` ở `PENDING`. Sau khi commit thì gửi qua
    `AlrService` rồi cập nhật `SENT`/`FAILED`. Email lỗi không được làm hỏng webhook (FR-ALR-15 AC2).
  - Gửi tới email đã xác minh của Brand Admin (FR-ALR-16 AC1).
  - Gộp hai bản nội dung email đang trùng nhau (handler và `notifyRentalCheckoutPaid`) về một chỗ.
  - Thêm adapter gửi thật, cấu hình qua `.env`. Dev/test vẫn chỉ ghi log.
- **Đã thử:**
  - Bảng `notifications` chưa có chỗ lưu "phản hồi của dịch vụ email" (AC2) và số lần thử (AC3). Cột
    cần có — **TV1 thêm ở W7-09**: `recipient_address`, `reference_id`, `provider_message_id`,
    `delivery_attempts`, `last_attempt_at`, `last_error`.
  - Job gửi chạy trong `entrypoints/scheduler.ts`. Mỗi email một transaction ngắn, khóa
    `FOR UPDATE SKIP LOCKED`. Gửi xong ghi `SENT` kèm mã thư, lỗi thì ghi `FAILED` kèm phản hồi.
  - Thử lại `FAILED` sau một khoảng chờ, dừng sau N lần — đọc hai hằng `EMAIL_*` từ cấu hình, không
    hardcode.
  - Adapter SMTP bằng `nodemailer` dùng được với mọi nhà cung cấp có SMTP. Cấu hình
    `EMAIL_TRANSPORT=log|smtp`, `SMTP_*`, `EMAIL_FROM`. Production cấm `log`.
  - Handler webhook gọi `AlrService` qua `modules/alr/index.ts`. Hiện `alr/index.ts` đang `export *` cả
    queries và controller, trái QT3 — chỉ nên xuất module và service.
  - Nội dung email trong handler đang viết thẳng tiếng Việt, cần chuyển sang khóa i18n.
- **DỪNG:** nhóm chốt nhà cung cấp SMTP và tài khoản gửi trước khi bật `smtp`.
- **Xong khi:**
  - Có test integration: webhook thanh toán → bản ghi `EMAIL` đi `PENDING → SENT`, hoặc `FAILED` khi
    provider lỗi.
  - Không còn chỗ nào ghi `EMAIL` + `SENT` mà không gọi provider.

#### W7-02 · Mở được phiếu nạp trên hóa đơn chưa thanh toán

- **Chỗ:** `apps/api/src/modules/inv/inv.queries.ts:929` (`findActiveSlotRental`)
- **Lỗi:** chấp nhận hóa đơn `DRAFT` mà không kiểm `paid_at`. Slot mới chỉ đang giữ chỗ trong lúc thanh
  toán cũng lắp được chai, trái ADR-0006 ("chỉ lắp chai vào slot có hóa đơn đã thanh toán").
- **Sửa:** `DRAFT` chỉ hợp lệ khi `paid_at IS NOT NULL` và `cancelled_at IS NULL`. Dùng hằng trạng thái
  dùng chung trong `shared/scoping/brand-scope.ts`, không tự liệt kê lại.
- **Xong khi:** có test `DRAFT` chưa thanh toán → `RENTAL_NOT_ACTIVE`, `DRAFT` đã thanh toán → mở được
  phiếu.

#### W7-03 · Duyệt được lô chưa nộp giấy tờ chính hãng

- **Chỗ:** `apps/api/src/modules/inv/inv.service.ts:247` (duyệt) và hàm từ chối ngay bên dưới
- **Lỗi:** không kiểm lô đang `PENDING` và đã có `documentUrl`. Super Admin bấm duyệt một lô chưa có giấy
  tờ là chặn của FR-INV-35 mất tác dụng.
- **Sửa:** chỉ duyệt hoặc từ chối khi đã có giấy tờ ở trạng thái `PENDING`; các trường hợp khác trả 409.
  Mã lỗi theo W7-09.
- **Xong khi:** có test cho các ca: duyệt lô chưa nộp, duyệt lại lô đã `APPROVED`, từ chối lô đã
  `REJECTED`.

#### W7-04 · Đóng phiếu nạp thiếu transaction và thiếu kiểm tra chai

- **Chỗ:** `apps/api/src/modules/inv/inv.service.ts:419` (`closeRefillSession`)
- **Lỗi:**
  - Cập nhật chai, cập nhật slot và đóng phiếu là ba lệnh rời. Lỗi giữa chừng để lại dữ liệu nửa vời.
  - Không khóa phiếu, nên hai lần đóng cùng lúc đều qua.
  - Không kiểm chai đang `IN_STOCK`, nên lắp được chai đang `INSTALLED` ở slot khác, chai `DAMAGED` hay
    `RETURNED_TO_BRAND`.
  - Thiếu `PRODUCT_MISMATCH` (FR-INV-07) và `BOTTLE_EXPIRED` (FR-INV-08), dù contract
    `POST /refill-sessions/{id}/close` đã ghi.
  - Không xử lý chai cũ trong slot (`old_bottle_id`).
  - Không ghi AuditLog (FR-AUD-07). Cả module INV hiện không có transaction và không ghi audit lần nào.
- **Sửa:**
  - Gói toàn bộ thao tác trong một transaction, khóa phiếu `FOR UPDATE`.
  - Thêm đủ các kiểm tra contract đã ghi, và ghi audit.
  - Chai cũ rời slot: còn nước hoa thì về `IN_STOCK`, hết thì `EMPTY`, ghi `removed_at`.
  - Transaction này là chỗ T8 nối kích hoạt hóa đơn khi lắp chai đầu tiên (FR-SLT-24), nên service SLT
    phải nhận được `executor`/`tx` truyền vào.
- **Xong khi:** có test integration cho từng mã lỗi trên, và test "lỗi giữa chừng thì không đổi gì".

#### W7-05 · Tiếp nhận lô hàng không có transaction

- **Chỗ:** `apps/api/src/modules/inv/inv.service.ts:113` (`receiveShipment`)
- **Lỗi:**
  - Cập nhật khai báo và tạo lô là hai lệnh rời, trong khi FR-INV-26 AC1 đòi cùng một transaction.
  - Không khóa khai báo, nên bấm "tiếp nhận" hai lần cùng lúc tạo ra hai lô.
  - AC2 chỉ cho Inventory Staff, nhưng code cho cả Ops và Super Admin.
- **Sửa:**
  - Transaction, khóa khai báo `FOR UPDATE`.
  - Phân quyền bằng `@RequirePermissions` như MCH, thay cho kiểm `actor.roles` bằng tay. Áp cho mọi
    controller INV.
- **Xong khi:** có test hai lần tiếp nhận song song chỉ tạo đúng một lô.

#### W7-06 · Lộ dữ liệu, thiếu ràng buộc và lệch contract ở INV

- **Chỗ:** `inv.service.ts:61`, `:369`, `:407`; `inv.queries.ts:892`; `inv.http.ts`
- **Lỗi và sửa:**
  - `GET /refill-sessions` không kiểm quyền và không lọc thương hiệu, nên Brand Admin xem được phiếu nạp
    của mọi thương hiệu (BR-012). Sửa: lọc theo `resolveBrandScope`.
  - Mở phiếu không kiểm slot có thuộc máy đã chọn không, nên có thể dừng nhầm máy.
  - Không chặn hai phiếu `STARTED` trên cùng slot. Sửa: kiểm trong code; unique index một phần do TV1
    thêm ở W7-09.
  - Kiểm "máy bận" bỏ sót lệnh xịt trạng thái `CREATED`. Index `uq_machine_active_customer_command` coi
    cả `CREATED`, `SENT`, `ACKNOWLEDGED` là lệnh còn hiệu lực.
  - Kiểm "máy bận" rồi mới ghi phiếu, nên kiosk có thể tạo đơn chen vào giữa. Sửa: khóa dòng `machines`
    trong cùng transaction với bước kiểm và bước ghi. TV1 khóa cùng dòng phía ORD (W7-24).
  - Khai báo gửi hàng không kiểm sản phẩm thuộc thương hiệu (FR-INV-22 AC2, `PRODUCT_NOT_OWNED`). Hiện
    lỗi chỉ nổ 500 lúc tiếp nhận, do `fk_batch_product_same_brand`.
  - **Code lệch cả contract đã có** — sửa code theo `openapi.yaml`, không sửa contract theo code:
    - `RefillSessionOpen` chỉ có `slotId` (+ `beforeWeightG`): máy suy từ slot, nhờ vậy hết luôn lỗi
      "slot không thuộc máy" ở trên. Code đang đòi cả `machineId`.
    - `RefillSessionClose` là `newBottleId`, `checklistCompleted: true`, `afterWeightG` tùy chọn. Code
      đang đòi `initialMeasuredWeightG`.
    - `ShipmentReceive` bắt buộc `batchNumber` do người kho nhập theo nhãn lô, có `expiresAt`. Code đang
      tự sinh số lô.
    - DTO trả về chưa theo schema: `ShipmentDeclaration.resultingBatchId`, `Bottle.owner`,
      `currentEstimatedMl`, `installedSlotId`… Hiện code trả thẳng dòng CSDL. Dùng
      `Schema<'…'>` từ `@scentstation/contracts` làm kiểu trả về để `tsc` bắt lệch.
  - Phân quyền dùng `@RequirePermissions`: `inventory.manage` cho tiếp nhận, chai, phiếu nạp; quyền mới
    cho khai báo/nộp giấy tờ (Brand Admin) và duyệt (Super Admin) — tên quyền chốt ở W7-09.
  - Bỏ các route bí danh ngoài contract: `/shipments`, `/batches`, `/:id/confirm-receive`,
    `/:id/authenticity`, `/:id/approve`, `/:id/reject`.
- **Xong khi:**
  - Có test Brand Admin B không thấy phiếu nạp của A.
  - Có test khai báo sản phẩm của thương hiệu khác → `PRODUCT_NOT_OWNED`.
  - Có test hai người mở phiếu cùng một slot cùng lúc chỉ ra một phiếu.

#### W7-07 · Ép bảo trì ghi thẳng vào bảng đơn của ORD (TV1 duyệt)

- **Chỗ:** `apps/api/src/modules/mch/mch.queries.ts:578` (`failAffectedOrdersOnForceMaintenance`),
  `mch.service.ts:339`
- **Lỗi:**
  - MCH tự `UPDATE orders` và `dispense_commands`, vượt ranh giới module (ADR-0003), không qua máy trạng
    thái của ORD.
  - Đơn chờ thanh toán bị chuyển `EXPIRED` mà không hủy link PayOS (FR-ORD-16, ADR-0016).
  - Lệnh `SENT`/`ACKNOWLEDGED` bị chuyển `FAILED` trong khi thiết bị có thể vẫn đang xịt.
  - Hủy đơn và đổi chế độ máy chạy ở hai transaction khác nhau, nên giữa hai bước kiosk vẫn tạo được đơn
    mới.
  - Mã `FORCE_MAINTENANCE` dùng cho `failure_code` và loại alert chưa có trong spec.
- **Sửa:** MCH gọi service của ORD (qua `modules/ord/index.ts`), không ghi bảng `orders`.
- **Đã thử:**
  - ORD đã có sẵn `failBeforeDispense(tx, orderId, failureCode)`: đơn `PAID` chờ lượt → `FAILED` +
    kiểm tra thủ công, gọi trong cùng transaction đổi chế độ máy.
  - Luồng hủy link PayOS trong `cancelKioskOrder` tách được thành một hàm dùng chung cho đơn chờ thanh
    toán. Gọi sau khi commit chế độ `MAINTENANCE` — máy đã dừng nhận đơn nên không có đơn mới chen vào.
  - Đơn `DISPENSE_REQUESTED` **không** đụng tới: máy nhận cấu hình `MAINTENANCE` thì từ chối lệnh chưa
    sáng đèn, và DSP xử lý theo FR-ORD-19.
  - Tách phần đổi chế độ máy khỏi `MchService` thành service riêng phụ thuộc ORD, DSP, ALR, để unit
    test của `MchService` vẫn dùng queries giả được.
- **DỪNG:** chốt với TV1 mã thất bại ghi trên đơn và tên hàm ORD mới — ORD là module của TV1.
- **Xong khi:** có test integration: ép bảo trì khi có một đơn `PENDING_PAYMENT` và một đơn `PAID` →
  link PayOS bị hủy, đơn `PAID` chuyển `FAILED` với `needs_manual_review`, có alert, máy ở `MAINTENANCE`.

#### W7-20 · Màn Shipments: Inventory Staff không vào được

- **Chỗ:** `apps/admin-web/src/routes/shipments/ShipmentsPage.tsx`, `app/navigation.tsx`,
  `routes/notifications/NotificationsPage.tsx`
- **Lỗi:**
  - `RequireRole` và menu chỉ cho Super Admin, Ops, Brand Admin. **Inventory Staff** — người tiếp nhận
    lô, mở/đóng phiếu nạp — không vào được màn hình, và cũng không vào được màn Thông báo (nơi nhận
    thông báo khai báo mới, FR-INV-28).
  - Mã sản phẩm, máy, slot phải gõ tay UUID.
  - Nhiều chuỗi tiếng Việt viết thẳng trong component, trái FE4/NFR-USA-07: "Mã khai báo", "Sản phẩm",
    "Trạng thái", "Xem tài liệu", "Chưa nộp", nội dung Popconfirm, nhãn loại giấy tờ…
  - Nút hiện theo tên vai trò, kể cả nút "Duyệt" cho lô chưa nộp giấy tờ. `user.permissions` đã có sẵn
    trong `CurrentUser` — dùng quyền để khớp với chốt chặn phía máy chủ.
  - `(api as any)` cả với endpoint đã có trong contract. Nhờ vậy lệch contract ở W7-06 không bị `tsc`
    bắt, và `check:screens` không đếm được màn hình.
  - Màn Thông báo: thẻ thống kê chỉ đếm trang hiện tại; các cột `brandName`, `recipientEmail` không có
    trong contract.
- **Sửa:**
  - Thêm `INVENTORY_STAFF` vào `RequireRole` và menu của cả hai màn — làm ngay, không chờ W7-09.
  - Dùng `Select` lấy từ `GET /products`, `GET /machines`, `GET /machines/{id}/slots`. Inventory Staff
    cần quyền `machine.view` trong seed để chọn máy.
  - Chuyển mọi chuỗi sang `packages/i18n` (cả `vi` lẫn `en`).
  - Bỏ `as any`, dùng kiểu sinh từ contract — sau W7-09.
  - Tách ba tab thành ba component trong cùng thư mục cho dễ test.
- **Xong khi:** đăng nhập `inventory@scentstation.local` thấy menu "Khai báo & Tồn kho", tiếp nhận và
  mở/đóng phiếu được mà không gõ UUID.

### P1 — lệch contract/AC

#### W7-08 · `GET /machines` có ghi dữ liệu (tự chuyển DRAINING → MAINTENANCE)

- **Chỗ:** `apps/api/src/modules/mch/mch.service.ts:219`, `:250`
- **Lỗi:**
  - Máy chỉ chuyển khi có người mở trang, và lời gọi đọc lại sinh ra ghi.
  - Logic trùng với DSP: TV1 đã làm việc tự chuyển ở `DspService.completeDraining` (commit `4a590f3`).
  - `countPendingOrdersAndCommands` tự định nghĩa lại "máy cạn đơn", khác chỗ của DSP.
- **Sửa:** bỏ việc chuyển trong `GET`; `drainingOrdersCount` chỉ đọc.
- **Đã thử:** contract nói máy rảnh thì trả `MAINTENANCE` ngay. Đặt `DRAINING` rồi gọi
  `DspService.completeDraining()` là đủ — DSP tự chuyển, gửi thông báo FR-MNT-07, ghi lịch sử.
- **Xong khi:** test FR-MNT-05 AC2 chạy qua DSP, không cần gọi `GET /machines`.

#### W7-10 · Mã lỗi lệch AC

Sau W7-09, đổi các chỗ đang trả `VALIDATION_ERROR` 400:

| Chỗ | Đang trả | Phải trả |
|---|---|---|
| Lắp chai thuộc lô chưa duyệt | `VALIDATION_ERROR` 400 | `BATCH_NOT_APPROVED` 409 (FR-INV-35 AC1) |
| Từ chối giấy tờ mà thiếu lý do | `VALIDATION_ERROR` | `REASON_REQUIRED` (FR-INV-34 AC3) |
| Ép bảo trì mà thiếu lý do | `VALIDATION_ERROR` | `REASON_REQUIRED` (FR-MNT-17 AC3) |
| Brand B nộp giấy tờ cho lô của A | `NOT_FOUND` | `FORBIDDEN_SCOPE` (FR-INV-33 AC2) |

**Xong khi:** mỗi dòng có test kiểm đúng mã.

#### W7-11 · AC chưa làm

| FR | Thiếu |
|---|---|
| FR-INV-33 | AC3: hạn nộp `RENTAL_MAX_STOCKING_DAYS` → `DOCUMENT_SUBMISSION_EXPIRED`; AC1: ghi AuditLog |
| FR-INV-34 | Thông báo Brand Admin khi duyệt/từ chối; ghi AuditLog |
| FR-INV-28 (S) | Thông báo Inventory Staff khi có khai báo mới — cắt được nếu thiếu thời gian |

Hạn nộp FR-INV-33: lô không gắn với hóa đơn nên tính theo thương hiệu. Bản thử cho nộp khi thương hiệu
còn hóa đơn `ACTIVE`/`EXPIRING`/`GRACE`, hoặc có hóa đơn `DRAFT` đã thanh toán mà
`paid_at + RENTAL_MAX_STOCKING_DAYS` chưa qua. Cách hiểu này cần TV1 ghi vào ADR ở W7-09.

#### W7-21 · Nhãn trạng thái lệch enum

- `packages/i18n`: `refillSessionStatus.ABORTED`, nhưng enum `refill_status` là `CANCELLED`, nên phiếu
  bị hủy hiện nguyên mã. Sau W7-09 thì `authenticityStatus` thêm `NOT_SUBMITTED`.
- **Xong khi:** mọi giá trị enum hiển thị có nhãn ở cả `vi` lẫn `en`.

### P2 — test và công cụ

#### W7-13 · Test INV/ALR chỉ chạy trên queries giả, sai tên

- `tests/unit/inv.test.ts` và `alr.test.ts` dùng `Fake…Queries`, nên 978 dòng SQL của `inv.queries.ts` và
  luồng ép bảo trì chưa chạy trên CSDL thật lần nào.
- Tên test không theo `spec/testing.md`. Phải đặt đúng như mục "Kiểm tra" của từng FR (ví dụ
  `test_FR_INV_22_declare_shipment`), nếu không `check:traceability` vẫn báo thiếu.
- Test integration dùng `tests/integration/helpers/seed-isolation.ts`. Fixture chưa có Inventory Staff —
  tạo tài khoản như `test_refund_claims.test.ts` tạo Operations Staff. `asUser` đã tự thêm tiền tố
  `/api/v1`, không viết lại.
- **Xong khi:**
  - Có `tests/integration/test_inv_*.test.ts` cho FR-INV-22 ÷ 35 và FR-ALR-16.
  - `npm run check:traceability` không còn FR nào của tuần 7.

#### W7-22 · Test web đang nuốt lỗi

- `apps/admin-web/vite.config.ts` bật `dangerouslyIgnoreUnhandledErrors: true`, và `test-utils.tsx`
  stub `message`/`notification` của antd — lỗi chưa bắt trong màn hình không làm test đỏ.
- **Sửa:** bỏ cờ. Nếu lộ lỗi thì sửa ở màn hình gây ra, không che.
- **Xong khi:** `npm run test:web` xanh khi không có cờ.

#### W7-23 · Kênh gửi email cho email xác minh (cùng TV3)

- Email xác minh đăng ký (FR-USR-07) hiện chỉ in ra log. TV4 làm kênh gửi SMTP ở W7-01 sao cho dùng
  chung được: một provider @Global, không gắn riêng vào ALR. TV3 nối vào sender — xem `TV3_TUAN_7.md`.

---

## 3. Chuyển sang tuần 8

- **FR-SLT-24:** kích hoạt hóa đơn khi lắp chai đầu tiên chạy trong transaction đóng phiếu nạp của
  W7-04 (TV3 + TV4).
- **FR-ALR-16:** bảy loại email còn lại dùng lại đường gửi của W7-01, không viết lại.

## 4. Xong tuần 7 khi

- W7-01 ÷ W7-08, W7-10, W7-11, W7-13, W7-19 ÷ W7-23 đã merge vào `dev`, hoặc được ghi cắt theo "Phạm vi
  cắt khi rút lịch".
- `npm test` và `npm run lint` xanh; `npm run check:traceability` không còn FR-INV, FR-ALR-16, FR-MNT
  của tuần 7.
- `npm run check:screens` không còn dòng `BE` cho endpoint INV, MNT, ALR mà người dùng thao tác.
