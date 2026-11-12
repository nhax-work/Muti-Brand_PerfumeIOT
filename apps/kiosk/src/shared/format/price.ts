import type { Locale } from '@scentstation/i18n';

const LOCALE_TAGS: Record<Locale, string> = { vi: 'vi-VN', en: 'en-US' };

/**
 * Số tiền máy chủ trả (chuỗi thập phân, NFR-DAT-02) định dạng theo ngôn ngữ đang chọn:
 * vi → "35.000 ₫", en → "₫35,000". Chuỗi hỏng thì in nguyên văn kèm mã tiền tệ — không đoán giá.
 */
export function formatPrice(
  amount: string | null | undefined,
  currency: string,
  locale: Locale,
): string {
  if (!amount) return '';
  const value = Number(amount);
  if (Number.isNaN(value)) return `${amount} ${currency}`;
  try {
    return new Intl.NumberFormat(LOCALE_TAGS[locale], { style: 'currency', currency }).format(
      value,
    );
  } catch {
    // Mã tiền tệ lạ mà Intl không biết.
    return `${new Intl.NumberFormat(LOCALE_TAGS[locale]).format(value)} ${currency}`;
  }
}
