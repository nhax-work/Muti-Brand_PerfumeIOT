# ADR-0019 — Theo dõi lượng còn lại bằng đếm lượt xịt, bỏ load cell

**Ngày:** 2026-10-28 · **Trạng thái:** đã duyệt (2026-10-28) · **Người quyết:** TV1

## Bối cảnh

Thiết kế ban đầu dự kiến mỗi slot có load cell (HX711) để cân chai. Phương án phần cứng cuối cùng
không lắp load cell: lượng còn lại của chai được theo dõi bằng **số lượt xịt thành công** nhân với
**liều đã hiệu chuẩn** của slot. Firmware hiện tại đã đi theo hướng này
(`arduino/ScentStationDevice/README.md`: "no delivery sensor, load cell…"), và phần lõi của spec
cũng vậy (FR-INV-09, `mqtt.md` §3: "load cell chỉ dùng để đối chiếu").

Tuy nhiên spec, contract và lộ trình vẫn còn những chỗ phụ thuộc vào số đo khối lượng:

| # | Vấn đề | Hậu quả |
|---|---|---|
| 1 | FR-INV-05 bắt buộc ghi khối lượng ban đầu khi lắp chai; AC2 từ chối nếu thiếu số đo | Không có thiết bị nào cung cấp số đo này. Code hiện để `emptyWeightG` không bắt buộc, nên đang lệch với AC2 |
| 2 | FR-INV-13 và `RefillSession` lưu khối lượng trước/sau khi nạp (`before_weight_g`, `after_weight_g`) | Ô nhập trên màn phiếu nạp không ai điền được đúng |
| 3 | FR-INV-15, FR-EXP-19, FR-EXP-26 ghi "khối lượng còn lại" khi tháo chai, thanh lý, trả hàng. `BottleReturnCreate.bottles[].measuredWeightG` là trường **bắt buộc** | Endpoint trả hàng (chưa hiện thực) đòi một số đo không tồn tại |
| 4 | FR-INV-18, FR-INV-19 đối chiếu lượng tiêu thụ với load cell và cảnh báo nghi ngờ rò rỉ; hằng số `LEAK_DETECT_THRESHOLD_PCT` | Không có nguồn dữ liệu thứ hai để đối chiếu; hai FR không bao giờ chạy được |
| 5 | FR-IOT-04 và `mqtt.md` §3: telemetry có `slots[].load_cell_g`; §4: kết quả xịt có `measured_quantity_ml`, ví dụ `sensor_snapshot` chứa số cân trước/sau | Contract mô tả trường thiết bị không bao giờ gửi. (`sensor_snapshot` vẫn được firmware gửi với `slot_number`, `actuator_run_ms`, `delivery_sensor_present` — chỉ ví dụ sai) |
| 6 | Bảng `bottles` có `empty_weight_g`, `initial_measured_weight_g`, `current_measured_weight_g`; `dispense_results` có `measured_quantity_ml` | Cột luôn NULL; ERD trong SDD mô tả dữ liệu không có thật |
| 7 | **FR-INV-10 chưa được hiện thực** — `dsp.service.ts` ghi rõ "Trừ lượng còn lại sau lượt thành công (FR-INV-10) thuộc INV, chưa hiện thực" | Với cách đếm lượt xịt, đây là cơ chế lõi. Hiện `estimated_remaining_ml`/`estimated_remaining_sprays` đứng yên từ lúc lắp chai, nên FR-INV-11, FR-INV-12, FR-ALR-02 không bao giờ xảy ra và báo cáo tồn kho sai |
| 8 | Lộ trình giao TV2 "Load cell + HX711" (tuần 8) và "tích hợp load cell vào firmware" (tuần 9) | Việc không còn làm |

## Phương án đã cân nhắc

1. **Giữ load cell làm tùy chọn, không sửa contract.** Không tốn công, nhưng các FR mức M (FR-INV-05,
   FR-INV-15, FR-EXP-26) vẫn đòi một số đo không ai cung cấp, và SDD mô tả một thiết bị không tồn tại.
2. **Đánh dấu DEPRECATED như ADR-0006:** giữ cột, cấm code mới dùng. Tránh được migration xóa cột,
   nhưng ERD và từ điển dữ liệu mang theo 6 cột chết. Lý do giữ cột của ADR-0006 là bảo toàn dữ liệu
   cũ; ở đây các cột chỉ có NULL hoặc dữ liệu seed, nên lý do đó không áp dụng.
