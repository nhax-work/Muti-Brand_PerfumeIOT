# Test ESP32 với backend sau khi thử nút cục bộ

## 1. Nạp firmware kết nối

Mở `arduino/DeviceSimulator/DeviceSimulator.ino`. `LOCAL_BUTTON_TEST=false` đã được đặt để dùng Wi-Fi/MQTT. Cấu hình mạng trong `config.h` được giữ nguyên; `INITIALIZE_DEVICE_STORAGE=false` để không tự định dạng bộ nhớ. `ALLOW_DIAGNOSTIC_COMMANDS=false` vẫn chặn chạy tự động. Nạp lại ESP, mở Serial Monitor 115200. Lệnh Serial ACTIVATE không dùng trong chế độ này.

MQTT_HOST của ESP phải là IP LAN hiện tại của máy chạy broker, không phải localhost. ESP và máy tính phải truy cập được nhau trên cổng 1883, và ESP cần truy cập NTP. Kiểm tra lại IP nếu vừa đổi Wi-Fi/hotspot. Unsigned development commands chỉ dành cho mạng thử nghiệm tin cậy.

## 2. Hạ tầng và cấu hình PowerShell

Mở Docker Desktop, chờ engine Linux sẵn sàng. Trong PowerShell tại `E:\FPT\CapstoneProject`:

```powershell
$env:DOTENV_CONFIG_PATH = 'E:/FPT/CapstoneProject/.env'
$env:NODE_OPTIONS = '--require=E:/FPT/CapstoneProject/node_modules/dotenv/config.js'
$env:MQTT_URL = 'mqtt://localhost:1883'
docker compose up -d db mqtt
docker ps
npm run device:prepare -- --serial M001
npm run api:dev
```

NODE_OPTIONS cùng DOTENV_CONFIG_PATH nạp file `.env` ở gốc repo cho các tiến trình Node/npm trong terminal hiện tại; không sửa hoặc in bí mật. Terminal khác cần khai báo lại ba biến này. Không chạy db:reset hoặc seed lại database có dữ liệu.

Lệnh prepare cần máy đã đăng ký với đúng năm slot và không có lệnh cấp phát đang chạy. Nó chuyển simulator_enabled=false. Dừng tiến trình simulator khác dùng M001. Máy cần operating_mode=NORMAL. Slot bán được cần AVAILABLE, chai active và liều đã hiệu chỉnh. Không tự mở mọi slot chỉ để thử.

Log backend cần xác nhận kết nối MQTT. Log ESP cần có `MQTT connected` rồi `Configuration applied: version ...`. Chờ heartbeat cập nhật máy ONLINE trước khi chọn sản phẩm. Nếu còn lỗi storage hoặc chưa nhận config, không tiếp tục gửi lệnh.

## 3. Test đèn/nút qua broker, chưa tạo đơn

Trong terminal khác:

```powershell
npm run device:activate -- -MachineSerial M001 -SlotNumber 1
```

Đèn 1 sáng và ESP hiện `Command armed: slot 1`. Thả rồi nhấn nút 1: chỉ bơm 1 chạy một lần khoảng 500 ms. Nhấn nút khác phải bị bỏ qua. Sau khi hoàn tất, nhấn lại mà chưa cấp lệnh mới thì không chạy. Test lệnh mới cho các slot còn lại đang được cấu hình cho phép. Một lệnh không bấm sẽ hết cửa sổ 60 giây và tắt đèn.

Script này chỉ publish MQTT: không tạo payment/order/dispense_command trong backend. Vì vậy dùng nó để thử đèn và nút, không dùng nó để kết luận dữ liệu giao dịch đã lưu đầy đủ.

## 4. Test giao dịch đầy đủ với cổng mock

Mở terminal khác, nạp ba biến môi trường như bước 2 rồi chạy `npm run kiosk:dev` và `npm run admin:dev` nếu chưa chạy. Mở URL Vite in trong terminal, không mặc định dùng URL cũ nếu cổng đã đổi. Kiosk không cần tài khoản khách; trang quản trị dùng tài khoản đã tạo và mật khẩu hiện tại sau khi đổi mật khẩu tạm.

1. Xác nhận PAYMENT_PROVIDER=mock trong môi trường thử nghiệm.
2. Trên kiosk chọn sản phẩm của slot đang khả dụng, xem giá/điều khoản, tạo đơn đến màn QR. Ghi mã ORD-... vừa được tạo.
3. Trong terminal đã nạp cấu hình `.env` ở gốc repo, gửi thanh toán giả lập, thay mã ví dụ bằng mã vừa lấy:

```powershell
npm run pay:mock -- ORD-MA-THAM-CHIEU
```

4. Quan sát đơn PAID → lệnh ACKNOWLEDGED → đèn đúng slot sáng. Thả và bấm nút, bơm chạy → RESULT thành công → đơn DISPENSED.
5. Đọc báo cáo database:

```powershell
npm run device:inspect -- --serial M001
```

Đối chiếu order_status, command_token, command_status, executed_at và raw_payload. Ngoài ra kiểm tra last_seen_at/firmware_version, telemetry và device_events. Không coi dòng `published` của script là xác nhận ESP đã thực thi.

Đây là webhook thanh toán giả lập, không chuyển tiền ngân hàng. SUCCEEDED xác nhận chu kỳ điều khiển bơm; chưa đo được lượng nước hoa thực tế vì không có cảm biến lưu lượng.

## 5. Các ca cần đạt

| Ca thử | Kết quả mong đợi |
|---|---|
| Cấp nguồn/reset, chưa có lệnh | Tất cả bơm tắt; nút không làm chạy bơm |
| Giữ nút trước khi lệnh đến | Không chạy; cần thả rồi bấm lại |
| Lệnh cho slot 1, bấm slot khác | Không chạy bơm khác, vẫn chờ nút 1 |
| Bấm đúng slot | Chạy một bơm, tắt sau chu kỳ; không lặp khi giữ nút |
| Không bấm sau ACK | Hết cửa sổ bấm, đèn tắt; đơn FORFEITED theo nghiệp vụ hiện tại |
| ESP reset trong lúc chờ | Không tự chạy lại lệnh cũ; backend cần xử lý hết hạn/đối soát |
| Mất mạng trong test | Không tự phát sinh lượt; trạng thái/kết quả phải được đối chiếu sau nối lại |

Hoàn tất từng đơn trước khi thử ca tiếp theo. Nếu nguồn chập chờn, dừng thử giao dịch để xử lý nguồn; không tăng thời gian bơm để khắc phục.
