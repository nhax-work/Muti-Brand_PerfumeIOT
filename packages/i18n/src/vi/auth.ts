/**
 * Xác thực và phân quyền (FR-AUTH-01..12).
 *
 * `invalidCredentials` cố ý dùng chung cho cả "email không tồn tại" lẫn "sai mật khẩu"
 * (FR-AUTH-01 AC2) — đừng tách thành hai khóa, tách là lộ email nào có trong hệ thống.
 */
export const auth = {
  missingAccessToken: 'Thiếu access token',
  invalidAccessToken: 'Access token không hợp lệ',
  accessTokenExpired: 'Access token đã hết hạn',
  sessionExpired: 'Phiên đăng nhập không còn hiệu lực',
  mustChangePassword: 'Phải đổi mật khẩu tạm trước khi dùng hệ thống',
  missingPermission: 'Tài khoản không có quyền thực hiện thao tác này',
  reauthRequired: 'Thao tác này cần xác thực lại mật khẩu',
  invalidCredentials: 'Sai email hoặc mật khẩu',
  accountLocked: 'Tài khoản đang bị khóa tạm thời',
  invalidRefreshToken: 'Refresh token không hợp lệ hoặc đã hết hạn',
  wrongPassword: 'Mật khẩu không đúng',
  wrongCurrentPassword: 'Mật khẩu hiện tại không đúng',
  newPasswordMustDiffer: 'Mật khẩu mới phải khác mật khẩu hiện tại',
  newPasswordSameAsCurrent: 'Trùng mật khẩu hiện tại',
  registerRateLimited: 'Quá nhiều yêu cầu đăng ký, vui lòng thử lại sau ít phút',
  invalidVerificationToken: 'Mã xác minh email không hợp lệ hoặc không tồn tại',
  verificationTokenExpired: 'Mã xác minh email đã hết hạn',
  brandCodeTaken: 'Mã thương hiệu đã tồn tại',
  verificationEmailSubject: 'Xác minh tài khoản thương hiệu ScentStation',
  verificationEmailBody:
    'Chào mừng bạn đến với ScentStation. Vui lòng bấm vào liên kết sau để xác minh email của bạn: {link}. Liên kết này có hiệu lực trong {hours} giờ.',
  // Quên mật khẩu (FR-AUTH-13, ADR-0030)
  passwordResetEmailSubject: 'Đặt lại mật khẩu ScentStation',
  passwordResetEmailBody:
    'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản ScentStation của bạn. Bấm vào liên kết sau để đặt mật khẩu mới: {link}. Liên kết dùng được một lần và hết hạn sau {minutes} phút. Nếu bạn không yêu cầu, hãy bỏ qua email này — mật khẩu hiện tại vẫn giữ nguyên.',
  invalidResetToken:
    'Liên kết đặt lại mật khẩu không hợp lệ, đã hết hạn hoặc đã được dùng. Vui lòng yêu cầu liên kết mới.',
  passwordResetRateLimited: 'Bạn yêu cầu quá nhiều lần. Vui lòng thử lại sau một phút.',
} as const;
