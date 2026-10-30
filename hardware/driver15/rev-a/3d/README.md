# Hình 3D lắp linh kiện — Rev A

Ảnh được render bằng KiCad từ bản sao PCB Rev A và mô hình linh kiện KiCad. Không thay đổi PCB hoặc Gerber gốc.

ESP32 được thêm để minh họa trạng thái cắm vào socket: carrier, USB và linh kiện nhỏ trên carrier là mô hình gần đúng; package ESP32-WROOM dùng model thư viện KiCad. Khoảng cách socket 27,5 mm, bề rộng, chiều dài carrier và chiều cao lắp chưa được đối chiếu board thực. Không dùng ảnh này để kết luận đã kiểm tra va chạm cơ khí.

Module PCF8575 và buck 12V→5V nối ngoài bo qua JPCF1/JBUCKIN1/J5 nên không được vẽ như linh kiện gắn trực tiếp lên carrier. Đầu nối Phoenix trên bo mới gồm header PCB; đầu cắm dây ghép rời và dây không được mô phỏng.

File `scentstation-assembly-preview.kicad_pcb` chỉ dành cho 3D Viewer; không xuất Gerber từ bản này. Thư mục `models/` và file WRL đi kèm cần được giữ cùng thư mục để mở lại.
