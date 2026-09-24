import type { LoginRequest } from '@scentstation/contracts';
import { useMutation } from '@tanstack/react-query';
import { useAuth } from '@/shared/auth';

/** Hook riêng của màn hình đăng nhập — màn hình khác không import file này (quy tắc FE số 2). */
export function useLogin() {
  const { login } = useAuth();
  return useMutation({ mutationFn: (credentials: LoginRequest) => login(credentials) });
}
