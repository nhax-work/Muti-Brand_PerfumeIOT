# Device Simulator cho ESP32 thật (1 bơm)

Sketch này chạy trên ESP32 thật và mô phỏng một máy ScentStation `M001` có một slot. Đèn nút chỉ
sáng sau khi nhận lệnh MQTT hợp lệ. Nút không kích hoạt bơm nếu chưa có lệnh.

## Phần cứng

| Thành phần | GPIO | Logic |
|---|---:|---|
| Module điều khiển bơm | 25 | `HIGH` bật |
| Đèn nút | 26 | `HIGH` bật |
| Nút NO | 27 | Nhấn kéo xuống GND (`INPUT_PULLUP`) |

Luôn kiểm tra nguồn, MOSFET/diode bảo vệ và đấu mass chung trước khi cấp điện cho bơm. Không cấp
nguồn cho bơm trực tiếp từ chân GPIO.

## 1. Chuẩn bị Arduino IDE

1. Cài board package **esp32 by Espressif Systems**.
2. Cài thư viện **PubSubClient** của Nick O'Leary.
3. Cài thư viện **ArduinoJson** phiên bản 7.x.
4. Chọn đúng board ESP32 và cổng COM.

Sao chép `config.example.h` thành `config.h`, rồi sửa:

```cpp
#define WIFI_SSID "ten-wifi"
#define WIFI_PASSWORD "mat-khau"
#define MQTT_HOST "192.168.1.10"
```

`MQTT_HOST` là IPv4 LAN của máy tính chạy Docker, không phải `localhost`. Trên Windows, xem địa chỉ
bằng `ipconfig`. ESP32 và máy tính phải truy cập được nhau trong cùng mạng.

## 2. Khởi động broker và quan sát MQTT

Tại thư mục gốc repository:

```powershell
docker compose up -d mqtt
docker compose ps mqtt
docker exec scent-mqtt mosquitto_sub -t "scentstation/#" -v
```

Nếu Windows Firewall hỏi, cho phép Docker/Mosquitto nhận kết nối từ mạng Private. Nạp sketch, mở
Serial Monitor ở `115200 baud`. Kết quả đúng khi khởi động:

```text
Khoi dong an toan: bom TAT - den TAT
Da ket noi MQTT - bom TAT - den TAT
Dong ho NTP da dong bo
```

Terminal theo dõi MQTT phải thấy `event` BOOT, `heartbeat` và `telemetry` của `M001`.

## 3. Gửi config thử nghiệm

Lệnh PowerShell dưới đây đặt thời gian chạy bơm slot 1 là 500 ms:

```powershell
docker exec scent-mqtt mosquitto_pub -t "scentstation/M001/config" -r -q 1 -m '{"schema_version":1,"machine_serial":"M001","ts":"2026-09-24T10:00:00Z","configuration_version":1,"heartbeat_interval_sec":30,"telemetry_interval_sec":60,"operating_mode":"NORMAL","slots":[{"slot_number":1,"enabled":true,"calibrated_dosage_ml":0.12,"actuator_run_ms":500}]}'
```

Serial Monitor phải in `Da ap dung config version 1`. Muốn gửi lại, tăng
`configuration_version`; thiết bị cố ý bỏ qua version cũ hoặc bằng version hiện tại.

## 4. Gửi lệnh xịt

Trong chế độ dev, sketch yêu cầu có trường `signature` nhưng chưa xác minh giá trị của nó. Dùng
`expires_at` ở tương lai:

```powershell
docker exec scent-mqtt mosquitto_pub -t "scentstation/M001/command" -q 1 -m '{"schema_version":1,"machine_serial":"M001","ts":"2026-09-24T10:00:00Z","command_token":"cmd-test-001","command_type":"DISPENSE","dispense_type":"DIAGNOSTIC","slot_number":1,"dosage_ml":0.12,"expires_at":"2099-12-31T23:59:59Z","signature":"DEV_ONLY"}'
```

Kết quả mong đợi:

1. ESP32 publish `stage = ACK`.
2. Đèn GPIO26 sáng; bơm vẫn tắt.
3. Nhấn nút nối GPIO27 xuống GND.
4. Đèn tắt, bơm GPIO25 bật trong 500 ms.
5. ESP32 publish `stage = RESULT`, `success = true`, rồi trở về `IDLE`.

Đổi `command_token` cho mỗi lần thử. Token đã kích bơm được lưu trong NVS, nên vẫn bị từ chối với
`CMD_DUPLICATE` sau khi ESP32 khởi động lại.

## 5. Các ca kiểm tra quan trọng

| Ca kiểm tra | Cách thực hiện | Kết quả mong đợi |
|---|---|---|
| Nhấn khi chưa có lệnh | Khởi động rồi nhấn nút | Đèn và bơm không bật |
| Sai máy | Gửi payload có `machine_serial=M002` vào topic M001 | `REJECT/CMD_WRONG_MACHINE` |
| Sai slot | Gửi `slot_number=2` | `REJECT/SLOT_EMPTY` |
| Lệnh trùng | Gửi lại token đã thực hiện | `REJECT/CMD_DUPLICATE` |
| Lệnh hết hạn | Đặt `expires_at` trong quá khứ | `REJECT/CMD_EXPIRED` |
| Maintenance | Gửi config version mới với mode `MAINTENANCE` | Lệnh bị từ chối |
| Config không an toàn | Đặt `actuator_run_ms=800` | Giữ config cũ, không chạy chạm ngưỡng 800 ms |
| Mất MQTT | Dừng broker rồi chạy lại | ESP32 tự reconnect, bơm không tự chạy |

## Giới hạn có chủ đích của bản prototype

- `DEV_ALLOW_UNSIGNED_COMMANDS=true` chỉ dành cho mạng dev. Trước khi dùng ngoài môi trường thử
  nghiệm phải xác minh Ed25519 theo `spec/contracts/mqtt.md` và đặt cờ thành `false`.
- PubSubClient publish QoS 0 dù API nội bộ ghi chú topic cần QoS 1. Production nên chuyển sang MQTT
  client hỗ trợ publish QoS 1.
- Prototype chưa có cảm biến cửa, load cell, cảm biến dòng và bộ đệm 500 sự kiện khi offline.
- Broker dev cho phép anonymous và không TLS; không đưa cấu hình này ra Internet.
