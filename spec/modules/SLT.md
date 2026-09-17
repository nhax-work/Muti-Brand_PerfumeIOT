# FR-SLT — Hợp đồng thuê slot

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A6 · 29 FR  
> Trạng thái AC: **hoàn thành** (FR-SLT-01÷18 viết tuần 1; FR-SLT-19÷29 bổ sung sau)  
> Phụ trách: TV3 / Tài  

Đọc kèm: `spec/glossary.md` (state machine SlotRental), `spec/errors.md`, `spec/constraints.md`

---

## FR-SLT-01 — Tạo hợp đồng thuê slot
* **Statement:** Hệ thống phải cho phép Platform Super Admin tạo hợp đồng thuê slot gồm slot, thương hiệu, ngày bắt đầu, ngày kết thúc, phí cố định theo kỳ và tỷ lệ ăn chia doanh thu.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Platform Super Admin, slot `S` tồn tại, thương hiệu `B` ở trạng thái ACTIVE, ngày bắt đầu `start_date <= end_date`, `fixed_fee >= 0`, `revenue_share_rate` nằm trong khoảng `[0, 100]`,  
    When gửi yêu cầu tạo hợp đồng thuê slot,  
    Then hệ thống tạo hợp đồng mới với trạng thái `ACTIVE` (nếu `start_date <= Today <= end_date`) hoặc `DRAFT` (nếu `start_date > Today`), lưu đầy đủ các trường và ghi AuditLog.
  * **AC2:** Given người dùng không có vai trò Platform Super Admin (vd: Brand Admin, Operations Staff),  
    When gửi yêu cầu tạo hợp đồng thuê slot,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC3 (Ca biên - Ngày không hợp lệ):** Given ngày kết thúc nhỏ hơn ngày bắt đầu (`start_date > end_date`),  
    When gửi yêu cầu tạo hợp đồng,  
    Then hệ thống từ chối với HTTP 400 `INVALID_RENTAL_PERIOD`.
  * **AC4 (Ca biên - Tham số tài chính âm):** Given `fixed_fee < 0` hoặc `revenue_share_rate < 0` hoặc `revenue_share_rate > 100`,  
    When gửi yêu cầu tạo hợp đồng,  
    Then hệ thống từ chối với HTTP 400.
* **Test:** `test_FR_SLT_01_create_slot_rental`

---

## FR-SLT-02 — Một hợp đồng hiệu lực trên mỗi slot
* **Statement:** Hệ thống phải bảo đảm mỗi slot chỉ có tối đa một hợp đồng ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED tại một thời điểm.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã có một hợp đồng ở trạng thái `ACTIVE`,  
    When tạo hợp đồng mới trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_OCCUPIED`.
  * **AC2:** Given slot `S` có hợp đồng ở trạng thái `LIQUIDATED` (đang bán hàng tồn thanh lý),  
    When tạo hợp đồng mới trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_OCCUPIED`.
  * **AC3:** Given slot `S` có hợp đồng cũ đã chuyển sang `CLOSED` hoặc `TERMINATED`,  
    When tạo hợp đồng mới trên slot `S`,  
    Then hệ thống chấp nhận tạo hợp đồng.
  * **AC4 (Đồng thời - Concurrency):** Given hai yêu cầu tạo hợp đồng trên cùng slot `S` đến đồng thời,  
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
  * **AC1:** Given thương hiệu `B` đang có hợp đồng ACTIVE trên slot 1 của máy `M`, slot 2 của máy `M` đang trống,  
    When tạo hợp đồng mới cho thương hiệu `B` trên slot 2,  
    Then hệ thống tạo hợp đồng thành công và cả hai slot đều thuộc quyền khai thác của thương hiệu `B`.
  * **AC2:** Given máy `M` có `N` slot trống,  
    When tạo `N` hợp đồng cho cùng thương hiệu `B` trên `N` slot này,  
    Then hệ thống chấp nhận toàn bộ `N` hợp đồng độc lập nhau.
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
* **Statement:** Hệ thống phải từ chối tạo hợp đồng có kỳ hạn chồng lấn với hợp đồng đang tồn tại trên cùng slot.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã có hợp đồng ACTIVE với kỳ hạn `01/01 - 31/03`,  
    When tạo hợp đồng mới trên `S` với kỳ hạn `01/02 - 30/04`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_OVERLAP`.
  * **AC2:** Given slot `S` có hợp đồng ACTIVE `01/01 - 31/03`,  
    When tạo hợp đồng mới trên `S` bắt đầu từ `01/04`,  
    Then hệ thống chấp nhận.
  * **AC3 (Ca biên - Trùng mốc biên):** Given slot `S` có hợp đồng ACTIVE `01/01 - 31/03`,  
    When tạo hợp đồng mới trên `S` bắt đầu đúng ngày `31/03`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_OVERLAP` (khoảng đóng hai đầu `[start, end]`).
  * **AC4:** Given slot `S` có hợp đồng cũ bị `TERMINATED` hiệu lực đến `15/02`,  
    When tạo hợp đồng mới trên `S` từ `16/02`,  
    Then hệ thống chấp nhận.
