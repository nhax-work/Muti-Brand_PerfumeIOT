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
} as const;
