/**
 * Bằng chứng camera an ninh độc lập với máy (ADR-0032, FR-ORD-38, 39, FR-INV-38, 39).
 */
export const evd = {
  fileRequired: 'Vui lòng chọn một tệp video MP4 hoặc ảnh.',
  fileTooLarge: 'Tệp vượt quá {maxMb} MB.',
  fileUnsupported: 'Chỉ nhận video MP4 hoặc ảnh JPEG, PNG, WebP.',
  recordedRangeInvalid: 'Giờ kết thúc ghi hình phải sau giờ bắt đầu.',
  recordedOutsideWindow:
    'Khoảng ghi hình không khớp khung giờ của giao dịch. Kiểm tra lại giờ trên hình và độ lệch đồng hồ camera.',
  evidenceRequired: 'Cần gắn ít nhất một bằng chứng camera trước khi từ chối phiếu này.',
  evidenceLimitReached: 'Hồ sơ đã đủ {max} tệp bằng chứng.',
  targetClosed: 'Hồ sơ đã đóng — không thêm hay gỡ bằng chứng được nữa.',
  selfReview: 'Người đã thực hiện phiếu nạp không được tự nộp bằng chứng cho phiếu đó.',
  evidenceNotFound: 'Không tìm thấy bằng chứng.',
  notUploader: 'Chỉ người đã tải bằng chứng này mới gỡ được.',
  refillNotFound: 'Không tìm thấy phiếu nạp.',
  brandAccountOnly: 'Chỉ tài khoản thương hiệu gửi được yêu cầu trích hình.',
  footageRequestExpired:
    'Phiếu nạp đã mở quá {days} ngày — đầu ghi có thể đã ghi đè hình, không gửi yêu cầu được nữa.',
  footageRequestAlreadyOpen: 'Phiếu nạp này đã có yêu cầu trích hình đang chờ xử lý.',
  footageRequestNotFound: 'Không tìm thấy yêu cầu trích hình.',
  footageRequestClosed: 'Yêu cầu trích hình đã đóng.',
  footageNoteRequired: 'Vui lòng ghi lý do không có hình.',
  footageNeedsEvidence:
    'Phiếu nạp chưa có bằng chứng nào — gắn hình trước khi đánh dấu đã đính hình.',
  footageRequestedSubject: 'Yêu cầu trích hình phiếu nạp: {brand}',
  footageRequestedContent:
    'Thương hiệu {brand} yêu cầu trích hình camera phiếu nạp slot {slot} trên {machine}, mở lúc {startedAt}. Lý do: {reason}',
  footageFulfilledSubject: 'Đã có hình camera cho phiếu nạp',
  footageFulfilledContent:
    'Hình camera phiếu nạp slot {slot} trên {machine} đã được đính kèm. Mở phiếu nạp để xem.',
  footageUnavailableSubject: 'Không có hình camera cho phiếu nạp',
  footageUnavailableContent:
    'Không trích được hình camera phiếu nạp slot {slot} trên {machine}: {note}',
} as const;

export const evidenceKind = {
  VIDEO: 'Video',
  IMAGE: 'Ảnh',
} as const;

export const footageRequestStatus = {
  OPEN: 'Đang chờ',
  FULFILLED: 'Đã đính hình',
  UNAVAILABLE: 'Không có hình',
} as const;
