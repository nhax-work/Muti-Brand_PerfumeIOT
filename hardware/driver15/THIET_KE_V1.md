# Bo ScentStation V1 — không dùng load cell

Ngày: 19/10/2026. Trạng thái: thiết kế chức năng và kết nối nguyên lý để rà soát; chưa phải PCB đã đi dây hoặc bộ Gerber sản xuất. Sơ đồ xem nhanh: `so-do-v1.svg`. Danh sách kênh: `kenh-v1.csv`.

## Phương án

Một bo mang ESP32-WROOM-32D bản 38 chân, 15 MOSFET tích hợp cho 5 bơm + 5 van + 5 đèn; 5 đầu nối tiếp điểm nút. Không có HX711 hoặc load cell. Giữ nguyên 15 GPIO của firmware hiện tại. Dùng PCF8575 cấp 3,3 V theo lựa chọn người dùng để thêm van và tín hiệu cho phép tải. Bổ sung U5 SN74AHCT04 cấp 5 V để đảo sáu tín hiệu active-LOW từ PCF8575 trước tầng driver/enable. Giữ nguyên chân bơm, nút và đèn đang chạy; không chuyển đèn sang IC mở rộng trong phương án này.

Mỗi lần chỉ chạy một cụm bơm/van. Đây là chế độ vận hành, không phải bảo vệ điện khi xảy ra lỗi nhiều kênh cùng bật.

## Kết nối nguồn

J_PWR: chân 1 = +12V_IN, chân 2 = GND_PWR. Nguồn dương → F1 → khối chống ngược cực cần chọn → +12V_LOAD. Cầu chì 5 A đang có chỉ là ứng viên; cần đối chiếu dòng khởi động và khả năng cắt DC. Khối chống ngược cực và TVS chưa chốt mã/footprint; không nối tắt trên bản sản xuất.

Cbulk ứng viên 1000 µF/25 V đặt giữa +12V_LOAD và GND_PWR gần cụm tải; bổ sung tụ gốm tại nguồn driver. Giá trị/điện áp phải kiểm tra theo xung nguồn đo được. TVS phải phối hợp với điện áp chịu đựng của tụ, MOSFET và bộ hạ áp.

+12V_LOAD → bộ hạ áp 5 V → ESP32 qua đường 5 V của board đã xác minh; tuyệt đối không đưa 12 V vào ESP. Dùng nguồn 3V3 ổn áp của board cho PCF8575 nếu đủ ngân sách dòng. Có jumper ngắt nguồn 5 V ngoài khi cắm USB cho tới khi xác minh mạch chống cấp ngược của board; không cắm đồng thời hai nguồn 5 V chưa được cách ly.

GND logic và GND công suất cùng tham chiếu, nhưng đường hồi tải đi thẳng về đầu vào nguồn, không đi qua ESP hoặc đầu nối nút. Không tự chia cắt mặt phẳng GND làm mất đường hồi tín hiệu.

## ESP và IC mở rộng

| Tín hiệu | Chân |
|---|---|
| Bơm 1..5 | GPIO25,18,19,21,22 |
| Đèn 1..5 | GPIO26,23,32,33,13 |
| Nút NO 1..5 | GPIO27,34,35,36,39 |
| SDA PCF8575 | GPIO16 |
| SCL PCF8575 | GPIO17 |
| RUN_REQUEST (mặc định thấp) | GPIO14 |

PCF8575 U3: VCC=3V3; GND=GND; A0/A1/A2=GND (địa chỉ 7-bit 0x20 cho đúng PCF8575, xác minh mã thực tế); tụ 100 nF sát VCC. SDA/SCL mỗi đường kéo lên 3V3 bằng 4,7 kΩ ứng viên, kiểm tra điện dung bus. Nếu module có điện trở kéo lên sẵn, phải xác minh chúng nối về 3V3, không phải 5 V. INT để không nối. IC này không có chân RESET hoặc thanh ghi IODIR/OLAT như MCP23017.

P00..P04 → U5 cổng đảo 1..5 → VALVE1..5 → đầu vào AHCT541 tương ứng. P05 → U5 cổng đảo 6 → EXP_READY. P06/P07 và P10..P17 chưa dùng, luôn ghi 1. Mỗi đầu vào U5 nối từ PCF có kéo lên 3V3 bằng 10 kΩ ứng viên, không kéo xuống. U5 SN74AHCT04 cấp 5 V, tụ 100 nF sát VCC; đầu ra là tín hiệu 5 V, không đưa về ESP/PCF. Kiểm tra trình tự nguồn và trạng thái khi mất 3V3 trong khi 5 V còn tồn tại.

