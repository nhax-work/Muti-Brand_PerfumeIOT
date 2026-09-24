import { useQuery } from '@tanstack/react-query';
import { config } from '@/shared/config';
import { api } from './client';
import { unwrap } from './errors';

export const catalogQueryKey = ['kiosk', 'catalog', config.machineSerial] as const;

/**
 * Danh mục của máy này. Dùng chung cho khung kiosk (phát hiện tạm ngưng) và các màn hình chọn
 * sản phẩm, nên nằm ở `shared/` chứ không trong một màn hình.
 *
 * Slot có mua được hay không đọc thẳng `item.available` — client không tự suy từ trạng thái slot,
 * hợp đồng hay tồn kho (FR-MCH-16, QT5 của ADR-0003).
 */
export function useKioskCatalog() {
  return useQuery({
    queryKey: catalogQueryKey,
    queryFn: () =>
      unwrap(
        api.GET('/kiosk/machines/{serialNumber}/catalog', {
          params: { path: { serialNumber: config.machineSerial } },
        }),
      ),
    refetchInterval: config.catalogPollMs,
    retry: 1,
  });
}