3. **Bỏ hẳn:** sửa hoặc bãi bỏ FR, xóa cột, xóa trường contract, đồng thời hiện thực FR-INV-10 ÷ 12.
   **Chọn.** Mọi trường khối lượng đều không bắt buộc trong code, nên ít chỗ phụ thuộc. Còn trước mốc
   đóng băng code 06/11 và chưa có dữ liệu pilot.

## Quyết định

### 1. Nguồn sự thật của lượng còn lại

| Hạng mục | Nội dung |
|---|---|
| Đơn vị gốc | ml. `bottles.current_estimated_ml` là lượng còn lại của chai; `machine_slots.estimated_remaining_ml` là bản sao cho chai đang lắp |
| Lượng ban đầu | `bottles.initial_volume_ml`, nhập khi đăng ký chai (`BottleCreate.initialVolumeMl`, đã bắt buộc) |
| Công thức | Lượng còn lại = lượng ban đầu − Σ liều hiệu chuẩn của các lượt xịt **thành công** (khách và chẩn đoán) − Σ điều chỉnh tồn kho |
| Số lượt còn lại | `estimated_remaining_sprays = floor(estimated_remaining_ml / calibrated_dosage_ml)`; slot chưa hiệu chuẩn thì giữ nguyên như hiện tại |
| Thiết bị | Không gửi bất kỳ số đo lượng hay khối lượng nào. Telemetry chỉ còn cửa, cơ cấu, nguồn |

### 2. Hiệu chuẩn liều

| Hạng mục | Nội dung |
|---|---|
| Lưu ở đâu | `machine_slots.calibrated_dosage_ml` — không đổi cột, không đổi endpoint hiện có |
| Cách đo | Xịt hết một chai mẫu có dung tích đã biết qua cơ cấu của chính slot đó, đếm số lượt thành công; liều = dung tích ÷ số lượt. Làm khi đưa slot vào dùng và sau mỗi lần thay cơ cấu |
| Đổi liều | Tính lại `estimated_remaining_sprays` từ `estimated_remaining_ml` theo liều mới; không tính lại lịch sử |
| NFR-REL-06 | Giữ nguyên. Cân 0,01g ở đó là dụng cụ kiểm thử độ bền trong phòng lab, không phải tính năng của máy |

### 3. Trừ lượng sau lượt xịt (FR-INV-09 ÷ 12, FR-ALR-02)

| Hạng mục | Nội dung |
|---|---|
| Khi nào | Lúc nền tảng ghi `dispense_results` có `success = true` cho lệnh `CUSTOMER` hoặc `DIAGNOSTIC`, **trong cùng transaction** |
| Trừ bao nhiêu | `calibrated_dosage_ml` hiện tại của slot, trừ vào `bottles.current_estimated_ml` của chai đang lắp và `machine_slots.estimated_remaining_ml`, chặn dưới ở 0 |
| Khóa | Khóa hàng `machine_slots` (`FOR UPDATE`) trước khi trừ |
| Khử trùng | Chỉ trừ ở lần ghi kết quả đầu tiên. `RESULT` gửi lại (cùng `device_event_id`) không trừ lần hai |
| Không trừ | Lượt `REJECT`, `success = false`, `UNKNOWN`, `FORFEITED` (FR-INV-09 AC2) |
| Sắp hết (FR-INV-11) | Lượng còn lại **nhỏ hơn** `low_stock_threshold_ml` → chai `LOW`, sinh cảnh báo sắp hết (FR-ALR-02 AC1), chống trùng theo slot như FR-ALR-07 |
| Hết (FR-INV-12) | Lượng còn lại nhỏ hơn một liều → chai `EMPTY`, slot `UNAVAILABLE` (điều kiện của FR-MCH-15 ÷ 17), sinh cảnh báo slot rỗng (FR-ALR-02 AC2) |
| Lệch thực tế | Sai số liều tích lũy và lượt `UNKNOWN` có thể làm ước tính lệch. Inventory Staff kiểm tra bằng mắt khi mở phiếu nạp; lệch thì ghi điều chỉnh tồn kho kèm lý do (FR-INV-16) |

### 4. Sửa FR

