import { DEFAULT_LOCALE, LOCALES, translate, type Locale } from '@scentstation/i18n';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { I18nContext, type I18nContextValue } from './context';

const STORAGE_KEY = 'scentstation.admin.locale';

function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

function readSavedLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLocale(saved) ? saved : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

/**
 * Đổi ngôn ngữ là đổi catalog tại chỗ — không tải lại trang, không gọi lại API (NFR-USA-07,
 * ADR-0003). Lỗi API đã nhận vẫn dịch lại đúng vì UI giữ `messageKey`, không giữ chuỗi đã dịch.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readSavedLocale);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Trình duyệt chặn storage thì chỉ mất phần nhớ lựa chọn, đổi ngôn ngữ vẫn chạy.
    }
    document.documentElement.lang = next;
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({ locale, setLocale, t: (key, params) => translate(locale, key, params) }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
