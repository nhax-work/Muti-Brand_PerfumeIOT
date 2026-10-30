# ScentStation Rev A — bản thử nghiệm kỹ thuật

Thiết kế theo yêu cầu ngày 19/10/2026, không dùng load cell. Đây là bộ thiết kế để tiếp tục rà soát và làm prototype sau khi xác nhận linh kiện/kích thước; chưa được xác nhận trên phần cứng thực. Trạng thái kiểm tra tự động được ghi riêng trong `KIEM_TRA.json`; không suy ra đã an toàn hoặc sản xuất được chỉ từ việc có Gerber.

## Những phần đã thiết kế

Bo dự kiến 240 × 190 mm, dày 1,6 mm, đồng hai mặt 70 µm mỗi mặt (2 oz), FR4. Thông số lớp được lưu trong PCB và Gerber job. 15 MOSFET AOD4184A: 5 bơm DP-521, 5 van 2W025-08 12 V/6 W, 5 đèn nút 12 V. Nút nhấn dùng tiếp điểm riêng. 10 diode SB560 5 A/60 V là lựa chọn cho prototype, cần đo dòng ngắt, xung lặp, nhiệt và thời gian đóng van. Không lấy dòng 5 A danh định làm bảo đảm cho mọi dạng xung.

ESP32 cắm trực tiếp qua hai socket 1×19, pitch 2,54 mm, khoảng cách hai hàng tạm 27,5 mm. Pinout tạm theo ESP32-DevKitC V4 của Espressif. Phải đối chiếu từng chân và đo board đang có; ảnh module ESP32-WROOM-32D không đủ xác nhận pinout của carrier. Hướng trên sơ đồ PCB: đầu antenna ở phía cạnh trên bo, đầu USB ở phía dưới cụm socket. Antenna có vùng cấm đồng; kích thước vùng này vẫn phải đối chiếu board thật.

PCF8575 dùng module rời nối dây vào carrier, không dùng footprint cắm module suy từ ảnh. Sáu ngõ PCF qua SN74AHCT04N đảo mức trước tầng đệm SN74AHCT541N. Các IC DIP dùng socket tùy chọn để dễ thay. Điện trở/tụ nhỏ dùng 0805; MOSFET DPAK hàn trực tiếp, không dùng lại module MOSFET rời.

## Nguồn và đầu nối

- J12: chân 1 = +12 V; chân 2 = GND. Bắt buộc có cầu chì DC bên ngoài phía trước đầu vào; 5 A đang có là ứng viên cần kiểm tra đặc tính thời gian/dòng khởi động. Bo này chưa có mạch chống ngược cực chủ động.
- JBUCKIN1: chân 1 = +12 V đã qua cầu chì; chân 2 = GND, cấp cho module hạ áp bên ngoài. Buck không được cắm vào footprint đoán kích thước.
- J5: nhận đầu ra buck đã chỉnh và đo đúng 5 V: chân 1 = +5V_EXT; chân 2 = GND. Chọn buck đủ dòng ESP và logic, kiểm tra đáp ứng xung và nhiệt. Không nối 12 V vào J5.
- JP5: jumper nối +5V_EXT vào rail 5 V logic/ESP. Tháo JP5 trước khi cấp ESP qua USB. Không coi board hiện tại có bảo vệ cấp ngược USB.
- Tụ nguồn 12 V: 1000 µF/35 V, footprint radial đường kính 12,5 mm, pitch 5 mm; phải mua tụ khớp footprint và kiểm tra chiều cao vỏ. TVS SMBJ15A là ứng viên, chưa đo phối hợp bảo vệ/nguồn.
- Tụ nguồn 5 V: 470 µF/10 V, footprint radial đường kính 8 mm, pitch 3,5 mm. Không thay bằng tụ khác kích thước mà giữ PCB.
- Mọi đầu bơm/van/đèn: chân 1 = +12 V; chân 2 = cực âm được MOSFET đóng/ngắt. Không nối chân 2 về GND trực tiếp.
- Đầu tải theo footprint Phoenix Contact MSTBVA 2,5/2-G-5,08, pitch 5,08 mm, cần đầu cắm ghép tương ứng. Không mặc định domino xanh bất kỳ lắp vừa footprint này.
- Đầu nút: chân 1 = COM/GND; chân 2 = NO/GPIO. NC không nối. Hai dây LED nối sang đầu LIGHT tương ứng, không nối vào đầu BUTTON.

Các đường công suất đã được bố trí rộng hơn tín hiệu, nhưng chưa có phép đo tăng nhiệt hoặc xác nhận dòng định mức của cả bo. Thiết kế dự kiến một bơm/van hoạt động cùng lúc. Năm cặp theo thông số công bố khoảng 12,5 A trước phụ tải, vượt cấu hình nguồn/cầu chì 5 A; không vận hành ở chế độ đó. Không lấy bề rộng đường đồng làm bằng chứng độc lập về khả năng chịu dòng; còn phụ thuộc độ dày đồng, nhiệt, vias, đầu nối và xung khởi động.

