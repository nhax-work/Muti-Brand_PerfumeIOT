import { isMessageKey } from '@scentstation/i18n';
import type { Translate } from './i18n/context';

type CodeNamespace =
  | 'orderCode'
  | 'actorType'
  | 'revenueOwner'
  | 'credentialStatus'
  | 'statusSource'
  | 'machineStatus'
  | 'machineOperatingMode'
  | 'commandStatus'
  | 'dispenseType'
  | 'brandPayoutStatus'
  | 'storageCompensationStatus'
  | 'bottleStatus'
  | 'refillRequestStatus'
  | 'refillRequestReason';

/**
 * Nhãn dễ hiểu cho một mã máy chủ trả về (mã lỗi, lý do, trạng thái…). Mã chưa có trong catalog —
 * ví dụ máy chủ thêm mã mới trước khi web cập nhật — thì hiện nguyên mã thay vì một khóa i18n hỏng.
 */
export function codeLabel(
  t: Translate,
  namespace: CodeNamespace,
  code: string | null | undefined,
): string {
  if (!code) return '—';
  const key = `${namespace}.${code}`;
  return isMessageKey(key) ? t(key) : code;
}
