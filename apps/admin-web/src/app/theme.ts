import type { ThemeConfig } from 'antd';

/**
 * Theme antd riêng cho các trang xác thực (AuthLayout): đen trắng, góc vuông, cùng nhận diện với kiosk
 * và landing. Phần quản trị bên trong vẫn dùng theme mặc định. Giá trị khớp biến `--auth-*` trong
 * `styles/global.css`.
 */
export const AUTH_THEME: ThemeConfig = {
  token: {
    colorPrimary: '#000000',
    colorLink: '#000000',
    colorLinkHover: '#5f5e5e',
    colorBorder: '#d4d4d4',
    borderRadius: 0,
    controlHeight: 48,
    fontFamily:
      "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
};

/**
 * Menu trái của phần quản trị: nền than chì cùng màu nền landing và favicon, để vừa đăng nhập vào
 * không thấy lệch tông. Menu `theme="dark"` của antd tự tô `#001529` lên vùng các mục — phải đặt cùng
 * màu với `--sider-bg` ở `styles/global.css`, không thì menu và phần nền bên dưới thành hai màu.
 */
export const SIDER_THEME: ThemeConfig = {
  components: {
    Menu: {
      darkItemBg: '#111111',
      darkPopupBg: '#111111',
      darkSubMenuItemBg: '#0a0a0a',
    },
  },
};