| FR | Thay đổi |
|---|---|
| FR-INV-05 | Đổi thành "Hệ thống phải ghi nhận dung tích ban đầu của chai khi đăng ký chai". AC1: lưu `initial_volume_ml` và đặt `current_estimated_ml` bằng giá trị đó. AC2: thiếu `initialVolumeMl` → `VALIDATION_ERROR`. Test đổi tên `test_FR_INV_05_initial_volume` |
| FR-INV-13 | Bỏ "khối lượng đo được trước và sau". Phiên nạp lưu người thực hiện, thời điểm, máy, slot, chai cũ, chai mới; lượng còn lại của chai cũ lấy từ `current_estimated_ml` lúc tháo |
| FR-INV-15 | "ghi nhận lượng còn lại" = `current_estimated_ml` tại thời điểm tháo, không nhập tay. Lệch thì dùng FR-INV-16. Bỏ AC2 (thiếu số đo) |
| FR-INV-18, FR-INV-19 | **Bãi bỏ** (mức X), cùng hằng số `LEAK_DETECT_THRESHOLD_PCT` |
| FR-EXP-19, FR-EXP-26 | "khối lượng còn lại" → "lượng còn lại ước tính (ml)" |
| FR-IOT-04 | Telemetry gồm trạng thái cửa, trạng thái cơ cấu xịt và trạng thái nguồn điện. AC1 bỏ `load_cell_g` và số đo `LOAD_CELL_G` |
| FR-INV-09 ÷ 12, FR-ALR-02 | Giữ nguyên lời; cách hiện thực theo mục 3 |
| Mã lỗi, quyền | Không thêm |

## Hệ quả

### Contract

| Phần | Thay đổi |
|---|---|
| Migration | `1791400000000_adr-0019-bo-load-cell.sql`: xóa `bottles.empty_weight_g`, `bottles.initial_measured_weight_g`, `bottles.current_measured_weight_g`, `refill_sessions.before_weight_g`, `refill_sessions.after_weight_g`, `dispense_results.measured_quantity_ml`. Bước down thêm lại các cột, cho phép NULL |
| `schema.sql`, `data-dictionary.md` | Mô tả trạng thái sau migration; thêm ADR-0019 vào danh sách ở đầu `schema.sql` |
| `openapi.yaml` | Bỏ `BottleCreate.emptyWeightG`; bỏ `beforeWeightG`/`afterWeightG` ở `RefillSession`, `RefillSessionOpen`, `RefillSessionClose`; bỏ `BottleRemoval.remainingMl`; `BottleReturnCreate.bottles[]` chỉ còn `bottleId`; bỏ `DispenseResult.measuredQuantityMl`; sửa mô tả `createBottle`, `closeRefillSession`, `createBottleReturn` |
| `mqtt.md` | §3: bỏ `slots[].load_cell_g` (bảng và ví dụ), bỏ gạch đầu dòng đối chiếu rò rỉ, viết lại đoạn "Telemetry không phải nguồn sự thật" theo mục 1. §4: bỏ `measured_quantity_ml`; giữ `sensor_snapshot` (cột `dispense_results.sensor_snapshot` giữ nguyên), ví dụ đổi theo nội dung firmware thật gửi. Bảng hằng số bỏ `LEAK_DETECT_THRESHOLD_PCT`. Không tăng `schema_version`: chỉ bỏ trường không bắt buộc, nền tảng vẫn bỏ qua trường lạ |
| `spec/constraints.md` | Bỏ `LEAK_DETECT_THRESHOLD_PCT`, sinh lại `constraints.generated.ts` ở api, admin-web, kiosk |
| `spec/modules/` | INV.md, EXP.md, IOT.md theo mục 4 |

### Code

