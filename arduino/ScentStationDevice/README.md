# ScentStation ESP32 system firmware

`Test5Buttons` remains the standalone wiring test. Upload this sketch for the connected system: in CUSTOMER mode a button only works after the backend authorizes a paid order. Power-up never authorizes a pump.

## Hardware and build

Use a classic ESP32 board with Arduino ESP32 core 3.x (verified with 3.3.12), ArduinoJson 7.4.2, ArduinoMqttClient 0.1.8 and Crypto 0.4.0. Open `ScentStationDevice.ino` in Arduino IDE. Copy `config.example.h` to `config.h` and configure Wi-Fi, machine serial and MQTT host. `config.h` is ignored by Git.

| Slot | Pump | Button light | Button NO |
|---|---|---|---|
| 1 | GPIO25 | GPIO26 | GPIO27 |
| 2 | GPIO18 | GPIO23 | GPIO34 |
| 3 | GPIO19 | GPIO32 | GPIO35 |
| 4 | GPIO21 | GPIO33 | GPIO36 |
| 5 | GPIO22 | GPIO13 | GPIO39 |

Keep the external 10 kΩ pull-ups to 3V3 for buttons, especially GPIO34/35/36/39. Buttons COM and signal grounds share ESP32 ground. Pump current returns through the power ground bus, outside the breadboard and ESP32. Match the module's actual active level with `PUMP_ON_LEVEL` and `LIGHT_ON_LEVEL`.

On a fresh board, set `INITIALIZE_DEVICE_STORAGE=true` for the initial upload to initialize LittleFS, then set it back to `false` and upload again. Formatting erases the stored replay history and pending messages; do not use it to recover ordinary network errors. Preserve the LittleFS partition on later firmware updates.

Use `npm run device:prepare -- --serial M001` in the repo after registering the machine and its five slots. This disables the backend simulator for that machine and prints the public signing key when configured. Put that public key in `COMMAND_PUBLIC_KEY_HEX`; never put the backend private key on ESP32. Stop any separately running simulator with the same serial.

For isolated LAN development with the backend's mock signer only, explicitly enable `DEV_ALLOW_UNSIGNED_COMMANDS`. The default rejects unsigned commands. Production requires verified Ed25519 commands and a TLS broker with a trusted CA. The board needs NTP access for command expiry checks. All serial messages are English.

## Operation

The device boots with all outputs off and stays DISABLED until it receives retained configuration. The backend publishes mode, enabled slots, press window and actuator duration. A fresh button release is required before a press is accepted; holding a button through boot cannot start a pump.

In CUSTOMER mode, payment leads to COMMAND → ACK → illuminated target button → fresh press → one pump → RESULT. Wrong buttons cannot trigger a pump. A missed press window produces PRESS_TIMEOUT. DIAGNOSTIC commands are rejected by default. Enabling ALLOW_DIAGNOSTIC_COMMANDS allows automatic pump operation for authorized maintenance only.

Only one pump runs at a time. The fixed customer duration is 2000 ms; an independent hardware timer cuts pumps at 3500 ms. There is a 500 ms rest between activations. The device stores 500 replay tokens and buffers up to 500 event/result/reject messages in LittleFS, removing a pending message only after MQTT QoS 1 acknowledgment. Storage failures inhibit new commands.

## What the data means

Heartbeat updates connection status and firmware version. Telemetry records all five actuator channels. Events and results carry durable identifiers so retransmissions do not create duplicate database records. A restart while waiting requires a new command; the device does not resume an old authorization.

This wiring has no delivery sensor, load cell or measured power status. A successful result confirms completion of the commanded actuator cycle, not proof that liquid reached the customer. The payload explicitly reports absent delivery sensing. Without a door switch, door state is an assumption; without power sensing, AC status is an assumption. Do not use these values as measured evidence. This firmware does not repair an undersized power supply or a faulty pump circuit.

See `docs/GHEP_ESP32_HE_THONG_THAT.md` for backend setup and database verification.

## Thời gian bơm cố định trên ESP

Firmware này dùng PUMP_RUN_MS = 2000 cho cả 5 slot, ngắt dự phòng ACTUATOR_MAX_MS = 3500. Giá trị actuator_run_ms trong cấu hình MQTT vẫn được kiểm tra hợp lệ nhưng không quyết định thời gian chạy. Quyền bật slot, chế độ máy, chữ ký lệnh và yêu cầu nhấn nút vẫn áp dụng. Muốn đổi thời gian, sửa PUMP_RUN_MS rồi nạp lại firmware. Cần đo và hiệu chuẩn lại liều ml/lượt khi đổi thời gian.


