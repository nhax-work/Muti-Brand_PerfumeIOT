import { createContext } from 'react';

/** Đơn khách đã tạo ở phiên này mà chưa kết thúc — kiosk không được bỏ rơi khách giữa chừng. */
export interface ActiveOrder {
  id: string;
  paymentReference: string;
}

export interface KioskSessionContextValue {
  kioskSessionId: string;
  startNewSession: () => string;
  /** Khác `null` từ lúc tạo đơn tới lúc đơn kết thúc hoặc khách rời màn thanh toán. */
  activeOrder: ActiveOrder | null;
  setActiveOrder: (order: ActiveOrder | null) => void;
}

export const KioskSessionContext = createContext<KioskSessionContextValue | null>(null);
