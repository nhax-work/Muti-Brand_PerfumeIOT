# FR-RFQ — Yêu cầu bổ sung nước hoa

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A10 · 12 FR  
> Trạng thái AC: **hoàn thành** · Phụ trách đặc tả: TV3 · Hiện thực: TV1 (T8)  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`  
Mẫu định dạng AC: xem `spec/modules/SLT.md`

---

## FR-RFQ-01 — Tạo yêu cầu bổ sung nước hoa
* **Statement:** Hệ thống phải cho phép Brand Admin tạo yêu cầu bổ sung nước hoa cho slot mình đang thuê.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests`
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đang có hóa đơn thuê `H` trạng thái `ACTIVE` thuộc thương hiệu `B`,  
    When Brand Admin của `B` gửi `{ slotRentalId: H.id, slotId: S.id, fragranceProductId: P.id, reason: 'LOW_STOCK' }`,  
    Then hệ thống tạo bản ghi `refill_requests` với `status = 'SUBMITTED'`, `requested_by = actor.userId`, `created_at = now()`, trả về HTTP 201 cùng thông tin yêu cầu.
  * **AC2 (Khác thương hiệu):** Given slot `S` hoặc hóa đơn `H` không thuộc thương hiệu của Brand Admin,  
    When gửi yêu cầu tạo,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE` (hoặc composite foreign key `fk_refill_request_rental_same_brand` chặn).
  * **AC3 (Hóa đơn không hiệu lực):** Given hóa đơn trên slot `S` không ở trạng thái cho phép nạp (ví dụ `DRAFT` chưa thanh toán, `CANCELLED`, `CLOSED`),  
    When gửi yêu cầu tạo,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
* **Test:** `test_FR_RFQ_01_create_refill_request`

---

## FR-RFQ-02 — Bắt buộc chọn lý do yêu cầu bổ sung
* **Statement:** Hệ thống phải yêu cầu chọn lý do khi tạo yêu cầu, trong tập: LOW_STOCK, EXPIRING, PRODUCT_CHANGE.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests`
* **Acceptance criteria:**
  * **AC1:** Given payload tạo yêu cầu có trường `reason` mang một trong ba giá trị `'LOW_STOCK'`, `'EXPIRING'`, hoặc `'PRODUCT_CHANGE'`,  
    When Brand Admin gửi yêu cầu,  
    Then hệ thống chấp nhận và lưu đúng lý do vào cột `reason`.
  * **AC2 (Thiếu hoặc sai lý do):** Given payload thiếu trường `reason` hoặc mang giá trị nằm ngoài danh mục enum `refill_request_reason`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
* **Test:** `test_FR_RFQ_02_require_valid_reason`

---

## FR-RFQ-03 — Gợi ý tạo yêu cầu bổ sung khi sắp hết
* **Statement:** Hệ thống phải gợi ý tạo yêu cầu bổ sung cho Brand Admin khi slot của họ đạt ngưỡng sắp hết.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given chai nước hoa đang lắp tại slot `S` của thương hiệu `B` chuyển trạng thái sang `LOW` hoặc thể tích ước tính còn lại chạm ngưỡng cảnh báo,  
    When hệ thống ghi nhận sự kiện,  
    Then hệ thống phát cảnh báo hoặc hiển thị nút gợi ý tạo yêu cầu bổ sung trên giao diện web quản trị của Brand Admin (điền sẵn slot và sản phẩm tương ứng).
* **Test:** `test_FR_RFQ_03_suggest_refill_on_low_stock`

---

