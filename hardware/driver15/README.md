# Bo điều khiển 15 tải cho ScentStation

Trạng thái: thiết kế nguyên lý dự thảo ngày 15/10/2026, chưa đủ điều kiện xuất Gerber để sản xuất. Không thay đổi firmware đã thử ổn định; Report 3 đang tạm dừng theo yêu cầu.

## Dữ liệu đã xác nhận

| Hạng mục | Dữ liệu | Nguồn |
|---|---|---|
| Kiểu bo | MOSFET tích hợp, không dùng lại module MOSFET rời | Người dùng xác nhận |
| Tải | 5 bơm, 5 van, 5 đèn nút | Người dùng xác nhận |
| Bơm | DP-521, DC 12 V, dòng công bố 2 A, áp suất tối đa 0,48 MPa | Chữ trên ảnh sản phẩm người dùng gửi; chưa có datasheet nhà sản xuất |
| Nguồn | DC 12 V | Người dùng xác nhận; ảnh nguồn ghi S-120-12, cần đối chiếu nhãn thực tế để chốt dòng |
| Cầu chì | 5 A | Người dùng xác nhận; chưa biết loại nhanh/chậm, khả năng cắt và kích thước |
| Nút có đèn | Thân 16 mm; nhấn nhả, không giữ trạng thái; 5 chân: 2 LED và COM/NO/NC; LED 12–24 VDC | Ảnh thông số người dùng gửi; chưa có dòng LED |
| Van đã chọn | 2W025-08, DN08, ren G1/4, DC 12 V, 6 W; cút nối ống 8 mm; mô tả dòng sản phẩm là thường đóng | Ảnh thông số mới và lựa chọn mua người dùng gửi; dòng tính từ nhãn 6 W / 12 V = 0,5 A |
| ESP | ESP32 38 chân, ảnh module ESP32-WROOM-32D | Người dùng xác nhận và ảnh; khoảng cách hai hàng chân chưa đo |
| Diode đang có | 1N5819 Schottky, 1 A; datasheet Vishay: VRRM 40 V, DO-41 | Người dùng xác nhận mã; cần đối chiếu hãng linh kiện thực |
| Điện trở | Ảnh minh họa lặp lại | Không dùng ảnh để xác định giá trị điện trở thực mua |

## Ngân sách dòng điện

Một bơm theo dòng công bố: 12 V × 2 A = 24 W. Năm bơm cùng chạy: 10 A, 120 W, chưa tính van, đèn và mạch điều khiển. Cầu chì tổng 5 A không phục vụ chế độ đó. Nhãn 2 A cũng chưa xác định được dòng khởi động, dòng kẹt rotor hoặc dòng khi đầu bơm bị chặn.

Chế độ dự kiến là một cụm bơm + van hoạt động tại một thời điểm. Dòng qua cầu chì khi đó là dòng bơm thực tế + dòng van đang mở + tổng dòng đèn đang sáng + dòng vào bộ hạ áp. Phải đo cả xung khởi động trước khi chốt nguồn, cầu chì, đầu nối và đường đồng. Không tăng cầu chì đơn thuần để khắc phục sụt nguồn. Mạch phải chịu và bảo vệ được lỗi nhiều kênh cùng bật, không dựa riêng vào giới hạn một bơm trong firmware.

Ảnh van bổ sung xác nhận công suất 6 W tại DC 12 V: dòng danh định tính toán 0,5 A/van. Một bơm 2 A và một van 0,5 A tương ứng khoảng 2,5 A, 30 W, chưa tính đèn, nguồn logic và xung khởi động bơm. Năm cặp bơm/van cùng chạy tương ứng 12,5 A, 150 W trước các tải phụ; không phù hợp cầu chì tổng 5 A. Đây là tính toán từ thông số công bố, chưa phải phép đo tải. Van có thể duy trì mở lâu hơn bơm nên cần xét nhiệt liên tục của kênh van, không lấy chu kỳ bơm 500 ms làm chu kỳ van.

## Kiến trúc nguyên lý đề xuất

