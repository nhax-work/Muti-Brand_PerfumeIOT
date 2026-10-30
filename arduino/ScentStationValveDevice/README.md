# Firmware riêng cho bơm và van trên bo Rev B

Sketch `ScentStationValveDevice.ino` bổ sung van cho bo `hardware/driver15/rev-b` và biến thể `rev-b-1oz`. Bản `arduino/ScentStationDevice` dùng bơm rời được giữ riêng. Không nạp bản này cho mạch chỉ có module MOSFET bơm hoặc mạch van đấu trực tiếp vào GPIO khác.

## Đấu nối

| Chức năng | Chân ESP32 hoặc PCF8575 |
| --- | --- |
| Bơm 1–5 | GPIO25, 18, 19, 21, 22 |
| Đèn 1–5 | GPIO26, 23, 32, 33, 13 |
| Nút 1–5 | GPIO27, 34, 35, 36, 39 |
| I²C SDA / SCL | GPIO16 / GPIO17, kéo lên 3V3 |
| PCF8575 | Địa chỉ 7-bit 0x20, nguồn 3V3 |
| Van 1–5 | P00–P04 qua AHCT04 rồi AHCT541 |
| EXP_READY | P05 qua AHCT04 |
| RUN_REQUEST | GPIO14, có kéo xuống; LOW khóa toàn bộ tải qua OE |
| Nhịp watchdog CD74HC123 | GPIO4, xung từ vòng điều khiển mỗi khoảng 10 ms |

