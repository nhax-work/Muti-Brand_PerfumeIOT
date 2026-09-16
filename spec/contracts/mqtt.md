# Giao thức MQTT giữa thiết bị và nền tảng

> **CONTRACT ĐÓNG BĂNG.** Không sửa trực tiếp. Muốn đổi: viết ADR trong `spec/decisions/`, TV1 duyệt,
> rồi mới sửa và chạy `make test-contract` (`spec/contracts/README.md`).

Đáp ứng NFR-MTN-05. Máy trải nghiệm nằm **ngoài** ranh giới hệ thống; tài liệu này là hợp đồng giao
diện giữa hai bên, không phải mô tả nội bộ backend. Mọi FR trong nhóm DSP và IOT có chủ ngữ
"Thiết bị phải…" là ràng buộc mà thiết bị phải tuân thủ.

Danh sách topic ở đây phải **khớp từng dòng** với `infra/mosquitto/config/acl.example` — ACL là thứ
broker thực sự thi hành, đặc tả lệch ACL nghĩa là thiết bị bị chặn.

---

## 1. Tổng quan

| Hạng mục | Giá trị |
|---|---|
| Broker | Eclipse Mosquitto 2 |
| Cổng dev | 1883 (không TLS), 9001 (websocket, để debug) |
| Cổng thật | 8883 (TLS bắt buộc — NFR-SEC-02) |
| Tiền tố topic | `scentstation/` |
| Định danh máy trong topic | `machines.serial_number` (vd `M001`), **không phải** `machines.id` |
| Mã hóa payload | JSON, UTF-8 |
| Giới hạn kích thước | 65536 byte (`message_size_limit` trong `mosquitto.conf`) |
| Múi giờ | Mọi mốc thời gian là ISO-8601 có offset, lưu ở UTC (NFR-DAT-01) |

Dùng `serial_number` chứ không dùng `id` vì thiết bị được nạp số sê-ri lúc sản xuất, trước khi
có bản ghi trong CSDL; và vì ACL phải đọc được bằng mắt khi vận hành.

### Bảng topic

| Topic | Chiều | QoS | Retain | FR |
|---|---|---|---|---|
| `scentstation/{serial}/heartbeat` | thiết bị → nền tảng | 0 | không | FR-IOT-01, 02, 03 |
| `scentstation/{serial}/telemetry` | thiết bị → nền tảng | 0 | không | FR-IOT-04, FR-INV-18 |
| `scentstation/{serial}/event` | thiết bị → nền tảng | 1 | không | FR-IOT-05, 10, 11 |
| `scentstation/{serial}/command` | nền tảng → thiết bị | 1 | **không** | FR-IOT-06, FR-DSP-03, 04 |
| `scentstation/{serial}/command/result` | thiết bị → nền tảng | 1 | không | FR-DSP-11, 16 |
| `scentstation/{serial}/config` | nền tảng → thiết bị | 1 | có | FR-IOT-06, FR-MCH-06 |

**Vì sao `command` không retain:** lệnh xịt có thời hạn hiệu lực `DISPENSE_CMD_TTL_SEC`. Nếu retain,
một thiết bị khởi động lại sau đó sẽ nhận lại lệnh cũ và có thể xịt nhầm — vi phạm BR-002 (một giao
dịch một lượt xịt). `config` thì ngược lại, phải retain để thiết bị lấy được cấu hình ngay khi
kết nối lại.

**Vì sao `heartbeat` và `telemetry` QoS 0:** mất một bản tin là bình thường và đã có cơ chế xử lý
(FR-IOT-02 đánh dấu UNSTABLE khi thiếu `MACHINE_UNSTABLE_MISSED` bản tin liên tiếp). Các topic còn
lại QoS 1 vì mất bản tin gây hậu quả nghiệp vụ.

### Trường chung của mọi payload

| Trường | Kiểu | Bắt buộc | Ý nghĩa |
|---|---|---|---|
| `schema_version` | integer | có | Phiên bản cấu trúc bản tin. Hiện là `1` |
| `machine_serial` | string | có | Phải khớp `{serial}` trong topic; lệch thì bản tin bị loại |
| `ts` | string (ISO-8601) | có | Thời điểm thiết bị sinh bản tin |

Lặp `machine_serial` trong payload dù topic đã có, để phát hiện thiết bị publish nhầm topic
(cùng cơ chế với `CMD_WRONG_MACHINE` ở chiều ngược lại).

---

