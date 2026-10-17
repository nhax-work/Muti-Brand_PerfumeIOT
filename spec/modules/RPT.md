# FR-RPT — Dashboard và báo cáo

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A16 · 15 FR  
> Trạng thái AC: **một phần** — FR-RPT-04 soát lại và có AC theo ADR-0015; các FR khác dạng CRUD/báo cáo tổng hợp  
> Phụ trách: TV4 / Tài  
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu  

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`,
`spec/decisions/0015-dung-ban-an-toan-va-bao-ve-khach-tai-may.md`

---

## FR-RPT-04 — Báo cáo tỷ lệ xịt thành công, thất bại và bỏ lượt
* **Statement:** Hệ thống phải hiển thị tỷ lệ lượt xịt thành công, thất bại và khách bỏ lượt (FORFEITED), tổng và theo từng máy, trong đó khách bỏ lượt không tính là thất bại (ADR-0015).
* **Traces:** BR-002, BR-007 · **Priority:** M · ADR-0015 mục 4
* **API:** `GET /reports/dispense-outcomes`
* **Acceptance criteria:**
  * **AC1 (Tách bạch tỷ lệ):** Given báo cáo lượt xịt của máy `M` trong khoảng thời gian có 100 đơn hàng đã thanh toán: 85 đơn `DISPENSED` (thành công), 10 đơn `FORFEITED` (khách không bấm nút trong thời gian chờ), 5 đơn `FAILED` (thiết bị báo lỗi hoặc timeout),  
    When Platform Super Admin hoặc Operations Staff xem báo cáo,  
    Then hệ thống tính và hiển thị:
    - Tỷ lệ thành công = 85%
    - Tỷ lệ khách bỏ lượt (`FORFEITED`) = 10%
    - Tỷ lệ thất bại kỹ thuật = 5%
    Tuyệt đối **không gộp** 10 đơn `FORFEITED` vào tỷ lệ thất bại kỹ thuật của máy.
  * **AC2 (Theo từng máy và tổng thể):** Báo cáo cho phép xem chỉ số tổng hợp trên toàn hệ thống và phân rã chi tiết theo từng máy `machine_id`.
  * **AC3 (Phân quyền):** Given người dùng là Brand Admin truy cập báo cáo này,  
    Then hệ thống chỉ trả về số liệu lượt xịt liên quan đến các slot mà thương hiệu đang thuê, không tiết lộ số liệu toàn máy của thương hiệu khác (FR-RPT-10, FR-RPT-11).
* **Test:** `test_FR_RPT_04_dispense_outcome_rates_report`

---

## Các FR Báo cáo khác — FR-RPT-01..03, 05..15 (Dashboard / Thống kê)

Các báo cáo thống kê, dashboard trạng thái kết nối, doanh thu theo thời gian, tồn kho và xuất file CSV tuân theo các quy tắc lọc dữ liệu cô lập thương hiệu ở FR-RPT-10, FR-RPT-11, FR-BND-05 và phân quyền Platform Super Admin ở FR-RPT-15.
