# Bố trí PCB nháp — 19/10/2026

Người dùng cho phép làm nháp vì linh kiện có thể thay đổi. File `scentstation-draft.kicad_pcb` là bố trí sơ bộ chỉnh sửa được theo định dạng KiCad 8. File chưa được mở/kiểm chứng bằng KiCad trong môi trường này do chưa có công cụ EDA cài sẵn. Đã kiểm tra cấu trúc ngoặc, số lượng vị trí kênh và xem ảnh bố trí; chưa kiểm ERC/DRC.

## Giả định đang dùng

- Bo 180 × 140 mm, dày 1,6 mm, hai lớp đồng; kích thước tạm chọn, chưa đặt chiều dày đồng.
- ESP32 cắm trực tiếp qua hai socket 1×19, bước chân tạm 2,54 mm, tâm hai hàng 27,5 mm theo khoảng người dùng ước tính. Chưa gán số pad socket thành GPIO vì còn phải xác nhận chính xác board và chiều cắm. Vị trí, kích thước thân và vùng antenna đều chỉ để giữ chỗ.
- PCF8575 là module theo ảnh, dùng đầu nối dây 1×10 dự kiến: 3V3, GND, SDA, SCL, P00, P01, P02, P03, P04, P05. Đây là đầu dây tùy chỉnh trên carrier, không phải footprint cắm module hoặc thứ tự chân sẵn trên module. Có vùng giữ chỗ cho module; chưa chốt cách cố định cơ khí.
- Đầu tải tạm bước 5,08 mm; nút tạm bước 2,54 mm. Pad/khoan mẫu chưa khớp mã đầu nối cụ thể và chưa có kiểm tra dòng định mức.
- 15 vị trí MOSFET, 10 diode, 2 buffer, 1 inverter, vùng enable/watchdog và vùng nguồn mới là hình chữ nhật giữ chỗ, không có pad điện. Chưa bố trí điện trở, tụ và linh kiện phụ; phải bổ sung sau khi chọn package.
- Bốn lỗ cơ khí tạm đường kính 3,2 mm, tâm cách mép 4 mm.

## File

- `bo-tri-pcb-nhap.png`: ảnh xem bố cục; không phải ảnh mô phỏng bo đã hoàn thiện.
- `scentstation-draft.kicad_pcb`: board outline, lỗ cơ khí, pad header mẫu và vị trí giữ chỗ.
- `vi-tri-linh-kien.csv`: tọa độ tính bằng mm, gốc ở góc trên trái bo. Không phải file pick-and-place sản xuất.

Không có net điện, track đồng, via, copper pour hoặc Gerber trong bản này. Không gửi đặt in. Bản nháp dùng để đổi bố cục và thay linh kiện trước khi triển khai schematic/footprint thực.

Để tạo lại ảnh và file nháp: chạy `python -X utf8 hardware/driver15/tao_pcb_nhap.py` từ thư mục project. Thay các tham số và vị trí trong script trước khi tạo lại; chạy lại sẽ ghi đè các file sinh ra, vì vậy nếu sửa thủ công trong KiCad hãy lưu thành tên riêng.