## JPCF1 — dây sang module PCF8575

| Chân carrier | Tín hiệu | Điểm nối module |
|---|---|---|
| 1 | 3V3 | Rail logic PCF ở chế độ 3,3 V đã xác minh |
| 2 | GND | GND |
| 3 | GPIO16/SDA | SDA tương thích 3,3 V |
| 4 | GPIO17/SCL | SCL tương thích 3,3 V |
| 5 | PCF_P00 | P00, van 1 |
| 6 | PCF_P01 | P01, van 2 |
| 7 | PCF_P02 | P02, van 3 |
| 8 | PCF_P03 | P03, van 4 |
| 9 | PCF_P04 | P04, van 5 |
| 10 | PCF_P05 | P05, cho phép tải |

Ảnh module có cả chữ VCC và VDD cùng linh kiện nguồn; không được coi hai nhãn này mặc định là cùng điểm điện. Trước khi nối, phải xác minh sơ đồ/đo thông mạch jumper VCC–VDD, điện áp thực tại chân cấp nguồn IC và điện áp kéo lên SDA/SCL. Phương án carrier này chỉ hỗ trợ module đã cấu hình cả logic và bus ở 3,3 V. Nếu module có LDO và chuyển mức, cần thiết lập chế độ bypass 3,3 V đúng theo module; không cấp 3,3 V vào đầu vào LDO rồi mặc định đầu ra vẫn đủ 3,3 V. Không cấp 5 V cho bus nối trực tiếp ESP. Chưa xác minh điều này từ ảnh, vì vậy đây là một điều kiện kiểm tra trước khi cấp điện.

A0/A1/A2 cấu hình trên module; địa chỉ 7-bit 0x20 chỉ đúng khi cả ba thấp và đúng phiên bản PCF8575. Đọc địa chỉ trước khi arm tải. Điện trở kéo lên 4,7 kΩ trên carrier có thể bỏ lắp nếu module đã có pull-up tương đương sau khi tính điện trở tổng và đo cạnh xung.

## GPIO và kênh

| Slot | Bơm | Đèn | Nút | Van qua PCF |
|---|---|---|---|---|
| 1 | GPIO25 | GPIO26 | GPIO27 | P00 |
| 2 | GPIO18 | GPIO23 | GPIO34 | P01 |
| 3 | GPIO19 | GPIO32 | GPIO35 | P02 |
| 4 | GPIO21 | GPIO33 | GPIO36 | P03 |
| 5 | GPIO22 | GPIO13 | GPIO39 | P04 |

GPIO14 = RUN_REQUEST, mặc định kéo thấp. GPIO4 = xung heartbeat phần mềm cho mạch giám sát độc lập CD74HC123E. P05 qua cổng đảo = EXP_READY. Các ngõ tải chỉ được phép chạy khi cả RUN_REQUEST, EXP_READY và WD_OK đều cao và vòng tiếp điểm JSTOP1 đang đóng.

## Khóa tải và giám sát

Hai chân /OE trên mỗi AHCT541 chung OE_N, kéo lên 5 V để tắt buffer. Ba transistor 2N3904 nối tiếp chỉ kéo OE_N thấp khi ba điều kiện cho phép đều đúng. Mỗi Gate MOSFET kéo xuống riêng 100 kΩ; khi buffer vô hiệu, Gate xả về GND. Điện trở Gate nối tiếp 1 kΩ giới hạn dòng xung từ buffer; 100 kΩ kéo xuống giảm sụt áp tĩnh của mạng chia áp xuống khoảng 1% thay vì khoảng 9% với 10 kΩ. Cần đo VGS khi bật đạt ít nhất 4,5 V trong điều kiện xấu nhất, đo thời gian xả Gate và nhiễu lúc reset; buck 5 V phải được điều chỉnh và kiểm tra ổn định. Chưa có phép đo này nên chưa chốt được tổn hao/nhiệt của MOSFET.

CD74HC123E được cấp 3,3 V, /1A thấp, 1B nhận GPIO4, /1CLR nhận ESP_EN. Ngõ Q1 chân 13 tạo WD_OK; chân 4 là ngõ đảo, không dùng thay Q1. R=470 kΩ và C=1 µF là ứng viên; công thức 0,45RC của datasheet nêu ở 5 V, không bảo đảm thời gian cắt tại 3,3 V. Phải đo timeout trong dải nguồn/nhiệt và chọn nhịp heartbeat có dự phòng. Thử xung mỗi khoảng 10 ms là điểm bắt đầu cho bench test, chưa phải thông số đã xác nhận.

