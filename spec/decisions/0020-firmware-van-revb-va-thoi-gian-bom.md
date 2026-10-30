# ADR-0020 — Firmware van riêng cho Rev B và thời gian bơm

Ngày: 30/10/2026. Trạng thái: hiện thực để thử nghiệm kỹ thuật; chưa nghiệm thu tải thật.

## Bối cảnh

Workspace có bản bơm đã chỉnh lượt khách cố định 2000 ms, hard cutoff 3500 ms, test USB/MQTT và mồi đường ống. GitHub dev còn giới hạn cũ 800 ms và cấu hình 500 ms. Người dùng yêu cầu đưa phần cứng lên dev và thêm **bản firmware có van riêng**, giữ sketch bơm hiện có tách biệt.

## Quyết định

- Thêm `arduino/ScentStationValveDevice` cho PCF8575 và khóa OE trên bo Rev B/Rev B 1 oz. Không thay tên hoặc chuyển sketch `ScentStationDevice` sang yêu cầu bắt buộc có van.
- PCF8575 dùng SDA16/SCL17, 0x20; P00–P04 active-LOW qua tầng đảo cho van, P05 cho EXP_READY. GPIO14 là RUN_REQUEST, GPIO4 phát xung watchdog từ vòng điều khiển.
- Lỗi bus, sai mức PCF, cửa mở khi chạy hoặc timeout phải vô hiệu RUN_REQUEST trước mọi giao dịch I²C. Không tự xóa lỗi driver trong phiên chạy. ISR không thực hiện I²C; hạ GPIO14 khóa cả bơm và van qua phần cứng OE.
- `ACTUATOR_MAX_MS = 3500`; `ACTUATOR_RUN_MS = 2000` là thời gian mặc định backend. Hai giá trị này đồng bộ với lượt khách cố định 2000 ms của firmware workspace. Thời gian test từng slot có thể khác và không thay liều khách.
- Bản van có `VALVE_LEAD_MS`/`VALVE_TAIL_MS` mặc định 0, cần đo trước khi chọn. Chu kỳ van + bơm phải nhỏ hơn 3500 ms; không xem 2000/3500 là kết quả hiệu chuẩn ml/lượt.
- Giữ nguyên schema và migration ADR-0019 trên dev: không đưa lại các cột load cell/khối lượng. Không đổi cấu trúc payload xịt hoặc mã lỗi. Trường chẩn đoán `sensor_snapshot.valve_driver` nằm trong snapshot JSON.
- Lệnh bảo trì dùng phần mở rộng `test/command` và `test/result` dưới topic riêng của máy. ACL mẫu chỉ cấp read/write đúng chiều cho máy M001, không cấp wildcard. Đây không phải lệnh DISPENSE thanh toán: được kiểm chữ ký, TTL tối đa 30 giây và token chống lặp riêng trước khi xử lý.
- Test/mồi là thao tác bảo trì, không tạo kết quả đơn hàng hoặc tự trừ tồn kho. Không tự nạp thiết bị hoặc chạy tải trong CI.

## Xác minh

Bộ test C++ dùng bus/khóa tải giả lập kiểm tra reset với PCF giữ mức cũ, năm kênh, lỗi đọc/ghi, sai mức, PCF reset khi chạy, timeout ngay trước enable và lỗi được giữ lại sau khi bus hoạt động trở lại. CI biên dịch ESP32 với cấu hình mẫu không có thông tin đăng nhập.

Các test này không xác nhận van đóng cơ học, thời gian watchdog ngoài, định mức dòng/nhiệt hoặc liều giao thực tế. Các ca đo và thử bo thật nằm trong README của bản firmware van. Những giới hạn của hồ sơ PCB Rev B vẫn còn hiệu lực.