* **Test:** `test_FR_SLT_05_reject_overlapping_rental`

---

## FR-SLT-06 — Quản lý vòng đời trạng thái hợp đồng
* **Statement:** Hệ thống phải quản lý trạng thái hợp đồng theo tập: DRAFT, ACTIVE, EXPIRING, GRACE, RENEWED, LIQUIDATED, CLOSED, TERMINATED.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng đang ở trạng thái hợp lệ,  
    When thực hiện chuyển đổi trạng thái tuân thủ đúng sơ đồ State Machine (`DRAFT -> ACTIVE -> EXPIRING -> GRACE -> RENEWED/LIQUIDATED -> CLOSED`, hoặc `ACTIVE -> TERMINATED`),  
    Then hệ thống cập nhật trạng thái mới và ghi vết AuditLog.
  * **AC2 (Chuyển đổi sai quy tắc):** Given hợp đồng đang ở trạng thái `CLOSED` hoặc `TERMINATED`,  
    When có yêu cầu chuyển sang `ACTIVE` hoặc `GRACE`,  
    Then hệ thống từ chối với HTTP 400.
  * **AC3:** Given hợp đồng đang ở `LIQUIDATED`,  
    When có yêu cầu chuyển sang `RENEWED`,  
    Then hệ thống từ chối với HTTP 400 (hàng thanh lý không thể phục hồi gia hạn).
* **Test:** `test_FR_SLT_06_contract_lifecycle_transitions`

---

## FR-SLT-07 — Ràng buộc sản phẩm thuộc thương hiệu thuê slot
* **Statement:** Hệ thống phải chỉ cho phép gán vào slot sản phẩm thuộc thương hiệu đang có hợp đồng thuê slot đó.
* **Traces:** BR-003, BR-012 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hợp đồng ACTIVE của thương hiệu `B`, sản phẩm `P` thuộc danh mục của thương hiệu `B`,  
    When cấu hình gán sản phẩm `P` cho slot `S`,  
    Then hệ thống lưu thành công.
  * **AC2:** Given slot `S` có hợp đồng ACTIVE của thương hiệu `B`, sản phẩm `P` thuộc sở hữu thương hiệu `C` (`C != B`),  
    When cố gắng gán sản phẩm `P` cho slot `S`,  
    Then hệ thống từ chối với HTTP 403 `PRODUCT_NOT_OWNED`.
  * **AC3:** Given slot `S` hiện không có hợp đồng thuê hiệu lực nào,  
    When cố gắng gán bất kỳ sản phẩm nào cho slot `S`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
* **Test:** `test_FR_SLT_07_slot_product_ownership_validation`

---

