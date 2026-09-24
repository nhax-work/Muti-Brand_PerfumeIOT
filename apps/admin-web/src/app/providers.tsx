import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntdApp, ConfigProvider } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import { useState, type ReactNode } from 'react';
import { ApiRequestError } from '@/shared/api';
import { AuthProvider, ReauthProvider } from '@/shared/auth';
import { I18nProvider, useI18n } from '@/shared/i18n';

const ANTD_LOCALES = { vi: viVN, en: enUS } as const;

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Lỗi 4xx là câu trả lời thật của máy chủ (sai quyền, không tồn tại) — thử lại vô ích.
        retry: (failureCount, error) =>
          !(error instanceof ApiRequestError && error.status >= 400 && error.status < 500) &&
          failureCount < 2,
      },
    },
  });
}

/** Chữ của component antd (phân trang, DatePicker, Empty...) đi theo ngôn ngữ đang chọn. */
function AntdLocaleBridge({ children }: { children: ReactNode }) {
  const { locale } = useI18n();
  return (
    <ConfigProvider locale={ANTD_LOCALES[locale]}>
      <AntdApp>{children}</AntdApp>
    </ConfigProvider>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <AntdLocaleBridge>
          <AuthProvider>
            <ReauthProvider>{children}</ReauthProvider>
          </AuthProvider>
        </AntdLocaleBridge>
      </I18nProvider>
    </QueryClientProvider>
  );
}
