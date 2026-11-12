# FR-MCH — Máy và slot

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A5 · 18 FR  
> Trạng thái AC: **một phần** — FR-MCH-09 (soát lại), FR-MCH-15÷17, và FR-MCH-18 (thêm mới theo ADR-0015) đã hoàn thành; FR-MCH-01÷08, 10÷14 dạng CRUD/phát biểu  
> Phụ trách: TV4 / Tài  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu  

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`,
`spec/decisions/0015-dung-ban-an-toan-va-bao-ve-khach-tai-may.md`

---

## FR-MCH-09 — Hiển thị chế độ vận hành máy
* **Statement:** Hệ thống phải hiển thị chế độ hoạt động của máy theo tập: NORMAL, DRAINING, MAINTENANCE trên màn hình quản trị và cập nhật ngay khi thay đổi (ADR-0015).
* **Traces:** BR-004, BR-006 · **Priority:** M
* **API:** `GET /machines`, `GET /machines/{id}`
* **Acceptance criteria:**
  * **AC1:** Given máy `M` đang ở chế độ `operating_mode` thuộc enum (`'NORMAL'`, `'DRAINING'`, `'MAINTENANCE'`),  
    When người dùng xem thông tin máy trên web quản trị,  
    Then hệ thống hiển thị chính xác nhãn chế độ tương ứng kèm số lượng đơn đang phục vụ nốt (nếu đang `DRAINING`).
  * **AC2:** Given máy `M` vừa chuyển từ `DRAINING` sang `MAINTENANCE` do hết đơn dở dang,  
    When truy vấn lại thông tin máy,  
    Then trạng thái phản hồi cập nhật thành `MAINTENANCE` ngay lập tức.
* **Test:** `test_FR_MCH_09_display_operating_mode`

---

## FR-MCH-15 — Tập trạng thái khả dụng của slot
* **Statement:** Hệ thống phải quản lý trạng thái khả dụng của slot theo tập: AVAILABLE, UNAVAILABLE, MAINTENANCE, DISABLED.
* **Traces:** BR-002, BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given một slot bất kỳ,  
    When hệ thống lưu trạng thái khả dụng,  
    Then giá trị chỉ thuộc enum `slot_status`.
  * **AC2:** Given giá trị nằm ngoài tập quy định,  
    When yêu cầu cập nhật trạng thái slot,  
    Then hệ thống từ chối giá trị đó.
  * **AC3:** Given slot vừa được tạo cùng máy mới,  
    When kiểm tra bản ghi,  
    Then trạng thái mặc định là `DISABLED` — slot chưa dùng được cho tới khi đủ điều kiện ở FR-MCH-16.
* **Test:** `test_FR_MCH_15_slot_status_set`

---

## FR-MCH-16 — Điều kiện chuyển slot sang AVAILABLE
* **Statement:** Hệ thống phải chuyển slot sang AVAILABLE khi đồng thời thỏa: có hóa đơn ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED; đã gán sản phẩm và đặt giá lượt xịt; có chai đang lắp với lượng còn lại đủ cho một lượt xịt; và slot không bị tắt thủ công.
* **Traces:** BR-002, BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` thỏa **đồng thời cả bốn** điều kiện — hóa đơn ở một trong bốn trạng thái chiếm dụng, `fragrance_product_id` và `price_per_spray` khác NULL, `active_bottle_id` khác NULL với `estimated_remaining_ml >= calibrated_dosage_ml`, và slot không bị tắt thủ công,  
    When hệ thống tính lại trạng thái khả dụng,  
    Then slot `S` chuyển sang `AVAILABLE`.
  * **AC2 (Thiếu hóa đơn):** Given slot `S` không có hóa đơn ở trạng thái chiếm dụng,  
    When tính trạng thái,  
    Then slot **không** chuyển `AVAILABLE` (FR-SLT-10).
  * **AC3 (Thiếu sản phẩm hoặc giá):** Given hóa đơn trên slot `S` có `fragrance_product_id` hoặc `price_per_spray` là NULL (thương hiệu đã thanh toán nhưng chưa cấu hình slot xong — FR-SLT-08, FR-SLT-27),  
    When tính trạng thái,  
    Then slot **không** chuyển `AVAILABLE` (FR-SLT-29).
  * **AC4 (Không đủ cho một lượt xịt):** Given chai đang lắp có `estimated_remaining_ml < calibrated_dosage_ml`,  
    When tính trạng thái,  
    Then slot **không** chuyển `AVAILABLE` (FR-INV-12).
  * **AC5 (Hàng thanh lý vẫn bán được):** Given hóa đơn trên slot `S` ở trạng thái `LIQUIDATED` và ba điều kiện còn lại đều thỏa,  
    When tính trạng thái,  
    Then slot `S` vẫn chuyển `AVAILABLE` — doanh thu từ đó thuộc nền tảng (FR-EXP-17, FR-REV-02).
