# ADR-0036: Bằng chứng ảnh bảo trì, lịch bảo trì định kỳ theo máy và đồng bộ chế độ máy

- **Trạng thái**: Đã chấp nhận
- **Ngày**: 2026-11-27
- **Liên quan**: `spec/contracts/schema.sql`, `migrations/1791800120000_periodic-maintenance.sql`, `apps/api/src/modules/mnt/`, `apps/api/src/modules/mch/`

## Bối cảnh

1. Khi nhân viên vận hành xử lý phiếu bảo trì (FR-MNT-10, FR-MNT-11), hệ thống cần lưu ảnh bằng chứng từ Web (`admin-web`) và Mobile App (`staff-app`).
2. Mỗi máy Kiosk cần được gán cố định một nhân viên vận hành phụ trách bảo trì/vệ sinh định kỳ (mặc định chu kỳ 30 ngày) và tự động gửi thông báo nhắc nhở trước hạn 3 ngày.
3. Khi nhân viên mở phiếu bảo trì tại máy (`POST /maintenance-tickets/:id/start`), máy cần chuyển sang chế độ `MAINTENANCE` để dừng nhận đơn mới và tự động khôi phục `NORMAL` khi hoàn tất Post-test `PASS`.

## Quyết định

1. **Ảnh bằng chứng bảo trì**: Tái sử dụng cột `maintenance_activities.attachments` (`jsonb`) hiện có, bổ sung `POST /maintenance-tickets/:id/evidence` (chuẩn hóa ảnh WebP qua `MEDIA_STORAGE`, không cần migration mới).
2. **Bảo trì định kỳ theo máy**: Bổ sung vào bảng `machines` các cột `periodic_maintenance_staff_id`, `periodic_maintenance_interval_days`, `next_periodic_maintenance_at`, `last_periodic_maintenance_at`, `last_periodic_reminder_for` cùng chỉ mục `idx_machines_periodic_due` và endpoint `PUT /machines/:id/periodic-maintenance`.
3. **Đồng bộ chế độ máy**: Bổ sung `POST /maintenance-tickets/:id/start` để chuyển máy sang `MAINTENANCE` và tự động đưa về `NORMAL` khi `submitPostTest` đạt `PASS` và không còn phiếu bảo trì dang dở.
