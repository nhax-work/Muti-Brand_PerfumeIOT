# FR-AUD — Nhật ký kiểm toán

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A17 · 11 FR
> Trạng thái AC: **một phần** — FR-AUD-11 (2026-10-26, lộ trình tuần 8); các FR khác chưa viết
> Phụ trách: TV4 · FR-AUD-11: TV1
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`
Mẫu định dạng AC: xem `spec/modules/SLT.md`

---

## FR-AUD-11 — Truy vết đầu-cuối một đơn hàng
* **Statement:** Hệ thống phải cho phép truy vết từ một đơn hàng đến thanh toán, lệnh xịt, kết quả thiết bị, thay đổi tồn kho, hóa đơn thuê và hoàn tiền liên quan.
* **Traces:** BR-008 · **Priority:** M
* **API:** `GET /audit-logs/order-trace/{orderId}`
* **Acceptance criteria:**
  * **AC1 (Chuỗi đầy đủ):** Given đơn `O` đã `DISPENSED` qua một thanh toán `SUCCEEDED` và một lệnh xịt `SUCCEEDED`,  
    When Platform Super Admin gọi truy vết `O`,  
    Then phản hồi gồm `order`, `slotRental` của đơn, `statusHistory` theo thời gian tăng dần, `payments` (gồm cả bản ghi hoàn tiền), `dispenseCommands` kèm kết quả thiết bị, `inventoryAdjustments` là các điều chỉnh tồn kho trên slot của đơn từ lúc tạo đơn tới lúc đơn kế tiếp trên slot đó được tạo (bảng điều chỉnh không có cột đơn hàng), và `auditLogs` có `target_id` là đơn, thanh toán hoặc lệnh xịt của đơn — theo thời gian tăng dần.
  * **AC2 (Đơn chưa xịt):** Given đơn `O` mới `PENDING_PAYMENT`,  
    When truy vết,  
    Then `dispenseCommands` và `inventoryAdjustments` là mảng rỗng, không lỗi.
  * **AC3 (Không tồn tại):** Given `orderId` không tồn tại,  
    When truy vết,  
    Then hệ thống trả HTTP 404 `NOT_FOUND`.
  * **AC4 (Phân quyền):** Given người gọi không có quyền `audit.read` (Brand Admin, Operations Staff, Inventory Staff),  
    When truy vết,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE` — nhật ký kiểm toán chứa dữ liệu của nhiều thương hiệu trên cùng máy.
* **Test:** `test_FR_AUD_11_order_trace`

---

<!-- Các FR còn lại (FR-AUD-01 ÷ 10): chép từ docs/ mục A17, bổ sung AC theo mẫu ở trên. -->
