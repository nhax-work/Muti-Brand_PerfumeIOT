/** Thương hiệu (FR-BND-01..08). */
export const bnd = {
  codeTaken: 'Mã thương hiệu đã tồn tại',
  brandAccountOnly: 'Chỉ tài khoản thuộc thương hiệu mới có thương hiệu riêng',
  taxCodeRequiredForVerification: 'Thương hiệu chưa khai mã số thuế, không thể xác minh pháp nhân',
  legalProfileSaved: 'Đã lưu hồ sơ pháp nhân và tài khoản nhận doanh thu',
  legalVerifiedSuccess: 'Đã ghi nhận xác minh pháp nhân',
  logoFileRequired: 'Chọn một tệp ảnh làm logo',
  logoTooLarge: 'Logo vượt quá {maxMb} MB',
  logoUnsupported: 'Logo chỉ nhận ảnh JPEG, PNG hoặc WebP hợp lệ',
  // Thông báo trong ứng dụng
  newBrandRegisteredSubject: 'Thương hiệu mới đăng ký: {brand}',
  newBrandRegisteredContent:
    'Thương hiệu {brand} ({email}) vừa tự đăng ký và xác minh email. Thương hiệu thuê slot được ' +
    'ngay; cần xác minh pháp nhân trước lần chi trả doanh thu đầu tiên.',
  legalProfileSubmittedSubject: '{brand} chờ xác minh pháp nhân',
  legalProfileSubmittedContent:
    'Thương hiệu {brand} vừa khai hồ sơ pháp nhân (mã số thuế {taxCode}). ' +
    'Kiểm tra và ghi nhận xác minh để thương hiệu nhận được chi trả doanh thu.',
  legalVerifiedSubject: 'Đã xác minh pháp nhân của {brand}',
  legalVerifiedContent:
    'Nền tảng đã xác minh hồ sơ pháp nhân của {brand}. Các kỳ chi trả doanh thu đã chốt sẽ được ' +
    'chuyển khoản vào tài khoản nhận tiền thương hiệu đã khai.',
} as const;
