# FR-SLT — Hóa đơn thuê slot

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A6 · 47 mục = 40 FR hiệu lực + 7 FR bãi bỏ (mức X)  
> Trạng thái AC: **hoàn thành** (FR-SLT-01÷18 viết tuần 1; FR-SLT-19÷29 bổ sung sau; ngày 2026-09-25 viết lại theo ADR-0006 — **TV1 đã duyệt 2026-09-29**: bãi bỏ FR-SLT-01, 20÷23, 25, 26; viết lại FR-SLT-06, 08, 12, 13, 17, 18, 19, 24, 27, 29; thêm FR-SLT-30÷47. Ngày 2026-09-30 theo ADR-0008 — thanh toán nhiều slot một lần, **TV1 đã duyệt 2026-09-30**: viết lại FR-SLT-35, 36, 37, 38, 39, 43; chỉnh FR-SLT-12, 40)  
> Phụ trách: TV3 / Tài  

"Hóa đơn thuê slot" là thuật ngữ tiếng Việt của thực thể `SlotRental`; định danh kỹ thuật không đổi.
"Phiên thanh toán" (`RentalCheckout`, ADR-0008) gom các hóa đơn tạo trong cùng một lần chọn để trả
tiền một lần; mỗi slot vẫn là một hóa đơn với số hóa đơn và vòng đời riêng.

Luồng của Brand Admin: đăng nhập → xem slot trống (FR-SLT-19) → chọn một hoặc nhiều slot và chọn dịch
vụ cho từng slot (FR-SLT-34, 35) → thanh toán một lần cho cả phiên (FR-SLT-37, 38) → nhận một hóa đơn
cho mỗi slot (FR-SLT-40) → cấu hình từng slot (FR-SLT-08, 27). Thời hạn mỗi hóa đơn bắt đầu khi
Inventory Staff lắp chai đầu tiên vào slot đó (FR-SLT-24).

Đọc kèm: `spec/glossary.md` (state machine SlotRental), `spec/errors.md`, `spec/constraints.md`,
`spec/decisions/0006-mua-goi-thue-slot-tu-phuc-vu-va-hoa-don.md`

---

## FR-SLT-01 — ~~Tạo hợp đồng thuê slot~~ (bãi bỏ)
* **Statement:** ~~Hệ thống phải cho phép Platform Super Admin tạo hợp đồng thuê slot gồm slot, thương hiệu, ngày bắt đầu, ngày kết thúc, phí cố định theo kỳ và tỷ lệ ăn chia doanh thu.~~
* **Traces:** BR-009, BR-011 · **Priority:** X (bãi bỏ theo ADR-0006)
* **Lý do:** hóa đơn chỉ sinh ra khi Brand Admin mua gói (FR-SLT-35); không còn đường Platform Super Admin tạo tay. Ràng buộc tham số tiền chuyển sang FR-SLT-30 ÷ 33 và FR-SLT-36.

---

## FR-SLT-02 — Một hóa đơn hiệu lực trên mỗi slot
* **Statement:** Hệ thống phải bảo đảm mỗi slot chỉ có tối đa một hóa đơn ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED tại một thời điểm.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã có một hóa đơn ở trạng thái `ACTIVE`,  
    When tạo hóa đơn mới trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_OCCUPIED`.
  * **AC2:** Given slot `S` có hóa đơn ở trạng thái `LIQUIDATED` (đang bán hàng tồn thanh lý),  
    When tạo hóa đơn mới trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_OCCUPIED`.
  * **AC3:** Given slot `S` có hóa đơn cũ đã chuyển sang `CLOSED` hoặc `TERMINATED`,  
    When tạo hóa đơn mới trên slot `S`,  
    Then hệ thống chấp nhận tạo hóa đơn.
  * **AC4 (Đồng thời - Concurrency):** Given hai yêu cầu tạo hóa đơn trên cùng slot `S` đến đồng thời,  
    Then đúng một yêu cầu thành công, yêu cầu còn lại bị chặn và nhận mã lỗi HTTP 409 `SLOT_OCCUPIED`.
* **Ràng buộc CSDL bắt buộc:**
  ```sql
  CREATE UNIQUE INDEX uq_slot_active_rental
    ON slot_rentals (slot_id)
    WHERE status IN ('ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED');
  ```
  AC4 phải được bảo đảm bằng index này, **không** bằng kiểm tra ở tầng ứng dụng.
* **Test:** `test_FR_SLT_02_reject_occupied_slot`

---

## FR-SLT-03 — Thuê đồng thời nhiều slot trên cùng một máy
* **Statement:** Hệ thống phải cho phép một thương hiệu thuê đồng thời nhiều slot trên cùng một máy.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` đang có hóa đơn ACTIVE trên slot 1 của máy `M`, slot 2 của máy `M` đang trống,  
    When tạo hóa đơn mới cho thương hiệu `B` trên slot 2,  
    Then hệ thống tạo hóa đơn thành công và cả hai slot đều thuộc quyền khai thác của thương hiệu `B`.
  * **AC2:** Given máy `M` có `N` slot trống,  
    When tạo `N` hóa đơn cho cùng thương hiệu `B` trên `N` slot này,  
    Then hệ thống chấp nhận toàn bộ `N` hóa đơn độc lập nhau.
* **Test:** `test_FR_SLT_03_brand_multiple_slots_same_machine`

---

## FR-SLT-04 — Độc lập cấu hình giữa các slot của cùng thương hiệu
* **Statement:** Hệ thống phải cho phép mỗi slot của cùng một thương hiệu trên cùng một máy có sản phẩm, giá và kỳ hạn riêng biệt.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` thuê slot 1 và slot 2 trên cùng máy `M`,  
    When cấu hình slot 1 với sản phẩm `P1`, giá 20,000 VND, kỳ hạn Q1; và slot 2 với sản phẩm `P2`, giá 35,000 VND, kỳ hạn Q2,  
    Then hệ thống lưu trữ và áp dụng độc lập các cấu hình mà không làm ghi đè lẫn nhau.
  * **AC2:** Given slot 1 hết hạn trước slot 2 và chuyển sang trạng thái `EXPIRING` hoặc `GRACE`,  
    When kiểm tra slot 2,  
    Then slot 2 vẫn duy trì trạng thái `ACTIVE` bình thường, giá và cấu hình không bị thay đổi.
* **Test:** `test_FR_SLT_04_independent_slot_configurations`

---

## FR-SLT-05 — Chống chồng lấn kỳ hạn trên cùng slot
* **Statement:** Hệ thống phải từ chối tạo hóa đơn có kỳ hạn chồng lấn với hóa đơn đang tồn tại trên cùng slot.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã có hóa đơn ACTIVE với kỳ hạn `01/01 - 31/03`,  
    When tạo hóa đơn mới trên `S` với kỳ hạn `01/02 - 30/04`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_OVERLAP`.
  * **AC2:** Given slot `S` có hóa đơn ACTIVE `01/01 - 31/03`,  
    When tạo hóa đơn mới trên `S` bắt đầu từ `01/04`,  
    Then hệ thống chấp nhận.
  * **AC3 (Ca biên - Trùng mốc biên):** Given slot `S` có hóa đơn ACTIVE `01/01 - 31/03`,  
    When tạo hóa đơn mới trên `S` bắt đầu đúng ngày `31/03`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_OVERLAP` (khoảng đóng hai đầu `[start, end]`).
  * **AC4:** Given slot `S` có hóa đơn cũ bị `TERMINATED` hiệu lực đến `15/02`,  
    When tạo hóa đơn mới trên `S` từ `16/02`,  
    Then hệ thống chấp nhận.
* **Test:** `test_FR_SLT_05_reject_overlapping_rental`

---

## FR-SLT-06 — Quản lý vòng đời trạng thái hóa đơn
* **Statement:** Hệ thống phải quản lý trạng thái hóa đơn theo tập: DRAFT, ACTIVE, EXPIRING, GRACE, RENEWED, LIQUIDATED, CLOSED, TERMINATED, CANCELLED.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn đang ở trạng thái hợp lệ,  
    When thực hiện chuyển đổi trạng thái tuân thủ đúng sơ đồ State Machine (`DRAFT -> ACTIVE -> EXPIRING -> GRACE -> RENEWED/LIQUIDATED -> CLOSED`, `EXPIRING -> RENEWED`, `ACTIVE -> TERMINATED`, hoặc `DRAFT -> CANCELLED`),  
    Then hệ thống cập nhật trạng thái mới và ghi vết AuditLog.
  * **AC2 (Chuyển đổi sai quy tắc):** Given hóa đơn đang ở trạng thái `CLOSED`, `TERMINATED` hoặc `CANCELLED`,  
    When có yêu cầu chuyển sang `ACTIVE` hoặc `GRACE`,  
    Then hệ thống từ chối với HTTP 400.
  * **AC3:** Given hóa đơn đang ở `LIQUIDATED`,  
    When có yêu cầu chuyển sang `RENEWED`,  
    Then hệ thống từ chối với HTTP 400 (hàng thanh lý không thể phục hồi gia hạn).
  * **AC4 (Đã thanh toán thì không hủy):** Given hóa đơn `DRAFT` đã thanh toán (`paid_at` khác NULL),  
    When có yêu cầu chuyển sang `CANCELLED`,  
    Then hệ thống từ chối với HTTP 400.
