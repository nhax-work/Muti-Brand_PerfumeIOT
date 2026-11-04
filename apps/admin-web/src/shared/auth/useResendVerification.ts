import { useMutation } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';

/** Gửi lại mã xác minh email cho tài khoản đang đăng nhập (FR-USR-07, ADR-0013). */
export function useResendVerification() {
  return useMutation({
    mutationFn: () => unwrap(api.POST('/auth/verify-email/resend')),
  });
}