## 2. `heartbeat` — thiết bị → nền tảng

Thiết bị gửi theo chu kỳ `HEARTBEAT_INTERVAL_SEC` (FR-IOT-01).

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-09-16T08:30:00Z",
  "firmware_version": "1.2.0",
  "configuration_version": 3,
  "operating_mode": "NORMAL",
  "uptime_sec": 86400
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `firmware_version` | string | có | Ghi vào `machines.firmware_version` (FR-MCH-10) |
| `configuration_version` | integer | có | Nền tảng so với `machines.configuration_version`; lệch thì đẩy lại `config` |
| `operating_mode` | enum | có | `NORMAL` \| `MAINTENANCE` \| `DISABLED` |
| `uptime_sec` | integer | không | Thời gian chạy từ lần khởi động gần nhất |

**Xử lý phía nền tảng.** Cập nhật `machines.last_seen_at`, rồi suy ra `machines.status`:

| Điều kiện | `machines.status` | FR |
|---|---|---|
| Vừa nhận heartbeat | `ONLINE` | FR-MCH-08 |
| Thiếu `MACHINE_UNSTABLE_MISSED` bản tin liên tiếp | `UNSTABLE` | FR-IOT-02 |
| Không nhận gì trong `MACHINE_OFFLINE_SEC` | `OFFLINE` | FR-IOT-03 |

Mọi lần đổi giá trị ghi một hàng `machine_status_histories` (cặp `*_connection_status`, để trống cặp
`*_operating_mode`). Chuyển sang `OFFLINE` sinh cảnh báo (FR-ALR-01) và chặn tạo đơn mới (FR-IOT-12,
lỗi `MACHINE_OFFLINE`).

Ngưỡng lấy từ `spec/constraints.md`, đọc từ cấu hình — không hardcode.

---

## 3. `telemetry` — thiết bị → nền tảng

Số đo cảm biến (FR-IOT-04).

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-09-16T08:30:00Z",
  "door_open": false,
  "power_status": "AC",
  "slots": [
    {
      "slot_number": 1,
      "load_cell_g": 112.4,
      "actuator_status": "IDLE",
      "estimated_remaining_ml": 48.2
    },
    { "slot_number": 2, "load_cell_g": 98.1, "actuator_status": "IDLE" }
  ]
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `door_open` | boolean | có | Nguồn của FR-ALR-03 và của điều kiện từ chối `DOOR_OPEN` |
| `power_status` | enum | có | `AC` \| `BATTERY` \| `LOW_BATTERY` |
| `slots[].slot_number` | integer | có | Số hiệu slot trên máy, khớp `machine_slots.slot_number` |
| `slots[].load_cell_g` | number | không | Khối lượng đo được; thiếu khi máy không có load cell |
| `slots[].actuator_status` | enum | có | `IDLE` \| `RUNNING` \| `FAULT` |

**Xử lý phía nền tảng.** Mỗi số đo thành một hàng `sensor_readings` (`reading_type` = `LOAD_CELL_G`,
`DOOR_OPEN`, `POWER_STATUS`…). Sau đó:

- `door_open = true` liên tục quá `DOOR_OPEN_ALERT_MIN` → cảnh báo FR-ALR-03, **trừ khi** máy đang ở
  chế độ `MAINTENANCE` **hoặc** đang tồn tại `refill_sessions` có `status = STARTED` cho cùng
  máy/slot (FR-INV-30). Hai ngoại lệ, không phải một.
- `actuator_status = FAULT` → cảnh báo FR-ALR-05.
- So `load_cell_g` với lượng tiêu thụ tính theo số lượt xịt; lệch quá `LEAK_DETECT_THRESHOLD_PCT`
  → cảnh báo nghi ngờ rò rỉ (FR-INV-18, FR-INV-19).

Telemetry **không** phải nguồn sự thật của tồn kho. `machine_slots.estimated_remaining_ml` được cập
nhật theo số lượt xịt thành công và liều lượng đã hiệu chuẩn (FR-INV-09, FR-INV-10); load cell chỉ
dùng để đối chiếu.

---

## 4. `event` — thiết bị → nền tảng

