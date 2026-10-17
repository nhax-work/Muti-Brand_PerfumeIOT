# FR-RFQ — Yêu cầu bổ sung nước hoa

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A10 · 12 FR  
> Trạng thái AC: **hoàn thành** (biên soạn ngày 2026-10-17 theo lộ trình Tuần 6)  
> Phụ trách: TV3 / Tài  

Mô-đun Quản lý yêu cầu bổ sung nước hoa (Refill Request Management) cho phép Brand Admin chủ động yêu cầu nạp thêm dung dịch khi sắp hết, chai sắp hết hạn hoặc đổi sản phẩm sang slot đang thuê. Phiên nạp thực tế tại máy chỉ do Inventory Staff thực hiện để bảo đảm an toàn thiết bị và tính toàn vẹn của chuỗi cung ứng.

Vòng đời yêu cầu:
```
SUBMITTED ──> ACCEPTED ──> SCHEDULED ──> COMPLETED
     │            │
     │            └──> CANCELLED
     └──> REJECTED
``` 
`COMPLETED` chỉ được gán khi có `refill_session_id` liên kết hợp lệ.

Đọc kèm: `spec/glossary.md` (§RefillRequest), `spec/errors.md`, `spec/constraints.md`, `spec/contracts/schema.sql` (bảng `refill_requests`, index `uq_refill_request_open`).

---

## FR-RFQ-01 — Tạo yêu cầu bổ sung nước hoa cho slot đang thuê
* **Statement:** Hệ thống phải cho phép Brand Admin tạo yêu cầu bổ sung nước hoa cho slot mình đang thuê.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests`
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B` đang có hóa đơn thuê có hiệu lực (`ACTIVE`) trên slot `S`,  
    When gửi `POST /refill-requests` với `slotId = S`, `reason` hợp lệ và `fragranceProductId` (nếu đổi mùi),  
    Then hệ thống tạo mới bản ghi `refill_requests` với `status = 'SUBMITTED'`, `brand_id = B`, `requested_by = current_user_id` và trả HTTP 201 cùng dữ liệu yêu cầu.
  * **AC2 (Không thuê slot):** Given slot `S` đang trống hoặc thuộc quyền khai thác của thương hiệu khác,  
    When người dùng thương hiệu `B` gửi yêu cầu nạp cho slot `S`,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC3 (Hóa đơn không hiệu lực):** Given hóa đơn thuê slot của thương hiệu `B` trên slot `S` đã kết thúc (`CLOSED` hoặc `TERMINATED`),  
    When gửi yêu cầu tạo phiếu nạp cho slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_NOT_RENTED` hoặc HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_RFQ_01_create_refill_request`

---

## FR-RFQ-02 — Bắt buộc chọn lý do khi tạo yêu cầu bổ sung
* **Statement:** Hệ thống phải yêu cầu chọn lý do khi tạo yêu cầu, trong tập: LOW_STOCK, EXPIRING, PRODUCT_CHANGE.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests`
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu tạo phiếu bổ sung nước hoa gửi kèm trường `reason`,  
    When `reason` thuộc tập enum `refill_request_reason` (`'LOW_STOCK'`, `'EXPIRING'`, `'PRODUCT_CHANGE'`),  
    Then hệ thống chấp nhận lưu lý do vào trường `refill_requests.reason`.
  * **AC2 (Thiếu lý do hoặc lý do sai):** Given payload tạo yêu cầu thiếu trường `reason` hoặc giá trị không nằm trong 3 lý do quy định,  
    When gửi yêu cầu tới API,  
    Then hệ thống từ chối với HTTP 400 `INVALID_ARGUMENT`.
  * **AC3 (Đổi sản phẩm):** Given `reason = 'PRODUCT_CHANGE'`,  
    When gửi yêu cầu,  
    Then trường `fragranceProductId` bắt buộc phải có giá trị và sản phẩm phải thuộc sở hữu của thương hiệu `B`, ngược lại trả HTTP 400 `INVALID_PRODUCT`.
* **Test:** `test_FR_RFQ_02_require_valid_reason`

---

## FR-RFQ-03 — Gợi ý tạo yêu cầu bổ sung khi slot sắp hết
* **Statement:** Hệ thống phải gợi ý tạo yêu cầu bổ sung cho Brand Admin khi slot của họ đạt ngưỡng sắp hết.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` của thương hiệu `B` có chai đang hoạt động với dung tích còn lại `<= BOTTLE_LOW_PERCENT` hoặc số lượt xịt còn lại `<= LOW_STOCK_SPRAY_THRESHOLD`,  
    When Brand Admin truy cập cổng quản trị (hoặc xem chi tiết slot),  
    Then hệ thống hiển thị nhãn cảnh báo "Sắp hết nước hoa" kèm nút thao tác tắt "Tạo yêu cầu nạp".
  * **AC2:** Given slot chưa chạm ngưỡng sắp hết,  
    When xem chi tiết slot,  
    Then hệ thống không hiển thị gợi ý nạp khẩn cấp.