## Chế độ test qua USB, không cần nạp lại khi chỉnh thời gian

Sau khi nạp firmware có tính năng này một lần, mở Serial Monitor ở **115200 baud**, chọn kết thúc dòng **Newline**. Khách hàng vẫn nhấn một lần để xịt một lần đủ 2000 ms; buông nút không dừng và giữ nút không kích hoạt thêm lượt.

1. Khi máy đang rảnh, gửi `TEST ON`. Chế độ test chỉ bật qua USB tại máy, không tự bật lại sau khởi động.
2. Gửi `SET 1 1500` để lưu thời gian test của bơm 1 là 1500 ms. Áp dụng tương tự cho slot 1–5, trong khoảng 1–3499 ms.
3. Gửi `SHOW` để xem trạng thái và thời gian từng bơm.
4. Thả rồi nhấn nút vật lý tương ứng: bơm chạy đúng một lần theo thời gian test, không cần thanh toán. Mỗi lần chỉ một bơm chạy, nghỉ tối thiểu 500 ms giữa hai lần. Giữ nút không chạy lặp.
5. Gửi `STOP` để dừng bơm test ngay; gửi `TEST OFF` để dừng và trở lại hoạt động bình thường.

Thời gian test lưu trong NVS và còn sau khi khởi động, nhưng **không thay đổi thời gian xịt của khách**. Chỉ chỉnh thời gian khi bơm test đã dừng và hết khoảng nghỉ. Chế độ test vẫn xử lý MQTT khi đầu ra đang tắt, nhưng tạm ngưng lệnh khách; chỉ dùng lúc bảo trì khi máy không phục vụ khách. Không vào test khi đang chờ khách nhấn hoặc đang chạy một lượt khách. Test không tạo kết quả đơn hàng hay trừ tồn kho, nên cần ghi nhận lượng dung dịch đã dùng khi bảo trì. Công tắc cửa (nếu có) vẫn chặn/ngắt bơm và bộ ngắt phần cứng 3500 ms vẫn hoạt động.

### Kiểm tra trên máy thật

- Khởi động: tất cả đầu ra tắt, test tắt; các nút không tự chạy bơm.
- Bật test, đặt mỗi slot một thời gian khác nhau, nhấn từng nút và đo thời gian thực tế; không bơm nào khác được bật.
- Giữ nút qua lúc vào test: phải thả rồi nhấn lại; giữ sau khi xịt xong không tạo lượt mới.
- Thử thời gian 0, 3500, số âm, slot 0/6 và dư tham số: đều bị từ chối.
- Khi bơm đang chạy, gửi STOP hoặc TEST OFF: tất cả đầu ra phải tắt; mở cửa cũng phải ngắt nếu có cảm biến.
- Khởi động lại: SHOW giữ thời gian đã lưu nhưng test OFF; kiểm tra lại lượt khách chỉ nhấn một lần và vẫn chạy 2000 ms.


## Mồi/nạp nước cho đường ống trong test mode

Bản này chưa điều khiển van điện từ/PCF8575. **Phải mở van tương ứng bằng bộ điều khiển hiện có trước khi chạy lệnh mồi**, để khí và nước thoát ra béc; không chạy khi đầu ra bị khóa. Hứng chất lỏng ở đầu ra. Thời gian tối đa của lệnh không có nghĩa mọi loại bơm đều được phép chạy khô lâu như vậy; tuân thủ thông số bơm thực tế.

Mở Serial Monitor 115200 baud, Newline và gửi từng dòng:

```text
TEST ON
PRIME 1 10000
```

Lệnh thứ hai bắt đầu mồi **ngay**, không chờ nhấn nút: bơm 1 chạy tổng cộng 10000 ms, chia thành nhịp tối đa 2000 ms, nghỉ 500 ms giữa các nhịp. Vì có khoảng nghỉ, thời gian thực tế dài hơn 10 giây. Thay số 1 bằng slot 1–5; thời gian hợp lệ 1–60000 ms. Thời gian này độc lập với SET và không thay đổi liều khách hàng.

- `STOP`: hủy toàn bộ lần mồi, kể cả đang trong khoảng nghỉ; không tự chạy tiếp.
- `TEST OFF`: hủy mồi và thoát chế độ test.
- `SHOW`: xem trạng thái mồi và phần thời gian bật đã đặt còn lại (giảm sau mỗi nhịp).
- Trong lúc mồi, không nhận lệnh SET, PRIME mới hay nút chạy bơm khác. Chỉ một bơm chạy tại một thời điểm.
- Hết tổng thời gian thì tự kết thúc; khởi động lại không tiếp tục mồi. Lỗi ngắt cứng hoặc cửa mở trong nhịp chạy hủy toàn bộ lần mồi.
- Sau khi dừng/kết thúc, đóng lại van bằng bộ điều khiển hiện có.