Sự kiện rời rạc (FR-IOT-05).

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-09-16T08:30:00Z",
  "device_event_id": "M001-1758012600-0042",
  "event_type": "RECONNECTED",
  "payload": { "offline_duration_sec": 120 }
}
```

| `event_type` | Khi nào |
|---|---|
| `BOOT` | Thiết bị khởi động |
| `SHUTDOWN` | Tắt máy có kiểm soát |
| `RECONNECTED` | Nối lại MQTT sau khi mất kết nối |
| `MODE_CHANGED` | Đổi chế độ hoạt động tại chỗ |
| `SENSOR_ERROR` | Lỗi cảm biến → FR-ALR-05 |
| `DISPENSE_ERROR` | Lỗi cơ cấu xịt ngoài phạm vi một lệnh cụ thể → FR-ALR-05 |
| `DOOR_OPENED` / `DOOR_CLOSED` | Cửa mở/đóng |

**Idempotency (FR-IOT-10, FR-IOT-11).** Khi mất kết nối, thiết bị lưu tạm tối thiểu
`DEVICE_EVENT_BUFFER_MIN` sự kiện vào bộ nhớ cục bộ và gửi lại sau khi nối lại. Mỗi sự kiện mang
`device_event_id` do thiết bị tự sinh và **không đổi qua các lần gửi lại**. Nền tảng khử trùng bằng
unique index `uq_device_event` trên `device_events (machine_id, device_event_id)`: bản trùng bị bỏ
qua im lặng, không phải lỗi.

Quy ước `device_event_id`: `{serial}-{epoch_giây}-{số_thứ_tự}`. Không được dùng UUID sinh lại mỗi lần
gửi — làm vậy thì khử trùng vô hiệu.

---

## 5. `command` — nền tảng → thiết bị

Lệnh xịt khách hàng, lệnh xịt chẩn đoán, yêu cầu báo cáo trạng thái (FR-IOT-06).

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-09-16T08:30:00Z",
  "command_token": "cmd_01JB8XQ2M4YB7N9K3T5V6W8Z1A",
  "command_type": "DISPENSE",
  "dispense_type": "CUSTOMER",
  "slot_number": 1,
  "dosage_ml": 0.12,
  "expires_at": "2026-09-16T08:31:00Z",
  "signature": "base64url(ed25519(canonical_payload))"
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `command_token` | string | có | Duy nhất toàn hệ thống (FR-DSP-02). Khớp `dispense_commands.command_token` |
| `command_type` | enum | có | `DISPENSE` \| `STATUS_REPORT` |
| `dispense_type` | enum | chỉ khi `DISPENSE` | `CUSTOMER` \| `DIAGNOSTIC` (FR-DSP-20) |
| `slot_number` | integer | chỉ khi `DISPENSE` | Slot đích (FR-DSP-03) |
| `dosage_ml` | number | chỉ khi `DISPENSE` | Liều đã hiệu chuẩn cho slot (FR-MCH-06) |
| `expires_at` | string | có | `ts + DISPENSE_CMD_TTL_SEC` (FR-DSP-06) |
| `signature` | string | có | Chữ ký số (FR-DSP-04) |

Lệnh **không** mang `order_id`, giá, tên sản phẩm hay bất cứ thông tin thương hiệu nào. Thiết bị
không cần biết, và không được biết — giữ mặt tấn công nhỏ nhất, đồng thời tránh rò rỉ dữ liệu
thương hiệu qua broker (BR-012).

### 5.1 Ký lệnh (FR-DSP-04, FR-DSP-07)

Thuật toán: **Ed25519**. Khóa riêng giữ ở backend (`DISPENSE_SIGNING_KEY`); khóa công khai nạp vào
thiết bị lúc đăng ký máy và lưu ở `device_credentials.public_key_or_secret_hash`.

Chuỗi ký là **payload chuẩn hóa**: JSON của bản tin sau khi bỏ trường `signature`, khóa sắp xếp tăng
dần theo mã Unicode, không khoảng trắng thừa, mã hóa UTF-8. Kết quả ký mã hóa base64url không đệm.

Phía thiết bị kiểm theo **đúng thứ tự** sau, dừng ở lỗi đầu tiên:

| # | Kiểm | Từ chối với | FR |
|---|---|---|---|
| 1 | Chữ ký hợp lệ | `CMD_INVALID_SIGNATURE` | FR-DSP-07 |
| 2 | `machine_serial` khớp chính nó | `CMD_WRONG_MACHINE` | FR-DSP-09 |
| 3 | `expires_at` chưa qua | `CMD_EXPIRED` | FR-DSP-08 |
| 4 | `command_token` chưa từng thực hiện | `CMD_DUPLICATE` | FR-DSP-10 |
| 5 | Cửa đang đóng | `DOOR_OPEN` | FR-DSP-12 |
| 6 | Không ở chế độ `MAINTENANCE` | `MACHINE_IN_MAINTENANCE` | FR-DSP-13 |
| 7 | Slot đích không rỗng | `SLOT_EMPTY` | FR-DSP-14 |

Kiểm chữ ký **trước** mọi thứ khác: các bước sau đều dựa vào nội dung bản tin, tin vào nội dung chưa
xác thực là vô nghĩa.

Thiết bị lưu danh sách `command_token` đã thực hiện để phục vụ bước 4 (FR-DSP-10). Danh sách phải
sống qua khởi động lại; giữ tối thiểu số lượng tương đương `DEVICE_EVENT_BUFFER_MIN`.

### 5.2 Thực hiện

Sau khi qua đủ 7 bước, thiết bị **gửi xác nhận tiếp nhận trước khi bắt đầu thực hiện** (FR-DSP-11),
rồi kích hoạt **đúng cơ cấu của slot đích**, một chu kỳ đã hiệu chuẩn (FR-DSP-15).

Firmware giới hạn cứng thời gian kích hoạt ở `ACTUATOR_MAX_MS`, **độc lập với mọi logic nghiệp vụ**
(NFR-SAF-01). Vượt ngưỡng thì cắt nguồn cơ cấu và báo `HARD_TIMEOUT`. Giới hạn này không được phép bỏ
qua bởi bất kỳ trường nào trong bản tin — `dosage_ml` không thể dùng để kéo dài quá `ACTUATOR_MAX_MS`.

---

## 6. `command/result` — thiết bị → nền tảng

Dùng cho cả xác nhận tiếp nhận (FR-DSP-11) lẫn kết quả thực hiện (FR-DSP-16), phân biệt bằng `stage`.

**Xác nhận tiếp nhận:**

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-09-16T08:30:01Z",
  "command_token": "cmd_01JB8XQ2M4YB7N9K3T5V6W8Z1A",
  "stage": "ACK"
}
```