## FR-RFQ-04 — Quản lý trạng thái yêu cầu bổ sung
* **Statement:** Hệ thống phải quản lý trạng thái yêu cầu theo tập: SUBMITTED, ACCEPTED, REJECTED, SCHEDULED, COMPLETED, CANCELLED.
* **Traces:** BR-005 · **Priority:** M
* **API:** `GET /refill-requests`, `POST /refill-requests/{id}/schedule`, `POST /refill-requests/{id}/cancel` (ADR-0018)
* **Acceptance criteria:**
  * **AC1 (Duyệt/Từ chối ban đầu):** Given yêu cầu ở trạng thái `SUBMITTED`,  
    When Platform Super Admin xử lý,  
    Then trạng thái chỉ được chuyển sang `ACCEPTED` hoặc `REJECTED`.
  * **AC2 (Lên lịch hoặc hủy):** Given yêu cầu ở trạng thái `ACCEPTED`,  
    When nhân viên vận hành xử lý,  
    Then trạng thái có thể chuyển sang `SCHEDULED` (lên lịch nạp) hoặc `CANCELLED` (hủy yêu cầu trước khi nạp).
  * **AC3 (Hoàn tất):** Given yêu cầu ở trạng thái `SCHEDULED` (hoặc `ACCEPTED`),  
    When phiên nạp thực tế hoàn tất thành công,  
    Then trạng thái chuyển sang `COMPLETED`.
  * **AC4 (Chuyển trạng thái bất hợp lệ):** Given yêu cầu đã ở trạng thái kết thúc (`COMPLETED`, `REJECTED`, `CANCELLED`),  
    When có thao tác cố tình thay đổi trạng thái,  
    Then hệ thống từ chối với HTTP 409 hoặc 400 `VALIDATION_ERROR`.
* **Test:** `test_FR_RFQ_04_status_transitions`

---

## FR-RFQ-05 — Thông báo yêu cầu mới cho Super Admin và Inventory Staff
* **Statement:** Hệ thống phải thông báo yêu cầu mới cho Platform Super Admin và Inventory Staff.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin tạo thành công một yêu cầu bổ sung mới (`SUBMITTED`),  
    When transaction hoàn tất,  
    Then hệ thống tạo thông báo trong hòm thư hệ thống gửi tới Platform Super Admin và Inventory Staff với đầy đủ thông tin máy, slot và thương hiệu yêu cầu (FR-ALR-10).
* **Test:** `test_FR_RFQ_05_notify_staff_on_new_request`

---

## FR-RFQ-06 — Duyệt hoặc từ chối yêu cầu bổ sung
* **Statement:** Hệ thống phải cho phép Platform Super Admin chấp nhận hoặc từ chối yêu cầu, kèm lý do bắt buộc khi từ chối.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests/{id}/accept`, `POST /refill-requests/{id}/reject`
* **Acceptance criteria:**
  * **AC1 (Chấp nhận):** Given yêu cầu `R` ở trạng thái `SUBMITTED`,  
    When Platform Super Admin gọi endpoint accept,  
    Then yêu cầu chuyển sang `ACCEPTED`, ghi `reviewed_by = actor.userId`, cập nhật `updated_at`, và ghi AuditLog.
  * **AC2 (Từ chối hợp lệ):** Given yêu cầu `R` ở trạng thái `SUBMITTED`,  
    When Platform Super Admin gọi endpoint reject kèm `{ rejectionReason: "Kho tạm hết chai dự phòng cho sản phẩm này" }`,  
    Then yêu cầu chuyển sang `REJECTED`, lưu `rejection_reason`, ghi `reviewed_by = actor.userId`, và ghi AuditLog.
  * **AC3 (Từ chối thiếu lý do):** Given Platform Super Admin gọi endpoint reject nhưng `rejectionReason` bị bỏ trống hoặc chỉ chứa khoảng trắng,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC4 (Phân quyền):** Given người gọi không mang vai trò Platform Super Admin (ví dụ Brand Admin),  
    When gọi endpoint accept hoặc reject,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_RFQ_06_review_refill_request`

---

## FR-RFQ-07 — Lên lịch xử lý yêu cầu bổ sung
* **Statement:** Hệ thống phải cho phép Inventory Staff lên lịch xử lý yêu cầu đã được chấp nhận.
* **Traces:** BR-005 · **Priority:** S
* **API:** `POST /refill-requests/{id}/schedule` (ADR-0018)
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu `R` ở trạng thái `ACCEPTED`,  
    When Inventory Staff gán mốc thời gian xử lý dự kiến `scheduledAt`,  
    Then hệ thống cập nhật `scheduled_at = scheduledAt` và chuyển trạng thái sang `SCHEDULED`.
* **Test:** `test_FR_RFQ_07_schedule_refill_request`

---

