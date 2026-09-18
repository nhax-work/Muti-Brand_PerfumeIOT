# FR-BND — Thương hiệu và cô lập dữ liệu

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A2 · 8 FR
> Trạng thái AC: **một phần** — FR-BND-05 và FR-BND-08 (cô lập dữ liệu) đã viết và hiện thực ở
> `apps/api/src/shared/scoping`; FR-BND-01..04, 06, 07 (hồ sơ thương hiệu) chưa viết
> Phụ trách: TV3 (hồ sơ thương hiệu) · TV1 (cô lập dữ liệu)
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md` §"Quy tắc cô lập dữ liệu", `spec/modules/AUTH.md` FR-AUTH-07/08,
`spec/decisions/0003-to-chuc-ma-nguon.md` QT4

---

## FR-BND-05 — Tự động lọc truy vấn theo hợp đồng thuê slot
* **Statement:** Hệ thống phải tự động lọc mọi truy vấn dữ liệu của người dùng thuộc thương hiệu theo tập hợp đồng thuê slot của thương hiệu đó.
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
    Then điều kiện nối qua `slot_rentals` VÀ so mốc thời gian của bản ghi với kỳ hạn hợp đồng — cùng một slot phục vụ nhiều thương hiệu ở các kỳ khác nhau.
  * **AC5 (Tài khoản nền tảng):** Given người dùng không gắn thương hiệu,  
    When dựng điều kiện,  
    Then điều kiện luôn đúng — Platform Super Admin xem được mọi thương hiệu (FR-BND-07).
* **Test:** `tests/unit/scoping.test.ts` kiểm logic của chốt chặn. Nghiệm thu đầu-cuối trên CSDL thật với hai thương hiệu cùng một máy là `tests/integration/test_slot_isolation.ts` — **test người tự viết** (`spec/testing.md`).

> **Nợ kỹ thuật:** Row-Level Security chưa bật (`schema.sql` §12, ADR-0002). Chốt chặn này là lớp
> bảo vệ **duy nhất** cho FR này — một truy vấn bỏ qua nó là rò rỉ, không có lưới đỡ ở CSDL.

---

## FR-BND-08 — Không tiết lộ thông tin thương hiệu khác
* **Statement:** Hệ thống phải không tiết lộ cho người dùng thuộc một thương hiệu bất kỳ thông tin nào về thương hiệu khác, bao gồm tên, sản phẩm và sự tồn tại của hợp đồng thuê trên cùng máy.
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
* **Test:** như FR-BND-05 — nghiệm thu bằng `tests/integration/test_slot_isolation.ts` (test người tự viết).

---

## Hồ sơ thương hiệu — FR-BND-01..04, 06, 07 (chưa viết)

Chưa viết. Không thuộc task Auth · RBAC · cô lập dữ liệu mức slot. Nội dung FR ở
`docs/FR_NFR_SCENTSTATION.md` mục A2; viết theo đúng định dạng của FR-BND-05 ở trên.