* **Test:** `test_FR_SLT_06_contract_lifecycle_transitions`

---

## FR-SLT-07 — Ràng buộc sản phẩm thuộc thương hiệu thuê slot
* **Statement:** Hệ thống phải chỉ cho phép gán vào slot sản phẩm thuộc thương hiệu đang có hóa đơn thuê slot đó.
* **Traces:** BR-003, BR-012 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hóa đơn ACTIVE của thương hiệu `B`, sản phẩm `P` thuộc danh mục của thương hiệu `B`,  
    When cấu hình gán sản phẩm `P` cho slot `S`,  
    Then hệ thống lưu thành công.
  * **AC2:** Given slot `S` có hóa đơn ACTIVE của thương hiệu `B`, sản phẩm `P` thuộc sở hữu thương hiệu `C` (`C != B`),  
    When cố gắng gán sản phẩm `P` cho slot `S`,  
    Then hệ thống từ chối với HTTP 403 `PRODUCT_NOT_OWNED`.
  * **AC3:** Given slot `S` hiện không có hóa đơn thuê hiệu lực nào,  
    When cố gắng gán bất kỳ sản phẩm nào cho slot `S`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
* **Test:** `test_FR_SLT_07_slot_product_ownership_validation`

---

## FR-SLT-08 — Thương hiệu tự do đặt giá mỗi lượt xịt
* **Statement:** Hệ thống phải cho phép Brand Admin tự do đặt giá mỗi lượt xịt cho slot mình thuê, không bị giới hạn bởi giá sàn hay giá trần.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B`, slot `S` có hóa đơn của `B` đã thanh toán (đang chờ nạp hàng hoặc đã hiệu lực),  
    When đặt giá bất kỳ lớn hơn 0 (ví dụ: 1,000 VND hoặc 500,000 VND) cho slot `S`,  
    Then hệ thống chấp nhận cập nhật giá và ghi AuditLog.
  * **AC2:** Given Brand Admin của thương hiệu `B`, slot `S` đang thuộc thương hiệu khác `C`,  
    When đặt giá cho slot `S`,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC3 (Ca biên - Giá không hợp lệ):** Given Brand Admin đặt giá `<= 0`,  
    When gửi yêu cầu cập nhật giá,  
    Then hệ thống từ chối với HTTP 400.
  * **AC4 (Chưa thanh toán):** Given hóa đơn của slot `S` còn ở `DRAFT` chưa thanh toán,  
    When Brand Admin đặt giá,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
* **Test:** `test_FR_SLT_08_free_pricing`

---

## FR-SLT-09 — Áp dụng giá mới bất biến với đơn hàng đang chờ
* **Statement:** Hệ thống phải áp dụng giá mới cho các đơn hàng tạo sau thời điểm thay đổi, không ảnh hưởng đơn hàng đang chờ thanh toán.
* **Traces:** BR-002, BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có giá cũ `P_old`, đơn hàng `O1` được tạo tại thời điểm `t1` với giá `P_old` đang ở trạng thái `PENDING_PAYMENT`,  
    When giá của slot `S` được cập nhật thành `P_new` tại thời điểm `t2` (`t2 > t1`),  
    Then đơn hàng `O1` vẫn giữ nguyên giá `P_old`, cổng thanh toán vẫn thu đúng `P_old`.
  * **AC2:** Given giá slot `S` đã đổi thành `P_new` tại `t2`,  
    When khách hàng tạo đơn hàng mới `O2` tại `t3` (`t3 > t2`),  
    Then đơn hàng `O2` được tính giá `P_new`.
* **Test:** `test_FR_SLT_09_price_change_does_not_affect_pending_orders`

---

## FR-SLT-10 — Từ chối tạo đơn khi slot không có hóa đơn hợp lệ
* **Statement:** Hệ thống phải từ chối tạo đơn hàng mới trên slot không có hóa đơn ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED.
* **Traces:** BR-002, BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hóa đơn ở một trong các trạng thái `ACTIVE`, `EXPIRING`, `GRACE`, hoặc `LIQUIDATED` (máy ONLINE, slot AVAILABLE),  
    When khách hàng gửi yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống cho phép tạo đơn thành công.
  * **AC2:** Given slot `S` có hóa đơn ở trạng thái `DRAFT`, `RENEWED`, `CLOSED`, `TERMINATED` hoặc không có hóa đơn nào,  
    When khách hàng gửi yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_UNAVAILABLE`.
* **Test:** `test_FR_SLT_10_reject_order_on_inactive_rental_slot`

---

## FR-SLT-11 — Chuyển trạng thái slot khi hóa đơn kết thúc
* **Statement:** Hệ thống phải chuyển slot sang trạng thái UNAVAILABLE khi hóa đơn chuyển sang TERMINATED hoặc CLOSED.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đang ở trạng thái `AVAILABLE` với hóa đơn `H`,  
    When hóa đơn `H` chuyển sang `TERMINATED`,  
    Then slot `S` tự động chuyển sang trạng thái `UNAVAILABLE` và từ chối mọi yêu cầu tạo đơn mới.
  * **AC2:** Given slot `S` đang bán hàng thanh lý với hóa đơn `H` ở trạng thái `LIQUIDATED`,  
    When hóa đơn `H` chuyển sang `CLOSED`,  
    Then slot `S` tự động chuyển sang `UNAVAILABLE`.
  * **AC3:** Given slot `S` đã chuyển sang `UNAVAILABLE`,  
    When Kiosk hiển thị giao diện,  
    Then slot `S` không hiển thị là khả dụng để khách lựa chọn.
* **Test:** `test_FR_SLT_11_slot_unavailable_on_contract_end`

---

