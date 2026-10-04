import { createContext } from 'react';

export interface KioskSessionContextValue {
  kioskSessionId: string;
  startNewSession: () => string;
}

export const KioskSessionContext = createContext<KioskSessionContextValue | null>(null);