**Kết quả thực hiện:**

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-09-16T08:30:03Z",
  "command_token": "cmd_01JB8XQ2M4YB7N9K3T5V6W8Z1A",
  "stage": "RESULT",
  "device_event_id": "M001-1758012603-0043",
  "success": true,
  "executed_at": "2026-09-16T08:30:02Z",
  "measured_quantity_ml": 0.118,
  "result_code": "OK",
  "failure_code": null,
  "sensor_snapshot": { "load_cell_before_g": 112.4, "load_cell_after_g": 112.28 }
}
```

| Trường | Kiểu | Bắt buộc | Ghi chú |
|---|---|---|---|
| `stage` | enum | có | `ACK` \| `REJECT` \| `RESULT` |
| `success` | boolean | chỉ khi `RESULT` | |
| `failure_code` | string \| null | khi không thành công | **Chỉ dùng mã trong `spec/errors.md`** |
| `executed_at` | string | chỉ khi `RESULT` | Thời điểm kích hoạt cơ cấu |
| `measured_quantity_ml` | number | không | Suy từ load cell nếu có |
| `device_event_id` | string | chỉ khi `RESULT` | Để khử trùng khi gửi lại |

### Ánh xạ sang `dispense_commands.status`

| Nhận được | Trạng thái lệnh | Trạng thái đơn |
|---|---|---|
| `stage = ACK` | `ACKNOWLEDGED` | giữ nguyên `DISPENSE_REQUESTED` |
| `stage = REJECT` | `REJECTED` | `FAILED` |
| `stage = RESULT`, `success = true` | `SUCCEEDED` | `DISPENSED` (FR-DSP-17) |
| `stage = RESULT`, `success = false` | `FAILED` | `FAILED`, đặt `needs_manual_review` nếu đã thanh toán (FR-ORD-19) |
| Không nhận gì trong `DISPENSE_RESULT_TIMEOUT_SEC` | `UNKNOWN` (FR-DSP-18) | đặt `needs_manual_review` |

Hai điều tuyệt đối không được làm:

1. **Không** chuyển đơn sang `DISPENSED` khi chưa có `success = true` từ thiết bị (FR-DSP-17). Không
   suy ra từ `ACK`, không suy ra từ hết timeout.
2. **Không** tự sinh lệnh mới cho đơn có lệnh đang ở `UNKNOWN` (FR-DSP-19). Nếu thiết bị thực ra đã
   xịt mà kết quả bị mất trên đường về, lệnh thứ hai sẽ xịt lần hai — vi phạm BR-002. Trường hợp này
   đi qua luồng kiểm tra thủ công và hoàn tiền (FR-ORD-20).

`REJECTED` khác `FAILED`: `REJECTED` là thiết bị từ chối **trước khi** kích hoạt cơ cấu nên khách
chưa mất lượt xịt; `FAILED` là đã kích hoạt mà hỏng. FR-ALR-04 (3 lượt thất bại liên tiếp trên cùng
slot) chỉ đếm `FAILED` (xem `spec/decisions/0002-chuan-dat-ten-va-kieu-du-lieu-csdl.md`).

Mỗi bản tin `RESULT` ghi một hàng `dispense_results`, liên kết 1-1 với `dispense_commands` qua
`command_id` (FR-IOT-07, cưỡng chế bằng `UNIQUE` trên `dispense_results.command_id`).

Ràng buộc thời gian: từ lúc nền tảng nhận webhook thanh toán đến lúc thiết bị bắt đầu kích hoạt cơ
cấu tối đa `WEBHOOK_TO_ACTUATION_MAX_SEC` (NFR-PER-03).

---

## 7. `config` — nền tảng → thiết bị

Cấu hình đẩy xuống, retain để thiết bị lấy được ngay khi kết nối lại.

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-09-16T08:00:00Z",
  "configuration_version": 3,
  "heartbeat_interval_sec": 30,
  "telemetry_interval_sec": 60,
  "operating_mode": "NORMAL",
  "slots": [
    { "slot_number": 1, "enabled": true, "calibrated_dosage_ml": 0.12, "actuator_run_ms": 500 },
    { "slot_number": 2, "enabled": false, "calibrated_dosage_ml": 0.12, "actuator_run_ms": 500 }
  ]
}
```

