# Rà soát và phạm vi ghép ESP32

Đối chiếu repo với tài liệu `RA_SOAT_NGHIEP_VU_CON_THIEU (1).pdf` ngày 2026-10-07. Phạm vi triển khai lần này là ghép thiết bị năm nút vào luồng hiện có và sửa các lỗi giao dịch/giao diện liên quan; các đề xuất nghiệp vụ trong PDF không tự trở thành contract đã được duyệt.

## Đã sửa

| Mục PDF | Kết quả |
|---|---|
| 0.1 | Bỏ khẳng định khách chưa bị trừ tiền khi đơn EXPIRED, ở cả tiếng Việt và tiếng Anh |
| 0.2 | Bỏ hướng dẫn phụ thuộc nhân viên tại điểm đặt; vẫn cần kênh hỗ trợ thật |
| 0.3 | Phân biệt transactionId ngân hàng thứ hai với webhook gửi lại; lưu payment_event, đánh dấu kiểm tra thủ công và audit riêng, giữ giao dịch gốc; chưa hoàn tiền tự động |
| 0.4 | Giữ màn checkout và mã tham chiếu khi máy/network không sẵn sàng |
| 0.5 | Hiện giá trước khi đồng ý thanh toán |
| 0.6 | Bỏ nút quay về danh mục trong checkout; API hủy đơn/vô hiệu QR chưa triển khai |
| 0.7 | Đổi câu FORFEITED, bỏ giọng quy lỗi cho khách |

Router kiosk trước đó dẫn các đường về màn catalog có giao diện thanh toán minh họa; checkout nay mở màn CheckoutScreen gọi API thật. MQTT ingestion đã được nối vào backend để lưu heartbeat, telemetry, sự kiện, trạng thái kết nối và config năm slot. Firmware riêng kế thừa Test5Buttons, chờ lệnh đã được ký và nút bấm; không bật bơm ngay khi cấp điện.

## Còn cần trước pilot

- Kênh khiếu nại công khai, lưu yêu cầu khách và cổng thanh toán có hoàn tiền thật. Hiện đánh dấu kiểm tra thủ công không đồng nghĩa đã trả tiền lại.
- Hạn chờ tối đa cho đơn PAID chưa được arm khi broker/máy mất mạng; giá trị hằng và cách hoàn tiền cần quyết định theo quy trình spec.
- Hủy đơn từ kiosk, vô hiệu QR ở phía cổng và phục hồi phiên sau reset; trạng thái chờ bấm ở cấp máy.
- Cảm biến hoặc quy trình kiểm chứng khách nhận được nước hoa, hiệu chỉnh liều, cập nhật tồn kho đúng luồng INV; telemetry hiện không chứng minh lượng thực xuất.
- Hoàn thiện phần nguồn và thử trên thiết bị thật: boot, reset, giữ nút, mất Wi-Fi, mất broker, gửi trùng và thời gian chạy từng bơm.

## Đề xuất ngoài phạm vi kết nối thiết bị

Các nhóm còn lại của PDF gồm hợp đồng/đồng ý của brand, gói bảo quản và bằng chứng bồi thường, duyệt giấy tờ sản phẩm, chi trả doanh thu, thông báo email, trả hàng/gia hạn/thanh lý, bảo trì phòng ngừa và circuit breaker. Đây là thay đổi nghiệp vụ rộng, một số tác động contract đóng băng; chưa triển khai hoặc tuyên bố hoàn tất trong lần ghép ESP này. Không áp dụng số ADR trong PDF một cách máy móc vì repo đã có quyết định mới hơn.

Không thay đổi schema hay MQTT/OpenAPI contract đóng băng. Không triển khai lên server, nạp ESP hay chạy migration/seed trên database thật trong phiên này. Hướng dẫn vận hành nằm ở `GHEP_ESP32_HE_THONG_THAT.md`.

## Kiểm chứng trong phiên làm việc

Ngày 2026-10-09: unit 159, integration 86, contract 38, admin web 16, kiosk 27 và E2E 10 bài đều qua (336 tổng cộng). Một bài E2E dùng Mosquitto cục bộ và PostgreSQL thử nghiệm để kiểm chứng heartbeat và chống trùng sự kiện qua broker thật; các bài DSP hiện có kiểm chứng luồng lệnh/kết quả. Lint và typecheck qua. Firmware biên dịch thành công với ESP32 core 3.3.12, dùng khoảng 78% bộ nhớ chương trình và 15% RAM tĩnh. Đây là kiểm chứng phần mềm, chưa xác nhận phần cứng, cảm biến, cổng thanh toán hay vận hành production.