## FR-RFQ-08 — Liên kết yêu cầu với phiên nạp thực tế
* **Statement:** Hệ thống phải liên kết yêu cầu với phiên nạp thực tế khi Inventory Staff hoàn tất việc nạp.
* **Traces:** BR-005, BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu `R` của slot `S` đang ở trạng thái `ACCEPTED` hoặc `SCHEDULED`,  
    When Inventory Staff thực hiện phiên nạp thực tế (`refill_sessions`) cho slot `S`,  
    Then phiên nạp được gắn kết với yêu cầu thông qua `refill_requests.refill_session_id = refill_sessions.id`.
* **Test:** `test_FR_RFQ_08_link_refill_session`

---

## FR-RFQ-09 — Chuyển COMPLETED khi phiên nạp thành công
* **Statement:** Hệ thống phải chuyển yêu cầu sang COMPLETED khi phiên nạp liên kết kết thúc thành công.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu `R` đã liên kết với `refill_session_id`,  
    When phiên nạp hoàn tất checklist và đóng thành công (`refill_sessions.status = 'COMPLETED'`),  
    Then hệ thống tự động cập nhật yêu cầu `R` sang `status = 'COMPLETED'`.
  * **AC2 (Ràng buộc CSDL §13 mục 4):** Given yêu cầu `R` có `refill_session_id` là NULL,  
    When có bất kỳ thao tác trực tiếp nào cố chuyển `status` sang `COMPLETED`,  
    Then hệ thống từ chối thao tác (cưỡng chế toàn vẹn dữ liệu).
* **Test:** `test_FR_RFQ_09_complete_on_session_completion`

---

## FR-RFQ-10 — Brand Admin theo dõi trạng thái và lịch sử
* **Statement:** Hệ thống phải cho phép Brand Admin xem trạng thái và lịch sử các yêu cầu của thương hiệu mình.
* **Traces:** BR-005 · **Priority:** M
* **API:** `GET /refill-requests`
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B`,  
    When gọi `GET /refill-requests`,  
    Then hệ thống trả về danh sách các yêu cầu bổ sung thuộc `B` (sắp xếp mới nhất trước), hỗ trợ phân trang (`page`, `pageSize`) và lọc theo `status`.
  * **AC2 (Cô lập dữ liệu thương hiệu):** Given yêu cầu `R_A` của thương hiệu `A` và `R_B` của thương hiệu `B`,  
    When Brand Admin của thương hiệu `A` tra cứu danh sách hoặc chi tiết,  
    Then kết quả chỉ trả về `R_A`, tuyệt đối không thấy `R_B` (BR-012, `fk_refill_request_rental_same_brand`).
* **Test:** `test_FR_RFQ_10_list_brand_refill_requests`

---

## FR-RFQ-11 — Không cho phép Brand Admin thao tác phiên nạp
* **Statement:** Hệ thống phải không cho phép Brand Admin trực tiếp thực hiện hoặc chỉnh sửa phiên nạp.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given người dùng mang vai trò Brand Admin,  
    When cố tình gọi các endpoint bắt đầu, hoàn tất hoặc cập nhật phiên nạp (`/refill-sessions*`),  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_RFQ_11_brand_admin_cannot_touch_refill_sessions`

---

## FR-RFQ-12 — Ngăn tạo yêu cầu trùng khi slot còn yêu cầu chưa hoàn tất
* **Statement:** Hệ thống phải ngăn tạo yêu cầu mới trên cùng slot khi đã tồn tại yêu cầu chưa hoàn tất.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests`
* **Acceptance criteria:**
  * **AC1 (Chặn trùng trên slot):** Given slot `S` đang có một yêu cầu ở trạng thái `SUBMITTED`, `ACCEPTED`, hoặc `SCHEDULED`,  
    When Brand Admin gửi yêu cầu tạo thêm một yêu cầu bổ sung mới cho slot `S`,  
    Then hệ thống từ chối với HTTP 409 `REFILL_REQUEST_PENDING` (cưỡng chế bởi unique partial index `uq_refill_request_open`).
  * **AC2 (Cho phép khi yêu cầu trước đã đóng):** Given yêu cầu trước đó trên slot `S` đã ở trạng thái `COMPLETED`, `REJECTED`, hoặc `CANCELLED`,  
    When Brand Admin gửi yêu cầu tạo mới cho slot `S`,  
    Then hệ thống chấp nhận và tạo yêu cầu thành công.
* **Test:** `test_FR_RFQ_12_prevent_duplicate_open_refill_request`