**Đã giải quyết khác biệt điện áp:** ảnh lựa chọn xác nhận DC 12 V và ống 8 mm; ảnh thông số bổ sung ghi 2W025-08, 6 W. Đoạn mô tả 220 V trước đó thuộc bài bán nhiều biến thể, không dùng làm điện áp cho van đã chọn. Tiếp tục kiến trúc bo tải 12 VDC. Vẫn cần kiểm tra phân cực hoặc diode có sẵn, yêu cầu thời gian nhả và nhãn sản phẩm thực để chốt bảo vệ. Ren G1/4/DN08 là thông số thân van; ống 8 mm là cút lắp ngoài, không phải bề rộng lỗ PCB.

12 V đi qua bảo vệ/cầu chì đến bus tải. Mỗi tải có đầu nối riêng: cực dương về bus 12 V được bảo vệ; cực âm về Drain MOSFET N; Source về mass công suất. Mass logic và mass công suất có tham chiếu chung nhưng đường hồi bơm không chạy qua ESP. Mỗi bơm và van có mạch dập xung đặt gần vòng dòng chuyển mạch; loại diode/clamp cần kiểm tra dòng, năng lượng và thời gian nhả van.

Diode 1N5819 đang có được đề xuất cho từng cuộn van 12 V, dòng danh định tính toán 0,5 A, với điều kiện kiểm tra nhiệt, xung lặp và thời gian nhả. Khi dùng diode flyback song song tải DC: cathode đầu có vạch về +12 V, anode về đầu âm tải/Drain; diode bị phân cực ngược khi tải được cấp điện. Diode thông thường có thể kéo dài thời gian nhả van, cần kiểm tra ảnh hưởng đến liều. Không chốt 1N5819 cho bơm 2 A chỉ dựa vào định mức xung đơn: cần diode có đường đặc tính dòng xung lặp/nhiệt đáp ứng dòng tại lúc ngắt và dòng khởi động/kẹt thực tế. Không dùng 1N5819 nối tiếp bus tổng 5 A và không mặc định mắc song song nhiều diode để tăng dòng.

Đề xuất dùng AOD4184A TO-252/DPAK với tầng đệm SN74AHCT541 cấp 5 V. AOD4184A có RDS(on) tối đa 9,5 mΩ tại VGS=4,5 V; datasheet không đảm bảo thông số đó ở 3,3 V. Vì vậy không lấy điện áp ngưỡng VGS(th) làm bằng chứng MOSFET mở đủ khi nối trực tiếp GPIO. Với 2 A và 9,5 mΩ, tổn hao dẫn tham khảo ở điều kiện datasheet là 0,038 W, chưa tính tăng nhiệt, chuyển mạch và dòng khởi động. Không dùng dòng 50 A trên datasheet làm định mức của PCB.

Hai SN74AHCT541 cung cấp tối đa 16 đường đệm; ngõ OE giữ trạng thái vô hiệu bằng điện trở khi khởi động, ngõ Gate mỗi MOSFET có điện trở kéo xuống riêng. Đường enable của ESP cần tầng kéo xuống/chuyển mức thích hợp để không đưa 5 V vào GPIO. Giá trị điện trở Gate, mạng bảo vệ và trình tự cấp nguồn chưa chốt trước kiểm tra thời gian chuyển mạch.

Giữ 10 GPIO bơm/đèn đã test. Đề xuất thêm MCP23017 cấp 3,3 V qua I2C GPIO16/17 cho 5 van; tín hiệu van cũng qua tầng đệm. Đây là phương án cần kiểm tra nguồn chính thức của linh kiện và triển khai firmware riêng, chưa phải chân van hiện có trong code. Đường enable phần cứng phải tắt được tải kể cả khi bus I2C treo. ESP38 chân không còn nghĩa mọi GPIO đều dùng được: tránh chân flash, chân chỉ-input và các chân strap trong phương án bố trí mới.

