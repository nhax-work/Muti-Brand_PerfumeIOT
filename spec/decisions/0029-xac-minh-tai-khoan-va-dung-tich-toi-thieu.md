# ADR-0029: Tài khoản phục vụ xác minh pháp nhân và dung tích tối thiểu

## Quyết định

Theo yêu cầu sửa lỗi, Super Admin thuộc nền tảng được xem đầy đủ tài khoản ngân hàng khi mở hồ sơ xác minh pháp nhân. `GET /brands/{id}` bổ sung `payoutAccount` cho vai trò này. Các phản hồi danh sách, hồ sơ tự quản của thương hiệu và audit log tiếp tục chỉ chứa tài khoản đã che. Dữ liệu trong CSDL vẫn được mã hóa.

Khi tạo sản phẩm, dung tích chai là bắt buộc và tối thiểu 500 ml. Khi sửa dung tích, không cho đặt dưới 500 ml hoặc xóa thành null. Dữ liệu cũ vẫn đọc được; cập nhật các trường khác qua API không bắt buộc sửa dung tích cũ.

Khai báo hàng chỉ hợp lệ khi dung tích mỗi chai nhân số lượng đạt ít nhất 500 ml. Chai trong lô có thể nhỏ hơn 500 ml nếu tổng lô đủ ngưỡng. Kiểm tra cả giao diện và service để không thể bỏ qua bằng lời gọi API trực tiếp. Không áp dụng ngưỡng này hồi tố lên lô đã khai báo.
