import { useKioskCatalog } from '@/shared/api';

/**
 * Kiosk có phải hiện màn hình tạm ngưng không (FR-IOT-13).
 *
 * Chỉ đọc lại những gì máy chủ đã trả, không tự suy nghiệp vụ (QT5):
 *   - không lấy được danh mục (mất mạng, máy chủ lỗi, serial không tồn tại);
 *   - người vận hành đặt máy ngoài chế độ NORMAL (FR-MCH-09);
 *   - hệ thống ghi nhận máy OFFLINE — bán được đơn cũng không xịt được (FR-MCH-08).
 */
export function useOutOfService(): boolean {
  const catalog = useKioskCatalog();
  if (catalog.isError) return true;
  if (!catalog.data) return false;
  return catalog.data.operatingMode !== 'NORMAL' || catalog.data.machineStatus === 'OFFLINE';
}