## FR-SLT-08 — Thương hiệu tự do đặt giá mỗi lượt xịt
* **Statement:** Hệ thống phải cho phép Brand Admin tự do đặt giá mỗi lượt xịt cho slot mình thuê, không bị giới hạn bởi giá sàn hay giá trần.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B`, slot `S` có hợp đồng ACTIVE của `B`,  
    When đặt giá bất kỳ lớn hơn 0 (ví dụ: 1,000 VND hoặc 500,000 VND) cho slot `S`,  
    Then hệ thống chấp nhận cập nhật giá và ghi AuditLog.
  * **AC2:** Given Brand Admin của thương hiệu `B`, slot `S` đang thuộc thương hiệu khác `C`,  
    When đặt giá cho slot `S`,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC3 (Ca biên - Giá không hợp lệ):** Given Brand Admin đặt giá `<= 0`,  
    When gửi yêu cầu cập nhật giá,  
    Then hệ thống từ chối với HTTP 400.
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

## FR-SLT-10 — Từ chối tạo đơn khi slot không có hợp đồng hợp lệ
* **Statement:** Hệ thống phải từ chối tạo đơn hàng mới trên slot không có hợp đồng ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED.
* **Traces:** BR-002, BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hợp đồng ở một trong các trạng thái `ACTIVE`, `EXPIRING`, `GRACE`, hoặc `LIQUIDATED` (máy ONLINE, slot AVAILABLE),  
    When khách hàng gửi yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống cho phép tạo đơn thành công.
  * **AC2:** Given slot `S` có hợp đồng ở trạng thái `DRAFT`, `RENEWED`, `CLOSED`, `TERMINATED` hoặc không có hợp đồng nào,  
    When khách hàng gửi yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_UNAVAILABLE`.
* **Test:** `test_FR_SLT_10_reject_order_on_inactive_rental_slot`

---

## FR-SLT-11 — Chuyển trạng thái slot khi hợp đồng kết thúc
* **Statement:** Hệ thống phải chuyển slot sang trạng thái UNAVAILABLE khi hợp đồng chuyển sang TERMINATED hoặc CLOSED.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đang ở trạng thái `AVAILABLE` với hợp đồng `H`,  
    When hợp đồng `H` chuyển sang `TERMINATED`,  
    Then slot `S` tự động chuyển sang trạng thái `UNAVAILABLE` và từ chối mọi yêu cầu tạo đơn mới.
  * **AC2:** Given slot `S` đang bán hàng thanh lý với hợp đồng `H` ở trạng thái `LIQUIDATED`,  
    When hợp đồng `H` chuyển sang `CLOSED`,  
    Then slot `S` tự động chuyển sang `UNAVAILABLE`.
  * **AC3:** Given slot `S` đã chuyển sang `UNAVAILABLE`,  
    When Kiosk hiển thị giao diện,  
    Then slot `S` không hiển thị là khả dụng để khách lựa chọn.
* **Test:** `test_FR_SLT_11_slot_unavailable_on_contract_end`

---

## FR-SLT-12 — Gia hạn hợp đồng nối tiếp
* **Statement:** Hệ thống phải cho phép Platform Super Admin gia hạn hợp đồng bằng cách tạo hợp đồng kế tiếp và liên kết với hợp đồng cũ.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H1` trên slot `S` đang `EXPIRING` hoặc `GRACE` có ngày kết thúc `end_date`,  
    When Platform Super Admin tạo hợp đồng gia hạn `H2` cho cùng thương hiệu bắt đầu từ ngày `end_date + 1`,  
    Then `H2` được tạo thành công với liên kết `previous_rental_id = H1.id`, và `H1` chuyển trạng thái sang `RENEWED`.
  * **AC2:** Given hợp đồng `H1` đã ở trạng thái `CLOSED` hoặc `TERMINATED`,  
    When cố gắng thực hiện gia hạn từ `H1`,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_NOT_ACTIVE`.
* **Test:** `test_FR_SLT_12_renew_contract_link`

---

