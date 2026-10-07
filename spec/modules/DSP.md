# FR-DSP — Điều khiển lượt xịt an toàn

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A12 · 27 FR  
> Trạng thái AC: **một phần** — FR-DSP-21÷27 (ADR-0007, nút bấm vật lý) đã có AC; FR-DSP-01÷20 **chưa viết**.  
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
