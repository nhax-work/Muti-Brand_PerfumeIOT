# FR-REV — Phân tách doanh thu

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A8 · 7 FR  
> Trạng thái AC: **hoàn thành**  
> Phụ trách: TV1 / Tài  

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`

---

## FR-REV-01 — Gán chủ sở hữu doanh thu tại thời điểm tạo đơn
* **Statement:** Hệ thống phải gán cho mỗi đơn hàng một giá trị chủ sở hữu doanh thu là BRAND hoặc PLATFORM tại thời điểm tạo đơn.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given khách hàng tạo đơn hàng `O` trên slot `S`,  
    When bản ghi `Order` được chèn vào CSDL,  
    Then cột `revenue_owner` phải có giá trị là `'BRAND'` hoặc `'PLATFORM'` (NOT NULL).
  * **AC2 (Ràng buộc CSDL):** Given yêu cầu lưu đơn hàng mà giá trị `revenue_owner` bị NULL,  
    When thực hiện INSERT,  
    Then CSDL từ chối do vi phạm ràng buộc NOT NULL.
* **Test:** `test_FR_REV_01_revenue_owner_snapshot`

---

## FR-REV-02 — Quy tắc xác định chủ sở hữu doanh thu
* **Statement:** Hệ thống phải xác định chủ sở hữu doanh thu là PLATFORM khi slot đang bán hàng đã thanh lý, và là BRAND trong các trường hợp còn lại.
* **Traces:** BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given slot `S` có hợp đồng ở trạng thái `LIQUIDATED` (hàng thanh lý),  
    When đơn hàng `O` được tạo trên slot `S`,  
    Then `Order.revenue_owner` được gán chính xác là `'PLATFORM'`.
  * **AC2:** Given slot `S` có hợp đồng ở trạng thái `ACTIVE`, `EXPIRING` hoặc `GRACE`,  
    When đơn hàng `O` được tạo trên slot `S`,  
    Then `Order.revenue_owner` được gán chính xác là `'BRAND'`.
* **Test:** `test_FR_REV_02_determine_revenue_owner_rules`

---

## FR-REV-03 — Tính bất biến của chủ sở hữu doanh thu
* **Statement:** Hệ thống phải giữ nguyên chủ sở hữu doanh thu của đơn hàng đã tạo, kể cả khi quyền sở hữu hàng tồn thay đổi sau đó.
* **Traces:** BR-008, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn hàng `O` được tạo lúc 09:00 với `revenue_owner = 'BRAND'`, đến 10:00 hợp đồng của slot chuyển sang `LIQUIDATED`,  
    When truy vấn lại đơn hàng `O` vào bất kỳ thời điểm nào sau đó,  
    Then giá trị `O.revenue_owner` vẫn bất biến là `'BRAND'`.
  * **AC2 (Bảo vệ dữ liệu):** Given có lệnh UPDATE cố tình thay đổi giá trị cột `revenue_owner` của đơn hàng đã tồn tại,  
    When thực thi,  
    Then tầng ứng dụng và trigger CSDL từ chối cập nhật.
* **Test:** `test_FR_REV_03_revenue_owner_immutable`

---

## FR-REV-04 — Báo cáo doanh thu tách theo hai nguồn
* **Statement:** Hệ thống phải cho phép Platform Super Admin xem doanh thu tách theo hai nguồn: doanh thu thuộc thương hiệu và doanh thu thuộc nền tảng.
* **Traces:** BR-009, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Platform Super Admin xem dashboard doanh thu trong khoảng thời gian `T`,  
    When tải báo cáo tổng hợp,  
    Then hệ thống hiển thị rõ ràng hai chỉ số phân tách: Tổng doanh thu BRAND và Tổng doanh thu PLATFORM.
  * **AC2:** Given Platform Super Admin lọc theo máy `M` hoặc địa điểm `L`,  
    When dữ liệu trả về,  
    Then các số liệu vẫn được chia rẽ nhánh rõ ràng theo hai nguồn `BRAND` và `PLATFORM`.
* **Test:** `test_FR_REV_04_split_revenue_dashboard`

---

## FR-REV-05 — Chỉ tính doanh thu BRAND vào quyết toán thương hiệu
* **Statement:** Hệ thống phải chỉ tính vào bảng quyết toán của thương hiệu các đơn hàng có chủ sở hữu doanh thu là BRAND.
* **Traces:** BR-009 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given trong kỳ quyết toán `K`, slot `S` của thương hiệu `B` phát sinh: 10 đơn hàng có `revenue_owner = 'BRAND'` tổng 500,000 VND và 4 đơn hàng thanh lý có `revenue_owner = 'PLATFORM'` tổng 200,000 VND,  
    When hệ thống tạo bảng quyết toán cho thương hiệu `B`,  
    Then tổng doanh thu lượt xịt ghi nhận cho `B` chỉ là `500,000 VND`.
  * **AC2 (Mệnh đề truy vấn):** Given câu truy vấn tính toán doanh thu quyết toán thương hiệu,  
    When câu lệnh SQL thực thi,  
    Then bắt buộc chứa điều kiện:
    ```sql
    WHERE revenue_owner = 'BRAND' AND brand_id = :current_brand_id
    ```
* **Test:** `test_FR_REV_05_settlement_only_includes_brand_revenue`

---

## FR-REV-06 — Không hiển thị đơn hàng PLATFORM cho Brand Admin
* **Statement:** Hệ thống phải không hiển thị cho Brand Admin các đơn hàng có chủ sở hữu doanh thu là PLATFORM.
* **Traces:** BR-012, BR-013 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B` truy vấn danh sách đơn hàng hoặc báo cáo kinh doanh,  
    When API xử lý request,  
    Then hệ thống tự động lọc dữ liệu và chỉ trả về các bản ghi có `revenue_owner = 'BRAND'`, tuyệt đối không để lộ bất kỳ đơn hàng nào có `revenue_owner = 'PLATFORM'`.
  * **AC2:** Given Brand Admin cố tình truyền tham số truy vấn `revenue_owner=PLATFORM`,  
    When API thực thi,  
    Then hệ thống trả về danh sách rỗng hoặc HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_REV_06_hide_platform_revenue_from_brand_admin`

---

## FR-REV-07 — Báo cáo doanh thu hàng thanh lý
* **Statement:** Hệ thống phải cho phép Platform Super Admin xem báo cáo doanh thu hàng thanh lý theo slot, máy và khoảng thời gian.
* **Traces:** BR-013 · **Priority:** S
* **Acceptance criteria:**
  * **AC1:** Given Platform Super Admin lọc báo cáo doanh thu thanh lý theo máy `M` từ ngày `D1` đến `D2`,  
    When xuất báo cáo,  
    Then hệ thống trả về danh sách các đơn hàng có `revenue_owner = 'PLATFORM'` trên máy `M` kèm tổng số tiền, số lượt xịt và tên sản phẩm thanh lý.
  * **AC2:** Given Brand Admin cố gắng truy cập endpoint báo cáo doanh thu thanh lý,  
    When gửi request,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_REV_07_liquidation_revenue_report`