Giữ nguyên tầng đảo, khóa OE và watchdog theo sơ đồ Rev B. PCF bit 1 = đóng van, bit 0 = mở van sau tầng đảo. Gửi đủ hai byte, byte thấp trước: `FFFF` đóng toàn bộ và tắt EXP_READY; `FFDF` đóng toàn bộ và bật EXP_READY. Chỉ một bit van được xóa trong mỗi chu kỳ. Đọc lại chân PCF chỉ xác minh mức logic, không chứng minh van đã mở/đóng cơ học. Xem [datasheet PCF8575 của TI](https://www.ti.com/lit/ds/symlink/pcf8575.pdf).

## Chu kỳ hoạt động

1. Boot giữ GPIO14 thấp, bơm và đèn tắt; ghi/đọc lại `FFFF`, rồi `FFDF`. Lỗi ghi, thiếu byte đọc hoặc mức chân không khớp làm khóa driver cho tới reset.
2. Lệnh khách vẫn kiểm Ed25519, máy, TTL, token chống lặp và an toàn; bật đèn slot rồi ACK, chờ một lần nhấn mới. Van chưa mở ở bước chờ.
3. Nhấn đúng nút: giữ khóa tải, đóng các van cũ, chọn van đúng slot và đọc lại; khởi động bộ ngắt phần cứng, cấp RUN_REQUEST, chờ `VALVE_LEAD_MS`, rồi bật bơm đúng slot.
4. Lượt khách chạy 2000 ms. Dừng bơm, chờ `VALVE_TAIL_MS`, hạ RUN_REQUEST và đóng van. Lưu RESULT sau khi tải đã tắt.
5. Đọc lại PCF khoảng mỗi 25 ms khi vòng điều khiển chạy. Lỗi bus/sai mức/cửa mở khi chạy làm khóa tải. ISR quá 3500 ms hạ trực tiếp GPIO14 và tắt bơm, không gọi Wire/I²C trong ISR. Lỗi được giữ tới reset, không tự thử mở lại.

Thời hạn 3500 ms tính cho cả thời gian van được cấp điện và bơm chạy, gồm khoảng dẫn/đuôi. `VALVE_LEAD_MS` và `VALVE_TAIL_MS` mặc định 0 vì chưa có số đo cơ khí. Mỗi giá trị tối đa 1000 ms và tổng chu kỳ phải nhỏ hơn 3500 ms; cấu hình không hợp lệ bị chặn khi biên dịch hoặc khi bắt đầu lượt test. Hiệu chuẩn lại liều ml/lượt sau khi chọn thời gian van. Firmware này không thay DB hoặc hợp đồng backend.

Trong lúc bơm chạy không poll mạng hay ghi flash; vẫn phục vụ kiểm tra driver và nhịp watchdog. Khi I²C bị treo, timeout Wire là 20 ms; ISR vẫn có thể khóa tải mà không chờ I²C. Nhịp watchdog dừng khi driver lỗi. Mạch watchdog và thời gian nhả van cần được đo trên bo thật; chưa có xác nhận nghiệm thu phần cứng.

## Test và mồi

Giữ các lệnh `TEST ON`, `SET <slot> <ms>`, `RUN <slot>`, `SHOW`, `STOP`, `TEST OFF` qua USB và lệnh test có chữ ký qua MQTT. `PRIME <slot> <ms>` tự mở đúng van trong từng nhịp bơm, nghỉ 500 ms với van đóng giữa nhịp; không cần mở van bằng bộ điều khiển khác. Không cho vào test giữa một đơn khách. Test/mồi không tạo RESULT của đơn hàng hoặc tự trừ tồn kho; ghi nhận lượng dung dịch bảo trì bằng quy trình kho.

Ví dụ qua Serial Monitor 115200 baud, Newline:

```text
TEST ON
SET 1 1000
RUN 1
PRIME 2 5000
STOP
TEST OFF
```

`SET` phải chừa thời gian dẫn/đuôi dưới giới hạn 3500 ms. `STOP`/`TEST OFF` hạ khóa tải trước khi giao dịch I²C. Không bật test để phục vụ khách. Firmware tự thoát phiên test Wi-Fi khi mất kết nối hoặc quá 120 giây không có lệnh; STOP qua MQTT chỉ được nhận ở khoảng bơm tắt, bộ ngắt cục bộ vẫn bắt buộc.

## Biên dịch

Dùng ESP32 Arduino core 3.3.12, ArduinoJson 7.4.3, ArduinoMqttClient 0.1.8, Crypto 0.4.0 và Wire đi kèm core. Sao chép `config.example.h` thành `config.h`, khai báo cấu hình riêng cho bản này. Không sao chép hoặc commit thông tin đăng nhập từ sketch khác. Biên dịch bằng Arduino IDE hoặc:

```text
arduino-cli compile --fqbn esp32:esp32:esp32 arduino/ScentStationValveDevice
```

Không tự nạp thiết bị hoặc chạy tải khi biên dịch. CI dùng cấu hình mẫu, chạy test driver giả lập bằng C++ và build ESP32. Kiểm thử driver cục bộ nếu có g++:

```text
g++ -std=c++17 -Wall -Wextra -Werror -pedantic tests/firmware/valve_driver_test.cpp -o valve-driver-test
./valve-driver-test
```

## Kiểm chứng trên bo trước khi dùng

| Ca thử | Kết quả cần đo |
| --- | --- |
| Reset riêng ESP khi PCF còn nguồn | OE khóa trước; không mở lại van/lượt đang chờ |
| Từng slot, cả khách và test | Đúng một van và một bơm, các slot khác tắt |
| Hết thời gian bấm hoặc sai nút | Không mở van, không bật bơm |
| Rút I²C / ngõ PCF sai mức / PCF reset | GPIO14 thấp, tải tắt, không tự phục hồi chạy |
| Treo vòng điều khiển | Watchdog ngoài làm mất WD_OK; đo thời gian cắt |
| Giả lập ISR cutoff khi I²C bận | GPIO14 thấp ngay; van không phụ thuộc ghi I²C thành công |
| STOP / TEST OFF / cửa mở / mất Wi-Fi trong test | Không tự tiếp tục mồi; kiểm tra toàn bộ đầu ra |
| Đổi slot hoặc nhịp PRIME tiếp theo | Van cũ đóng trước khi van mới được cấp điện |
| Đo thời gian cơ khí và lượng thực | Chốt lead/tail, liều hiệu chuẩn và thời gian đóng thực có diode flyback |

Chưa có cảm biến đo lượng giao thực tế; `success=true` chỉ phản ánh chu kỳ điều khiển hoàn tất. Nút dừng và OE không khắc phục được MOSFET chập; giữ các giới hạn phần cứng trong hồ sơ Rev B.