## FR-SLT-12 — Thương hiệu tự gia hạn bằng mua gói mới
* **Statement:** Hệ thống phải cho phép Brand Admin gia hạn bằng cách mua gói thuê mới cho chính slot mình đang thuê khi hóa đơn hiện tại ở EXPIRING hoặc GRACE, tạo hóa đơn gia hạn liên kết với hóa đơn cũ.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **API:** `POST /slot-rentals/{id}/renew`
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H1` của thương hiệu `B` trên slot `S` đang `EXPIRING` với `ends_at = E`,  
    When Brand Admin của `B` chọn gói thuê `P` và gói bảo quản `G` để gia hạn,  
    Then hệ thống tạo một phiên thanh toán gồm đúng một hóa đơn `H2` ở `DRAFT` với `previous_rental_id = H1.id`, kỳ hạn tạm `[E, E + P.duration_months)`, tổng tiền theo FR-SLT-36; thanh toán như FR-SLT-37 (ADR-0008); `H1` giữ nguyên trạng thái.
  * **AC2 (Nối tiếp khi hết hạn):** Given `H2` đã thanh toán và `H1` vẫn `EXPIRING`,  
    When tới mốc `E`,  
    Then trong **cùng một transaction** `H1` → `RENEWED` và `H2` → `ACTIVE` với `starts_at = E` — slot bán liên tục, không có khoảnh khắc nào không có hóa đơn hiệu lực. `H2` không chờ lắp chai vì chai đã nằm sẵn trong slot.
  * **AC3 (Gia hạn trong ân hạn):** Given `H1` đang `GRACE`,  
    When thanh toán của `H2` được xác nhận lúc `t`,  
    Then trong cùng transaction `H1` → `RENEWED`, `H2` → `ACTIVE` với `starts_at = t`, `ends_at = t + P.duration_months`, và phí ân hạn của `H1` dừng tại `t` (FR-EXP-13).
  * **AC4 (Chưa tới lúc gia hạn):** Given `H1` đang `ACTIVE` (chưa `EXPIRING`), hoặc đã `LIQUIDATED`, `CLOSED`, `TERMINATED`,  
    When Brand Admin gia hạn,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
  * **AC5 (Cô lập dữ liệu):** Given `H1` thuộc thương hiệu khác,  
    When Brand Admin gia hạn,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC6 (Không thanh toán):** Given phiên của `H2` hết giờ giữ chỗ và `H2` chuyển `CANCELLED` (FR-SLT-39),  
    When kiểm tra `H1`,  
    Then `H1` tiếp tục vòng đời bình thường (`EXPIRING` → `GRACE` → `LIQUIDATED`), và Brand Admin gia hạn lại được.
* **Test:** `test_FR_SLT_12_brand_renews_by_buying_package`

---

## FR-SLT-13 — Chấm dứt hóa đơn trước hạn kèm lý do bắt buộc
* **Statement:** Hệ thống phải cho phép Platform Super Admin chấm dứt hóa đơn trước hạn kèm lý do bắt buộc, không tự động hoàn tiền.
* **Traces:** BR-009 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Platform Super Admin, hóa đơn `H` đang `ACTIVE`,  
    When gửi yêu cầu chấm dứt hóa đơn kèm chuỗi lý do hợp lệ (non-empty string),  
    Then hóa đơn `H` chuyển sang `TERMINATED`, ghi nhận `terminated_at`, `termination_reason`, đưa slot về `UNAVAILABLE`, và ghi AuditLog.
  * **AC2 (Ca biên - Thiếu lý do):** Given yêu cầu chấm dứt không có lý do hoặc lý do chỉ chứa khoảng trắng,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400.
  * **AC3:** Given người dùng là Brand Admin hoặc vai trò khác,  
    When gửi yêu cầu chấm dứt hóa đơn,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC4 (Không hoàn tiền tự động):** Given `H` đã thanh toán tổng tiền `T`,  
    When `H` chuyển `TERMINATED`,  
    Then hệ thống không tạo khoản hoàn tiền nào; hoàn hay không là quyết định ngoài hệ thống.
* **Test:** `test_FR_SLT_13_terminate_contract_early`

---

## FR-SLT-14 — Đóng hóa đơn thanh lý để giải phóng slot
* **Statement:** Hệ thống phải cho phép Platform Super Admin đóng hóa đơn ở trạng thái LIQUIDATED sau khi hàng thanh lý đã bán hết hoặc được tháo khỏi slot, để giải phóng slot cho hóa đơn mới.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` trên slot `S` đang ở trạng thái `LIQUIDATED`, chai nước hoa trong slot đã `EMPTY` hoặc đã được Inventory Staff tháo về kho (`IN_STOCK`),  
    When Platform Super Admin thực hiện đóng hóa đơn,  
    Then hóa đơn `H` chuyển sang `CLOSED`, giải phóng slot `S`.
  * **AC2 (Ca biên - Còn tồn chưa tháo):** Given hóa đơn `H` đang `LIQUIDATED` nhưng chai nước hoa trong slot vẫn còn dung lượng và chưa tháo khỏi slot,  
    When yêu cầu đóng hóa đơn mà không có cờ xác nhận tháo chai,  
    Then hệ thống từ chối với HTTP 409.
  * **AC3:** Given hóa đơn `H` đã chuyển `CLOSED`,  
    When tạo hóa đơn mới trên slot `S`,  
    Then hệ thống chấp nhận (không còn bị chặn bởi ràng buộc `SLOT_OCCUPIED`).
* **Test:** `test_FR_SLT_14_close_liquidated_rental`

---

## FR-SLT-15 — Lưu lịch sử toàn bộ hóa đơn trên mỗi slot
* **Statement:** Hệ thống phải lưu lịch sử toàn bộ hóa đơn đã từng tồn tại trên mỗi slot.
* **Traces:** BR-008, BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã trải qua nhiều hóa đơn (`H1` CLOSED, `H2` TERMINATED, `H3` ACTIVE),  
    When Platform Super Admin truy vấn lịch sử slot `S`,  
    Then hệ thống trả về đầy đủ danh sách các hóa đơn theo thứ tự thời gian kèm thông tin thương hiệu, kỳ hạn và trạng thái.
  * **AC2 (Cô lập dữ liệu BR-012):** Given Brand Admin của thương hiệu `B` truy vấn lịch sử hóa đơn của slot `S`, slot `S` trước đây từng do thương hiệu `C` thuê,  
    When xem danh sách lịch sử,  
    Then hệ thống chỉ trả về các hóa đơn thuộc thương hiệu `B`, tuyệt đối ẩn các bản ghi thuộc thương hiệu `C`.
* **Test:** `test_FR_SLT_15_slot_rental_history_audit`

---

## FR-SLT-16 — Báo cáo tỷ lệ lấp đầy slot
* **Statement:** Hệ thống phải hiển thị cho Platform Super Admin tỷ lệ lấp đầy slot theo máy và theo địa điểm.
* **Traces:** BR-009 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given máy `M` có tổng cộng 4 slot, trong đó 3 slot có hóa đơn ở trạng thái `ACTIVE`, `EXPIRING`, `GRACE` hoặc `LIQUIDATED`, và 1 slot trống,  
    When Platform Super Admin xem báo cáo lấp đầy,  
    Then tỷ lệ lấp đầy của máy `M` hiển thị chính xác là `75.0%` (3/4).
  * **AC2:** Given địa điểm `L` có 2 máy với tổng cộng 8 slot, có 6 slot đang được thuê hiệu lực,  
    When xem báo cáo theo địa điểm `L`,  
    Then tỷ lệ lấp đầy hiển thị chính xác là `75.0%` (6/8).
  * **AC3:** Given Brand Admin cố gắng truy cập báo cáo tỷ lệ lấp đầy toàn hệ thống,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_16_slot_occupancy_rate_report`

---

## FR-SLT-17 — Tạo bảng đối soát doanh thu theo kỳ cho thương hiệu
* **Statement:** Hệ thống phải tạo bảng đối soát doanh thu theo kỳ cho mỗi thương hiệu, gộp toàn bộ hóa đơn của thương hiệu trong kỳ, có dòng chi tiết theo từng slot.
* **Traces:** BR-009 · **Priority:** M
* **API:** `GET /settlements`
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` có 2 hóa đơn hiệu lực trong kỳ `K`,  
    When lấy bảng đối soát cho kỳ `K`,  
    Then hệ thống trả đúng 1 bảng đối soát cho thương hiệu `B`, kèm chính xác 2 dòng chi tiết tương ứng với 2 slot.
  * **AC2:** Given thương hiệu `B` không có hóa đơn hiệu lực và không phát sinh doanh thu trong kỳ `K`,  
    When lấy bảng đối soát,  
    Then không có bảng đối soát cho thương hiệu `B`.
  * **AC3 (Phân quyền dữ liệu):** Given Brand Admin của thương hiệu `B` tải bảng đối soát,  
    When thực hiện truy vấn,  
    Then chỉ xem được bảng của thương hiệu `B`, không xem được của các thương hiệu khác.
* **Test:** `test_FR_SLT_17_generate_settlement_statement`

---

