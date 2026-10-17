# Ghép ESP32 vào hệ thống ScentStation

Firmware mới nằm ở `arduino/ScentStationDevice`, kế thừa GPIO và chống dội nút của `arduino/Test5Buttons`. Bản Test5Buttons vẫn dùng để thử dây; nó không có luồng thanh toán/MQTT/database. Không ghi đè bản `DeviceSimulator.ino` đang được sửa trong workspace.

## Cấu hình trước khi nạp

1. Đảm bảo PostgreSQL và MQTT broker của hệ thống đang chạy. Dùng cấu hình hiện có của backend: DATABASE_URL, MQTT_URL và khóa ký DISPENSE_SIGNING_KEY. Không dùng `db:reset` trên database có dữ liệu thật.
2. Máy phải được đăng ký với serial đúng và đủ năm slot 1–5. Slot bán được cần chai đang hoạt động, trạng thái AVAILABLE và liều đã hiệu chỉnh; firmware không tự mở các slot bị khóa.
3. Dừng simulator cùng serial, chạy `npm run device:prepare -- --serial M001`. Lệnh kiểm tra không còn lệnh cấp phát đang chạy rồi chuyển cờ simulator_enabled về false. Khóa công khai được in ra nếu backend có khóa ký hợp lệ.
4. Làm theo README trong thư mục firmware để tạo config.h, cấu hình Wi-Fi, serial, địa chỉ broker và khóa công khai. MQTT_HOST phải là IP/tên máy chủ mà ESP truy cập được; `localhost` trên ESP không trỏ về máy tính. NTP phải hoạt động để kiểm tra hạn lệnh.
5. Nạp firmware bằng Arduino IDE, mở Serial Monitor. Lần khởi tạo LittleFS đầu tiên cần bật cờ khởi tạo rồi tắt lại ở lần nạp tiếp theo. Không định dạng lại storage của thiết bị đang vận hành.
6. Chạy `npm run api:dev` và `npm run kiosk:dev` theo cấu hình kiosk hiện có. Backend gửi config trước khi phát lệnh; ESP khởi động ở DISABLED và tất cả bơm tắt.

Không có thiết bị tại phiên làm việc này nên chưa nạp hoặc xác nhận bơm thật. Không đổi dữ liệu máy trong database thật trong quá trình kiểm thử tự động.

## Luồng giao dịch cần quan sát

Chọn sản phẩm → xem giá/điều khoản → thanh toán → backend nhận webhook hợp lệ → đơn PAID → lệnh MQTT → ACK → đèn nút đúng slot sáng → khách bấm → chạy một bơm → RESULT → đơn DISPENSED.

Chỉ bấm nút khi chưa có lệnh đã thanh toán thì bơm không chạy. Không bấm trong cửa sổ cho phép thì lệnh bị từ chối PRESS_TIMEOUT và đơn FORFEITED theo nghiệp vụ hiện có. Không tự sửa quy tắc hoàn tiền này.

`npm run pay:mock` chỉ dùng thử giao dịch; đây không phải bằng chứng đã tích hợp ngân hàng hoặc hoàn tiền thật. Luồng cổng thanh toán thật phải có webhook/xác thực đúng cấu hình của dự án.

## Kiểm tra database

Chạy `npm run device:inspect -- --serial M001` để xuất báo cáo JSON chỉ đọc, không in thông tin kết nối hay khóa bí mật.

| Bảng | Dữ liệu đối chiếu |
|---|---|
| machines | ONLINE, last_seen_at, firmware_version, configuration_version |
| machine_status_histories | Chuyển ONLINE / UNSTABLE / OFFLINE |
| sensor_readings | Thời gian đo và nhận telemetry; trạng thái từng kênh |
| device_events | device_event_id, loại sự kiện, payload và thời điểm nhận |
| orders | payment_reference, PAID/DISPENSED/FORFEITED/FAILED, thời điểm và cờ kiểm tra thủ công |
| dispense_commands | command_token, trạng thái gửi/ACK/kết thúc |
| dispense_results | Kết quả, device_event_id và raw_payload của ESP |
| alerts | Cảnh báo mất kết nối, tránh tạo nhiều cảnh báo đang mở cho cùng máy |

Kết quả và sự kiện QoS 1 được backend xác nhận sau khi xử lý database thành công. ESP lưu hàng đợi bền và gửi lại khi có mạng; backend chống trùng bằng định danh sự kiện. Heartbeat/telemetry QoS 0 có thể mất khi mạng lỗi, không phải nhật ký đầy đủ mọi thời điểm.

Chưa có cảm biến xác nhận lượng nước hoa thực xuất: SUCCEEDED phản ánh chu kỳ điều khiển bơm đã hoàn tất. Firmware không gửi lượng ml giả; ingestion telemetry không tự trừ tồn kho. Việc đo liều, cập nhật tồn kho và kiểm tra vòi tắc cần tiếp tục đối chiếu với luồng INV/cảm biến thực tế. Phần nguồn chập chờn vẫn cần xử lý phần cứng trước khi pilot.
