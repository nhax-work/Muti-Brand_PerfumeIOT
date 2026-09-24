import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { AppProviders } from './app/providers';
import { router } from './app/router';
import { config } from './shared/config';
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
