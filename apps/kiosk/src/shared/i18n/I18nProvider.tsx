import { DEFAULT_LOCALE, translate, type Locale } from '@scentstation/i18n';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { I18nContext, type I18nContextValue } from './context';

/**
 * Đổi ngôn ngữ là đổi catalog tại chỗ — không tải lại trang, không gọi lại API (NFR-USA-07).
 *
 * Khác web quản trị: kiosk KHÔNG nhớ lựa chọn. Máy dùng chung cho nhiều khách, nên khi hết phiên
 * (`useIdleReset`) ngôn ngữ quay về mặc định cho khách tiếp theo.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  const setLocale = useCallback((next: Locale) => {
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