## FR-SLT-18 — Tính các khoản trong bảng đối soát
* **Statement:** Hệ thống phải tính trong bảng đối soát: số đơn hàng, doanh thu lượt xịt thuộc thương hiệu và số tiền nền tảng phải chuyển trả cho thương hiệu.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` của thương hiệu `B` có 400 đơn hàng mang nhãn `BRAND` trong kỳ, tổng `10,000,000 VND`,  
    When tính dòng đối soát cho `H`,  
    Then số đơn = `400`, doanh thu lượt xịt thương hiệu = `10,000,000 VND`, số tiền phải chuyển trả = `10,000,000 VND` — không trừ phí thuê hay ăn chia vì gói đã trả trước (ADR-0006).
  * **AC2 (Đơn thuộc nền tảng):** Given slot của `H` có thêm đơn mang nhãn `PLATFORM` sau khi thanh lý,  
    When tính đối soát,  
    Then các đơn đó không được tính (FR-REV-05).
  * **AC3:** Given thương hiệu `B` đã trả tiền gói thuê và gói bảo quản cho `H`,  
    When xem bảng đối soát,  
    Then các khoản đó không xuất hiện — chúng nằm trên hóa đơn (FR-SLT-40), không phải trên bảng đối soát.
* **Test:** `test_FR_SLT_18_settlement_calculation_formula`

---

## FR-SLT-19 — Danh sách slot trống kèm giá niêm yết
* **Statement:** Hệ thống phải cho phép Brand Admin xem danh sách slot đang trống đã có giá thuê niêm yết, theo máy và địa điểm, kèm giá niêm yết theo tháng, không kèm thông tin thương hiệu đã từng thuê trước đó.
* **Traces:** BR-011, BR-012 · **Priority:** M
* **API:** `GET /slots/available`
* **Acceptance criteria:**
  * **AC1:** Given slot `S` không có hóa đơn nào ở `DRAFT`, `ACTIVE`, `EXPIRING`, `GRACE` hoặc `LIQUIDATED`, và đã có `monthly_rent_price`,  
    When Brand Admin truy vấn danh sách slot trống,  
    Then slot `S` xuất hiện trong kết quả kèm máy, mã slot, địa điểm và giá niêm yết theo tháng.
  * **AC2:** Given slot `S` đang có hóa đơn ở một trong bốn trạng thái chiếm dụng, **hoặc** đang có hóa đơn `DRAFT` (đang giữ chỗ hoặc chờ nạp hàng),  
    When Brand Admin truy vấn danh sách slot trống,  
    Then slot `S` không xuất hiện trong kết quả.
  * **AC3 (Chưa mở cho thuê):** Given slot `S` trống nhưng `monthly_rent_price` là NULL,  
    When Brand Admin truy vấn,  
    Then slot `S` không xuất hiện.
  * **AC4 (Cô lập dữ liệu):** Given slot `S` từng được thương hiệu `B2` thuê và hóa đơn đó nay đã `CLOSED`,  
    When Brand Admin của thương hiệu `B1` xem slot `S` trong danh sách slot trống,  
    Then kết quả không chứa bất kỳ trường nào tiết lộ `B2` — không tên thương hiệu, không tên sản phẩm cũ, không lịch sử hóa đơn.
* **Test:** `test_FR_SLT_19_list_available_slots`

---

## FR-SLT-20 — ~~Gửi yêu cầu thuê slot trống~~ (bãi bỏ)
* **Statement:** ~~Hệ thống phải cho phép Brand Admin gửi yêu cầu thuê một hoặc nhiều slot trống, kèm kỳ hạn mong muốn.~~
* **Traces:** BR-011 · **Priority:** X (bãi bỏ theo ADR-0006)
* **Lý do:** không còn bước xin thuê và duyệt; Brand Admin mua gói trực tiếp (FR-SLT-35).

---

## FR-SLT-21 — ~~Trạng thái yêu cầu thuê~~ (bãi bỏ)
* **Statement:** ~~Hệ thống phải quản lý trạng thái yêu cầu thuê theo tập: REQUESTED, APPROVED, REJECTED, CONVERTED, CANCELLED.~~
* **Traces:** BR-011 · **Priority:** X (bãi bỏ theo ADR-0006)
* **Lý do:** thực thể `SlotRentalRequest` không còn dùng; bảng `slot_rental_requests` giữ lại ở trạng thái `DEPRECATED`.

---

## FR-SLT-22 — ~~Duyệt hoặc từ chối yêu cầu thuê~~ (bãi bỏ)
* **Statement:** ~~Hệ thống phải cho phép Platform Super Admin duyệt hoặc từ chối yêu cầu thuê, kèm lý do bắt buộc khi từ chối.~~
* **Traces:** BR-009, BR-011 · **Priority:** X (bãi bỏ theo ADR-0006)
* **Lý do:** điều khoản không còn đàm phán theo từng lượt thuê; Super Admin cấu hình bảng giá một lần (FR-SLT-30 ÷ 32).

---

## FR-SLT-23 — ~~Tự động tạo hợp đồng DRAFT khi duyệt~~ (bãi bỏ)
* **Statement:** ~~Hệ thống phải tự động tạo hợp đồng ở trạng thái DRAFT khi yêu cầu thuê được duyệt.~~
* **Traces:** BR-009 · **Priority:** X (bãi bỏ theo ADR-0006)
* **Lý do:** hóa đơn `DRAFT` được tạo lúc Brand Admin chọn dịch vụ (FR-SLT-35).

---

## FR-SLT-24 — Kích hoạt hóa đơn khi lắp chai đầu tiên
* **Statement:** Hệ thống phải chuyển hóa đơn đã thanh toán từ DRAFT sang ACTIVE khi Inventory Staff lắp chai đầu tiên vào slot, đặt ngày bắt đầu là thời điểm lắp và ngày kết thúc bằng ngày bắt đầu cộng thời hạn gói thuê.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` của thương hiệu `B` trên slot `S` ở `DRAFT`, đã thanh toán, gói 6 tháng,  
    When Inventory Staff hoàn tất lắp chai đầu tiên của `B` vào `S` lúc `t` (FR-INV-05, FR-INV-13),  
    Then trong **cùng một transaction** với việc lắp chai, `H` → `ACTIVE`, `starts_at = t`, `ends_at = t + 6 tháng`, và ghi AuditLog.
  * **AC2 (Chưa thanh toán):** Given hóa đơn của `S` còn ở `DRAFT` chưa thanh toán,  
    When Inventory Staff lắp chai vào `S`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
  * **AC3 (Lắp các lần sau):** Given `H` đã `ACTIVE`,  
    When Inventory Staff nạp hoặc thay chai khác,  
    Then `starts_at` và `ends_at` của `H` không đổi.
  * **AC4 (Hóa đơn gia hạn):** Given `H2` là hóa đơn gia hạn (`previous_rental_id` khác NULL),  
    When có thao tác lắp chai,  
    Then việc lắp chai không kích hoạt `H2` — `H2` kích hoạt theo FR-SLT-12 AC2/AC3.
* **Test:** `test_FR_SLT_24_activate_on_first_bottle_install`

---

## FR-SLT-25 — ~~Brand Admin xem trạng thái và lịch sử yêu cầu~~ (bãi bỏ)
* **Statement:** ~~Hệ thống phải cho phép Brand Admin xem trạng thái và lịch sử các yêu cầu thuê của thương hiệu mình.~~
* **Traces:** BR-011 · **Priority:** X (bãi bỏ theo ADR-0006)
* **Lý do:** thay bằng danh sách hóa đơn (FR-SLT-41).

---

## FR-SLT-26 — ~~Chặn yêu cầu trùng trên cùng slot~~ (bãi bỏ)
* **Statement:** ~~Hệ thống phải ngăn Brand Admin gửi yêu cầu thuê mới trên cùng slot khi đã tồn tại yêu cầu chưa xử lý xong.~~
* **Traces:** BR-011 · **Priority:** X (bãi bỏ theo ADR-0006)
* **Lý do:** thay bằng cơ chế giữ chỗ khi tạo hóa đơn `DRAFT` (FR-SLT-35 AC3).

---

## FR-SLT-27 — Gán sản phẩm vào slot
* **Statement:** Hệ thống phải cho phép Brand Admin gán đúng một sản phẩm đang kinh doanh của thương hiệu mình vào slot có hóa đơn đã thanh toán và chưa kết thúc.
* **Traces:** BR-011 · **Priority:** M
* **API:** `PUT /slot-rentals/{id}/product`
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` của thương hiệu `B` đã thanh toán (đang chờ nạp hàng hoặc đã hiệu lực) và sản phẩm `P` thuộc `B` ở trạng thái ACTIVE,  
    When Brand Admin gán `P` vào `H`,  
    Then hệ thống ghi `fragrance_product_id = P` và `product_assigned_at = now()`, đồng thời ghi AuditLog (FR-AUD-04).
  * **AC2 (Sản phẩm của thương hiệu khác):** Given sản phẩm `P2` thuộc thương hiệu `B2`,  
    When Brand Admin của `B1` gán `P2` vào hóa đơn của mình,  
    Then hệ thống từ chối với HTTP 403 `PRODUCT_NOT_OWNED`.
  * **AC3 (Ràng buộc ở tầng CSDL):** Given nỗ lực ghi thẳng vào CSDL một `fragrance_product_id` thuộc thương hiệu khác,  
    When thực hiện UPDATE,  
    Then composite foreign key `fk_rental_product_same_brand` từ chối thao tác (`spec/contracts/schema.sql` §10b).
  * **AC4 (Ca biên - Sản phẩm ngừng kinh doanh):** Given sản phẩm `P` ở trạng thái `DISCONTINUED`,  
    When gán `P` vào slot,  
    Then hệ thống từ chối thao tác.
  * **AC5 (Chưa thanh toán):** Given hóa đơn `H` còn ở `DRAFT` chưa thanh toán,  
    When Brand Admin gán sản phẩm,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
* **Test:** `test_FR_SLT_27_assign_product_to_slot`

---

## FR-SLT-28 — Đổi sản phẩm gán cho slot
* **Statement:** Hệ thống phải cho phép Brand Admin đổi sản phẩm gán cho slot, ghi nhận thời điểm đổi.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` đang gán sản phẩm `P1`,  
    When Brand Admin đổi sang sản phẩm `P2` cùng thương hiệu,  
    Then hệ thống cập nhật `fragrance_product_id = P2` và `product_assigned_at` về thời điểm đổi, ghi AuditLog.
  * **AC2 (Đơn đang chờ không bị ảnh hưởng):** Given có đơn hàng của `H` đang ở trạng thái `PENDING_PAYMENT` với sản phẩm `P1` đã chụp,  
    When đổi sản phẩm sang `P2`,  
    Then đơn đang chờ giữ nguyên `fragrance_product_id` và `product_name_snapshot` của `P1` (FR-ORD-06).
