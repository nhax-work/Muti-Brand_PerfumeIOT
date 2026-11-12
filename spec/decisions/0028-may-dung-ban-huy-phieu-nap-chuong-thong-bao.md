# ADR-0028 — Banner máy dừng bán, hủy phiếu nạp, chuông thông báo

**Ngày:** 2026-11-12 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Khi thử luồng trên máy local (2026-11-12), khách bấm thanh toán ở kiosk máy Landmark 81 #1 thì kiosk
chuyển "Tạm ngưng phục vụ". Nguyên nhân: một phiếu nạp mở từ 15:01 trên slot 1 — theo ADR-0015
(FR-INV-30) phiếu nạp mở thì cả máy dừng nhận đơn. Phiếu không đóng được vì không có chai đúng sản
phẩm, và hệ thống **không có cách hủy phiếu**. Máy dừng bán nhiều giờ mà không ai biết, cho tới khi
khách bấm thanh toán.

| Sự kiện | Hiện báo ở đâu trên web quản trị |
|---|---|
| Mở phiếu nạp → cả máy dừng bán | Không đâu cả |
| Máy chuyển bảo trì | Trang Thông báo của Brand Admin (FR-MNT-07) — phải tự mở trang mới thấy |
| Ép bảo trì khẩn cấp | Trang Cảnh báo (FR-MNT-17) |
| Có thông báo mới bất kỳ | Không có dấu hiệu nào trên header |

## Phương án đã cân nhắc

1. **Đẩy mọi lần đổi trạng thái máy thành thông báo.** Thông báo là sự kiện đã xảy ra; "máy đang
   dừng bán" là trạng thái đang kéo dài cần người xử lý. Đọc thông báo rồi vẫn không biết máy đã bán
   lại chưa.
2. **Cảnh báo khi phiếu nạp mở quá lâu.** Nhóm quyết định không làm — banner đã cho thấy ngay từ lúc
   mở phiếu, cộng nút hủy là đủ gỡ.
3. **Banner trạng thái + hủy phiếu + chuông thông báo.** **Chọn.** Banner cho trạng thái đang diễn ra,
   tự mất khi máy bán lại; chuông cho sự kiện; nút hủy để gỡ được phiếu mở nhầm.

## Quyết định

### 1. Banner máy dừng bán — `GET /machine-sales-stops` (FR-MCH-19)

- Lý do tính bằng **đúng hàm** kiosk dùng khi tạo đơn: tách `salesStopReason` khỏi
  `assertMachineAcceptsOrders` (`ord/sales-stop.ts`), cả hai cùng gọi. Banner báo dừng bán khi và chỉ
  khi kiosk từ chối đơn. Thứ tự: mất kết nối (`OFFLINE`) → chế độ khác `NORMAL` (`DRAINING`,
  `MAINTENANCE`, `DISABLED`) → phiếu nạp đang mở (`REFILL_SESSION`).
- Kèm `since`: `last_seen_at` khi mất kết nối, lần chuyển chế độ gần nhất
  (`machine_status_histories`), hoặc lúc mở phiếu nạp.
- Tài khoản nền tảng thấy mọi máy, kèm phiếu nạp đang mở (slot, người mở, lúc mở). Brand Admin chỉ thấy
  máy có slot mình đang khai thác (`brandHoldsSlotNow`, BR-012) và lý do chung — không lộ người mở phiếu.
- Không cần quyền riêng; web quản trị hỏi lại mỗi 30 giây, hiện banner dưới header ở mọi trang.

### 2. Hủy phiếu nạp — `POST /refill-sessions/{id}/cancel` (FR-INV-37)

- Quyền `inventory.manage`; lý do bắt buộc (ghi vào `notes` — không thêm cột), ghi `AuditLog`
  `inv.refill.cancelled`.
- Chỉ phiếu `STARTED`; phiếu khác trả `REFILL_SESSION_NOT_OPEN`. Phiếu chuyển `CANCELLED`, slot giữ
  nguyên chai cũ, máy nhận đơn lại ngay khi không còn phiếu mở.
- Yêu cầu bổ sung đã gắn với phiếu (FR-RFQ-08) được gỡ liên kết qua `RfqService.unlinkFromSession`
  trong cùng transaction — nếu không, `linkToSession` sẽ từ chối gắn yêu cầu đó vào phiếu sau.
- Nút "Hủy phiếu" ở bảng phiếu nạp và ở việc cần nạp (ADR-0026).

### 3. Chuông thông báo (FR-ALR-17)

| Thao tác | Mô tả |
|---|---|
| `GET /notifications/unread-count` | Số thông báo `IN_APP` của người gọi có `read_at IS NULL` |
| `POST /notifications/{id}/read` | Đánh dấu đã đọc; chỉ thông báo `IN_APP` của chính người gọi (của người khác trả 404, kể cả Super Admin); đọc lại giữ thời điểm đọc đầu tiên |
| `POST /notifications/read-all` | Mọi thông báo chưa đọc của người gọi |
| `GET /notifications?mine=true` | Chỉ thông báo của người gọi — Super Admin mặc định thấy mọi thông báo để đối soát (ADR-0017) |

Chuông nằm trên header của **mọi** trang quản trị, mọi vai trò: số chưa đọc (hỏi lại mỗi 30 giây),
bấm mở 8 thông báo mới nhất, bấm một thông báo là đã đọc, "Đánh dấu đã đọc tất cả", "Xem tất cả"
sang trang Thông báo.

### 4. Lược đồ

Không đổi. Không có migration.

## Hệ quả

- **Contract:** `openapi.yaml` — 5 thao tác (`listMachineSalesStops`, `cancelRefillSession`,
  `countUnreadNotifications`, `markNotificationRead`, `markAllNotificationsRead`), tham số `mine`
  của `listNotifications`, schema `MachineSalesStop`, `SalesStopReason`, `RefillSessionCancel`,
  `NotificationUnreadCount`.
- **Đặc tả:** FR-MCH-19, FR-INV-37, FR-ALR-17.
- **API:** `ord/sales-stop.ts` (hàm dùng chung), `mch/sales-stops.service.ts`, INV hủy phiếu, RFQ gỡ
  liên kết, ALR chuông.
- **Web quản trị:** `SalesStopBanner`, `NotificationBell` trong `AdminLayout`; nút và pop-up hủy phiếu
  ở tab nạp.
- **Test:** `test_FR_MCH_19_*` (máy bình thường không có, phiếu nạp mở thì banner và kiosk cùng báo
  dừng, phạm vi thương hiệu, thứ tự lý do), `test_FR_INV_37_*` (lý do, quyền, bán lại ngay, gỡ yêu
  cầu bổ sung), `test_FR_ALR_17_*` (đếm, đọc, người khác không đọc hộ, `mine`) và test giao diện.
