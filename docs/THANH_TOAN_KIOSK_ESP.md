# Thanh toán kiosk và đèn nút ESP

Chạy Docker, sau đó chạy backend từ thư mục gốc:

```powershell
npm run api:dev
```

Lệnh này dùng `MQTT_URL` đã cấu hình hoặc broker local `mqtt://127.0.0.1:1883`.
ESP dùng địa chỉ LAN của laptop trong `MQTT_HOST`; không dùng localhost trên ESP.

Máy vật lý phải có `simulator_enabled=false`. Sau khi seed lại database, chạy:

```powershell
npm run device:prepare -- --serial M001
```

Dừng simulator cùng mã máy. Mỗi slot cần trạng thái AVAILABLE, chai đang gắn và
liều bơm đã cấu hình. ESP cần gửi heartbeat để backend xác nhận máy ONLINE.

Luồng hoạt động:

1. Kiosk tạo đơn gắn với slot khách chọn.
2. Webhook thanh toán được xác thực, đối chiếu số tiền, chuyển đơn sang PAID.
3. Backend gửi cấu hình trước, rồi phát lệnh CUSTOMER cho slot của đơn qua MQTT.
4. ESP nhận lệnh hợp lệ, bật riêng đèn slot đó và gửi ACK; kiosk hướng dẫn đúng số slot.
5. Khách thả rồi nhấn nút đang sáng trong 60 giây. ESP chạy bơm một lần và gửi kết quả.
6. Backend cập nhật đơn; kiosk hiển thị kết quả. Đơn trả tiền sau chờ lượt nếu máy đang bận.

Với cổng mock ở môi trường phát triển, dùng mã thanh toán hiển thị trên kiosk:

```powershell
npm run pay:mock -- ORD-MA-THANH-TOAN
```

Không dùng `device:activate` để thay thế webhook thanh toán. Môi trường LAN hiện
dùng chữ ký dev khi backend chưa có khóa; firmware phải cho phép
`DEV_ALLOW_UNSIGNED_COMMANDS`. Triển khai thật cần khóa Ed25519 và TLS.

Kiểm thử tự động qua PostgreSQL test riêng và broker MQTT thật:

```powershell
npx vitest run tests/e2e/test_kiosk_paid_slot_broker.test.ts --no-file-parallelism
```

Kiểm thử xác nhận chưa thanh toán không có lệnh, slot 1/4 nhận đúng lệnh CUSTOMER,
webhook trùng chỉ có một lượt và ACK/RESULT cập nhật đơn. Cần kiểm tra thêm đèn và
bơm trên ESP vật lý để xác nhận phần cứng.