* **Test:** `test_FR_SLT_28_change_slot_product`

---

## FR-SLT-29 — Từ chối tạo đơn khi slot chưa cấu hình xong
* **Statement:** Hệ thống phải từ chối tạo đơn hàng tại slot chưa được gán sản phẩm hoặc chưa đặt giá lượt xịt.
* **Traces:** BR-002, BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` trên slot `S` có `fragrance_product_id` là NULL,  
    When kiosk yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_UNAVAILABLE`.
  * **AC2:** Given hóa đơn `H` có sản phẩm nhưng `price_per_spray` là NULL,  
    When kiosk yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_UNAVAILABLE`.
  * **AC3:** Given hóa đơn `H` chưa gán sản phẩm hoặc chưa đặt giá,  
    When tính trạng thái khả dụng của slot `S`,  
    Then slot ở trạng thái `UNAVAILABLE` (FR-MCH-16) và không hiển thị sản phẩm trên kiosk.
* **Test:** `test_FR_SLT_29_reject_order_without_product`

> **Vì sao `fragrance_product_id` và `price_per_spray` nullable ở tầng CSDL.** Hai cột để nullable
> *chỉ* nhằm phục vụ cửa sổ giữa lúc thương hiệu thanh toán (FR-SLT-38) và lúc cấu hình slot
> (FR-SLT-08, FR-SLT-27). Ràng buộc "phải có sản phẩm và giá trước khi nhận đơn" nằm ở domain
> service, không ở CSDL — xem `spec/contracts/schema.sql` §13 mục 3.

---

> **FR-SLT-30 ÷ FR-SLT-47 — Mua gói thuê, hóa đơn và bảo hiểm hàng hóa.** Thêm ngày 2026-09-25 theo
> `spec/decisions/0006-mua-goi-thue-slot-tu-phuc-vu-va-hoa-don.md` (**đã duyệt 2026-09-29**). Tên cột,
> endpoint và hằng ngưỡng bên dưới đã có trong contract, migration và `spec/constraints.md`.

## FR-SLT-30 — Danh mục gói thuê
* **Statement:** Hệ thống phải cho phép Platform Super Admin quản lý danh mục gói thuê gồm tên, thời hạn theo tháng, tỷ lệ ưu đãi và trạng thái mở bán.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **API:** `GET/POST/PATCH /rental-packages`
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Platform Super Admin,  
    When tạo gói "12 tháng" với `duration_months = 12`, `discount_percent = 10`,  
    Then gói được lưu ở trạng thái mở bán và ghi AuditLog.
  * **AC2 (Ca biên - Tham số sai):** Given `duration_months <= 0`, hoặc `discount_percent` ngoài `[0, 100]`,  
    When tạo hoặc sửa gói,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC3 (Ngừng mở bán):** Given gói `P` chuyển sang ngừng mở bán,  
    When Brand Admin xem các gói (FR-SLT-34),  
    Then `P` không xuất hiện; các hóa đơn đã mua gói `P` không bị ảnh hưởng.
  * **AC4:** Given người dùng không phải Platform Super Admin,  
    When tạo hoặc sửa gói,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_30_manage_rental_packages`

---

## FR-SLT-31 — Danh mục gói bảo quản (bảo hiểm hàng hóa)
* **Statement:** Hệ thống phải cho phép Platform Super Admin quản lý danh mục gói bảo quản gồm tên, mô tả quyền lợi, giá mỗi tháng, tỷ lệ bồi thường theo giá bán lẻ chai, hạn mức bồi thường và trạng thái mở bán.
* **Traces:** BR-005, BR-009 · **Priority:** M
* **API:** `GET/POST/PATCH /storage-plans`
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Platform Super Admin,  
    When tạo gói "Tiêu chuẩn" với `monthly_price = 200,000 VND`, `coverage_percent = 60`, `coverage_cap = 5,000,000 VND`,  
    Then gói được lưu ở trạng thái mở bán và ghi AuditLog.
  * **AC2 (Ca biên - Tham số sai):** Given `monthly_price < 0`, `coverage_cap < 0`, hoặc `coverage_percent` ngoài `[0, 100]`,  
    When tạo hoặc sửa gói,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC3 (Luôn có gói để chọn):** Given chỉ còn đúng một gói bảo quản đang mở bán,  
    When Super Admin ngừng mở bán gói đó,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR` — gói bảo quản là bắt buộc nên phải luôn còn ít nhất một gói.
  * **AC4:** Given người dùng không phải Platform Super Admin,  
    When tạo hoặc sửa gói,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_31_manage_storage_plans`

---

## FR-SLT-32 — Giá thuê niêm yết của slot
* **Statement:** Hệ thống phải cho phép Platform Super Admin đặt giá thuê niêm yết theo tháng cho từng slot.
* **Traces:** BR-009 · **Priority:** M
* **API:** `PUT /slots/{id}/rent-price`
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Platform Super Admin,  
    When đặt `monthly_rent_price = 1,500,000 VND` cho slot `S`,  
    Then giá được lưu, ghi AuditLog, và `S` xuất hiện trong danh sách slot trống nếu đang trống (FR-SLT-19).
  * **AC2 (Ca biên - Giá âm):** Given `monthly_rent_price < 0`,  
    When đặt giá,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC3:** Given người dùng không phải Platform Super Admin,  
    When đặt giá,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_32_set_slot_rent_price`

---

## FR-SLT-33 — Chụp bảng giá vào hóa đơn
* **Statement:** Hệ thống phải chụp giá niêm yết, tỷ lệ ưu đãi và điều khoản gói bảo quản vào hóa đơn lúc tạo, không thay đổi khi bảng giá thay đổi sau đó.
* **Traces:** BR-008, BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` tạo lúc slot có giá `1,500,000 VND/tháng`, gói ưu đãi `10%`, gói bảo quản bồi thường `60%`,  
    When sau đó Super Admin đổi giá slot thành `2,000,000 VND`, ưu đãi thành `5%`, bồi thường thành `50%`,  
    Then `H` vẫn giữ `1,500,000`, `10%`, `60%` và tổng tiền không đổi — kể cả khi `H` còn ở `DRAFT` chưa thanh toán.
  * **AC2 (Bất biến):** Given `H` đã được tạo,  
    When có bất kỳ thao tác nào cố sửa các cột chụp giá hoặc `total_amount`,  
    Then hệ thống từ chối — các cột này chỉ ghi một lần lúc tạo.
* **Test:** `test_FR_SLT_33_snapshot_pricing_on_invoice`

---

