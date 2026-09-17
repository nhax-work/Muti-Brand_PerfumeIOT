# FR-MCH — Máy và slot

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A5 · 17 FR
> Trạng thái AC: **một phần** — chỉ FR-MCH-15÷17 có AC; FR-MCH-01÷14 chưa viết
> Phụ trách: TV4
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`
Mẫu định dạng AC: xem `spec/modules/SLT.md`

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
* **Statement:** Hệ thống phải chuyển slot sang AVAILABLE khi đồng thời thỏa: có hợp đồng ở trạng thái ACTIVE, EXPIRING, GRACE hoặc LIQUIDATED; đã gán sản phẩm; có chai đang lắp với lượng còn lại đủ cho một lượt xịt; và slot không bị tắt thủ công.
* **Traces:** BR-002, BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` thỏa **đồng thời cả bốn** điều kiện — hợp đồng ở một trong bốn trạng thái chiếm dụng, `fragrance_product_id` khác NULL, `active_bottle_id` khác NULL với `estimated_remaining_ml >= calibrated_dosage_ml`, và slot không bị tắt thủ công,  
    When hệ thống tính lại trạng thái khả dụng,  
    Then slot `S` chuyển sang `AVAILABLE`.
  * **AC2 (Thiếu hợp đồng):** Given slot `S` không có hợp đồng ở trạng thái chiếm dụng,  
    When tính trạng thái,  
    Then slot **không** chuyển `AVAILABLE` (FR-SLT-10).
  * **AC3 (Thiếu sản phẩm):** Given hợp đồng trên slot `S` có `fragrance_product_id` là NULL (cửa sổ DRAFT của FR-SLT-23÷27),  
    When tính trạng thái,  
    Then slot **không** chuyển `AVAILABLE` (FR-SLT-29).
  * **AC4 (Không đủ cho một lượt xịt):** Given chai đang lắp có `estimated_remaining_ml < calibrated_dosage_ml`,  
    When tính trạng thái,  
    Then slot **không** chuyển `AVAILABLE` (FR-INV-12).
  * **AC5 (Hàng thanh lý vẫn bán được):** Given hợp đồng trên slot `S` ở trạng thái `LIQUIDATED` và ba điều kiện còn lại đều thỏa,  
    When tính trạng thái,  
    Then slot `S` vẫn chuyển `AVAILABLE` — doanh thu từ đó thuộc nền tảng (FR-EXP-17, FR-REV-02).
* **Test:** `test_FR_MCH_16_slot_becomes_available`

> FR này hợp nhất các điều kiện vốn nằm rải rác ở FR-SLT-11, FR-SLT-29 và FR-INV-12 thành một
> định nghĩa duy nhất. Khi hiện thực, tính trạng thái ở **một chỗ** rồi gọi lại từ mọi luồng làm
> thay đổi bốn điều kiện trên; đừng lặp lại logic ở từng luồng.

---

## FR-MCH-17 — Chuyển slot sang UNAVAILABLE khi mất điều kiện
* **Statement:** Hệ thống phải chuyển slot sang UNAVAILABLE ngay khi bất kỳ điều kiện tại FR-MCH-16 không còn thỏa.
* **Traces:** BR-002, BR-005 · **Priority:** M
* **Acceptance criteria:**
  * **AC1 (Hết hàng):** Given slot `S` đang `AVAILABLE`,  
    When lượt xịt thành công làm `estimated_remaining_ml` tụt xuống dưới `calibrated_dosage_ml`,  
    Then slot chuyển `UNAVAILABLE` ngay trong cùng luồng cập nhật tồn kho (FR-INV-10, FR-INV-12).
  * **AC2 (Hợp đồng kết thúc):** Given slot `S` đang `AVAILABLE`,  
    When hợp đồng chuyển sang `TERMINATED` hoặc `CLOSED`,  
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

<!-- Chép FR từ docs/ mục A5, bổ sung Acceptance criteria theo mẫu:

## FR-MCH-01 — <tên ngắn>

**Statement:** ...
**Traces:** BR-xxx · **Priority:** M

**Acceptance criteria**
- AC1: Given ..., When ..., Then ...
- AC2: Given ..., When ..., Then ... (ca biên)

**Test:** `test_FR_MCH_01_<mo_ta>`

-->
