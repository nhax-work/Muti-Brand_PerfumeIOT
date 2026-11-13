# ADR-0029 — Thông báo không gắn thương hiệu cho nhân sự nền tảng

**Ngày:** 2026-11-13 · **Trạng thái:** đề xuất · **Người quyết:** TV1

## Bối cảnh

Khi rà các luồng chưa có thông báo (2026-11-13), phần lớn đã thêm được mà không đổi contract: phiếu
khiếu nại, đơn cần kiểm tra, giấy tờ lô, hồ sơ pháp nhân, cảnh báo cho Brand Admin (FR-ALR-10)… đều gắn
một thương hiệu, nên ghi được vào `notifications.brand_id`.

Có hai việc **không gắn thương hiệu nào**:

| Sự kiện | Vì sao không có thương hiệu |
|---|---|
| Phân công cảnh báo cho Operations Staff (FR-ALR-11) | Cảnh báo mức máy (`MACHINE_OFFLINE`, cửa mở…) có `alerts.brand_id = NULL` |
| Phân công, hoàn tất phiếu bảo trì (FR-MNT-02, FR-MNT-03) | `maintenance_tickets` thuộc máy, không thuộc thương hiệu |

`notifications.brand_id` đang `NOT NULL`, nên người được giao chỉ biết việc khi tự mở danh sách. Phiếu
bảo trì có hạn (`due_at`) và cảnh báo có hạn xử lý (FR-ALR-14) — giao mà người nhận không biết thì hạn
trôi qua.

## Phương án đã cân nhắc

1. **Gắn đại một thương hiệu** (thương hiệu đầu tiên có slot trên máy). Sai nghĩa: thông báo của nhân sự
   nền tảng lọt vào bộ lọc theo thương hiệu của Super Admin, và đổi theo việc thuê slot.
2. **Bảng thông báo riêng cho nhân sự nền tảng.** Chuông, trang Thông báo và job gửi email phải đọc hai
   bảng — nhân đôi code cho một khác biệt một cột.
3. **Cho `notifications.brand_id` được NULL.** **Chọn.** NULL nghĩa là thông báo nội bộ nền tảng. Cột
   `brand_id` chỉ dùng để Super Admin lọc bằng chứng gửi (ADR-0017); người dùng thường vốn chỉ thấy
   thông báo gửi cho chính mình (ADR-0028), nên không có đường đọc nào dựa vào `brand_id` để cô lập dữ
   liệu.

## Quyết định

### 1. Lược đồ

```sql
ALTER TABLE notifications ALTER COLUMN brand_id DROP NOT NULL;
```

Khóa ngoại `notifications_brand_id_fkey` giữ nguyên. Thông báo gửi Brand Admin (`notifyBrandAdmins`)
vẫn luôn có `brand_id` — chỉ thông báo cho tài khoản nền tảng mới được để trống.

### 2. Thông báo mới (trong ứng dụng, không email)

| Sự kiện | Người nhận | `type` |
|---|---|---|
| Phân công cảnh báo | Người được giao, trừ khi tự giao cho mình hoặc giao lại cùng người | `ALERT_ASSIGNED` |
| Phân công phiếu bảo trì | Người được giao, cùng ngoại lệ trên | `MAINTENANCE_TICKET_ASSIGNED` |

Cảnh báo có `brand_id` thì thông báo mang `brand_id` đó; cảnh báo mức máy và phiếu bảo trì để NULL.
Báo "phiếu đã xử lý" cho người tạo phiếu **không** làm: `maintenance_tickets` không lưu người tạo, và
việc tạo phiếu không chọn người nhận (`MaintenanceTicketCreate` không có `assignedTo`).

### 3. Contract

`openapi.yaml`: `Notification.brandId` thành `type: [string, 'null']`. Không thêm thao tác nào.

## Hệ quả

- **Contract:** `schema.sql`, `data-dictionary.md` (cột `brand_id` của `notifications`),
  `openapi.yaml` (`Notification.brandId`). ERD không đổi — quan hệ vẫn là khóa ngoại tùy chọn.
- **Migration:** `migrations/1791700000000_adr-0029-thong-bao-khong-gan-thuong-hieu.sql`.
- **API:** `UserNotification.brandId` nhận `null`; ALR báo người được giao cảnh báo; MNT báo người được
  giao phiếu bảo trì.
- **Web quản trị:** không đổi — trang Thông báo và chuông không hiển thị thương hiệu.
