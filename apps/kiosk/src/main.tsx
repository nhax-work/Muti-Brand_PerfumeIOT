import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import { config } from './shared/config';
// Font tự host (Vite đóng gói vào bản build) — kiosk mất mạng vẫn đủ dấu tiếng Việt.
import '@fontsource/playfair-display/400.css';
import '@fontsource/playfair-display/500.css';
import '@fontsource/be-vietnam-pro/400.css';
import '@fontsource/be-vietnam-pro/500.css';
import '@fontsource/be-vietnam-pro/600.css';
import './styles/global.css';

// Cỡ chữ tối thiểu lấy từ spec/constraints.md, không viết cứng trong CSS (NFR-USA-04).
document.documentElement.style.setProperty('--kiosk-min-font', `${config.minFontPx}px`);

const container = document.getElementById('root');
if (!container) throw new Error('Thiếu phần tử #root trong index.html');

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