PCF8575 khởi động với các cổng HIGH; qua U5 thành LOW nên van và EXP_READY tắt khi nguồn ổn định. Quy ước phần mềm: bit 1 = van đóng, bit 0 = mở. Không dùng PCF8575 kéo Gate trực tiếp. Trạng thái khởi động HIGH không thay thế khóa OE khi nguồn đang lên hoặc khi ESP reset: PCF có thể giữ lệnh cũ nếu chỉ ESP reset. GPIO14 phải giữ OE vô hiệu cho tới khi đã ghi lại tất cả van đóng.

## Driver 15 kênh

U1/U2 = SN74AHCT541 cấp 5 V; mỗi IC có tụ 100 nF sát chân nguồn và tụ cục bộ 1 µF ứng viên. AHCT được chọn để nhận mức logic 3,3 V khi cấp 5 V; không tự thay bằng HC. Hai chân /OE của mỗi IC nối chung OE_N. Mỗi đầu vào dùng kéo xuống 47 kΩ ứng viên; đầu vào không sử dụng buộc GND, ngõ ra tương ứng để không nối.

| Driver | Đầu vào A1..A8 |
|---|---|
| U1 | Bơm1, Bơm2, Bơm3, Bơm4, Bơm5, Van1, Van2, Van3 |
| U2 | Van4, Van5, Đèn1, Đèn2, Đèn3, Đèn4, Đèn5, GND |

Mỗi ngõ Y → RG=1 kΩ ứng viên → Gate Q tương ứng. Gate → RPD=10 kΩ → Source/GND_PWR. Q1..15 = AOD4184A, Source=GND_PWR; Drain=âm đầu nối tải; dương đầu nối tải=+12V_LOAD. Điện trở Gate 1 kΩ ưu tiên giới hạn dòng xung từ buffer, cần đo cạnh chuyển mạch và nhiệt để chốt; không dùng thiết kế này cho PWM tần số cao trước khi kiểm tra.

Theo datasheet AOS, RDS(on) tối đa 9,5 mΩ được đảm bảo ở VGS=4,5 V, vì vậy dùng tầng đệm 5 V; không lấy VGS(th) làm điện áp mở đầy đủ. Footprint phải khớp đúng mã AOD4184A TO-252 và tab Drain theo datasheet.

## Cho phép tải và dừng khẩn

OE_N kéo lên +5V bằng 10 kΩ. Hai transistor NPN nối tiếp chỉ kéo OE_N xuống khi đồng thời RUN_REQUEST và EXP_READY ở mức cao: collector QEN1=OE_N; emitter QEN1=collector QEN2; emitter QEN2=GND. Base mỗi transistor nhận tín hiệu qua 10 kΩ và kéo xuống GND qua 100 kΩ (giá trị ứng viên). Cấu trúc này tránh nối đường OE kéo lên 5 V trực tiếp vào GPIO. Cần kiểm tra dòng rò/trình tự nguồn và ngưỡng OE ở mọi trạng thái nguồn.

RUN_REQUEST có kéo xuống 10 kΩ. Khi ESP reset, các buffer vô hiệu, Gate có kéo xuống riêng. Khi firmware phát hiện lỗi bus hoặc quá thời gian, hạ GPIO14 ngay, không chờ ghi I²C. Thiết kế hiện tại chưa có watchdog độc lập: nếu ESP treo với GPIO14 cao và EXP_READY còn cao, tải có thể tiếp tục bật. Trước sản xuất phải thêm mạch watchdog/giới hạn thời gian độc lập có thể vô hiệu OE, chọn mã và kiểm chứng bằng thử treo CPU. Không coi timer chạy trong ESP là bảo vệ khi toàn CPU treo.

J_STOP dành cho nút dừng khẩn điều khiển phần tử ngắt nguồn tải DC có định mức phù hợp, nằm trước bus +12V_LOAD. Chưa chọn relay/contactor hoặc công tắc DC, vì vậy chưa có chức năng dừng khẩn phần cứng hoàn chỉnh. Không cho dòng tổng tải đi qua tiếp điểm nút 16 mm khi chưa xác minh định mức.

## Đầu nối và bảo vệ tải

