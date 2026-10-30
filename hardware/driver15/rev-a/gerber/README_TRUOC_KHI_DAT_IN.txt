SCENTSTATION REV A — ENGINEERING SAMPLE — CHƯA DUYỆT SẢN XUẤT

Bo 240 x 190 mm; 2 lớp; FR4 1.6 mm; đồng 70 um / 2 oz mỗi mặt.
Các file khoan dùng mm và cùng gốc tuyệt đối với Gerber. PTH và NPTH tách riêng.
GTL/GBL: đồng; GTS/GBS: solder mask; GTO/GBO: silkscreen; GM1: outline.
Chỉ một outline kín. D356 là netlist kiểm điện, không phải lớp đồng.

Đã chạy KiCad 9.0.9: DRC 0 vi phạm, 0 kết nối thiếu; ERC 0 vi phạm.
Đã đối chiếu 381 chân có net giữa schematic, model và PCB.
Đã đọc lại 7 lớp Gerber và 308 lỗ PTH + 4 lỗ NPTH bằng Gerbonara.

CHƯA gửi đặt in trước khi kiểm tra socket ESP 27.5 mm đang giả định, pinout
ESP đang giả định theo DevKitC V4, package và đầu nối thực tế. Module PCF8575
có VCC/VDD: phải xác minh cấu hình logic và pull-up I2C ở 3.3 V.
Chưa đo dòng khởi động, nhiệt, VGS, xung tắt tải, timeout watchdog hoặc liều xịt.
Firmware Arduino hiện tại chưa hỗ trợ bo Rev A; cần sửa theo tài liệu đi kèm.
Cầu chì DC đầu vào và module buck 12 V -> 5 V nằm bên ngoài bo.

Kiểm tra tự động không thay thế kiểm chứng nguyên lý và thử nghiệm phần cứng.
Xem HUONG_DAN_REV_A.md trong bộ hồ sơ đầy đủ để biết mọi giả định và kết nối.