| Trường | FR |
|---|---|
| `operating_mode` | Bật/tắt máy từ xa (FR-MCH-11), chuyển chế độ bảo trì (FR-MNT-05) |
| `slots[].enabled` | Bật/tắt từng slot từ xa (FR-MCH-12) |
| `slots[].calibrated_dosage_ml`, `actuator_run_ms` | Hiệu chuẩn liều lượng theo slot (FR-MCH-06) |

`configuration_version` tăng đơn điệu. Thiết bị áp cấu hình có version **lớn hơn** version đang giữ,
và bỏ qua bản tin có version nhỏ hơn hoặc bằng — bảo vệ khỏi bản tin retain cũ đến sau khi tái kết nối.
Thiết bị báo version đang chạy trong mỗi `heartbeat` để nền tảng phát hiện lệch.

`slots[].enabled = false` chỉ tắt slot ở mức thiết bị. Trạng thái `machine_slots.status` ở nền tảng
là kết quả tổng hợp nhiều điều kiện (FR-MCH-16/17), không phải bản sao của cờ này.

`actuator_run_ms` luôn phải nhỏ hơn `ACTUATOR_MAX_MS`; thiết bị từ chối cấu hình vi phạm điều này và
giữ nguyên cấu hình cũ.

---

## 8. Bảo mật

### Xác thực

Mỗi máy có một bộ thông tin xác thực **riêng, không dùng chung** (FR-MCH-02, NFR-SEC-07), lưu ở bảng
`device_credentials` (một hàng một máy, `machine_id` UNIQUE). Broker từ chối kết nối từ thiết bị chưa
đăng ký hoặc có thông tin xác thực không hợp lệ (FR-IOT-08).

Thu hồi: đặt `device_credentials.status = REVOKED` và `revoked_at`, rồi gỡ khỏi `passwd`/`acl` của
broker (FR-AUTH-11).

### ACL (FR-IOT-09)

Mỗi thiết bị chỉ được publish/subscribe trên topic thuộc số sê-ri của chính nó. File ACL được sinh
tự động khi đăng ký máy mới, theo mẫu `infra/mosquitto/config/acl.example`:

```
user machine-M001
topic write scentstation/M001/heartbeat
topic write scentstation/M001/telemetry
topic write scentstation/M001/event
topic write scentstation/M001/command/result
topic read  scentstation/M001/command
topic read  scentstation/M001/config
```

Đây là tuyến phòng thủ cuối của BR-012 ở tầng hạ tầng: kể cả khi firmware bị chiếm, thiết bị vẫn
không đọc được topic của máy khác.

### TLS