Heartbeat phải phản ánh vòng lặp điều khiển đang tiến triển; không tự phát xung bằng phần cứng/timer vẫn chạy khi phần mềm đã treo. Đây là mạch phát hiện mất xung, không phát hiện mọi lỗi phần mềm, MOSFET chập hoặc tín hiệu xung bị phát sai.

JSTOP1 là đầu vào vòng tiếp điểm thường đóng nối WD_OK tới tầng enable. Nó chỉ ngắt tín hiệu điều khiển, không ngắt vật lý nguồn 12 V. Không gọi JSTOP1 là bộ dừng khẩn đã đạt chuẩn; nếu cần ngắt năng lượng ngay cả khi MOSFET chập phải bổ sung phần tử ngắt nguồn DC độc lập có định mức phù hợp.

## Firmware phải thay đổi trước khi dùng bo

Firmware hiện tại trong thư mục Arduino chưa được sửa cho Rev A và không chạy nguyên trạng trên bo này.

1. Giữ GPIO14 thấp từ khởi động; đặt tất cả ngõ bơm/đèn thấp, GPIO4 thấp.
2. Khởi tạo I²C tại SDA16/SCL17. Đặt PCF toàn bit 1 bằng hai byte FF FF; van đóng, EXP_READY thấp sau tầng đảo. Khi chỉ ESP reset, PCF có thể giữ giá trị cũ nên bắt buộc ghi lại.
3. Khởi động heartbeat khi vòng điều khiển ổn định, kiểm tra cấu hình và I²C. Ghi FFDF (P05=0, P00..04=1) rồi đưa GPIO14 cao. Đây là mask 16-bit, gửi byte thấp trước.
4. Mở van i bằng xóa bit i-1 trong shadow FFDF; giữ nguyên bit còn lại. Mở van → chờ thời gian đo thực → bật bơm → dừng bơm → chờ thời gian đo thực → đóng van. Không suy liều từ thời gian mà chưa hiệu chuẩn.
5. Lỗi bus, timeout hoặc trạng thái bất hợp lệ: hạ GPIO14 trực tiếp trước, không chờ giao dịch I²C. Dừng heartbeat nếu không thể xác nhận vòng điều khiển còn khỏe.
6. Kiểm tra reset ESP giữa chu kỳ, rút I²C, mất nguồn logic, giữ nút khi boot, mất heartbeat và hở vòng JSTOP1 với tải thử trước khi thử bơm.

## Nguồn thiết kế

Các reference được chuẩn hóa để KiCad kiểm ERC: JESP_L → JESPL1; JESP_R → JESPR1; JBUCK_IN → JBUCKIN1; JPCF → JPCF1; JSTOP → JSTOP1. Bảng `pin-net.csv` và `BOM.csv` dùng tên cuối cùng trên silkscreen.

Mở `scentstation-rev-a.kicad_pro` bằng KiCad 9 để sửa. PCB và schematic nhúng dữ liệu cần thiết; `RevA.kicad_sym` và các bảng thư viện đi kèm phục vụ kiểm tra/đổi symbol. Schematic dùng symbol dạng khối và nhãn net cho từng chân; GPIO của socket ESP được mô hình hóa như đầu nối, không mô phỏng toàn bộ mạch bên trong ESP. ERC không chứng minh thiết bị thực khớp model.

Các script trong repo nằm tại `hardware/driver15/`, dữ liệu đầu ra ở `hardware/driver15/rev-a/`, công cụ tải riêng ở `.tools/` đã được bỏ theo dõi Git. Bản ZIP đầy đủ kèm script tham khảo trong `scripts/`; không chạy trực tiếp trong ZIP. Để tái tạo theo script cần giữ cấu trúc repo, Python của KiCad 9.0.9, Freerouting 2.5.0, Java 25 và thư viện Python dùng cho kiểm tra; hoặc chỉnh trực tiếp trong KiCad và xuất lại. Chạy build/route/finalize sẽ ghi đè bản thiết kế đầu ra, nên lưu bản sao trước khi sửa.

Mẫu `mau-do-socket-ESP-1-1.svg` dùng in giấy ở Actual size/100%; kiểm tra thanh thước 50 mm sau khi in. Mẫu không xác nhận kích thước board, chỉ giúp đối chiếu giả định 27,5 mm trước khi sửa PCB.

- ESP pinout: https://docs.espressif.com/projects/esp-idf/en/v5.3.1/esp32/hw-reference/esp32/get-started-devkitc.html
- MOSFET: https://www.aosmd.com/res/data_sheets/AOD4184A.pdf
- Buffer: https://www.ti.com/product/SN74AHCT541
- Inverter: https://www.ti.com/product/SN74AHCT04
- Expander: https://www.ti.com/product/PCF8575
- Missing-pulse detector: https://www.ti.com/lit/ds/symlink/cd74hc123.pdf
- Footprints: thư viện KiCad 9.0.9 chính thức, nhúng trực tiếp vào PCB; cần đối chiếu mã/package của linh kiện mua thực tế.