## FR-SLT-34 — Xem các gói và số tiền cho slot đã chọn
* **Statement:** Hệ thống phải hiển thị cho Brand Admin các gói thuê và gói bảo quản đang mở bán cho slot đã chọn, kèm số tiền của từng lựa chọn sau ưu đãi.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` giá `1,000,000 VND/tháng`, các gói thuê 3/6/12 tháng ưu đãi 0%/5%/10%,  
    When Brand Admin chọn `S`,  
    Then hệ thống hiển thị phí thuê lần lượt `3,000,000`, `5,700,000`, `10,800,000 VND`, kèm số tiền tiết kiệm so với không ưu đãi.
  * **AC2:** Given các gói bảo quản đang mở bán,  
    When Brand Admin chọn một gói thuê,  
    Then hệ thống hiển thị từng gói bảo quản kèm quyền lợi, tỷ lệ bồi thường, hạn mức và phí bảo quản cho đúng số tháng đã chọn.
  * **AC3:** Given gói đã ngừng mở bán,  
    When Brand Admin xem,  
    Then gói đó không xuất hiện.
* **Test:** `test_FR_SLT_34_show_package_quotes`

---

## FR-SLT-35 — Chọn dịch vụ và giữ chỗ một hoặc nhiều slot
* **Statement:** Hệ thống phải cho phép Brand Admin chọn một hoặc nhiều slot trống, mỗi slot một gói thuê và đúng một gói bảo quản, để tạo trong một phiên thanh toán một hóa đơn DRAFT cho mỗi slot, giữ chỗ mọi slot trong `RENTAL_CHECKOUT_HOLD_MIN` phút.
* **Traces:** BR-011 · **Priority:** M
* **API:** `POST /rental-checkouts`
* **Acceptance criteria:**
  * **AC1:** Given slot `S` trống, gói thuê `P` và gói bảo quản `G` đang mở bán,  
    When Brand Admin của `B` gửi `{ items: [{ slotId: S, rentalPackageId: P, storagePlanId: G }] }` lúc `t0`,  
    Then hệ thống tạo phiên thanh toán `C` cho `B` với `hold_expires_at = t0 + RENTAL_CHECKOUT_HOLD_MIN`, và trong `C` một hóa đơn `H` ở `DRAFT` với tổng tiền theo FR-SLT-36 và kỳ hạn tạm `[t0, t0 + RENTAL_MAX_STOCKING_DAYS + P.duration_months)`.
  * **AC2 (Nhiều slot một lần):** Given slot `S1`, `S2`, `S3` trống (trên cùng máy hoặc khác máy),  
    When Brand Admin của `B` gửi ba phần tử `items`, mỗi slot một gói thuê và một gói bảo quản (có thể khác nhau),  
    Then trong **cùng một transaction** hệ thống tạo một phiên `C` và ba hóa đơn DRAFT thuộc `C`, mỗi hóa đơn chụp giá và tính tiền riêng (FR-SLT-33, FR-SLT-36), cả ba slot cùng giữ chỗ tới `C.hold_expires_at`.
  * **AC3 (Giữ chỗ — ràng buộc ở tầng CSDL):** Given hai Brand Admin của hai thương hiệu khác nhau cùng chọn slot `S` đồng thời,  
    When cả hai cùng tạo phiên,  
    Then `excl_slot_rental_overlap` bảo đảm chỉ một hóa đơn trên `S` được tạo; bên còn lại nhận HTTP 409 `SLOT_OCCUPIED`.
  * **AC4 (Tất cả hoặc không có gì):** Given giỏ gồm `S1` trống và `S2` đang bị thương hiệu khác giữ chỗ,  
    When Brand Admin gửi yêu cầu,  
    Then hệ thống từ chối cả phiên với HTTP 409 `SLOT_OCCUPIED`, và không có phiên hay hóa đơn nào được tạo — kể cả cho `S1`.
  * **AC5 (Thiếu gói bảo quản):** Given một phần tử `items` không có `storagePlanId`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR` — gói bảo quản là bắt buộc.
  * **AC6 (Giỏ không hợp lệ):** Given `items` rỗng, hoặc một slot xuất hiện hai lần trong `items`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC7 (Gói hoặc slot không hợp lệ):** Given một gói trong giỏ đã ngừng mở bán, hoặc một slot chưa có giá niêm yết,  
    When gửi yêu cầu,  
    Then hệ thống từ chối cả phiên với HTTP 400 `VALIDATION_ERROR`.
  * **AC8 (Thương hiệu bị đình chỉ):** Given thương hiệu `B` ở trạng thái `SUSPENDED`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_35_checkout_holds_slot`

> AC3 và AC4 thuộc nhóm "unique constraint slot" trong 7 nhóm test người tự viết (`spec/testing.md`)
> — agent không sinh test cho hai ca này. Không giới hạn số slot mỗi phiên (ADR-0008).

---

## FR-SLT-36 — Tính tổng tiền hóa đơn
* **Statement:** Hệ thống phải tính tổng tiền hóa đơn bằng phí thuê (giá niêm yết × số tháng × (1 − tỷ lệ ưu đãi)) cộng phí bảo quản (giá gói bảo quản mỗi tháng × số tháng) cộng phí ân hạn chuyển sang nếu là hóa đơn gia hạn, và tổng tiền phiên thanh toán bằng tổng tiền các hóa đơn trong phiên.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot giá `1,000,000 VND/tháng`, gói 6 tháng ưu đãi `5%`, gói bảo quản `200,000 VND/tháng`,  
    When tạo hóa đơn,  
    Then phí thuê = `1,000,000 × 6 × 0.95 = 5,700,000`, phí bảo quản = `200,000 × 6 = 1,200,000`, tổng = `6,900,000 VND`.
  * **AC2 (Ưu đãi không áp cho bảo quản):** Given cùng dữ liệu AC1,  
    When tính phí bảo quản,  
    Then không trừ ưu đãi `5%` của gói thuê.
  * **AC3 (Hóa đơn gia hạn):** Given hóa đơn gia hạn `H2` của `H1`, `H1` đã phát sinh phí ân hạn `300,000 VND` (FR-EXP-10) tới lúc tạo `H2`,  
    When tính tổng tiền `H2`,  
    Then tổng = phí thuê + phí bảo quản + `300,000 VND`, và dòng phí ân hạn hiện riêng trên hóa đơn.
  * **AC4 (Kiểu số):** Given phép nhân với tỷ lệ ưu đãi cho ra phần thập phân,  
    When lưu số tiền,  
    Then lưu bằng `numeric`, không dùng kiểu dấu phẩy động (NFR-DAT-02).
  * **AC5 (Tổng phiên):** Given phiên `C` gồm hóa đơn `H1` tổng `6,900,000 VND` và `H2` tổng `3,300,000 VND`,  
    When tạo phiên,  
    Then `C.total_amount = 10,200,000 VND`; mỗi hóa đơn vẫn chỉ ghi khoản tiền của chính slot đó.
  * **AC6 (Ràng buộc ở tầng CSDL):** Given `C.total_amount` khác tổng `total_amount` các hóa đơn của `C`,  
    When transaction COMMIT,  
    Then CSDL từ chối (`chk_checkout_total_matches_invoices`, ADR-0008).
* **Test:** `test_FR_SLT_36_compute_invoice_total`

---

## FR-SLT-37 — Thanh toán phiên thanh toán thuê slot
* **Statement:** Hệ thống phải cho phép Brand Admin thanh toán một lần toàn bộ các hóa đơn trong một phiên thanh toán qua cổng thanh toán, và bảo đảm mỗi phiên có tối đa một thanh toán đang chờ.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **API:** `POST /rental-checkouts/{id}/payments`, `GET /rental-checkouts/{id}`
* **Acceptance criteria:**
  * **AC1:** Given phiên `C` của thương hiệu `B` gồm các hóa đơn `DRAFT`, chưa thanh toán, chưa hủy, chưa quá `C.hold_expires_at`,  
    When Brand Admin của `B` bấm thanh toán,  
    Then hệ thống tạo một `Payment` `PENDING` với `rental_checkout_id = C.id`, `order_id = NULL`, `amount = C.total_amount`, và trả về thông tin để mở trang thanh toán/QR của cổng.
  * **AC2 (Bấm lại):** Given `C` đã có một `Payment` `PENDING`,  
    When Brand Admin bấm thanh toán lần nữa,  
    Then hệ thống trả lại chính `Payment` đó, không tạo bản ghi mới.
  * **AC3 (Ràng buộc ở tầng CSDL):** Given hai yêu cầu thanh toán cho `C` đến đồng thời,  
    When cả hai cùng ghi vào CSDL,  
    Then partial unique index `uq_checkout_payment_pending` bảo đảm chỉ có một `Payment` `PENDING`.
  * **AC4 (Hết giờ giữ chỗ):** Given `now() > C.hold_expires_at`,  
    When Brand Admin bấm thanh toán,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE` — kể cả khi job hủy (FR-SLT-39) chưa kịp chạy.
  * **AC5 (Sai trạng thái):** Given `C` đã thanh toán hoặc đã hủy,  
    When Brand Admin bấm thanh toán,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
  * **AC6 (Quay lại thanh toán):** Given Brand Admin rời trang sau khi tạo `C`,  
    When mở lại `C` (`GET /rental-checkouts/{id}`) trước `C.hold_expires_at`,  
    Then hệ thống trả `C` kèm mọi hóa đơn và tổng tiền để thanh toán tiếp.
  * **AC7 (Sai phạm vi):** Given người gọi là Brand Admin của thương hiệu khác,  
    When xem hoặc bấm thanh toán cho `C`,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_37_initiate_invoice_payment`

---

## FR-SLT-38 — Xác nhận thanh toán và cấp số hóa đơn
* **Statement:** Hệ thống phải xác nhận thanh toán phiên thanh toán thuê slot qua webhook của cổng thanh toán theo đúng quy tắc của FR-ORD-13 đến FR-ORD-15, và khi thành công thì ghi nhận thời điểm thanh toán cho phiên và mọi hóa đơn trong phiên, và cấp cho mỗi hóa đơn một số hóa đơn duy nhất.
* **Traces:** BR-008, BR-009 · **Priority:** M
* **API:** `POST /webhooks/payments/{provider}`
* **Acceptance criteria:**
  * **AC1:** Given `Payment` `P` `PENDING` của phiên `C` gồm hóa đơn `H1`, `H2`, `H3`,  
    When nhận webhook hợp lệ báo `P` thành công, đúng mã tham chiếu, số tiền và loại tiền,  
    Then trong **cùng một transaction**: `P` → `SUCCEEDED`, `C.paid_at = now()`, và với **mỗi** `Hi`: `Hi.paid_at = C.paid_at`, `Hi.invoice_number` được cấp riêng và duy nhất toàn hệ thống; ghi AuditLog (FR-AUD-06). Mỗi `Hi` vẫn ở `DRAFT` (chờ nạp hàng) cho tới khi lắp chai đầu tiên vào slot của nó (FR-SLT-24).
  * **AC2 (Số tiền lệch):** Given webhook báo số tiền khác `C.total_amount`,  
    When xử lý,  
    Then hệ thống trả HTTP 400 `AMOUNT_MISMATCH`, không đổi trạng thái `P`, `C` và các hóa đơn.
  * **AC3 (Chữ ký sai):** Given webhook có chữ ký không hợp lệ,  
    When xử lý,  
    Then hệ thống trả HTTP 401 `INVALID_WEBHOOK_SIGNATURE` và vẫn ghi `payment_events` để rà soát.
  * **AC4 (Webhook trùng):** Given webhook của `P` đã được xử lý,  
    When nhà cung cấp gửi lại,  
    Then hệ thống trả HTTP 200 `WEBHOOK_ALREADY_PROCESSED`, không ghi nhận thanh toán lần hai và không cấp số hóa đơn thứ hai cho hóa đơn nào.
  * **AC5 (Tiền về sau khi đã hủy):** Given `C` đã hủy, các hóa đơn của `C` đã `CANCELLED` và `P` đã `EXPIRED` (FR-SLT-39),  
    When nhận webhook hợp lệ báo `P` thành công,  
    Then `P` → `REFUND_PENDING` (tiền đã về nhưng phải trả lại), `C` và các hóa đơn **không** được khôi phục, và ghi AuditLog.
  * **AC6 (Không ghi nhận nửa phiên — ràng buộc ở tầng CSDL):** Given transaction đặt `C.paid_at` nhưng sót một hóa đơn của `C`,  
    When COMMIT,  
    Then CSDL từ chối (`chk_checkout_invoice_state_sync`, ADR-0008) — không có phiên đã trả tiền mà còn hóa đơn "chờ thanh toán".
* **Test:** `test_FR_SLT_38_confirm_invoice_payment_webhook`

> AC4 thuộc nhóm "idempotency webhook" trong 7 nhóm test người tự viết (`spec/testing.md`) — agent
> không sinh test cho ca này.

---

## FR-SLT-39 — Hủy phiên và hóa đơn hết giờ giữ chỗ
* **Statement:** Hệ thống phải tự động hủy phiên thanh toán chưa thanh toán khi hết thời gian giữ chỗ, chuyển mọi hóa đơn DRAFT của phiên sang CANCELLED, và giải phóng mọi slot của phiên.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given phiên `C` chưa thanh toán gồm hóa đơn `H1`, `H2` ở `DRAFT`, `now() > C.hold_expires_at`,  
    When job chuyển trạng thái chạy,  
    Then trong cùng transaction: `C.cancelled_at = now()`, `H1` và `H2` → `CANCELLED` với `cancelled_at = now()`, `Payment` `PENDING` của `C` (nếu có) → `EXPIRED`, và ghi AuditLog.
  * **AC2 (Giải phóng slot):** Given `C` vừa bị hủy,  
    When bất kỳ thương hiệu nào chọn slot của `H1` hoặc `H2`,  
    Then hệ thống cho tạo hóa đơn mới — `excl_slot_rental_overlap` không còn tính `H1`, `H2`.
  * **AC3 (Bù sau downtime):** Given hệ thống ngừng hoạt động qua mốc `hold_expires_at` của `C`,  
    When job chạy lần đầu sau khi khởi động lại,  
    Then `C` và mọi hóa đơn của nó vẫn được hủy, không bị bỏ sót.
  * **AC4:** Given `C` đã thanh toán,  
    When job chạy sau `hold_expires_at`,  
    Then `C` và các hóa đơn của nó không bị hủy.
  * **AC5 (Không hủy nửa phiên — ràng buộc ở tầng CSDL):** Given transaction hủy `C` nhưng sót một hóa đơn của `C` ở `DRAFT`,  
    When COMMIT,  
    Then CSDL từ chối (`chk_checkout_invoice_state_sync`, ADR-0008).
* **Test:** `test_FR_SLT_39_cancel_unpaid_invoice_after_hold`

> Thuộc nhóm "job chuyển trạng thái hóa đơn" trong 7 nhóm test người tự viết (`spec/testing.md`) —
> agent không sinh test cho FR này.

---

## FR-SLT-40 — Xem và tải hóa đơn
* **Statement:** Hệ thống phải cho phép Brand Admin xem và tải hóa đơn đã thanh toán, gồm số hóa đơn, slot, máy, địa điểm, gói thuê, gói bảo quản, đơn giá, ưu đãi, từng khoản tiền, tổng tiền, thời điểm thanh toán và thời hạn hiệu lực.
* **Traces:** BR-008, BR-011 · **Priority:** M
* **API:** `GET /slot-rentals/{id}/invoice`
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` của thương hiệu `B` đã thanh toán và đã hiệu lực,  
    When Brand Admin của `B` mở hóa đơn,  
    Then nội dung gồm đủ các trường trong Statement, đúng với giá đã chụp (FR-SLT-33).
  * **AC2 (Chờ nạp hàng):** Given `H` đã thanh toán nhưng chưa lắp chai,  
    When mở hóa đơn,  
    Then thời hạn hiệu lực hiện "bắt đầu khi lắp chai đầu tiên" thay vì ngày cụ thể.
  * **AC3 (Chưa thanh toán):** Given `H` còn ở `DRAFT` chưa thanh toán,  
    When mở hóa đơn,  
    Then hệ thống trả bảng tính tiền của riêng `H` kèm `hold_expires_at` và mã phiên thanh toán chứa `H` (ADR-0008), nhưng chưa có số hóa đơn.
  * **AC3b (Thanh toán chung phiên):** Given `H1`, `H2` đã thanh toán trong cùng một phiên,  
    When mở `H1`,  
    Then hóa đơn chỉ ghi các khoản tiền và số hóa đơn của `H1`, kèm mã phiên để đối chiếu với giao dịch đã trả.
  * **AC4 (Cô lập dữ liệu):** Given `H` thuộc thương hiệu `B2`,  
    When Brand Admin của `B1` mở `H`,  
    Then hệ thống trả HTTP 403 `FORBIDDEN_SCOPE` (FR-AUTH-08).