## FR-SLT-13 — Chấm dứt hợp đồng trước hạn kèm lý do bắt buộc
* **Statement:** Hệ thống phải cho phép Platform Super Admin chấm dứt hợp đồng trước hạn kèm lý do bắt buộc.
* **Traces:** BR-009 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given người dùng là Platform Super Admin, hợp đồng `H` đang `ACTIVE`,  
    When gửi yêu cầu chấm dứt hợp đồng kèm chuỗi lý do hợp lệ (non-empty string),  
    Then hợp đồng `H` chuyển sang `TERMINATED`, ghi nhận `terminated_at`, `termination_reason`, đưa slot về `UNAVAILABLE`, và ghi AuditLog.
  * **AC2 (Ca biên - Thiếu lý do):** Given yêu cầu chấm dứt không có lý do hoặc lý do chỉ chứa khoảng trắng,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400.
  * **AC3:** Given người dùng là Brand Admin hoặc vai trò khác,  
    When gửi yêu cầu chấm dứt hợp đồng,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_13_terminate_contract_early`

---

## FR-SLT-14 — Đóng hợp đồng thanh lý để giải phóng slot
* **Statement:** Hệ thống phải cho phép Platform Super Admin đóng hợp đồng ở trạng thái LIQUIDATED sau khi hàng thanh lý đã bán hết hoặc được tháo khỏi slot, để giải phóng slot cho hợp đồng mới.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` trên slot `S` đang ở trạng thái `LIQUIDATED`, chai nước hoa trong slot đã `EMPTY` hoặc đã được Inventory Staff tháo về kho (`IN_STOCK`),  
    When Platform Super Admin thực hiện đóng hợp đồng,  
    Then hợp đồng `H` chuyển sang `CLOSED`, giải phóng slot `S`.
  * **AC2 (Ca biên - Còn tồn chưa tháo):** Given hợp đồng `H` đang `LIQUIDATED` nhưng chai nước hoa trong slot vẫn còn dung lượng và chưa tháo khỏi slot,  
    When yêu cầu đóng hợp đồng mà không có cờ xác nhận tháo chai,  
    Then hệ thống từ chối với HTTP 409.
  * **AC3:** Given hợp đồng `H` đã chuyển `CLOSED`,  
    When tạo hợp đồng mới trên slot `S`,  
    Then hệ thống chấp nhận (không còn bị chặn bởi ràng buộc `SLOT_OCCUPIED`).
* **Test:** `test_FR_SLT_14_close_liquidated_rental`

---

## FR-SLT-15 — Lưu lịch sử toàn bộ hợp đồng trên mỗi slot
* **Statement:** Hệ thống phải lưu lịch sử toàn bộ hợp đồng đã từng tồn tại trên mỗi slot.
* **Traces:** BR-008, BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã trải qua nhiều hợp đồng (`H1` CLOSED, `H2` TERMINATED, `H3` ACTIVE),  
    When Platform Super Admin truy vấn lịch sử slot `S`,  
    Then hệ thống trả về đầy đủ danh sách các hợp đồng theo thứ tự thời gian kèm thông tin thương hiệu, kỳ hạn và trạng thái.
  * **AC2 (Cô lập dữ liệu BR-012):** Given Brand Admin của thương hiệu `B` truy vấn lịch sử hợp đồng của slot `S`, slot `S` trước đây từng do thương hiệu `C` thuê,  
    When xem danh sách lịch sử,  
    Then hệ thống chỉ trả về các hợp đồng thuộc thương hiệu `B`, tuyệt đối ẩn các bản ghi thuộc thương hiệu `C`.
* **Test:** `test_FR_SLT_15_slot_rental_history_audit`

---

## FR-SLT-16 — Báo cáo tỷ lệ lấp đầy slot
* **Statement:** Hệ thống phải hiển thị cho Platform Super Admin tỷ lệ lấp đầy slot theo máy và theo địa điểm.
* **Traces:** BR-009 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given máy `M` có tổng cộng 4 slot, trong đó 3 slot có hợp đồng ở trạng thái `ACTIVE`, `EXPIRING`, `GRACE` hoặc `LIQUIDATED`, và 1 slot trống,  
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