### Ca kiểm thử mồi trên phần cứng

| Ca | Kết quả cần đạt |
|---|---|
| PRIME khi chưa TEST ON | Bị từ chối, bơm tắt |
| PRIME 1 10000 | 5 nhịp 2000 ms, mỗi nhịp nghỉ 500 ms; chỉ bơm 1 chạy |
| PRIME 2 2500 | Nhịp 2000 ms rồi 500 ms, không chạy nhịp thứ ba |
| PRIME 3 1 | Một nhịp ngắn, kết thúc và không tự chạy lại |
| Slot 0/6, thời gian 0/60001, số âm, ký tự hoặc dư tham số | Bị từ chối |
| STOP giữa nhịp hoặc trong khoảng nghỉ | Tắt và hủy phần còn lại |
| TEST OFF trong lúc mồi | Tắt bơm, hủy phần còn lại, thoát test |
| Giữ/nhấn nút khác hoặc gửi SET/PRIME khi đang mồi | Không thay bơm, không đổi lịch mồi |
| Cửa mở hoặc ngắt cứng | Tắt và hủy, không tự tiếp tục |
| Khởi động lại giữa lần mồi | Tất cả đầu ra tắt, test OFF, không tiếp tục mồi |
| Thoát test rồi thực hiện đơn khách | Vẫn một lần nhấn, xịt 2000 ms |


## Test/mồi từ terminal Windows (không cần Serial Monitor)

ESP cần được nạp firmware có các lệnh test/mồi trước. Đóng Arduino Serial Monitor và các chương trình khác đang giữ cổng COM. Tại thư mục gốc dự án:

```text
npm run device:test -- -List
npm run device:test -- -Port COM5
```

Thay COM5 bằng cổng thực tế. Nếu chỉ có một cổng COM, có thể chạy `npm run device:test`. Terminal giữ kết nối USB và hiển thị phản hồi ESP. Gõ từng dòng rồi Enter:

```text
TEST ON
PRIME 1 10000
SHOW
STOP
TEST OFF
EXIT
```

Không gõ PRIME vào PowerShell trước khi mở phiên `device:test`. Mở van tương ứng trước khi mồi vì firmware chưa điều khiển van. ESC hoặc EXIT sẽ thử gửi STOP và TEST OFF trước khi đóng cổng; mất USB hoặc đóng cưỡng bức terminal không đảm bảo gửi được lệnh dừng. Một số board reset khi mở cổng: chờ khởi động xong rồi gửi TEST ON. Script không tự nạp firmware và không tự bật bơm khi mở kết nối.

Kiểm tra công cụ terminal: `-List` chỉ liệt kê COM, không mở cổng hoặc bật bơm; thử cổng sai cần báo lỗi; khi chạy trên ESP, kiểm tra SHOW nhận phản hồi và EXIT tắt test. Khi cổng bị Serial Monitor chiếm, đóng Serial Monitor rồi kết nối lại.


## Test qua Wi-Fi từ terminal (không cắm USB sau khi nạp)

Phần cứng hiện tại **chưa gắn van**; lệnh chỉ điều khiển bơm. Giữ đường ra thông, hứng nước khi mồi. Không yêu cầu mạch van PCF8575 để dùng tính năng này.

Nạp bản firmware mới có đăng ký topic `scentstation/<serial>/test/command` một lần. ESP kết nối Wi-Fi và broker đang chạy trên máy tính, lấy NTP được và khởi tạo LittleFS/NVS thành công. Sau đó cấp nguồn riêng cho ESP; không cần USB. Laptop phải kết nối được cùng broker với ESP. Test tại LAN không cần đưa lên cloud.

Ở thư mục gốc dự án, gửi từng lệnh từ PowerShell:

```text
npm run device:test:wifi -- --serial M001 "TEST ON"
npm run device:test:wifi -- --serial M001 "SET 1 500"
npm run device:test:wifi -- --serial M001 "RUN 1"
npm run device:test:wifi -- --serial M001 "PRIME 1 10000"
npm run device:test:wifi -- --serial M001 "SHOW"
npm run device:test:wifi -- --serial M001 "STOP"
npm run device:test:wifi -- --serial M001 "TEST OFF"
```