* **Test:** `test_FR_RFQ_03_low_stock_refill_suggestion`

---

## FR-RFQ-04 — Quản lý trạng thái yêu cầu bổ sung
* **Statement:** Hệ thống phải quản lý trạng thái yêu cầu theo tập: SUBMITTED, ACCEPTED, REJECTED, SCHEDULED, COMPLETED, CANCELLED.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1 (Khởi tạo):** Yêu cầu mới luôn bắt đầu ở trạng thái `SUBMITTED`.
  * **AC2 (Chuyển trạng thái hợp lệ):**  
    - `SUBMITTED` chỉ có thể chuyển sang `ACCEPTED`, `REJECTED`, hoặc `CANCELLED`.
    - `ACCEPTED` chỉ có thể chuyển sang `SCHEDULED` hoặc `CANCELLED`.
    - `SCHEDULED` chỉ có thể chuyển sang `COMPLETED`.
  * **AC3 (Trạng thái đóng):** Khi yêu cầu ở `REJECTED`, `COMPLETED` hoặc `CANCELLED`, không được phép chuyển sang bất kỳ trạng thái nào khác; mọi nỗ lực cập nhật trạng thái bị từ chối với HTTP 409 `INVALID_STATE`.
  * **AC4 (Khách hàng huỷ):** Given yêu cầu đang ở `SUBMITTED` hoặc `ACCEPTED`,  
    When Brand Admin sở hữu yêu cầu gọi huỷ (`POST /refill-requests/{id}/cancel`),  
    Then yêu cầu chuyển sang `CANCELLED`.
* **Test:** `test_FR_RFQ_04_refill_request_lifecycle`

---

## FR-RFQ-05 — Thông báo yêu cầu mới cho Admin và Inventory Staff
* **Statement:** Hệ thống phải thông báo yêu cầu mới cho Platform Super Admin và Inventory Staff.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu bổ sung mới được tạo thành công ở trạng thái `SUBMITTED`,  
    When transaction tạo yêu cầu commit,  
    Then hệ thống tự động sinh thông báo loại `REFILL_REQUEST_CREATED` trong bảng `notifications` cho tất cả tài khoản có vai trò `Platform Super Admin` và `Inventory Staff` phụ trách khu vực của máy.
  * **AC2:** Nội dung thông báo hiển thị rõ tên thương hiệu, mã máy, vị trí slot và lý do yêu cầu nạp.
* **Test:** `test_FR_RFQ_05_notify_admins_on_new_request`

---