## FR-SLT-17 — Tạo bảng quyết toán theo kỳ cho thương hiệu
* **Statement:** Hệ thống phải tạo bảng quyết toán theo kỳ cho mỗi thương hiệu, gộp toàn bộ hợp đồng của thương hiệu trong kỳ, có dòng chi tiết theo từng slot.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` có 2 hợp đồng thuê slot hoạt động trong kỳ thanh toán `K`,  
    When tiến trình tạo bảng quyết toán thực thi cho kỳ `K`,  
    Then hệ thống sinh đúng 1 bảng quyết toán tổng thể cho thương hiệu `B`, kèm chính xác 2 dòng chi tiết tương ứng với 2 slot.
  * **AC2:** Given thương hiệu `B` không có hợp đồng hoạt động và không phát sinh doanh thu trong kỳ `K`,  
    When tạo quyết toán,  
    Then không sinh bảng quyết toán cho thương hiệu `B`.
  * **AC3 (Phân quyền dữ liệu):** Given Brand Admin của thương hiệu `B` tải bảng quyết toán,  
    When thực hiện truy vấn,  
    Then chỉ xem được bảng quyết toán của thương hiệu `B`, không xem được của các thương hiệu khác.
* **Test:** `test_FR_SLT_17_generate_settlement_statement`

---

## FR-SLT-18 — Tính toán chi tiết các khoản trong bảng quyết toán
* **Statement:** Hệ thống phải tính trong bảng quyết toán: doanh thu lượt xịt thuộc thương hiệu, phí thuê cố định, phần ăn chia doanh thu, phí ân hạn và số tiền phải thanh toán.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` của thương hiệu `B` có `fixed_fee = 5,000,000 VND`, `revenue_share_rate = 20%`, tổng doanh thu đơn hàng mang nhãn BRAND trong kỳ là `10,000,000 VND`, phí ân hạn phát sinh là `500,000 VND`,  
    When tính toán số liệu quyết toán cho hợp đồng `H`,  
    Then hệ thống tính toán chi tiết:
    * Doanh thu lượt xịt thương hiệu = `10,000,000 VND`
    * Phí thuê cố định = `5,000,000 VND`
    * Phần ăn chia doanh thu của nền tảng = `10,000,000 * 20% = 2,000,000 VND`
    * Phí ân hạn lưu kho = `500,000 VND`
    * Số tiền thực nhận của thương hiệu = `10,000,000 - (5,000,000 + 2,000,000 + 500,000) = 2,500,000 VND`.
  * **AC2 (Ca biên - Doanh thu nhỏ hơn tổng phí):** Given tổng các khoản phí lớn hơn doanh thu của thương hiệu,  
    When tính toán số tiền thực nhận,  
    Then hệ thống ghi nhận số tiền âm (công nợ thương hiệu cần thanh toán cho nền tảng).
* **Test:** `test_FR_SLT_18_settlement_calculation_formula`
---

## FR-SLT-19 — Danh sách slot trống cho Brand Admin
* **Statement:** Hệ thống phải cho phép Brand Admin xem danh sách slot đang trống (không có hợp đồng ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED) theo máy và địa điểm, không kèm thông tin thương hiệu đã từng thuê trước đó.
* **Traces:** BR-011, BR-012 · **Priority:** M
* **API:** `GET /slots/available`
* **Acceptance criteria:**
  * **AC1:** Given slot `S` không có hợp đồng nào ở trạng thái `ACTIVE`, `EXPIRING`, `GRACE` hoặc `LIQUIDATED`,  
    When Brand Admin truy vấn danh sách slot trống,  
    Then slot `S` xuất hiện trong kết quả kèm máy, số slot và địa điểm.
  * **AC2:** Given slot `S` đang có hợp đồng ở một trong bốn trạng thái chiếm dụng,  
    When Brand Admin truy vấn danh sách slot trống,  
    Then slot `S` không xuất hiện trong kết quả.
  * **AC3 (Cô lập dữ liệu):** Given slot `S` từng được thương hiệu `B2` thuê và hợp đồng đó nay đã `CLOSED`,  
    When Brand Admin của thương hiệu `B1` xem slot `S` trong danh sách slot trống,  
    Then kết quả không chứa bất kỳ trường nào tiết lộ `B2` — không tên thương hiệu, không tên sản phẩm cũ, không lịch sử hợp đồng.
* **Test:** `test_FR_SLT_19_list_available_slots`

---

