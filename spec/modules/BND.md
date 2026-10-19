# FR-BND — Thương hiệu và cô lập dữ liệu

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A2 · 10 FR
> Trạng thái AC: **một phần** — FR-BND-05, FR-BND-08 (cô lập dữ liệu), FR-BND-09, FR-BND-10 (khai báo và xác minh pháp nhân) đã viết AC; FR-BND-01..04, 06, 07 (hồ sơ thương hiệu) chưa viết
> Phụ trách: TV3 (hồ sơ thương hiệu, pháp nhân) · TV1 (cô lập dữ liệu)
> Cập nhật: 2026-10-17 (bổ sung FR-BND-09, 10 theo ADR-0013)

Đọc kèm: `spec/glossary.md` §"Quy tắc cô lập dữ liệu", `spec/modules/AUTH.md` FR-AUTH-07/08,
`spec/decisions/0003-to-chuc-ma-nguon.md` QT4

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

## Hồ sơ thương hiệu — FR-BND-01..04, 06, 07 (chưa viết)

Chưa viết. Không thuộc task Auth · RBAC · cô lập dữ liệu mức slot. Nội dung FR ở
`docs/FR_NFR_SCENTSTATION.md` mục A2; viết theo đúng định dạng của FR-BND-05 ở trên.

---

## FR-BND-09 — Khai báo thông tin pháp nhân thương hiệu
* **Statement:** Hệ thống phải cho phép Brand Admin khai báo mã số thuế, giấy phép kinh doanh và tài khoản doanh nghiệp nhận doanh thu của thương hiệu mình; tài khoản nhận doanh thu được lưu mã hóa (ADR-0013).
* **Traces:** BR-009, ADR-0013 · **Priority:** M
* **API:** `PUT /brands/me/legal-profile`
* **Acceptance criteria:**
  * **AC1:** Given Brand Admin của thương hiệu `B`,  
    When cập nhật thông tin pháp nhân gồm mã số thuế, số giấy phép kinh doanh và tài khoản ngân hàng doanh nghiệp nhận doanh thu,  
    Then hệ thống lưu thông tin, mã hóa tài khoản nhận tiền (`payout_account`), ghi nhận thời điểm cập nhật và xóa trạng thái xác minh trước đó (`legal_verified_at = null`).
  * **AC2 (Mã hóa tài khoản):** Given tài khoản ngân hàng nhận tiền của thương hiệu,  
    When lưu vào CSDL,  
    Then trường `payout_account` được mã hóa đối xứng AES-256-GCM ở tầng ứng dụng, không lưu bản rõ trong CSDL hay log.
  * **AC3 (Phân quyền):** Given người dùng không phải Brand Admin của thương hiệu hoặc tài khoản nền tảng,  
    When gọi cập nhật hồ sơ pháp nhân của thương hiệu khác,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `tests/unit/bnd.test.ts` — các test `test_FR_BND_09_*`

---

## FR-BND-10 — Xác minh pháp nhân thương hiệu
* **Statement:** Hệ thống phải cho phép Platform Super Admin ghi nhận đã xác minh pháp nhân của thương hiệu, kèm người và thời điểm xác minh (ADR-0013).
* **Traces:** BR-008, BR-009, ADR-0013 · **Priority:** M
* **API:** `POST /brands/{id}/verify-legal`
* **Acceptance criteria:**
  * **AC1:** Given thương hiệu `B` đã khai báo thông tin pháp nhân,  
    When Platform Super Admin xác nhận thông tin hợp lệ,  
    Then hệ thống cập nhật `legal_verified_at = now()`, `legal_verified_by = admin.id` và ghi AuditLog `bnd.legal.verified`.
  * **AC2 (Điều kiện chi trả doanh thu):** Given kỳ chi trả của thương hiệu ở trạng thái `CONFIRMED`,  
    When thương hiệu chưa được xác minh pháp nhân (`legal_verified_at` NULL),  
    Then hệ thống từ chối chuyển kỳ chi trả sang `PAID` với mã lỗi `BRAND_NOT_VERIFIED` (ADR-0013 §3).
  * **AC3 (Phân quyền):** Given tài khoản không có quyền Platform Super Admin,  
    When gọi xác minh pháp nhân cho thương hiệu,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
* **Test:** `tests/unit/bnd.test.ts` — các test `test_FR_BND_10_*`