Dùng MQTT_URL của môi trường backend; có thể truyền `--broker mqtt://localhost:1883` nếu broker chạy trên chính laptop. Địa chỉ localhost này dành cho công cụ trên laptop, không phải MQTT_HOST của ESP. ESP vẫn dùng IP LAN laptop, hiện đang cấu hình 192.168.2.10; cần kiểm tra lại nếu mạng thay đổi.

Mặc định công cụ ký Ed25519 bằng DISPENSE_SIGNING_KEY, ESP kiểm bằng COMMAND_PUBLIC_KEY_HEX. Nếu đang dùng môi trường dev không có khóa ký, thêm `--dev-unsigned` vào mỗi lệnh **chỉ khi firmware đã bật DEV_ALLOW_UNSIGNED_COMMANDS=true**. Không tự đổi hoặc tắt xác thực trong công cụ. Không dùng broker công cộng/ẩn danh ngoài mạng thử nghiệm tin cậy.

Mỗi lệnh có mã riêng, hạn 20 giây, không retained; ESP kiểm chữ ký, mã máy, hạn lệnh và lưu token chống chạy trùng. Công cụ chỉ báo thành công khi nhận phản hồi đúng mã lệnh từ ESP, không coi việc broker nhận bản tin là đã chạy bơm. `accepted=true` xác nhận tiếp nhận lệnh, không xác nhận đã mồi xong hay nước thực sự ra. Không tự gửi lại PRIME/RUN nếu timeout: kiểm tra máy bằng SHOW trước.

Chỉ thăm dò mạng giữa các nhịp, không thực hiện thao tác MQTT có thể chặn khi bơm đang bật. Vì thế STOP qua Wi-Fi **không phải nút dừng khẩn cấp tức thời**: thường phải chờ hết nhịp đang chạy (mồi tối đa 2 giây/nhịp; RUN tối đa 3499 ms), cộng độ trễ mạng. Phiên Wi-Fi tự thoát sau 120 giây không có lệnh hợp lệ, hoặc khi phát hiện mất kết nối Wi-Fi/MQTT; không tự tiếp tục mồi sau kết nối lại. Sau thời gian tự thoát, gửi TEST ON lại. Tính năng chạy đồng thời 5 bơm chưa được triển khai.

### Kiểm tra Wi-Fi trên thiết bị

- SHOW phải trả đúng M001 và thời gian từng slot; sai mã máy/khóa ký/hết hạn/retained không được chạy tải.
- TEST ON bị từ chối khi đang chờ khách hoặc đang chạy đơn khách.
- RUN 1 sau SET 1 500 chạy riêng bơm 1; PRIME 1 2500 chia nhịp 2000 + 500 ms.
- STOP ở giữa nhịp phải hủy phần mồi còn lại khi ESP xử lý được lệnh; không đổi sang bơm khác.
- Gửi lại cùng một payload/token không được kích hoạt thêm lần nữa.
- Ngắt Wi-Fi/MQTT giữa lần mồi phải hủy lịch còn lại khi phát hiện lỗi; nối lại không tự chạy.
- Chờ 120 giây không gửi lệnh: test tắt; kiểm tra luồng đơn khách vẫn nhấn một lần xịt một lần.


### Tách luồng khách và bảo trì

Khi test OFF, vòng xử lý khách giữ thứ tự: kiểm tra hết thời gian chờ → đọc nút → MQTT → cấu hình → lệnh đơn hàng. Lệnh đơn khách được xét trước yêu cầu bật test trong cùng vòng lặp. Test chỉ bật khi trạng thái IDLE, không đang chờ khách nhấn, không đang xịt và đã hết khoảng nghỉ. Nhấn nút trong chế độ thường vẫn cần đơn đã được backend cấp quyền và đèn đúng slot; mỗi quyền chỉ chạy một lần.

Slot và thời điểm chạy bơm test dùng biến riêng, không ghi đè slot/thời điểm của đơn khách. SET/PRIME không đổi thời gian khách 2000 ms. Lệnh khách nhận trong lúc test bị bỏ qua, không giữ lại để thực thi sau khi thoát test. Các lệnh bảo trì không tạo ACK/RESULT của đơn hàng. Khởi động luôn test OFF, mồi OFF và ghi mức tắt cho cả 5 bơm; firmware không tự gọi RUN/PRIME hay bật bơm 5 trong setup. Đây là hành vi phần mềm; vẫn phải kiểm tra trạng thái đầu ra trên phần cứng lúc cấp nguồn/reset.

Rào chắn mã nguồn nằm ở tests/unit/firmware-maintenance-guards.test.ts; các kiểm tra này không chứng minh được trạng thái điện của chân GPIO hoặc mạch MOSFET thực tế.