* **Test:** `test_FR_SLT_40_view_invoice`

---

## FR-SLT-41 — Danh sách hóa đơn của thương hiệu
* **Statement:** Hệ thống phải cho phép Brand Admin xem danh sách hóa đơn của thương hiệu mình kèm trạng thái: chờ thanh toán, chờ nạp hàng, đang hiệu lực, sắp hết hạn, ân hạn, đã thanh lý, đã kết thúc hoặc đã hủy.
* **Traces:** BR-011 · **Priority:** M
* **API:** `GET /slot-rentals`
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` có hóa đơn ở nhiều trạng thái,  
    When Brand Admin của `B` xem danh sách,  
    Then mỗi hóa đơn hiện đúng một nhãn: `DRAFT` chưa thanh toán → chờ thanh toán; `DRAFT` đã thanh toán → chờ nạp hàng; `ACTIVE` → đang hiệu lực; `EXPIRING` → sắp hết hạn; `GRACE` → ân hạn; `LIQUIDATED` → đã thanh lý; `RENEWED`, `CLOSED`, `TERMINATED` → đã kết thúc; `CANCELLED` → đã hủy.
  * **AC2 (Cô lập dữ liệu):** Given thương hiệu `B2` cũng có hóa đơn,  
    When Brand Admin của `B1` xem danh sách,  
    Then kết quả không chứa hóa đơn nào của `B2`.
* **Test:** `test_FR_SLT_41_list_brand_invoices`

---

## FR-SLT-42 — Tự kích hoạt khi chờ nạp hàng quá lâu
* **Statement:** Hệ thống phải tự động kích hoạt hóa đơn đã thanh toán khi quá `RENTAL_MAX_STOCKING_DAYS` ngày kể từ lúc thanh toán mà chưa lắp chai, với ngày bắt đầu là thời điểm kích hoạt.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hóa đơn `H` gói 3 tháng, thanh toán lúc `tp`, chưa lắp chai, `now() > tp + RENTAL_MAX_STOCKING_DAYS`,  
    When job chuyển trạng thái chạy lúc `t`,  
    Then `H` → `ACTIVE`, `starts_at = t`, `ends_at = t + 3 tháng`, và ghi AuditLog. Slot vẫn `UNAVAILABLE` vì chưa có chai (FR-MCH-16).
  * **AC2 (Bù sau downtime):** Given hệ thống ngừng hoạt động qua mốc kích hoạt của `H`,  
    When job chạy lần đầu sau khi khởi động lại,  
    Then `H` vẫn được kích hoạt, không bị bỏ sót.
  * **AC3:** Given chai đầu tiên đã được lắp trước mốc,  
    When job chạy,  
    Then không làm gì với `H` (đã kích hoạt theo FR-SLT-24).
* **Test:** `test_FR_SLT_42_auto_activate_after_stocking_window`

> Thuộc nhóm "job chuyển trạng thái hóa đơn" trong 7 nhóm test người tự viết (`spec/testing.md`) —
> agent không sinh test cho FR này.

---

## FR-SLT-43 — Thông báo thanh toán thành công và bắt đầu hiệu lực
* **Statement:** Hệ thống phải thông báo cho Brand Admin khi hóa đơn được thanh toán thành công và khi hóa đơn bắt đầu hiệu lực, kèm ngày kết thúc.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given phiên `C` của thương hiệu `B` vừa được xác nhận thanh toán (FR-SLT-38),  
    When transaction hoàn tất,  
    Then mọi Brand Admin của `B` nhận **một** thông báo trong hệ thống liệt kê số hóa đơn của mọi hóa đơn trong `C`, kèm lời nhắc gửi hàng, cấu hình slot — không phải một thông báo cho mỗi hóa đơn (ADR-0008).
  * **AC2:** Given `H` chuyển `ACTIVE` (FR-SLT-24, FR-SLT-42 hoặc gia hạn FR-SLT-12),  
    When transaction hoàn tất,  
    Then mọi Brand Admin của `B` nhận thông báo kèm `starts_at` và `ends_at`.
  * **AC3 (Cô lập dữ liệu):** Given thương hiệu `B2` khác `B`,  
    When `H` được thanh toán hoặc kích hoạt,  
    Then không Brand Admin nào của `B2` nhận thông báo.
* **Test:** `test_FR_SLT_43_notify_paid_and_active_invoice`

---

## FR-SLT-44 — Tính bồi thường hàng hóa hư hỏng
* **Statement:** Hệ thống phải tính số tiền bồi thường khi chai của thương hiệu chuyển sang DAMAGED trong lúc nền tảng đang giữ, bằng tỷ lệ bồi thường của gói bảo quản áp dụng nhân giá bán lẻ chai, không vượt hạn mức còn lại.
* **Traces:** BR-005, BR-008 · **Priority:** M
* **Acceptance criteria:**
  * **AC1 (Chai đang lắp):** Given chai `X` của thương hiệu `B` đang lắp trong slot `S`, hóa đơn của `S` chụp gói bồi thường `60%`, hạn mức `5,000,000 VND` chưa dùng, giá bán lẻ chai `2,000,000 VND` (FR-PRD-05),  
    When Inventory Staff chuyển `X` sang `DAMAGED`,  
    Then hệ thống tạo khoản bồi thường `1,200,000 VND` trạng thái `PENDING`, gắn với `X` và hóa đơn đó, và ghi AuditLog.
  * **AC2 (Chai trong kho):** Given chai `Y` của `B` đang `IN_STOCK`, `B` có hai hóa đơn hiệu lực với gói bồi thường `30%` và `60%`,  
    When `Y` chuyển `DAMAGED`,  
    Then hệ thống áp gói `60%` (gói có tỷ lệ cao nhất trong các hóa đơn hiệu lực của `B`).
  * **AC3 (Chạm hạn mức):** Given hạn mức còn lại của hóa đơn là `500,000 VND`,  
    When tính ra `1,200,000 VND`,  
    Then khoản bồi thường là `500,000 VND`.
  * **AC4 (Không bồi thường):** Given chai hết hạn (`EXPIRED`), đã `LIQUIDATED`, hoặc `B` không có hóa đơn hiệu lực nào,  
    When chai chuyển `DAMAGED`,  
    Then hệ thống không tạo khoản bồi thường.
* **Test:** `test_FR_SLT_44_compute_storage_compensation`

---

## FR-SLT-45 — Ghi nhận chi trả bồi thường
* **Statement:** Hệ thống phải cho phép Platform Super Admin ghi nhận đã chi trả bồi thường kèm mã giao dịch, sau khi xác thực lại mật khẩu.
* **Traces:** BR-008 · **Priority:** M
* **API:** `POST /storage-compensations/{id}/payout`
* **Acceptance criteria:**
  * **AC1:** Given khoản bồi thường `C` `PENDING` `1,200,000 VND`, Super Admin đã xác thực lại,  
    When ghi nhận chi trả kèm `reference`,  
    Then `C` → `PAID`, lưu `payout_reference`, `paid_by`, `paid_at`, và ghi AuditLog (FR-AUD-06).
  * **AC2 (Chưa xác thực lại):** Given Super Admin chưa xác thực lại trong `REAUTH_TOKEN_TTL_SEC`,  
    When ghi nhận chi trả,  
    Then hệ thống từ chối với HTTP 403 `REAUTH_REQUIRED`.
  * **AC3 (Đã chi trả):** Given `C` đã `PAID`,  
    When ghi nhận lần nữa,  
    Then hệ thống từ chối với HTTP 400 `VALIDATION_ERROR`.
  * **AC4:** Given người gọi không phải Platform Super Admin,  
    When ghi nhận chi trả,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_45_record_compensation_payout`

