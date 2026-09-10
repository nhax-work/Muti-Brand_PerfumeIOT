# FR-SLT — Hợp đồng thuê slot

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A6 · 18 FR
> Trạng thái AC: **mẫu — hoàn thiện trong tuần 1**
> Phụ trách: TV3

Đọc kèm: `spec/glossary.md` (state machine SlotRental), `spec/errors.md`, `spec/constraints.md`

---

## FR-SLT-02 — Một hợp đồng hiệu lực trên mỗi slot

**Statement:** Hệ thống phải bảo đảm mỗi slot chỉ có tối đa một hợp đồng ở trạng thái ACTIVE,
EXPIRING, GRACE hoặc LIQUIDATED tại một thời điểm.
**Traces:** BR-009 · **Priority:** M

**Acceptance criteria**
- AC1: Given slot S có hợp đồng ACTIVE,
  When tạo hợp đồng mới trên S,
  Then từ chối với `SLOT_OCCUPIED`.
- AC2: Given slot S có hợp đồng **LIQUIDATED** (đang bán hàng thanh lý),
  When tạo hợp đồng mới trên S,
  Then từ chối với `SLOT_OCCUPIED`.
- AC3: Given slot S có hợp đồng CLOSED,
  When tạo hợp đồng mới trên S,
  Then chấp nhận.
- AC4: Given hai yêu cầu tạo hợp đồng trên cùng slot S đến **đồng thời**,
  Then đúng một yêu cầu thành công, yêu cầu còn lại nhận `SLOT_OCCUPIED`.

**Ràng buộc CSDL bắt buộc**
```sql
CREATE UNIQUE INDEX uq_slot_active_rental
  ON slot_rental (slot_id)
  WHERE status IN ('ACTIVE','EXPIRING','GRACE','LIQUIDATED');
```
AC4 phải được bảo đảm bằng index này, **không** bằng kiểm tra ở tầng ứng dụng.

**Test:** `test_FR_SLT_02_reject_occupied_slot`

---

## FR-SLT-05 — Chống chồng lấn kỳ hạn

**Statement:** Hệ thống phải từ chối tạo hợp đồng có kỳ hạn chồng lấn với hợp đồng đang tồn tại
trên cùng slot.
**Traces:** BR-009 · **Priority:** M

**Acceptance criteria**
- AC1: Given slot S có hợp đồng ACTIVE 01/01–31/03,
  When tạo hợp đồng mới trên S 01/02–30/04,
  Then từ chối với `RENTAL_OVERLAP`.
- AC2: Given slot S có hợp đồng ACTIVE 01/01–31/03,
  When tạo hợp đồng mới trên S từ 01/04,
  Then chấp nhận.
- AC3: Given slot S có hợp đồng ACTIVE 01/01–31/03,
  When tạo hợp đồng mới trên S bắt đầu **đúng 31/03**,
  Then từ chối với `RENTAL_OVERLAP` (biên đóng hai đầu).
- AC4: Given slot S có hợp đồng TERMINATED 01/01–31/03,
  When tạo hợp đồng mới trên S từ 01/02,
  Then chấp nhận.

**Test:** `test_FR_SLT_05_reject_overlapping_rental`

---

## FR-SLT-08 — Thương hiệu tự do đặt giá

**Statement:** Hệ thống phải cho phép Brand Admin tự do đặt giá mỗi lượt xịt cho slot mình thuê,
không bị giới hạn bởi giá sàn hay giá trần.
**Traces:** BR-009, BR-011 · **Priority:** M

**Acceptance criteria**
- AC1: Given Brand Admin của thương hiệu B, slot S có hợp đồng ACTIVE của B,
  When đặt giá bất kỳ > 0 cho S,
  Then chấp nhận và ghi `AuditLog`.
- AC2: Given Brand Admin của thương hiệu B, slot S thuộc thương hiệu khác,
  When đặt giá cho S,
  Then từ chối với `FORBIDDEN_SCOPE`.
- AC3: When đặt giá ≤ 0,
  Then từ chối với `INVALID_RENTAL_PERIOD`… *(cần mã lỗi mới — bổ sung vào errors.md)*

**Test:** `test_FR_SLT_08_free_pricing`

---

## Các FR còn lại

FR-SLT-01, 03, 04, 06, 07, 09–18 — chép từ `docs/`, bổ sung AC theo mẫu trên.

Mức chi tiết AC theo loại:

| Loại FR | Số AC |
|---|---|
| CRUD đơn giản | 1 AC hoặc để dạng phát biểu |
| Có điều kiện, có ngưỡng | 2–3 AC |
| Chuyển trạng thái, tiền bạc, quyền truy cập | 3–5 AC, **bắt buộc có ca biên** |
