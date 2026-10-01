import { useContext } from 'react';
import { KioskSessionContext, type KioskSessionContextValue } from './context';

export function useKioskSession(): KioskSessionContextValue {
  const ctx = useContext(KioskSessionContext);
  if (!ctx) {
    throw new Error('useKioskSession must be used within KioskSessionProvider');
  }
  return ctx;
}
