import { api } from './client';

export interface RecordInteractionParams {
  eventType: 'PRODUCT_IMPRESSION' | 'PRODUCT_SELECTED';
  slotId: string;
  kioskSessionId: string;
}

/**
 * Ghi nhận tương tác trên kiosk (FR-RPT-06, BR-007).
 *
 * Thực hiện bất đồng bộ non-blocking để không làm ảnh hưởng thời gian phản hồi giao diện
 * (KIOSK_SELECT_RESPONSE_MAX_MS = 500). Lỗi mạng được bắt và bỏ qua an toàn.
 */
export function recordKioskInteraction(params: RecordInteractionParams): void {
  const eventId = crypto.randomUUID();
  const occurredAt = new Date().toISOString();

  void api
    .POST('/kiosk/interactions', {
      body: {
        events: [
          {
            eventId,
            eventType: params.eventType,
            slotId: params.slotId,
            kioskSessionId: params.kioskSessionId,
            occurredAt,
          },
        ],
      },
    })
    .catch(() => {
      // Thống kê tương tác không được chặn hoặc gây gián đoạn luồng trải nghiệm của khách
    });
}
