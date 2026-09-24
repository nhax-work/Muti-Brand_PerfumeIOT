import type { LoginRequest } from '@scentstation/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { api, refreshSession, unwrap } from '@/shared/api';
import { AuthContext, type AuthContextValue } from './context';
import { sessionStore } from './session';

/**
 * Trạng thái đăng nhập của cả app. Mở trang (hoặc F5) thì thử khôi phục phiên bằng refresh token
 * đã lưu; trong lúc đó `status = 'restoring'` để guard không đá người dùng về trang đăng nhập.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const session = useSyncExternalStore(sessionStore.subscribe, sessionStore.get);
  const [restoring, setRestoring] = useState(() => sessionStore.savedRefreshToken() !== null);

  useEffect(() => {
    if (!restoring) return;
    void refreshSession().finally(() => setRestoring(false));
  }, [restoring]);

  const login = useCallback(async (credentials: LoginRequest) => {
    sessionStore.set(await unwrap(api.POST('/auth/login', { body: credentials })));
  }, []);

  const logout = useCallback(async () => {
    try {
      await unwrap(api.POST('/auth/logout'));
    } catch {
      // Máy chủ không nhận lệnh đăng xuất thì phía client vẫn phải xóa phiên.
    }
    sessionStore.clear();
    // Dữ liệu đã cache thuộc về người vừa đăng xuất; người đăng nhập sau không được thấy nó.
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      status: session ? 'authenticated' : restoring ? 'restoring' : 'anonymous',
      user: session?.user ?? null,
      login,
      logout,
    }),
    [session, restoring, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