## FR-SLT-20 — Gửi yêu cầu thuê slot trống
* **Statement:** Hệ thống phải cho phép Brand Admin gửi yêu cầu thuê một hoặc nhiều slot trống, kèm kỳ hạn mong muốn.
* **Traces:** BR-011 · **Priority:** M
* **API:** `POST /slot-rental-requests`
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B` và danh sách slot trống `[S1, S2]`, `desired_starts_at < desired_ends_at`,  
    When gửi yêu cầu thuê,  
    Then hệ thống tạo **hai** bản ghi `SlotRentalRequest` riêng biệt (một slot một yêu cầu), cùng ở trạng thái `REQUESTED`, gắn với thương hiệu `B`.
  * **AC2 (Ca biên - Kỳ hạn không hợp lệ):** Given `desired_ends_at <= desired_starts_at`,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 400 `INVALID_RENTAL_PERIOD`.
  * **AC3:** Given một trong các slot được chọn đang có hợp đồng ở trạng thái chiếm dụng,  
    When gửi yêu cầu,  
    Then hệ thống từ chối với HTTP 409 `SLOT_OCCUPIED` và không tạo yêu cầu nào trong lô đó.
* **Test:** `test_FR_SLT_20_submit_rental_request`

---

## FR-SLT-21 — Trạng thái yêu cầu thuê
* **Statement:** Hệ thống phải quản lý trạng thái yêu cầu thuê theo tập: REQUESTED, APPROVED, REJECTED, CONVERTED, CANCELLED.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given một yêu cầu thuê vừa được tạo,  
    When hệ thống lưu bản ghi,  
    Then trạng thái là `REQUESTED` và chỉ nhận giá trị thuộc enum `slot_rental_request_status`.
  * **AC2:** Given giá trị trạng thái nằm ngoài tập quy định,  
    When yêu cầu cập nhật,  
    Then hệ thống từ chối giá trị đó.
* **Test:** `test_FR_SLT_21_request_status_set`

---

## FR-SLT-22 — Duyệt hoặc từ chối yêu cầu thuê
* **Statement:** Hệ thống phải cho phép Platform Super Admin duyệt hoặc từ chối yêu cầu thuê, kèm lý do bắt buộc khi từ chối.
* **Traces:** BR-009, BR-011 · **Priority:** M
* **API:** `POST /slot-rental-requests/{id}/approve`, `POST /slot-rental-requests/{id}/reject`
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu `R` ở trạng thái `REQUESTED` và người dùng là Platform Super Admin,  
    When duyệt kèm điều khoản `price_per_spray`, `fixed_fee`, `revenue_share_percent`,  
    Then yêu cầu chuyển `APPROVED` và hệ thống ghi `reviewed_by`, `reviewed_at`.
  * **AC2 (Lý do bắt buộc):** Given yêu cầu `R` ở trạng thái `REQUESTED`,  
    When từ chối mà không kèm lý do,  
    Then hệ thống từ chối thao tác với HTTP 400 và không đổi trạng thái yêu cầu.
  * **AC3:** Given người dùng không có vai trò Platform Super Admin,  
    When duyệt hoặc từ chối yêu cầu,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_SLT_22_review_rental_request`

---

## FR-SLT-23 — Tự động tạo hợp đồng DRAFT khi duyệt
* **Statement:** Hệ thống phải tự động tạo hợp đồng ở trạng thái DRAFT khi yêu cầu thuê được duyệt, liên kết với yêu cầu gốc, điền theo điều khoản phí và tỷ lệ ăn chia do Platform Super Admin xác nhận.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given yêu cầu `R` trên slot `S` được duyệt kèm điều khoản,  
    When hệ thống xử lý việc duyệt,  
    Then trong **cùng một transaction** hệ thống tạo `SlotRental` trạng thái `DRAFT` với `slot_id = S`, kỳ hạn lấy từ yêu cầu, các điều khoản phí đã xác nhận, `request_id = R.id`, và đặt `R.resulting_rental_id` trỏ ngược về hợp đồng vừa tạo.
  * **AC2 (Chưa có sản phẩm):** Given hợp đồng DRAFT vừa được tạo tự động,  
    When kiểm tra bản ghi,  
    Then `fragrance_product_id` là NULL — sản phẩm do Brand Admin gán sau (FR-SLT-27).
  * **AC3 (Ca biên - Kỳ hạn chồng lấn):** Given slot `S` đã có một hợp đồng khác (kể cả DRAFT) phủ kỳ hạn chồng lấn,  
    When duyệt yêu cầu,  
    Then hệ thống từ chối với HTTP 409 `RENTAL_OVERLAP` và yêu cầu `R` giữ nguyên trạng thái `REQUESTED`.
