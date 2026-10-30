# Đánh giá nguồn và mass Rev B khi dùng đồng 1 oz

Ngày kiểm tra: 26/10/2026. Chỉ đọc PCB hiện có; không sửa PCB, stackup hoặc ZIP Gerber.

## Kết luận

Hình học đường nguồn/đường hồi cho thấy có thể xem xét chế tạo mẫu 1 oz cho chế độ một bơm 2 A + một van 0,5 A, cộng phụ tải logic/đèn. Chưa đủ bằng chứng duyệt sản xuất hoặc công bố dòng định mức. Dòng khởi động/kẹt bơm, dòng đèn, nhiệt trong vỏ và chất lượng mạ lỗ chưa được xác nhận.

Không áp dụng kết luận cho năm cặp bơm/van cùng chạy (khoảng 12,5 A chưa tính phụ tải), hoặc coi cầu chì 5 A là bộ giới hạn dòng chính xác.

## Kết quả đọc trực tiếp PCB

| Đường điện | Hình học hiện tại | Nhận xét khi xem xét 1 oz |
|---|---|---|
| Nguồn 12 V vào | Đường 3 mm từ J12 và trục 4 mm | Không có via trên net 12V_LOAD |
| Phân phối 12 V | Các nhánh ngang 3 mm, nhánh tải 2 mm | Mạng đường F.Cu rộng từ 1 mm trở lên liên tục và phủ tâm toàn bộ pad 12V_LOAD |
| Đầu âm tải đến MOSFET | DRAIN1–15 đều 2 mm, không via | Đường dẫn chính của từng kênh không có đoạn 0,3 mm |
| MOSFET về mass | 2 mm, dài 6,72 mm đến via mỗi kênh | Mỗi kênh có một via đường kính 1,8 mm, lỗ 0,9 mm; chưa biết độ dày mạ thành lỗ |
| Mass chung | Đường B.Cu 3–4 mm và vùng đổ GND mặt dưới, pad nối trực tiếp | Chưa mô phỏng phân bố dòng, cổ hẹp của vùng đổ hoặc nhiễu mass logic |
| Nguồn logic | 5V_EXT: 1,2 mm; 5 V: 0,8–1,2 mm; 3V3: 0,6–0,8 mm | Cần thử sụt áp/reset ESP khi khởi động bơm |

Net 12V_LOAD có tổng 169,672 mm đường 0,3 mm, nhưng kiểm tra hợp hình học đường rộng cho thấy các pad vẫn được nối qua mạng rộng độc lập. Không được coi tổng chiều dài các đoạn cùng net là chiều dài mắc nối tiếp của tải.

Đã chạy lại DRC trên file hiện tại: 0 vi phạm, 0 kết nối thiếu. DRC này vẫn dùng stackup 70 µm hiện có; không xác nhận chịu dòng/nhiệt ở 35 µm.

## Ước lượng sàng lọc nhiệt

Dùng công thức IPC-2221 cho lớp ngoài, đồng 35 µm, tăng nhiệt tham khảo 10 °C: I = 0,048 × ΔT^0,44 × A^0,725, A tính bằng mil². Công thức và cách xét độ dày/bề rộng: [Texas Instruments SNVA766](https://www.ti.com/lit/an/snva766/snva766.pdf).

| Bề rộng | Dòng ước lượng ở tăng nhiệt 10 °C |
|---|---|
| 1,5 mm | 3,21 A |
| 2 mm | 3,95 A |
| 3 mm | 5,30 A |
| 4 mm | 6,53 A |

Các số này là ước lượng cho đường đồng, không phải định mức của bo. Không áp dụng trực tiếp cho via, pad, đầu nối, dòng xung hoặc điều kiện trong vỏ kín; chưa xét dung sai ăn mòn và nhiệt độ môi trường. Lớp đồng 1 oz trên mặt bo không xác định độ dày mạ thành lỗ.

## Điều kiện còn thiếu trước khi chốt bản 1 oz

- Đo dòng khởi động và dòng tải thực; đo nhiệt đường nguồn/mass và via ở chế độ lâu nhất dự kiến, trong vỏ thực.
- Kiểm tra sụt áp 12 V/5 V/3V3 và reset ESP khi đóng/ngắt tải, kiểm tra xung tắt tải.
- Xác nhận yêu cầu đồng hoàn thiện tối thiểu 35 µm và mạ lỗ với xưởng; cân nhắc bổ sung via song song ở đường hồi công suất nếu cần dự phòng theo dòng đo được.
- Xác nhận bảo vệ khi lỗi nhiều kênh bật và phối hợp cầu chì với dây/đầu nối/PCB.
- Nếu chốt thiết kế 1 oz, cập nhật stackup PCB, Gerber job, tài liệu và đóng gói bộ xuất riêng. ZIP Rev B hiện có vẫn ghi 2 oz.

Dữ liệu chi tiết: `power-1oz-audit.json`; công cụ tái tạo: `../audit_power_1oz.py`; DRC: `drc-power-review.json`.
