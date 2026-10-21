# FR-DSP — Điều khiển lượt xịt an toàn

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A12 · 27 FR  
> Trạng thái AC: **một phần** — FR-DSP-18÷27 đã có AC (FR-DSP-18÷20 viết 2026-10-21); FR-DSP-01÷17 **chưa viết**.  
> Lưu ý: FR-DSP-06, 08, 11÷15, 18 đã đổi phát biểu theo ADR-0007 — viết AC theo phát biểu mới trong `docs/`.
> Phụ trách: TV1
> Mức chi tiết: **bắt buộc viết AC đầy đủ**

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`
Mẫu định dạng AC: xem `spec/modules/SLT.md`

---

<!-- Chép FR từ docs/ mục A12, bổ sung Acceptance criteria theo mẫu:

## FR-DSP-01 — <tên ngắn>

**Statement:** ...
**Traces:** BR-xxx · **Priority:** M

**Acceptance criteria**
- AC1: Given ..., When ..., Then ...
- AC2: Given ..., When ..., Then ... (ca biên)

**Test:** `test_FR_DSP_01_<mo_ta>`

-->

---

## FR-DSP-18 — Lệnh không có hồi âm thành UNKNOWN
* **Statement:** Hệ thống phải chuyển lệnh xịt sang trạng thái UNKNOWN khi không nhận được xác nhận hoặc từ chối trong `DISPENSE_RESULT_TIMEOUT_SEC` kể từ lúc gửi, hoặc không nhận được kết quả hoặc từ chối trong `DISPENSE_PRESS_WINDOW_SEC` cộng `DISPENSE_RESULT_TIMEOUT_SEC` kể từ lúc xác nhận.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1 (Gửi mà không ACK):** Given lệnh ở `SENT` và quá `DISPENSE_RESULT_TIMEOUT_SEC` kể từ `sent_at` chưa có `ACK` hay `REJECT`,  
    When nhịp quét DSP chạy,  
    Then lệnh chuyển `UNKNOWN`; đơn của lệnh `CUSTOMER` giữ `DISPENSE_REQUESTED` và được gắn `needs_manual_review` (vào `GET /orders/manual-review`).
  * **AC2 (ACK mà không có kết quả):** Given lệnh ở `ACKNOWLEDGED` và quá `DISPENSE_PRESS_WINDOW_SEC` + `DISPENSE_RESULT_TIMEOUT_SEC` kể từ `acknowledged_at`,  
    When nhịp quét chạy,  
    Then lệnh chuyển `UNKNOWN` như AC1. Trước mốc đó lệnh vẫn `ACKNOWLEDGED` (khách còn trong thời gian bấm).
  * **AC3 (Chưa gửi mà quá TTL):** Given lệnh ở `CREATED` đã qua `expires_at` (`DISPENSE_CMD_TTL_SEC`),  
    When nhịp quét chạy,  
    Then lệnh chuyển `EXPIRED`, không bao giờ được publish; đơn `FAILED` với `CMD_EXPIRED` và gắn `needs_manual_review` (FR-DSP-06).
  * **AC4 (Kết quả về muộn):** Given lệnh đã `UNKNOWN`,  
    When thiết bị gửi kết quả thành công, hoặc `REJECT PRESS_TIMEOUT`,  
    Then lệnh được khép theo kết quả đó: thành công → đơn `DISPENSED`; `PRESS_TIMEOUT` → đơn `FORFEITED` và gỡ cờ kiểm tra thủ công. Lệnh không bị đếm hai lần vào chuỗi lỗi liên tiếp (FR-ALR-04).
  * **AC5 (Bù sau downtime):** Given dịch vụ tắt qua các mốc trên,  
    When bật lại,  
    Then lần quét đầu tiên xử lý mọi lệnh đã quá mốc — quét theo mốc thời gian trong CSDL, không theo việc job có chạy đúng giờ.
* **Test:** `test_FR_DSP_18_sent_without_ack_becomes_unknown`, `test_FR_DSP_18_acknowledged_without_result_becomes_unknown_after_press_window`, `test_FR_DSP_06_unsent_command_past_ttl_expires`, `test_FR_DSP_17_late_success_after_unknown_closes_order`, `test_FR_DSP_24_late_press_timeout_after_unknown_forfeits_and_clears_review`

---

## FR-DSP-19 — Không tự tạo lệnh mới sau UNKNOWN
* **Statement:** Hệ thống phải không tự động tạo lệnh xịt mới cho đơn hàng có lệnh ở trạng thái UNKNOWN.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đơn có lệnh `CUSTOMER` ở `UNKNOWN`,  
    When nhịp điều phối DSP chạy bất kỳ số lần nào,  
    Then không có lệnh mới nào được tạo cho đơn đó (đơn đã rời `PAID`); việc xử lý đi qua kiểm tra thủ công hoặc phiếu khiếu nại (ADR-0012).
  * **AC2:** Given máy có lệnh `UNKNOWN` của đơn khác,  
    When có đơn `PAID` mới chờ lượt trên cùng máy,  
    Then lệnh `UNKNOWN` không còn tính là lệnh `CUSTOMER` hiệu lực (`uq_machine_active_customer_command`), nên đơn mới vẫn được ghi lệnh.
* **Test:** `test_FR_DSP_19_unknown_command_never_triggers_new_command`

---

## FR-DSP-20 — Ghi nhận riêng lượt xịt chẩn đoán
* **Statement:** Hệ thống phải ghi nhận riêng các lượt xịt chẩn đoán, không tính vào doanh thu và không tính vào thống kê lượt xịt khách hàng.
* **Traces:** BR-005, BR-008 · **Priority:** M
* **API:** `POST /machines/{id}/diagnostic-dispense`, `GET /dispense-commands`, `GET /orders/{id}/dispense-command`
* **Acceptance criteria:**
  * **AC1 (Ghi riêng):** Given Operations Staff tạo lượt xịt chẩn đoán trên slot `S` (FR-MNT-09),  
    When lệnh được ghi,  
    Then `dispense_commands` có một hàng `command_type = 'DIAGNOSTIC'`, `order_id` NULL; không có hàng `orders` hay `payments` nào được tạo.
  * **AC2 (Không vào doanh thu):** Given đã có lượt chẩn đoán thành công,  
    When tính `GET /revenue/split`, kỳ chi trả (FR-SLT-52) hay `GET /settlements`,  
    Then số đơn và số tiền không đổi so với trước lượt chẩn đoán.
  * **AC3 (Không vào thống kê lượt xịt khách):** Given báo cáo lượt xịt khách hàng (RPT),  
    When có lượt chẩn đoán trong kỳ,  
    Then lượt đó không được đếm; chuỗi lỗi liên tiếp (FR-ALR-04) cũng chỉ đếm lệnh `CUSTOMER`.
  * **AC4 (Tra cứu):** Given danh sách lệnh xịt,  
    When gọi `GET /dispense-commands?commandType=DIAGNOSTIC`,  
    Then chỉ trả lệnh chẩn đoán, phân trang; Brand Admin chỉ thấy lệnh có `brand_id` của mình (lệnh chẩn đoán trên slot không có hóa đơn có `brand_id` NULL nên không hiện với thương hiệu nào).
  * **AC5 (Lệnh của một đơn):** Given đơn `O` của thương hiệu `A`,  
    When gọi `GET /orders/{id}/dispense-command`,  
    Then trả lệnh `CUSTOMER` gần nhất của đơn kèm kết quả; đơn chưa có lệnh → `NOT_FOUND`; Brand Admin của `B` → `FORBIDDEN_SCOPE`.
* **Test:** `test_FR_DSP_20_diagnostic_not_counted_as_order`, `test_FR_DSP_20_list_filters_by_command_type`, `test_FR_DSP_20_order_dispense_command_scoped`

---

> **FR-DSP-21 ÷ FR-DSP-27 — Nút bấm vật lý.** Thêm ngày 2026-09-29 theo
> `spec/decisions/0007-nut-bam-vat-ly-kich-hoat-luot-xit.md` (TV1 đã duyệt). Chủ ngữ "Thiết bị phải"
> là ràng buộc giao diện với firmware (Phần D của `docs/FR_NFR_SCENTSTATION.md`).

## FR-DSP-21 — Sáng đèn nút thay vì xịt ngay
* **Statement:** Thiết bị phải sáng đèn nút của đúng slot đích, thay vì kích hoạt cơ cấu ngay, khi nhận một lệnh xịt khách hàng hợp lệ.
* **Traces:** BR-001, BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given lệnh `CUSTOMER` cho slot 2 qua đủ 7 bước kiểm tra (`mqtt.md` §5.1),  
    When thiết bị xử lý lệnh,  
    Then đèn nút slot 2 sáng, **không** kích hoạt cơ cấu, và thiết bị gửi `stage = ACK` (FR-DSP-11) — lệnh chuyển `ACKNOWLEDGED`.
  * **AC2:** Given lệnh bị từ chối ở một trong 7 bước,  
    When thiết bị xử lý,  
    Then không đèn nào sáng và thiết bị gửi `stage = REJECT` kèm mã lỗi.
* **Test:** `test_FR_DSP_21_arm_button_instead_of_dispensing`

---

## FR-DSP-22 — Chỉ xịt khi bấm đúng nút trong thời gian chờ
* **Statement:** Thiết bị phải chỉ kích hoạt cơ cấu khi khách bấm nút của slot đích trong `DISPENSE_PRESS_WINDOW_SEC` kể từ lúc sáng đèn, và bỏ qua mọi lần bấm nút của slot khác.
* **Traces:** BR-002, BR-010 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đèn nút slot 2 sáng lúc `t`,  
    When khách bấm nút slot 2 lúc `t + 10s`,  
    Then thiết bị kích hoạt cơ cấu slot 2 đúng một chu kỳ, tắt đèn, và gửi `RESULT` kèm `pressed_at`; thời gian từ lúc bấm tới lúc kích hoạt không vượt `PRESS_TO_ACTUATION_MAX_MS` (NFR-PER-07).
  * **AC2 (Bấm nhầm nút):** Given đèn nút slot 2 đang sáng,  
    When khách bấm nút slot 1,  
    Then không cơ cấu nào kích hoạt và đèn slot 2 vẫn sáng.
  * **AC3 (Bấm nhiều lần):** Given khách bấm nút slot 2 hai lần liên tiếp,  
    When thiết bị xử lý,  
    Then chỉ có đúng một lần kích hoạt (chống dội phím và FR-DSP-10).
  * **AC4 (Không có lệnh):** Given không đèn nào sáng,  
    When có người bấm bất kỳ nút nào,  
    Then không cơ cấu nào kích hoạt.
* **Test:** `test_FR_DSP_22_dispense_only_on_target_button_press`

---

## FR-DSP-23 — Kiểm tra an toàn lần hai lúc bấm
* **Statement:** Thiết bị phải kiểm tra lại các điều kiện tại FR-DSP-12 đến FR-DSP-14 đúng lúc khách bấm nút và từ chối kích hoạt nếu không còn thỏa.
* **Traces:** BR-010 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đèn nút slot 2 đã sáng và sau đó cửa máy bị mở,  
    When khách bấm nút slot 2,  
    Then không kích hoạt cơ cấu, đèn tắt, thiết bị gửi `stage = REJECT` với `DOOR_OPEN`.
  * **AC2:** Given đèn đã sáng và sau đó máy chuyển `MAINTENANCE`,  
    When khách bấm nút,  
    Then thiết bị từ chối với `MACHINE_IN_MAINTENANCE`.
  * **AC3:** Given đèn đã sáng và slot 2 bị đánh dấu rỗng,  
    When khách bấm nút,  
    Then thiết bị từ chối với `SLOT_EMPTY`.
* **Test:** `test_FR_DSP_23_recheck_safety_on_press`

---

## FR-DSP-24 — Hết thời gian chờ bấm
* **Statement:** Thiết bị phải tắt đèn và gửi từ chối với mã `PRESS_TIMEOUT` khi hết `DISPENSE_PRESS_WINDOW_SEC` mà khách chưa bấm nút.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đèn nút slot 2 sáng lúc `t`, khách không bấm,  
    When tới `t + DISPENSE_PRESS_WINDOW_SEC`,  
    Then đèn tắt, thiết bị gửi `stage = REJECT`, `failure_code = PRESS_TIMEOUT`, và lệnh được lưu vào danh sách mã đã xử lý để không thể kích hoạt lại (FR-DSP-10).
  * **AC2:** Given đã hết thời gian chờ,  
    When khách bấm nút slot 2,  
    Then không kích hoạt.
  * **AC3:** Given bộ đếm chờ bấm,  
    When đo trên firmware,  
    Then dùng timer phần cứng (`esp_timer`), không dùng `delay` — cùng nguyên tắc với `ACTUATOR_MAX_MS`.
* **Test:** `test_FR_DSP_24_press_timeout_rejects_command`

> Ca "bấm sau khi hết thời gian" thuộc nhóm test trọng yếu "TTL lệnh xịt" (`spec/testing.md`) —
> nghiệm thu bằng `tests/e2e/test_command_ttl.test.ts`.

---

## FR-DSP-25 — Không khôi phục trạng thái chờ bấm sau khởi động lại
* **Statement:** Thiết bị phải không khôi phục trạng thái chờ bấm của bất kỳ lệnh nào sau khi khởi động lại.
* **Traces:** BR-002, BR-010 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given đèn nút slot 2 đang sáng,  
    When thiết bị mất điện hoặc bị reset rồi khởi động lại,  
    Then không đèn nào sáng, bấm nút slot 2 không kích hoạt, và lệnh đó không bao giờ được thực hiện.
  * **AC2:** Given lệnh bị mất như AC1,  
    When quá mốc tại FR-DSP-18,  
    Then nền tảng chuyển lệnh `UNKNOWN` và đơn vào kiểm tra thủ công (FR-ORD-19) — không phải `FORFEITED`.
* **Test:** `test_FR_DSP_25_no_armed_state_after_reboot`

> Thuộc nhóm test trọng yếu "TTL lệnh xịt" (`spec/testing.md`). Phía nền tảng và simulator nghiệm
> thu bằng `tests/e2e/test_command_ttl.test.ts`; mất điện thật trên ESP32 kiểm trên phần cứng.

---

## FR-DSP-26 — Một lệnh xịt khách hàng hiệu lực mỗi máy
* **Statement:** Hệ thống phải bảo đảm mỗi máy có tối đa một lệnh xịt khách hàng đang hiệu lực, và chỉ tạo lệnh cho đơn đã thanh toán khi máy không còn lệnh khách hàng nào đang hiệu lực.
* **Traces:** BR-002 · **Priority:** M
* **Acceptance criteria:**
  * **AC1 (Ràng buộc ở tầng CSDL):** Given máy `M` đã có một lệnh `CUSTOMER` ở `CREATED`, `SENT` hoặc `ACKNOWLEDGED`,  
    When ghi thẳng lệnh `CUSTOMER` thứ hai cho `M` vào CSDL,  
    Then partial unique index `uq_machine_active_customer_command` từ chối thao tác.
  * **AC2 (Chờ lượt):** Given đơn `O2` trên máy `M` được thanh toán khi `M` đang có lệnh chờ bấm của đơn `O1`,  
    When xử lý webhook của `O2`,  
    Then `O2` chuyển `PAID` nhưng chưa có lệnh; ngay khi lệnh của `O1` kết thúc, hệ thống tạo lệnh cho `O2` và `O2` chuyển `DISPENSE_REQUESTED`.
  * **AC3:** Given lệnh `DIAGNOSTIC` đang chạy trên `M`,  
    When tạo lệnh `CUSTOMER`,  
    Then ràng buộc này không chặn (chỉ áp cho `CUSTOMER`).
* **Test:** `test_FR_DSP_26_one_active_customer_command_per_machine`

---

## FR-DSP-27 — Lệnh chẩn đoán không chờ bấm
* **Statement:** Thiết bị phải thực hiện lệnh xịt chẩn đoán ngay khi nhận, không sáng đèn chờ bấm.
* **Traces:** BR-006 · **Priority:** M
* **Acceptance criteria:**
  * **AC1:** Given lệnh `DIAGNOSTIC` hợp lệ cho slot 2,  
    When thiết bị xử lý,  
    Then thiết bị gửi `ACK` rồi kích hoạt ngay, không sáng đèn, và gửi `RESULT` như trước ADR-0007.
* **Test:** `test_FR_DSP_27_diagnostic_dispenses_immediately`
