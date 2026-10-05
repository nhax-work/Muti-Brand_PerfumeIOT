# Ghép nối lệnh xịt: kiosk → thanh toán → MQTT → ESP32

Hướng dẫn chạy chuỗi "chọn slot trên kiosk → giả lập thanh toán → đèn nút sáng → bấm → bơm chạy"
và hợp đồng MQTT mà firmware phải theo. Nguồn gốc: `spec/contracts/mqtt.md` §5–6, ADR-0007.

## 1. Chạy hệ thống

```powershell
docker compose up -d db mqtt
npm run db:migrate
npm run db:seed            # máy M001, 5 slot số 1–5, ONLINE/NORMAL, slot nào cũng có sản phẩm + giá
npm run api:dev            # cần MQTT_URL=mqtt://localhost:1883 trong .env (xem .env.example)
npm run kiosk:dev          # mở http://localhost:5173/?serial=M001
docker exec -it scent-mqtt mosquitto_sub -t 'scentstation/#' -v   # theo dõi lưu lượng
```

Log API khi đúng: `[MQTT] Đã kết nối broker…`, `[MQTT] Đang nghe scentstation/+/command/result`,
`[Scheduler] Đã bật job: hết hạn đơn, điều phối lệnh xịt`.

Trên kiosk: chọn mùi → **Trải nghiệm xịt ngay** → **Đồng ý và thanh toán** → màn hiện mã `ORD-…`. Giả
lập khách trả tiền:

```powershell
npm run pay:mock -- ORD-20261004-XXXXXX
```

Trong ≤ 1 giây đèn nút sáng, kiosk hiện "Mời bấm nút số N" và đếm ngược.

### Không có ESP32: dùng simulator Node

```powershell
npm run sim                              # M001, tự bấm nút sau 2 giây → đơn DISPENSED
npm run sim -- --no-press                # không bấm → sau 60 giây PRESS_TIMEOUT → FORFEITED
npm run sim -- --fail ACTUATOR_FAULT     # bấm nhưng cơ cấu hỏng → FAILED + cần kiểm tra
npm run sim -- --reject DOOR_OPEN        # từ chối ngay khi nhận lệnh
```

**Không** chạy simulator cùng lúc với ESP32 thật mang cùng serial `M001`.

## 2. Hợp đồng cho firmware (5 slot)

### Nhận — `scentstation/M001/command` (QoS 1, không retain)

```json
{
  "schema_version": 1,
  "machine_serial": "M001",
  "ts": "2026-10-04T03:23:04.404Z",
  "command_token": "cmd_d7d075cf-dbf9-41f8-8232-69828e6d08e8",
  "command_type": "DISPENSE",
  "dispense_type": "CUSTOMER",
  "slot_number": 2,
  "dosage_ml": 0.12,
  "expires_at": "2026-10-04T03:24:04.404Z",
  "signature": "dev-unsigned"
}
```

- `slot_number` 1–5 → chọn bộ chân (đèn, nút, bơm) của slot đó.
- `signature` là `dev-unsigned` khi backend chưa cấu hình khóa → giữ `DEV_ALLOW_UNSIGNED_COMMANDS true`.
- `expires_at` là hạn để **nhận lệnh và sáng đèn** — không phải hạn bấm nút. ESP32 cần giờ NTP để
  kiểm, thiếu giờ thì mọi lệnh bị `CMD_EXPIRED`.
- Backend chỉ gửi **một** lệnh CUSTOMER mỗi lúc cho một máy — không bao giờ có hai đèn cùng sáng.

### Gửi — `scentstation/M001/command/result` (QoS 1)

| Lúc | Bản tin | Đơn trên hệ thống |
|---|---|---|
| Đèn slot đã sáng | `{"stage":"ACK", "command_token":…, "machine_serial":"M001", …}` | giữ `DISPENSE_REQUESTED`, kiosk mời bấm |
| Bơm chạy xong | `{"stage":"RESULT", "success":true, "executed_at":…, "pressed_at":…, "device_event_id":…}` | `DISPENSED` |
| Bơm lỗi / quá 800ms | `{"stage":"RESULT", "success":false, "failure_code":"HARD_TIMEOUT"}` | `FAILED` + cần kiểm tra |
| **Hết `press_window_sec` (60 giây kể từ lúc đèn sáng) mà không bấm** | `{"stage":"REJECT", "failure_code":"PRESS_TIMEOUT"}` | `FORFEITED` |
| Từ chối ngay khi nhận | `{"stage":"REJECT", "failure_code":"CMD_EXPIRED" \| "CMD_DUPLICATE" \| …}` | `FAILED` |

`machine_serial` trong payload phải trùng serial trên topic, nếu không backend bỏ bản tin.

> **Cần sửa ở `arduino/DeviceSimulator`:** sketch hiện tại khi khách không bấm thì gửi
> `REJECT CMD_EXPIRED` lúc tới `expires_at`. Theo mqtt.md §5.2 phải đếm `press_window_sec` **từ lúc
> ACK** và gửi `PRESS_TIMEOUT`. Giữ nguyên thì đơn thành `FAILED` + cần kiểm tra thủ công thay vì
> `FORFEITED`.

### Nếu máy im lặng

Không có ACK trong 60 giây sau khi gửi, hoặc có ACK mà không có kết quả trong 120 giây → lệnh
`UNKNOWN`, đơn cắm cờ kiểm tra thủ công, kiosk hiện mã hỗ trợ, máy được nhận đơn tiếp theo. Kết quả
đến trễ sau đó vẫn được ghi để khép đơn đúng sự thật.

## 3. Sự cố hay gặp

| Triệu chứng | Kiểm tra |
|---|---|
| ESP32 không kết nối broker | `MQTT_HOST` là IPv4 LAN của máy chạy Docker (`ipconfig`), không phải `localhost`; mở cổng 1883 trên Windows Firewall (PowerShell quyền admin): `New-NetFirewallRule -DisplayName "MQTT 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow` |
| Lệnh tới nhưng ESP32 trả `CMD_EXPIRED` | ESP32 chưa đồng bộ NTP (cần Internet) hoặc lệch giờ |
| Trả tiền xong không có lệnh | Log API có `[Scheduler] … điều phối lệnh xịt` không? Thiếu → `.env` chưa có `MQTT_URL`. Máy phải `ONLINE` + `NORMAL` trong CSDL |
| Tạo đơn bị `MACHINE_BUSY` | Đèn của khách trước còn sáng — chờ hết lượt (tối đa 60 giây) |
| Đơn kẹt `PAID` | Máy đang có lệnh hiệu lực khác, hoặc broker mất kết nối — đơn tự đi tiếp khi máy rảnh |
