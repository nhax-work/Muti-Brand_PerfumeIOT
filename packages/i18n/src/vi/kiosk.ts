/**
 * Nhãn màn hình kiosk. Câu hướng tới khách viết bằng ngôn ngữ thông thường và kèm hướng dẫn hành
 * động tiếp theo (NFR-USA-03). Tên và mô tả sản phẩm KHÔNG nằm ở đây — giữ nguyên như thương hiệu
 * nhập (NFR-USA-07).
 */
export const kiosk = {
  welcome: 'Chào mừng bạn đến với ScentStation',
  tapToStart: 'Chạm để chọn mùi hương',
  outOfServiceTitle: 'Máy đang tạm ngưng phục vụ',
  outOfServiceHint: 'Vui lòng quay lại sau ít phút hoặc liên hệ nhân viên tại điểm đặt máy.',
} as const;
