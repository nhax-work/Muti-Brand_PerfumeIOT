/**
 * Nhãn giao diện dùng chung cho web quản trị và kiosk (NFR-USA-07).
 *
 * `localeName` là tên ngôn ngữ viết bằng CHÍNH ngôn ngữ đó — nút chuyển ngôn ngữ tra
 * `translate(locale, 'ui.localeName')` cho từng locale, nên "English" luôn hiện là "English"
 * dù giao diện đang ở tiếng Việt.
 */
export const ui = {
  localeName: 'Tiếng Việt',
  language: 'Ngôn ngữ',
  appName: 'ScentStation Quản trị',
  email: 'Email',
  password: 'Mật khẩu',
  login: 'Đăng nhập',
  loginTitle: 'Đăng nhập hệ thống quản trị',
  logout: 'Đăng xuất',
  dashboard: 'Tổng quan',
  dashboardWelcome: 'Xin chào, {fullName}',
  dashboardHint: 'Chọn chức năng ở menu bên trái để bắt đầu.',
  notFound: 'Không tìm thấy trang bạn yêu cầu',
  backHome: 'Về trang chủ',
  confirm: 'Xác nhận',
  cancel: 'Hủy',
  reauthTitle: 'Xác thực lại mật khẩu',
  reauthDescription: 'Thao tác này cần nhập lại mật khẩu để tiếp tục.',
  networkError: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.',
  loading: 'Đang tải...',
} as const;
