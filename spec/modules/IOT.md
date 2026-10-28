# FR-IOT — Giao tiếp và giám sát thiết bị

> Nguồn: `docs/FR_NFR_SCENTSTATION.md` mục A13 · 15 FR
> Trạng thái AC: **một phần** — FR-IOT-04, 05, 06 (2026-10-26, lộ trình tuần 8); các FR khác chưa viết
> Phụ trách: TV1
> Mức chi tiết: AC cho FR có điều kiện; CRUD để dạng phát biểu

Đọc kèm: `spec/glossary.md`, `spec/errors.md`, `spec/constraints.md`, `spec/contracts/mqtt.md`
Mẫu định dạng AC: xem `spec/modules/SLT.md`

---

## FR-IOT-04 — Telemetry của thiết bị
* **Statement:** Thiết bị phải gửi dữ liệu telemetry gồm trạng thái cửa, trạng thái cơ cấu xịt của từng slot và trạng thái nguồn điện. Máy không có load cell nên telemetry không mang số đo khối lượng (ADR-0019).
* **Traces:** BR-005, BR-006 · **Priority:** M
* **API:** `GET /machines/{id}/sensor-readings` (bản tin vào qua topic `telemetry`, `spec/contracts/mqtt.md`)
* **Acceptance criteria:**
  * **AC1 (Lưu bản tin):** Given máy `M` gửi telemetry có `door_open`, `power_status` và hai slot kèm `actuator_status`,  
    When nền tảng nhận bản tin,  
    Then `sensor_readings` có một số đo `DOOR_OPEN`, một `POWER_STATUS` (mức máy) và cho từng slot một `ACTUATOR_STATUS`, cùng `measured_at` lấy từ `ts` của bản tin.
  * **AC2 (Tra cứu):** Given máy `M` có số đo trong và ngoài khoảng `[from, to)`,  
    When Operations Staff gọi `GET /machines/{M}/sensor-readings?from&to&slotId&readingType`,  
    Then hệ thống trả các số đo của `M` thỏa bộ lọc, mới nhất trước, có phân trang; `from ≥ to` trả HTTP 400 `VALIDATION_ERROR`.
  * **AC3 (Phân quyền):** Given người gọi không có quyền `machine.view` (ví dụ Brand Admin),  
    When gọi endpoint,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`. Máy không tồn tại trả HTTP 404 `NOT_FOUND`.
* **Test:** `test_FR_IOT_04_list_sensor_readings`

---

## FR-IOT-05 — Sự kiện thiết bị
* **Statement:** Thiết bị phải gửi sự kiện khởi động, tắt máy, kết nối lại, chuyển chế độ bảo trì, lỗi cảm biến và lỗi xịt.
* **Traces:** BR-006 · **Priority:** M
* **API:** `GET /machines/{id}/device-events` (bản tin vào qua topic `event`)
* **Acceptance criteria:**
  * **AC1 (Lưu và khử trùng):** Given máy `M` gửi sự kiện `deviceEventId = E`,  
    When thiết bị gửi lại đúng sự kiện `E` sau khi kết nối lại,  
    Then `device_events` chỉ có một bản ghi cho `(M, E)` (`uq_device_event`, FR-IOT-11).
  * **AC2 (Tra cứu):** Given máy `M` có các sự kiện trong khoảng `[from, to)`,  
    When Operations Staff gọi `GET /machines/{M}/device-events`,  
    Then hệ thống trả sự kiện của `M` (loại, payload, thời điểm phát sinh và nhận), mới nhất trước, có phân trang; sự kiện của máy khác không lẫn vào.
  * **AC3 (Phân quyền):** Như FR-IOT-04 AC3.
* **Test:** `test_FR_IOT_05_list_device_events`

---

## FR-IOT-06 — Gửi lệnh và cấu hình xuống thiết bị
* **Statement:** Hệ thống phải gửi lệnh xịt, lệnh chẩn đoán, yêu cầu báo cáo trạng thái và cập nhật cấu hình tới thiết bị qua MQTT.
* **Traces:** BR-004 · **Priority:** M
* **API:** `POST /machines/{id}/config/push`
* **Acceptance criteria:**
  * **AC1 (Đẩy lại cấu hình):** Given máy `M` đang `configuration_version = v`, người gọi có quyền `machine.operate` và đã xác thực lại,  
    When gọi `POST /machines/{M}/config/push`,  
    Then hệ thống tăng `configuration_version` lên `v + 1`, publish ngay bản tin `config` (retain) mang `configuration_version = v + 1` theo `spec/contracts/mqtt.md` §7 — kể cả khi nội dung cấu hình không đổi — ghi AuditLog và trả HTTP 202 cùng `Machine`.
  * **AC2 (Chưa xác thực lại):** Given người gọi chưa xác thực lại trong `REAUTH_TOKEN_TTL_SEC`,  
    When gọi endpoint,  
    Then hệ thống từ chối với HTTP 403 `REAUTH_REQUIRED` và không đổi version.
  * **AC3 (Phân quyền):** Given người gọi là Brand Admin hoặc Inventory Staff,  
    When gọi endpoint,  
    Then hệ thống từ chối với HTTP 403 `FORBIDDEN_SCOPE`.
  * **AC4 (Lệnh xịt):** Lệnh `CUSTOMER` và `DIAGNOSTIC` đi qua topic `command` có chữ ký và TTL — xem FR-DSP-06, FR-MNT-09.
* **Test:** `test_FR_IOT_06_push_machine_config`

---

<!-- Các FR còn lại (FR-IOT-01 ÷ 03, 07 ÷ 15): chép từ docs/ mục A13, bổ sung AC theo mẫu ở trên. -->