* **Test:** `test_FR_SLT_23_auto_create_draft_rental`

---

## FR-SLT-24 — Tự động kích hoạt hợp đồng DRAFT đúng ngày bắt đầu
* **Statement:** Hệ thống phải tự động chuyển hợp đồng từ DRAFT sang ACTIVE đúng ngày bắt đầu đã cấu hình, kể cả khi hệ thống có thời gian ngừng qua mốc chuyển trạng thái.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` ở trạng thái `DRAFT` có `starts_at` là hôm nay,  
    When job chuyển trạng thái chạy,  
    Then `H` chuyển sang `ACTIVE` và ghi AuditLog.
  * **AC2 (Bù sau downtime):** Given hệ thống ngừng hoạt động qua mốc `starts_at` của hợp đồng `H` và chỉ khởi động lại sau đó 2 ngày,  
    When job chạy lần đầu sau khi khởi động lại,  
    Then `H` vẫn được chuyển sang `ACTIVE` (cơ chế bù, NFR-REL-07), không bị bỏ sót.
  * **AC3:** Given hợp đồng `H` ở `DRAFT` có `starts_at` trong tương lai,  
    When job chạy,  
    Then `H` giữ nguyên `DRAFT`.
* **Test:** `test_FR_SLT_24_activate_draft_on_start_date`

> Thuộc 7 nhóm test người tự viết (`tests/integration/test_rental_scheduler.py`,
> `spec/testing.md`) — agent không sinh test cho FR này.

---

## FR-SLT-25 — Brand Admin xem trạng thái và lịch sử yêu cầu
* **Statement:** Hệ thống phải cho phép Brand Admin xem trạng thái và lịch sử các yêu cầu thuê của thương hiệu mình.
* **Traces:** BR-011 · **Priority:** M
* **API:** `GET /slot-rental-requests`
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` có các yêu cầu ở nhiều trạng thái khác nhau,  
    When Brand Admin của `B` truy vấn danh sách,  
    Then hệ thống trả về đầy đủ yêu cầu của `B` kèm trạng thái, thời điểm duyệt và lý do từ chối nếu có.
  * **AC2 (Cô lập dữ liệu):** Given thương hiệu `B2` cũng có yêu cầu trong hệ thống,  
    When Brand Admin của `B1` truy vấn,  
    Then kết quả không chứa yêu cầu nào của `B2`.
* **Test:** `test_FR_SLT_25_list_own_rental_requests`

---

## FR-SLT-26 — Chặn yêu cầu trùng trên cùng slot
* **Statement:** Hệ thống phải ngăn Brand Admin gửi yêu cầu thuê mới trên cùng slot khi đã tồn tại yêu cầu ở trạng thái REQUESTED hoặc APPROVED chưa xử lý xong.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` đã có một yêu cầu ở trạng thái `REQUESTED`,  
    When bất kỳ thương hiệu nào gửi yêu cầu mới trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_OCCUPIED`.
  * **AC2:** Given slot `S` có yêu cầu ở trạng thái `REJECTED` hoặc `CANCELLED`,  
    When gửi yêu cầu mới trên slot `S`,  
    Then hệ thống chấp nhận — trạng thái kết thúc không chặn yêu cầu mới.
  * **AC3 (Ràng buộc ở tầng CSDL):** Given hai yêu cầu trên cùng slot `S` được gửi đồng thời,  
    When cả hai cùng ghi vào CSDL,  
    Then partial unique index `uq_slot_rental_request_open` bảo đảm chỉ một bản ghi thành công, bản còn lại lỗi — không phụ thuộc kiểm tra ở tầng ứng dụng.
