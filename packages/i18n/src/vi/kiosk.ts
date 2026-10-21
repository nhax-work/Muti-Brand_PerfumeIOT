/**
 * Nhãn màn hình kiosk. Câu hướng tới khách viết bằng ngôn ngữ thông thường và kèm hướng dẫn hành
 * động tiếp theo (NFR-USA-03). Tên và mô tả sản phẩm KHÔNG nằm ở đây — giữ nguyên như thương hiệu
 * nhập (NFR-USA-07).
 */
export const kiosk = {
  welcome: 'Chào mừng bạn đến với ScentStation',
  homeSubtitle: 'Khám phá & trải nghiệm hương thơm cao cấp chỉ với một chạm',
  featureAuthentic: 'Nước hoa chính hãng',
  featureFineMist: 'Xịt sương vi hạt cao cấp',
  featureQrPay: 'Thanh toán QR nhanh chóng',
  outOfServiceTitle: 'Máy đang tạm ngưng phục vụ',
  outOfServiceHint: 'Vui lòng quay lại sau ít phút.',
  outOfServiceContact: 'Cần hỗ trợ? Liên hệ {contact}.',
  connectionLost: 'Mất kết nối với hệ thống, đang thử lại…',
  connectionLostOrder: 'Mất kết nối với hệ thống, đang thử lại… Mã đơn của bạn: {reference}',
  catalogTitle: 'Danh mục nước hoa',
  catalogSubtitle: 'Khám phá các mùi hương cao cấp và chạm để trải nghiệm',
  allBrands: 'Tất cả',
  slotNumber: 'Ngăn {slot}',
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
  slotLabel: 'Vị trí ngăn',
  // Thanh toán và nhận lượt xịt (FR-ORD-08, 11, 21, 25÷27)
  checkoutTitle: 'Thanh toán lượt xịt',
  cancel: 'Hủy',
  goBack: 'Quay lại',
  leavePaymentConfirm:
    'Nếu bạn đã quét mã và chuyển khoản, xin đừng rời màn hình này. Bạn vẫn muốn quay lại?',
  stayHere: 'Ở lại',
  leaveAnyway: 'Vẫn quay lại',
  creatingOrder: 'Đang tạo đơn…',
  retryCreateOrder: 'Thử lại',
  scanToPay: 'Quét mã để thanh toán',
  paymentReference: 'Mã thanh toán',
  amountLabel: 'Số tiền',
  paymentExpiresIn: 'Mã hết hạn sau {seconds} giây',
  waitingForPayment: 'Đang chờ xác nhận thanh toán…',
  pressCountdown: 'Còn {seconds} giây',
  dispensedTitle: 'Cảm ơn bạn!',
  dispensedHint: 'Chúc bạn một ngày thơm tho.',
  pressTimeoutTitle: 'Đã hết thời gian bấm nút',
  paymentExpiredTitle: 'Mã thanh toán đã hết hạn',
  paymentExpiredHint: 'Nếu bạn chưa chuyển khoản, chỉ cần chọn lại mùi hương để thử lại.',
  paymentExpiredLatePayment:
    'Nếu bạn đã chuyển khoản, đừng lo: giao dịch vẫn được ghi nhận để hoàn tiền. Hãy lưu lại mã {reference}.',
  latePaymentTitle: 'Tiền về sau khi mã đã hết hạn',
  latePaymentHint:
    'Máy không xịt cho giao dịch này. Bạn sẽ được hoàn lại tiền — hãy quét mã bên dưới để gửi thông tin nhận hoàn tiền.',
  checkingResult: 'Đang xác nhận kết quả với máy…',
  // Máy chạy không có nhân viên (BR-001) — chỉ dẫn khách tới kênh hỗ trợ thật nếu có cấu hình.
  supportHint: 'Vui lòng lưu lại mã {reference} và liên hệ {contact} để được hỗ trợ.',
  claimQrTitle: 'Quét mã để yêu cầu hoàn tiền',
  claimQrHint:
    'Dùng điện thoại quét mã, điền tài khoản nhận tiền. Nhân viên sẽ chuyển khoản hoàn cho bạn trong vòng {hours} giờ.',
  supportHintNoContact:
    'Hệ thống đã ghi nhận sự cố. Vui lòng chụp lại mã {reference} để được hỗ trợ khi cần.',
  // Màn hình Thanh toán thành công & Hướng dẫn nhận lượt xịt (ADR-0007)
  guideStepApproach: 'Đưa cổ tay hoặc cổ cách vòi 10–15 cm',
  guideStepPress: 'Nhấn nút ô số {slot} khi đèn sáng',
  guideStepHold: 'Giữ yên 2–3 giây',
  copied: 'Đã sao chép!',
  copyCommand: 'Sao chép lệnh test',
  // Băng chuyền & modal chi tiết / mã QR ở màn danh mục
  language: 'Ngôn ngữ',
  // Danh mục: ba bước dưới wordmark, nhãn thẻ (FR-ORD-01)
  introChoose: 'Chọn hương',
  introScan: 'Quét mã',
  introPress: 'Nhấn nút trên máy',
  perSpray: '/ lượt xịt',
  // Trang chi tiết: chỉ dẫn nút bấm hiện trước mã QR (FR-ORD-25)
  pressGuide: 'Sau khi thanh toán, nhấn nút số {slot} trên máy trong {seconds} giây.',
  pressNoRefund: 'Quá thời gian, lượt xịt bị hủy và không được hoàn tiền.',
  payAmount: 'Thanh toán {price}',
  slotUnavailable: 'Tạm ngừng',
  buttonNumber: 'Nút số {slot}',
  scrollLeft: 'Cuộn sang trái',
  scrollRight: 'Cuộn sang phải',
  productImageAlt: 'Ảnh chai nước hoa',
  cancelPaymentConfirmTitle: 'Bạn muốn hủy thanh toán?',
  cancelPaymentConfirm:
    'Nếu bạn đã quét mã và chuyển khoản, xin đừng hủy — hệ thống cần vài giây để nhận tiền. Rời đi lúc này, lượt xịt có thể bắt đầu khi bạn không còn đứng trước máy.',
  continuePayment: 'Tiếp tục thanh toán',
  cancelAnyway: 'Vẫn hủy',
  cancelling: 'Đang hủy…',
  // Màn quét mã thanh toán (FR-ORD-08)
  paymentMethod: 'VietQR · App ngân hàng',
  afterPayLookUp: 'Thanh toán xong, hãy nhìn lên máy — nút số {slot} sẽ sáng.',
  // Sau thanh toán: chuẩn bị, chờ lượt, nhấn nút, kết quả (FR-ORD-11, 21, 26, 27)
  paidTitle: 'Đã nhận thanh toán',
  preparingHint: 'Đang chuẩn bị máy…',
  waitingTurnHint:
    'Máy đang phục vụ khách trước. Lượt của bạn đã được giữ — vui lòng chờ trong giây lát.',
  pressNow: 'Nhấn nút ngay',
  pressTimeoutHint: 'Rất tiếc, đã qua {seconds} giây để nhấn nút nên máy không xịt lượt này.',
  orderProblemTitle: 'Xin lỗi, máy chưa xịt được lượt của bạn',
  illustrationPending: 'Hình minh họa tư thế nhận xịt — chờ nhóm phần cứng cung cấp',
  // Màn chờ (NFR-USA-02)
  tapToStart: 'Chạm để bắt đầu',
} as const;