Môi trường thật bắt buộc TLS cho toàn bộ lưu lượng MQTT (NFR-SEC-02), cổng 8883.

Cấu hình dev hiện tại (`infra/mosquitto/config/mosquitto.conf`) đang để `allow_anonymous true` và
không TLS. **Chỉ hợp lệ trên máy dev.** Các dòng bật `password_file`, `acl_file` và listener 8883 đã
có sẵn dạng comment trong file đó, bật từ tuần 6.

Thiết bị phải tự kết nối lại trong tối đa 60 giây sau khi mạng phục hồi (NFR-REL-04).

### Dữ liệu không được xuất hiện trên MQTT

Không bản tin nào được mang: thông tin khách hàng, dữ liệu thanh toán (NFR-DAT-04), tên hoặc định
danh thương hiệu, giá bán. Broker là hạ tầng chia sẻ giữa mọi máy và mọi thương hiệu.

---

## 9. Bảng mã lỗi thiết bị

Sao nguyên văn từ `spec/errors.md` §"Lệnh xịt". **Thiết bị không được tự đặt mã mới** — cần mã mới thì
thêm vào `spec/errors.md` trước.

| Mã | Khi nào |
|---|---|
| `CMD_INVALID_SIGNATURE` | Thiết bị từ chối: chữ ký sai |
| `CMD_EXPIRED` | Thiết bị từ chối: quá TTL |
| `CMD_WRONG_MACHINE` | Thiết bị từ chối: sai máy đích |
| `CMD_DUPLICATE` | Thiết bị từ chối: mã lệnh đã thực hiện |
| `DOOR_OPEN` | Thiết bị từ chối: cửa đang mở |
| `SLOT_EMPTY` | Thiết bị từ chối: ngăn rỗng |
| `ACTUATOR_FAULT` | Cơ cấu không phản hồi |
| `HARD_TIMEOUT` | Vượt `ACTUATOR_MAX_MS`, đã cắt nguồn |
| `NO_CURRENT` | Không phát hiện dòng qua cơ cấu |

`MACHINE_IN_MAINTENANCE` (bước 6 ở §5.1) nằm ở nhóm "Đơn hàng và thanh toán" trong `spec/errors.md`,
không phải nhóm lệnh xịt.

---

## 10. Ngưỡng số

Không hằng số nào trong tài liệu này được hardcode. Tất cả đọc từ cấu hình theo tên hằng trong
`spec/constraints.md` — đó là nguồn duy nhất.

| Hằng | Dùng ở |
|---|---|
| `HEARTBEAT_INTERVAL_SEC` | §2 chu kỳ heartbeat, §7 `heartbeat_interval_sec` |
| `MACHINE_UNSTABLE_MISSED` | §2 ngưỡng `UNSTABLE` |
| `MACHINE_OFFLINE_SEC` | §2 ngưỡng `OFFLINE` |
| `DISPENSE_CMD_TTL_SEC` | §5 `expires_at` |
| `DISPENSE_RESULT_TIMEOUT_SEC` | §6 ngưỡng chuyển `UNKNOWN` |
| `ACTUATOR_MAX_MS` | §5.2 hard timeout firmware |
| `ACTUATOR_RUN_MS` | §7 `actuator_run_ms` mặc định |
| `DEVICE_EVENT_BUFFER_MIN` | §4 dung lượng bộ đệm cục bộ |
| `DOOR_OPEN_ALERT_MIN` | §3 ngưỡng cảnh báo cửa mở |
| `LEAK_DETECT_THRESHOLD_PCT` | §3 ngưỡng nghi ngờ rò rỉ |
| `WEBHOOK_TO_ACTUATION_MAX_SEC` | §6 ràng buộc thời gian đầu-cuối |

---

## 11. Kiểm thử thủ công

```bash
# Nghe toàn bộ lưu lượng
docker exec scent-mqtt mosquitto_sub -t 'scentstation/#' -v

# Giả lập heartbeat
docker exec scent-mqtt mosquitto_pub -t 'scentstation/M001/heartbeat' \
  -m '{"schema_version":1,"machine_serial":"M001","ts":"2026-09-16T08:30:00Z","firmware_version":"1.2.0","configuration_version":1,"operating_mode":"NORMAL"}'
```

Test tự động nằm ở `tests/contract/` (khớp đặc tả này) và `tests/e2e/` (luồng đầy đủ với Device
Simulator). **`tests/e2e/test_command_ttl.py` là test người tự viết**, agent không sinh
(`spec/testing.md`).
