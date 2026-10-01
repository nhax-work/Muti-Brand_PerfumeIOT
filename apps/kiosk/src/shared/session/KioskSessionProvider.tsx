import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { KioskSessionContext } from './context';

function generateSessionId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function KioskSessionProvider({ children }: { children: ReactNode }) {
  const [sessionId, setSessionId] = useState<string>(() => generateSessionId());

  const startNewSession = useCallback(() => {
    const nextId = generateSessionId();
    setSessionId(nextId);
    return nextId;
  }, []);

  const value = useMemo(
    () => ({
      kioskSessionId: sessionId,
      startNewSession,
    }),
    [sessionId, startNewSession],
  );

  return <KioskSessionContext.Provider value={value}>{children}</KioskSessionContext.Provider>;
}