Nguồn logic cần bộ hạ áp 12 V → 5 V được chọn và kiểm tra riêng, không cấp 12 V trực tiếp vào ESP. Chưa chốt bộ hạ áp tích hợp hay module; cần tránh cấp ngược giữa USB và nguồn 5 V ngoài. Chưa tạo footprint ESP từ ảnh vì chưa đo khoảng cách hàng chân và vị trí USB/antenna.

## Chân đang giữ lại từ bản máy đã test

| Cụm | Bơm | Đèn | Nút NO |
|---|---|---|---|
| 1 | GPIO25 | GPIO26 | GPIO27 |
| 2 | GPIO18 | GPIO23 | GPIO34 |
| 3 | GPIO19 | GPIO32 | GPIO35 |
| 4 | GPIO21 | GPIO33 | GPIO36 |
| 5 | GPIO22 | GPIO13 | GPIO39 |

Nút COM về GND; mỗi nút kéo lên 3V3 bằng 10 kΩ, đặc biệt GPIO34/35/36/39 không có pull-up nội. Không đưa nguồn đèn 12 V vào chân tiếp điểm hoặc GPIO.

Theo ảnh thông số mới, LED dùng 12–24 VDC nên nhánh đèn của bo có thể dùng nguồn 12 V. Dòng 3 A tại 36 V là định mức tiếp điểm, không phải dòng LED; không lấy 3 A để tính công suất mỗi đèn. Đèn LED+ nối bus 12 V được bảo vệ, LED− nối Drain kênh MOSFET đèn; cực Source về GND công suất. Phần tiếp điểm riêng: COM về GND tín hiệu, NO về GPIO nút, NC để trống. Cần xác định chính xác chân LED+/LED− trên mẫu thực tế trước khi đấu; mô tả 5 chân chưa cho biết vị trí vật lý. Không tự bỏ hoặc thêm điện trở hạn dòng dựa trên hình: cần xác nhận cấu tạo nhánh LED 12–24 V và dòng tại 12 V. Kích thước thân 16 mm không thay thế bản vẽ lỗ lắp/cốt ren để gia công mica.

## Dữ liệu còn cần để chốt

1. Phân cực/diode sẵn, yêu cầu thời gian nhả và xác nhận nhãn van thực tế. Model 2W025-08, DC 12 V, 6 W, dòng tính 0,5 A và cút ống 8 mm đã có trong ảnh thông số; không cần hỏi lại công suất danh định.
2. Dòng LED tại 12 V và vị trí chân LED+/LED− trên mẫu thật; điện áp LED đã xác nhận 12–24 VDC, tiếp điểm COM/NO/NC tách riêng.
3. Dòng định mức nguồn trên nhãn thực tế và đo dòng khởi động từng bơm dưới tải thực.
4. Chế độ van: mở trước bơm bao lâu, đóng sau bao lâu; chỉ một van mở hay nhiều van cùng mở.
5. Kích thước bo, vị trí lỗ bắt, loại đầu nối và tiết diện dây; khoảng cách hai hàng chân ESP đo bằng thước/cặp.

## Điều kiện trước khi gửi đặt in

Chốt sơ đồ và BOM theo dữ liệu trên; kiểm ERC; layout theo dòng và nhiệt thực; kiểm DRC và kết nối ngược từ layout; kiểm kích thước footprint/đầu nối; xuất đủ đồng, solder mask, silkscreen, outline và drill; mở lại bộ Gerber/drill trong viewer; chốt báo giá, số lượng và địa chỉ nhận. Hiện chưa có file Gerber, chưa đặt hàng hoặc phát sinh chi phí.

Nguồn linh kiện đã tra: [AOD4184A datasheet AOS](https://www.aosmd.com/res/data_sheets/AOD4184A.pdf), [SN74AHCT541 datasheet TI](https://www.ti.com/lit/ds/symlink/sn74ahct541.pdf). Thông số bơm và nguồn từ ảnh bán hàng cần xác nhận trên phần cứng thực.

Nguồn diode: [1N5819 Vishay datasheet](https://www.vishay.com/docs/88525/1n5817.pdf). Định mức 1 A là dòng chỉnh lưu trung bình theo điều kiện datasheet, không phải bảo đảm cho mọi xung dập tải cảm.