- J_P1..5, J_V1..5, J_L1..5: chân 1 = +12V_LOAD; chân 2 = Drain kênh tương ứng. In rõ dấu + và mã slot trên silkscreen.
- J_B1..5: chân 1 = GND; chân 2 = BUTTON_NO. COM nút → GND, NO → tín hiệu, NC không nối. Mỗi tín hiệu kéo lên 3V3 qua 10 kΩ. LED của nút chỉ nối J_L, không nối vào J_B.
- Mỗi bơm và van có diode song song cuộn/tải: cathode về +12V_LOAD, anode về Drain. Đặt sát đầu nối và vòng dòng công suất. Nếu tải đã có diode, xác minh phân cực trước khi nối.
- D1..5 cho bơm: chưa chốt mã, phải chịu dòng ngắt thực, xung lặp và nhiệt; không dùng mặc định 1N5819 1 A cho bơm công bố 2 A.
- D6..10 cho van: 1N5819 là ứng viên theo bản cũ, chưa duyệt sản xuất; kiểm tra nhiệt và thời gian nhả. Diode flyback có thể làm van đóng chậm, cần đo để hiệu chuẩn liều.
- Van 12 V/6 W tương ứng 0,5 A danh định. Một bơm công bố 2 A + một van ≈2,5 A chưa tính phụ tải và xung khởi động. Năm cặp ≈12,5 A, vượt cầu chì tổng 5 A đang có.

## Bố trí PCB đề xuất

Chưa đặt kích thước bo hoặc footprint socket ESP trước khi đo hai hàng chân thực tế. Dự kiến PCB hai lớp, khối nguồn/đầu nối tải ở một cạnh, MOSFET và diode gần tải, khối logic và nút ở vùng còn lại. Antenna ESP hướng ra ngoài mép carrier và giữ vùng cấm đồng/linh kiện theo datasheet module. Chọn độ dày đồng, bề rộng đường và đầu nối theo dòng khởi động đo được, nhiệt độ cho phép và điều kiện tản nhiệt; chưa gán bề rộng đường bằng một con số suy đoán.

## Firmware cần bổ sung

1. Khởi động GPIO14 thấp; đặt 10 ngõ ESP bơm/đèn thấp.
2. Giữ GPIO14 thấp; ghi đủ 2 byte 0xFF, 0xFF vào PCF8575 (nhóm P0 trước, nhóm P1 sau). Không có thao tác cấu hình hướng chân. Dùng shadow 16-bit để không ghi đè các bit khác; kiểm tra ACK và đọc trạng thái chân để phát hiện sai lệch logic, không coi đó là bằng chứng van đã chuyển cơ học.
3. Ghi shadow=0xFFDF: P05 thấp, qua U5 tạo EXP_READY cao; P00..P04 vẫn cao nên van đóng. Sau khi ghi thành công mới đưa RUN_REQUEST cao. Trạng thái đóng mọi van khi đã arm là 0xFFDF; mở van i (1..5) bằng cách xóa bit i-1, giữ các bit còn lại.
4. Được phép xịt: mở đúng van, chờ thời gian đã đo, chạy bơm; dừng bơm, chờ thời gian đã đo, đóng van. Không hard-code thời gian dẫn van khi chưa thử thực tế.
5. Lỗi I²C, hết thời gian hoặc trạng thái không hợp lệ: hạ GPIO14 trước, sau đó xử lý trạng thái và báo lỗi. Phải bổ sung kiểm thử reset giữa chu kỳ, lỗi bus và cấp nguồn lệch thứ tự.

Firmware hiện tại chưa thực hiện các bước trên; file này không thay đổi code đang nạp.

## Những việc còn phải làm để xuất PCB

Chọn khối bảo vệ nguồn, buck và watchdog; đo dòng khởi động bơm và dòng LED; xác nhận module ESP/socket; chốt kích thước bo, lỗ bắt và đầu nối. Sau đó nhập sơ đồ vào công cụ EDA, gán footprint, ERC, đi dây, DRC, kiểm tra kết nối và xuất Gerber/drill. Sơ đồ SVG là bản rà soát chức năng, không thay thế sơ đồ EDA có net điện.

Nguồn: https://www.aosmd.com/res/data_sheets/AOD4184A.pdf ; https://www.ti.com/product/SN74AHCT541 ; https://www.ti.com/product/PCF8575 ; https://www.ti.com/product/SN74AHCT04 ; https://documentation.espressif.com/esp32-wroom-32d_esp32-wroom-32u_datasheet_en.html