## FR-RFQ-06 — Phê duyệt hoặc từ chối yêu cầu bổ sung
* **Statement:** Hệ thống phải cho phép Platform Super Admin chấp nhận hoặc từ chối yêu cầu, kèm lý do bắt buộc khi từ chối.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests/{id}/accept`, `POST /refill-requests/{id}/reject`
* **Acceptance criteria:**
  * **AC1 (Chấp nhận):** Given yêu cầu đang ở `SUBMITTED`,  
    When Platform Super Admin gửi `POST /refill-requests/{id}/accept`,  
    Then yêu cầu chuyển sang `ACCEPTED`, trường `reviewed_by` ghi nhận ID Admin và thông báo cho Brand Admin.
  * **AC2 (Từ chối có lý do):** Given yêu cầu đang ở `SUBMITTED`,  
    When Platform Super Admin gửi `POST /refill-requests/{id}/reject` kèm payload `{ "reason": "Lý do từ chối cụ thể..." }`,  
    Then yêu cầu chuyển sang `REJECTED`, lưu lý do từ chối vào `review_note`, giải phóng slot để tạo yêu cầu mới.
  * **AC3 (Từ chối thiếu lý do):** Given gửi yêu cầu từ chối nhưng không cung cấp `reason` hoặc chuỗi rỗng,  
    Then hệ thống từ chối với HTTP 400 `REASON_REQUIRED`.
  * **AC4 (Phân quyền):** Given người dùng có vai trò `Brand Admin` hoặc `Operations Staff` gọi endpoint duyệt/từ chối,  
    Then hệ thống trả về HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_RFQ_06_admin_review_refill_request`

---

## FR-RFQ-07 — Lên lịch xử lý yêu cầu bổ sung
* **Statement:** Hệ thống phải cho phép Inventory Staff lên lịch xử lý yêu cầu đã được chấp nhận.
* **Traces:** BR-005 · **Priority:** S
* **API:** `POST /refill-requests/{id}/schedule`
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu đang ở trạng thái `ACCEPTED`,  
    When Inventory Staff gửi `scheduledAt` (thời điểm dự kiến nạp trong tương lai),  
    Then hệ thống cập nhật trường `scheduled_at`, chuyển trạng thái yêu cầu sang `SCHEDULED` và thông báo cho Brand Admin.
  * **AC2 (Trạng thái không hợp lệ):** Given yêu cầu đang ở `SUBMITTED`, `REJECTED` hoặc `COMPLETED`,  
    When Inventory Staff cố gắng lên lịch,  
    Then hệ thống trả về HTTP 409 `INVALID_STATE`.
* **Test:** `test_FR_RFQ_07_inventory_staff_schedule_refill`

---

## FR-RFQ-08 — Liên kết yêu cầu với phiên nạp thực tế
* **Statement:** Hệ thống phải liên kết yêu cầu với phiên nạp thực tế khi Inventory Staff hoàn tất việc nạp.
* **Traces:** BR-005, BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu `R` đang ở `SCHEDULED` (hoặc `ACCEPTED`) trên slot `S`,  
    When Inventory Staff mở phiên nạp `refill_sessions` trên slot `S` và chọn xử lý cho yêu cầu `R`,  
    Then bản ghi phiên nạp lưu `refill_requests.id`, đồng thời trường `refill_requests.refill_session_id` được liên kết với ID của phiên nạp đó.
* **Test:** `test_FR_RFQ_08_link_refill_session`

---

## FR-RFQ-09 — Hoàn tất yêu cầu khi phiên nạp thành công
* **Statement:** Hệ thống phải chuyển yêu cầu sang COMPLETED khi phiên nạp liên kết kết thúc thành công.
* **Traces:** BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu bổ sung `R` đã liên kết với phiên nạp `refill_session_id = X`,  
    When phiên nạp `X` hoàn tất đóng thành công (`status = 'COMPLETED'` qua `POST /inventory/refill-sessions/{id}/close`),  
    Then yêu cầu `R` tự động chuyển trạng thái sang `COMPLETED` trong cùng database transaction.
  * **AC2 (Ràng buộc CSDL):** Trạng thái `COMPLETED` tuyệt đối không thể được gán thủ công nếu `refill_session_id IS NULL`:
    ```sql
    CHECK (status != 'COMPLETED' OR refill_session_id IS NOT NULL)
    ```
    Mọi câu lệnh UPDATE cố tình vi phạm sẽ bị CSDL chặn và rollback.
