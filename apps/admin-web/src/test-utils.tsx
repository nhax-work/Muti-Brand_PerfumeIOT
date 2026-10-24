/**
 * Tiện ích test giao diện: jsdom thiếu `matchMedia` và `ResizeObserver` mà antd cần, và mọi màn
 * hình cần QueryClient + I18nProvider + router. Chỉ dùng trong `*.test.tsx`.
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import { message, notification } from 'antd';
import { I18nProvider } from '@/shared/i18n';

export function installDomStubs(): void {
  global.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  message.success = vi.fn().mockReturnValue(() => {});
  message.error = vi.fn().mockReturnValue(() => {});
  message.warning = vi.fn().mockReturnValue(() => {});
  message.info = vi.fn().mockReturnValue(() => {});
  message.open = vi.fn().mockReturnValue(() => {});

  notification.success = vi.fn();
  notification.error = vi.fn();
  notification.warning = vi.fn();
  notification.info = vi.fn();
  notification.open = vi.fn();
}

export function renderScreen(ui: ReactElement) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter>{ui}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}
