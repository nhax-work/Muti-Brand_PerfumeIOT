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
