/**
 * Nhãn màn hình kiosk. Câu hướng tới khách viết bằng ngôn ngữ thông thường và kèm hướng dẫn hành
 * động tiếp theo (NFR-USA-03). Tên và mô tả sản phẩm KHÔNG nằm ở đây — giữ nguyên như thương hiệu
 * nhập (NFR-USA-07).
 */
export const kiosk = {
  welcome: 'Chào mừng bạn đến với ScentStation',
  homeSubtitle: 'Khám phá & trải nghiệm hương thơm cao cấp chỉ với một chạm',
  tapToStart: 'Chạm để chọn mùi hương',
  featureAuthentic: 'Nước hoa chính hãng',
  featureFineMist: 'Xịt sương vi hạt cao cấp',
  featureQrPay: 'Thanh toán QR nhanh chóng',
  outOfServiceTitle: 'Máy đang tạm ngưng phục vụ',
  outOfServiceHint: 'Vui lòng quay lại sau ít phút hoặc liên hệ nhân viên tại điểm đặt máy.',
  catalogTitle: 'Danh mục nước hoa',
  catalogSubtitle: 'Khám phá các mùi hương cao cấp và chạm để trải nghiệm',
  allBrands: 'Tất cả',
  slotNumber: 'Ngăn {slot}',
  pricePerSpray: '{price} / lượt xịt',
  outOfStock: 'Bán hết',
  emptyCatalog: 'Hiện chưa có sản phẩm nào khả dụng trên máy này',
  backToHome: 'Trang chủ',
  backToCatalog: 'Quay lại danh mục',
  productDetail: 'Chi tiết sản phẩm',
  sprayExperience: 'Trải nghiệm xịt ngay',
  fragranceNotes: 'Các tầng hương',
  topNotes: 'Hương đầu',
  heartNotes: 'Hương giữa',
  baseNotes: 'Hương cuối',
  priceLabel: 'Giá một lượt xịt',
  productNotFound: 'Không tìm thấy sản phẩm',
  productUnavailable: 'Mùi hương này hiện tạm thời không khả dụng',
  brandLabel: 'Thương hiệu',
  slotLabel: 'Vị trí ngăn',
} as const;
