# FR-BND — Thương hiệu và cô lập dữ liệu

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A2 · 10 FR
> Trạng thái AC: **một phần** — FR-BND-05, 08 (cô lập dữ liệu) và FR-BND-09, 10 (pháp nhân & tài khoản chi trả, ADR-0013) đã hoàn thành; FR-BND-01..04, 06, 07 dạng CRUD
> Phụ trách: TV3 (hồ sơ thương hiệu) · TV1 (cô lập dữ liệu)
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md` §"Quy tắc cô lập dữ liệu", `spec/modules/AUTH.md` FR-AUTH-07/08,
`spec/decisions/0003-to-chuc-ma-nguon.md` QT4,
`spec/decisions/0013-brand-tu-dang-ky-hop-dong-hai-lop-va-chi-tra-doanh-thu.md`

---

## FR-BND-05 — Tự động lọc truy vấn theo hóa đơn thuê slot
* **Statement:** Hệ thống phải tự động lọc mọi truy vấn dữ liệu của người dùng thuộc thương hiệu theo tập hóa đơn thuê slot của thương hiệu đó.
* **Traces:** BR-003, BR-012 · **Priority:** M
* **Cơ chế:** chốt chặn duy nhất ở `apps/api/src/shared/scoping` (QT4, ADR-0003). Controller lấy phạm vi bằng `@CurrentBrandScope()`, truyền xuống query, dựng điều kiện bằng các hàm `brandScoped*`.
* **Acceptance criteria:**
  * **AC1 (Một chốt chặn):** Given bất kỳ truy vấn nào trả dữ liệu thuộc thương hiệu,  
    When rà soát mã nguồn,  
    Then điều kiện lọc lấy từ `brandScopedOrders`, `brandScopedByColumn`, `brandScopedBySlotAndTime` hoặc `brandOccupiesSlotNow` — không có `where brand_id = ...` viết tay.
  * **AC2 (Không lọc qua máy):** Given mọi điều kiện do chốt chặn sinh ra,  
    When kiểm nội dung,  
    Then không điều kiện nào tham chiếu bảng `machines` — `machines` không có `brand_id`.
  * **AC3 (Đơn hàng lọc cả chủ sở hữu doanh thu):** Given truy vấn trên `orders` của người dùng thuộc thương hiệu,  
    When dựng điều kiện,  
    Then điều kiện gồm cả `brand_id` và `revenue_owner = 'BRAND'` — đơn phát sinh sau thanh lý không lọt ra (FR-EXP-20, FR-REV-06).
  * **AC4 (Bảng không có brand_id):** Given truy vấn trên bảng gắn slot/máy như `sensor_readings`, `device_events`,  
    When dựng điều kiện,  
    Then điều kiện nối qua `slot_rentals` VÀ so mốc thời gian của bản ghi với kỳ hạn hóa đơn — cùng một slot phục vụ nhiều thương hiệu ở các kỳ khác nhau.
  * **AC5 (Tài khoản nền tảng):** Given người dùng không gắn thương hiệu,  
    When dựng điều kiện,  
    Then điều kiện luôn đúng — Platform Super Admin xem được mọi thương hiệu (FR-BND-07).
* **Test:** `tests/unit/scoping.test.ts` kiểm logic của chốt chặn. Nghiệm thu đầu-cuối trên CSDL thật với hai thương hiệu cùng một máy là `tests/integration/test_slot_isolation.test.ts` — nhóm test trọng yếu (`spec/testing.md`).

> **Nợ kỹ thuật:** Row-Level Security chưa bật (`schema.sql` §12, ADR-0002). Chốt chặn này là lớp
> bảo vệ **duy nhất** cho FR này — một truy vấn bỏ qua nó là rò rỉ, không có lưới đỡ ở CSDL.

---

## FR-BND-08 — Không tiết lộ thông tin thương hiệu khác
* **Statement:** Hệ thống phải không tiết lộ cho người dùng thuộc một thương hiệu bất kỳ thông tin nào về thương hiệu khác, bao gồm tên, sản phẩm và sự tồn tại của hóa đơn thuê trên cùng máy.
* **Traces:** BR-012 · **Priority:** M
* **Cơ chế:** `notFoundFor(principal)` ở `apps/api/src/shared/errors` — mọi chỗ tra tài nguyên theo id mà không thấy đều gọi hàm này, không tự chọn 403 hay 404.
* **Acceptance criteria:**
  * **AC1 (Không lộ sự tồn tại):** Given người dùng thuộc thương hiệu `B1` tra một id,  
    When id đó là tài nguyên của `B2` **hoặc** không tồn tại,  
    Then hai trường hợp trả **cùng** HTTP 403 `FORBIDDEN_SCOPE` — không suy ra được tài nguyên của thương hiệu khác có tồn tại hay không (FR-AUTH-08 AC2).
  * **AC2 (Tài khoản nền tảng):** Given Platform Super Admin tra một id không tồn tại,  
    When không thấy,  
    Then hệ thống trả HTTP 404 `NOT_FOUND` — người quản trị không cần bị che thông tin.
  * **AC3 (Sơ đồ máy):** Given máy có slot của `B1` và `B2`,  
    When Brand Admin của `B1` xem sơ đồ máy,  
    Then slot của `B2` hiển thị là không khả dụng, không kèm tên thương hiệu, sản phẩm hay số liệu (FR-RPT-12) — điều kiện dựng bằng `brandOccupiesSlotNow`.
* **Test:** như FR-BND-05 — nghiệm thu bằng `tests/integration/test_slot_isolation.test.ts` (nhóm test trọng yếu).

---

## FR-BND-09 — Khai báo thông tin pháp nhân và tài khoản nhận doanh thu
* **Statement:** Hệ thống phải cho phép Brand Admin khai báo mã số thuế, giấy phép kinh doanh và tài khoản doanh nghiệp nhận doanh thu của thương hiệu mình; tài khoản nhận doanh thu được lưu mã hóa (ADR-0013).
* **Traces:** BR-009 · **Priority:** M · ADR-0013 mục 1
* **API:** `PUT /brands/{id}/legal-profile`
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B`,  
    When cập nhật thông tin pháp nhân gồm mã số thuế (`tax_code`), đường dẫn/tài liệu giấy phép kinh doanh (`business_license_url`) và tài khoản doanh nghiệp (`payout_account`),  
    Then hệ thống lưu thành công, trong đó số tài khoản ngân hàng và tên ngân hàng nhận tiền phải được mã hóa trước khi ghi vào CSDL (`payout_account_ciphertext`).
  * **AC2 (Phân quyền):** Given Brand Admin của thương hiệu `B1`,  
    When cố gắng cập nhật pháp nhân của thương hiệu `B2`,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_BND_09_declare_legal_and_payout_profile`

---

## FR-BND-10 — Xác minh pháp nhân thương hiệu
* **Statement:** Hệ thống phải cho phép Platform Super Admin ghi nhận đã xác minh pháp nhân của thương hiệu, kèm người và thời điểm xác minh (ADR-0013).
* **Traces:** BR-008, BR-009 · **Priority:** M · ADR-0013 mục 1
* **API:** `POST /brands/{id}/verify-legal`
* **Acceptance criteria:**
  * **AC1:** Given Platform Super Admin đối soát hợp lệ thông tin pháp nhân của thương hiệu `B`,  
    When gửi `POST /brands/{id}/verify-legal`,  
    Then hệ thống ghi nhận `legal_verified_at = CURRENT_TIMESTAMP`, `legal_verified_by = current_user_id`, cho phép thương hiệu đủ điều kiện nhận chi trả doanh thu (`BrandPayout`).
  * **AC2 (Phân quyền):** Given người dùng không có vai trò Platform Super Admin gọi xác minh,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_BND_10_super_admin_verify_brand_legal`

---

## Hồ sơ thương hiệu — FR-BND-01..04, 06, 07 (CRUD)

Các FR dạng CRUD cơ bản: xem, tạo, cập nhật thông tin thương hiệu và đổi trạng thái ACTIVE/SUSPENDED tuân theo phân quyền quản trị của Super Admin và Brand Admin tương ứng.