* **Test:** `test_FR_SLT_26_reject_duplicate_open_request`

---

## FR-SLT-27 — Gán sản phẩm vào slot
* **Statement:** Hệ thống phải cho phép Brand Admin gán đúng một sản phẩm đang kinh doanh của thương hiệu mình vào slot đang có hợp đồng hiệu lực.
* **Traces:** BR-011 · **Priority:** M
* **API:** `PUT /slot-rentals/{id}/product`
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` của thương hiệu `B` và sản phẩm `P` thuộc `B` ở trạng thái ACTIVE,  
    When Brand Admin gán `P` vào `H`,  
    Then hệ thống ghi `fragrance_product_id = P` và `product_assigned_at = now()`, đồng thời ghi AuditLog (FR-AUD-04).
  * **AC2 (Sản phẩm của thương hiệu khác):** Given sản phẩm `P2` thuộc thương hiệu `B2`,  
    When Brand Admin của `B1` gán `P2` vào hợp đồng của mình,  
    Then hệ thống từ chối với HTTP 403 `PRODUCT_NOT_OWNED`.
  * **AC3 (Ràng buộc ở tầng CSDL):** Given nỗ lực ghi thẳng vào CSDL một `fragrance_product_id` thuộc thương hiệu khác,  
    When thực hiện UPDATE,  
    Then composite foreign key `fk_rental_product_same_brand` từ chối thao tác (`spec/contracts/schema.sql` §10b).
  * **AC4 (Ca biên - Sản phẩm ngừng kinh doanh):** Given sản phẩm `P` ở trạng thái `DISCONTINUED`,  
    When gán `P` vào slot,  
    Then hệ thống từ chối thao tác.
* **Test:** `test_FR_SLT_27_assign_product_to_slot`

---

## FR-SLT-28 — Đổi sản phẩm gán cho slot
* **Statement:** Hệ thống phải cho phép Brand Admin đổi sản phẩm gán cho slot, ghi nhận thời điểm đổi.
* **Traces:** BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` đang gán sản phẩm `P1`,  
    When Brand Admin đổi sang sản phẩm `P2` cùng thương hiệu,  
    Then hệ thống cập nhật `fragrance_product_id = P2` và `product_assigned_at` về thời điểm đổi, ghi AuditLog.
  * **AC2 (Đơn đang chờ không bị ảnh hưởng):** Given có đơn hàng của `H` đang ở trạng thái `PENDING_PAYMENT` với sản phẩm `P1` đã chụp,  
    When đổi sản phẩm sang `P2`,  
    Then đơn đang chờ giữ nguyên `fragrance_product_id` và `product_name_snapshot` của `P1` (FR-ORD-06).
* **Test:** `test_FR_SLT_28_change_slot_product`

---

## FR-SLT-29 — Từ chối tạo đơn khi slot chưa gán sản phẩm
* **Statement:** Hệ thống phải từ chối tạo đơn hàng tại slot chưa được gán sản phẩm.
* **Traces:** BR-002, BR-011 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given hợp đồng `H` trên slot `S` có `fragrance_product_id` là NULL,  
    When kiosk yêu cầu tạo đơn trên slot `S`,  
    Then hệ thống từ chối với HTTP 409 `SLOT_UNAVAILABLE`.
  * **AC2:** Given hợp đồng `H` chưa gán sản phẩm,  
    When tính trạng thái khả dụng của slot `S`,  
    Then slot ở trạng thái `UNAVAILABLE` (FR-MCH-16) và không hiển thị sản phẩm trên kiosk.
* **Test:** `test_FR_SLT_29_reject_order_without_product`

> **Vì sao `slot_rentals.fragrance_product_id` nullable ở tầng CSDL.** Cột để nullable *chỉ* nhằm
> phục vụ cửa sổ DRAFT giữa FR-SLT-23 (tạo hợp đồng tự động) và FR-SLT-27 (Brand Admin gán sản
> phẩm). Ràng buộc "phải có sản phẩm trước khi nhận đơn" nằm ở domain service, không ở CSDL —
> xem `spec/contracts/schema.sql` §13 mục 3.