---

## FR-SLT-46 — Brand Admin xem khoản bồi thường
* **Statement:** Hệ thống phải cho phép Brand Admin xem các khoản bồi thường của thương hiệu mình và trạng thái chi trả.
* **Traces:** BR-005, BR-012 · **Priority:** M
* **API:** `GET /storage-compensations`
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` có khoản bồi thường `PENDING` và `PAID`,  
    When Brand Admin của `B` xem danh sách,  
    Then mỗi khoản hiện chai, sản phẩm, số tiền, gói áp dụng, trạng thái và mã giao dịch nếu đã chi trả.
  * **AC2 (Cô lập dữ liệu):** Given thương hiệu `B2` cũng có khoản bồi thường,  
    When Brand Admin của `B1` xem,  
    Then kết quả không chứa khoản nào của `B2`.
* **Test:** `test_FR_SLT_46_list_brand_compensations`

---

## FR-SLT-47 — Báo cáo doanh thu bán gói
* **Statement:** Hệ thống phải cho phép Platform Super Admin xem doanh thu bán gói thuê và gói bảo quản theo khoảng thời gian, gói, máy và địa điểm.
* **Traces:** BR-009 · **Priority:** M
* **API:** `GET /reports/rental-sales`
* **Acceptance criteria:**
  * **AC1:** Given trong tháng `K` có 3 hóa đơn đã thanh toán tổng `20,700,000 VND` (phí thuê `17,100,000`, phí bảo quản `3,600,000`),  
    When Super Admin xem báo cáo tháng `K`,  
    Then báo cáo hiện tổng `20,700,000 VND`, tách phí thuê, phí bảo quản và phí ân hạn, lọc được theo gói, máy và địa điểm.
  * **AC2:** Given hóa đơn chưa thanh toán hoặc đã `CANCELLED`,  
    When tính báo cáo,  
    Then không tính vào doanh thu.
  * **AC3:** Given người gọi là Brand Admin,  
    When truy cập báo cáo,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE` (FR-RPT-15).
* **Test:** `test_FR_SLT_47_rental_sales_report`
