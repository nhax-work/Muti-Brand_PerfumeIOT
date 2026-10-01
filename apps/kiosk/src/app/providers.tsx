import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { I18nProvider } from '@/shared/i18n';
import { KioskSessionProvider } from '@/shared/session';

export function AppProviders({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <KioskSessionProvider>{children}</KioskSessionProvider>
      </I18nProvider>
    </QueryClientProvider>
  );
}