* **Test:** `test_FR_MCH_16_slot_becomes_available`

---

## FR-MCH-17 — Chuyển slot sang UNAVAILABLE khi mất điều kiện
* **Statement:** Hệ thống phải chuyển slot sang UNAVAILABLE ngay khi bất kỳ điều kiện tại FR-MCH-16 không còn thỏa.
* **Traces:** BR-002, BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1 (Hết hàng):** Given slot `S` đang `AVAILABLE`,  
    When lượt xịt thành công làm `estimated_remaining_ml` tụt xuống dưới `calibrated_dosage_ml`,  
    Then slot chuyển `UNAVAILABLE` ngay trong cùng luồng cập nhật tồn kho (FR-INV-10, FR-INV-12).
  * **AC2 (Hóa đơn kết thúc):** Given slot `S` đang `AVAILABLE`,  
    When hóa đơn chuyển sang `TERMINATED` hoặc `CLOSED`,  
    Then slot chuyển `UNAVAILABLE` (FR-SLT-11).
  * **AC3 (Tháo chai):** Given slot `S` đang `AVAILABLE`,  
    When Inventory Staff tháo chai khỏi slot,  
    Then slot chuyển `UNAVAILABLE` (FR-INV-15).
  * **AC4 (Tắt thủ công):** Given slot `S` đang `AVAILABLE`,  
    When Operations Staff tắt slot từ xa,  
    Then slot chuyển `UNAVAILABLE` (FR-MCH-12).
  * **AC5 (Không nhận đơn mới):** Given slot `S` vừa chuyển `UNAVAILABLE`,  
    When kiosk yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_UNAVAILABLE` (FR-ORD-04).
* **Test:** `test_FR_MCH_17_slot_becomes_unavailable`

---

## FR-MCH-18 — Tự chuyển slot sang MAINTENANCE khi lỗi xịt liên tiếp
* **Statement:** Hệ thống phải tự chuyển slot sang MAINTENANCE khi `CONSECUTIVE_FAIL_ALERT` lệnh xịt khách hàng liên tiếp trên slot kết thúc bằng FAILED, UNKNOWN hoặc REJECTED với mã khác `PRESS_TIMEOUT` và `CMD_DUPLICATE`; slot chỉ bán lại khi Operations Staff bật lại (FR-MCH-12) (ADR-0015).
* **Traces:** BR-002, BR-006 · **Priority:** M · ADR-0015 mục 4
* **Acceptance criteria:**
  * **AC1 (Tự khóa sang MAINTENANCE):** Given slot `S` trên máy `M` gặp `CONSECUTIVE_FAIL_ALERT = 3` lượt xịt khách hàng liên tiếp thất bại (`FAILED`, `UNKNOWN` timeout, hoặc thiết bị từ chối với mã khác `PRESS_TIMEOUT` và `CMD_DUPLICATE`),  
    When lượt thất bại thứ 3 được ghi nhận,  
    Then hệ thống tự động cập nhật trạng thái slot `S` sang `MAINTENANCE`, đồng thời sinh cảnh báo `CONSECUTIVE_FAIL_ALERT` (FR-ALR-04) và ghi AuditLog.
  * **AC2 (Loại trừ PRESS_TIMEOUT và CMD_DUPLICATE):** Given lượt xịt thất bại do khách không bấm nút (`PRESS_TIMEOUT`) hoặc bản sao lệnh (`CMD_DUPLICATE`),  
    When ghi nhận kết quả,  
    Then bộ đếm lỗi liên tiếp của slot không bị tăng và không kích hoạt tự động khóa bảo trì.
  * **AC3 (Chỉ mở lại bằng thao tác thủ công):** Given slot đang ở trạng thái `MAINTENANCE` do lỗi liên tiếp,  
    When máy vẫn hoạt động,  
    Then slot tuyệt đối không tự động mở lại bán hàng cho đến khi Operations Staff kiểm tra, khắc phục và chủ động bật lại thủ công qua API bật slot (FR-MCH-12).
* **Test:** `test_FR_MCH_18_auto_slot_maintenance_on_consecutive_fails`