* **Test:** `test_FR_RFQ_09_complete_on_session_finish`

---

## FR-RFQ-10 — Xem trạng thái và lịch sử yêu cầu của thương hiệu
* **Statement:** Hệ thống phải cho phép Brand Admin xem trạng thái và lịch sử các yêu cầu của thương hiệu mình.
* **Traces:** BR-005 · **Priority:** M
* **API:** `GET /refill-requests`
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B` đăng nhập hệ thống,  
    When gọi `GET /refill-requests`,  
    Then hệ thống trả về danh sách phân trang các yêu cầu bổ sung có `brand_id = B`, hỗ trợ lọc theo `status` và `slotId`.
  * **AC2 (Cô lập dữ liệu):** Kết quả trả về tuyệt đối không chứa bất kỳ yêu cầu nào thuộc thương hiệu khác.
  * **AC3 (Platform Super Admin):** Khi Platform Super Admin gọi endpoint này, có thể xem danh sách toàn bộ yêu cầu của tất cả thương hiệu.
* **Test:** `test_FR_RFQ_10_brand_admin_view_history`

---

## FR-RFQ-11 — Ngăn Brand Admin can thiệp trực tiếp vào phiên nạp
* **Statement:** Hệ thống phải không cho phép Brand Admin trực tiếp thực hiện hoặc chỉnh sửa phiên nạp.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /inventory/refill-sessions`, `POST /inventory/refill-sessions/{id}/close`
* **Acceptance criteria:**
  * **AC1:** Given người dùng có vai trò `Brand Admin`,  
    When gửi request tạo, mở, cập nhật checklist hoặc đóng phiên nạp (`/inventory/refill-sessions*`),  
    Then hệ thống từ chối ngay lập tức với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC2:** Chỉ người dùng có vai trò `Inventory Staff` hoặc `Platform Super Admin` mới có quyền thực thi các endpoint phiên nạp kho.
* **Test:** `test_FR_RFQ_11_brand_cannot_execute_refill_session`

---

## FR-RFQ-12 — Ngăn tạo trùng yêu cầu chưa hoàn tất trên cùng một slot
* **Statement:** Hệ thống phải ngăn tạo yêu cầu mới trên cùng slot khi đã tồn tại yêu cầu chưa hoàn tất.
* **Traces:** BR-005 · **Priority:** M
* **API:** `POST /refill-requests`
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã có một yêu cầu bổ sung đang ở trạng thái chưa hoàn tất (`SUBMITTED`, `ACCEPTED` hoặc `SCHEDULED`),  
    When Brand Admin gửi yêu cầu tạo thêm phiếu nạp trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `REFILL_REQUEST_PENDING`.
  * **AC2 (Bảo vệ bằng CSDL):** Ràng buộc được bảo đảm bằng partial unique index trong CSDL:
    ```sql
    CREATE UNIQUE INDEX uq_refill_request_open ON refill_requests (slot_id)
      WHERE status IN ('SUBMITTED', 'ACCEPTED', 'SCHEDULED');
    ```
    Hai request tạo đồng thời trên cùng slot sẽ có đúng 1 request thành công, request còn lại bị CSDL ném lỗi duplicate và API trả HTTP 409 `REFILL_REQUEST_PENDING`.
  * **AC3 (Sau khi hoàn tất/hủy):** Given yêu cầu trước đó trên slot `S` đã chuyển sang `COMPLETED`, `REJECTED` hoặc `CANCELLED`,  
    When Brand Admin gửi yêu cầu mới,  
    Then hệ thống chấp nhận tạo thành công bản ghi mới.
* **Test:** `test_FR_RFQ_12_prevent_duplicate_open_request`