| Module | Thay đổi |
|---|---|
| INV | Hiện thực mục 3 trong `InvDoseConsumer` (`dose-consumption.handler.ts`), cung cấp qua module @Global `InvDoseConsumptionModule`. Bỏ `emptyWeightG`, `beforeWeightG`, `afterWeightG` ở `inv.http.ts`, `inv.service.ts`, `inv.queries.ts` |
| DSP | Khai báo cổng `DOSE_CONSUMER` (`dose-consumption.port.ts`) và gọi nó trong transaction đóng lệnh khi lệnh chuyển `SUCCEEDED`. DSP không import INV: INV đã import SLT, mà SLT kéo theo MCH → DSP, nên import ngược thành vòng — cùng cách ORD nhận handler thanh toán từ SLT (ADR-0008). Bỏ `measured_quantity_ml` ở `dsp.mqtt.ts`, `dsp.service.ts`, `dsp.queries.ts` |
| MCH | Đổi `calibrated_dosage_ml` thì tính lại `estimated_remaining_sprays` (mục 2) |
| IOT | Bỏ `load_cell_g` khỏi `iot.messages.ts` và bỏ ghi `LOAD_CELL_G` trong `iot.service.ts` |
| AUD | Bỏ `measuredQuantityMl` trong truy vết đơn (`aud.queries.ts`) |
| admin-web | Bỏ hai ô khối lượng ở `RefillTab.tsx` cùng khóa i18n; bỏ `LOAD_CELL_G` ở `TelemetryCard.tsx` |
| Seed, script | `scripts/seed.ts`, `tests/integration/helpers/seed-isolation.ts` (`empty_weight_g`, số đo `slot_weight_g`), `scripts/smoke-auth.ts` (`LOAD_CELL_G`) |
| Test mới | `tests/integration/test_inv_consumption.test.ts`: `test_FR_INV_09_estimated_remaining`, `test_FR_INV_10_update_after_dispense` (gồm `RESULT` gửi lại không trừ hai lần), `test_FR_INV_11_low_stock_alert`, `test_FR_INV_12_slot_unavailable`, `test_FR_ALR_02_slot_stock_alert`; `test_FR_INV_05_initial_volume` trong `test_inv_refill_sessions.test.ts` |
| Test sửa | `test_inv_refill_sessions`, `test_iot_device_api`, `ShipmentsPage.test.tsx`, `TelemetryCard.test.tsx` |
| Firmware | Không đổi — firmware hiện tại không gửi các trường bị bỏ |

### Tài liệu

| Tài liệu | Thay đổi |
|---|---|
| `docs/FR_NFR_SCENTSTATION.md` | Bảng FR theo mục 4, kèm ghi chú bổ sung ngày áp dụng |
| `docs/FR_EPIC_SCENTSTATION.md`, `docs/FEATURES_MVP.md` | EPIC-INV-01, 06, 07, EPIC-IOT-02, F-INVS-01, F-DEV-02: bỏ khối lượng và đối chiếu rò rỉ |
| `docs/USE_CASES.md` | UC-INV-04 "Mount Bottle & Record Initial Weight" → ghi dung tích ban đầu |
| `docs/MAJOR_FEATURES_SCENTSTATION.md` | FE-07: bỏ load cell và cảnh báo rò rỉ |
| `docs/LO_TRINH_AI_HARNESS_13_TUAN.md` | Gạch "Load cell + HX711" (T8) và "tích hợp load cell vào firmware" (T9); việc hiệu chuẩn T7 ghi theo mục 2 |
| SDD | Sinh lại ERD (`docs/diagrams/sdd-erd.md` và các file draw.io) sau migration |

### Rủi ro chấp nhận

- Không còn phát hiện rò rỉ tự động. Rò rỉ chỉ lộ ra khi Inventory Staff kiểm tra bằng mắt lúc nạp
  hoặc khi chai hết sớm hơn ước tính.
- Lượng còn lại là ước tính. Sai số liều của cơ cấu (NFR-REL-06 cho phép tới 15%) tích lũy theo số
  lượt; điều chỉnh tồn kho (FR-INV-16) là cách sửa duy nhất.

## Nhật ký áp dụng — 2026-10-28

Áp contract, migration và hiện thực trên nhánh `feat/tv1-week8`:

- Migration `1791400000000_adr-0019-bo-load-cell.sql` đã chạy trên CSDL dev và CSDL test; `schema.sql`,
  `data-dictionary.md`, `types.generated.ts` sinh lại từ CSDL đã migrate (mỗi file đúng 6 cột bị bỏ).
- `openapi.yaml` (redocly lint đạt), `mqtt.md`, `constraints.md`; sinh lại `packages/contracts` và
  `constraints.generated.ts`.
- Code theo bảng "Code" ở trên. Cảnh báo dùng `alerts.type` = `LOW_STOCK` (mức `WARNING`) và
  `SLOT_EMPTY` (mức `HIGH`), khóa chống trùng `<type>:<slot_id>`.
- Spec module INV, EXP, IOT và các tài liệu ở bảng "Tài liệu"; ERD cho SDD sinh lại sau migration.
- Kiểm tra: lint 0 lỗi, typecheck ba app đạt; unit 267/267, contract 45/45, web 184/184, integration
  33 file đạt (một file bỏ qua và 11 test `todo` có từ trước).

Phần sửa trong INV (module của TV4) cần TV4 review.
