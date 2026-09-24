import type { Locale, MessageKey, MessageParams } from '@scentstation/i18n';
import { createContext } from 'react';

export type Translate = (key: MessageKey, params?: MessageParams) => string;

export interface I18nContextValue {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: Translate;
}

export const I18nContext = createContext<I18nContextValue | null>(null);
