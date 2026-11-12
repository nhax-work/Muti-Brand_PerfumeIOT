import { Alert, Button, message } from 'antd';
import { useEffect } from 'react';
import { errorMessage } from '@/shared/api';
import { useAuth, useResendVerification } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';

/**
 * Nhắc xác minh email trên mọi trang khi tài khoản tự đăng ký chưa xác minh (ADR-0021). Máy chủ vẫn
 * là nơi chặn tạo phiên thanh toán (FR-USR-07); thanh này chỉ cho thương hiệu biết sớm.
 */
export function EmailVerificationBanner() {
  const { t } = useI18n();
  const { user, reloadUser } = useAuth();
  const resend = useResendVerification();
  const pending = user?.emailVerificationPending ?? false;

  // Liên kết xác minh thường mở ở tab khác (không có phiên của tab này): quay lại tab thì hỏi lại
  // máy chủ để thanh nhắc tự biến mất.
  useEffect(() => {
    if (!pending) return;
    const recheck = () => {
      if (document.visibilityState === 'visible') void reloadUser().catch(() => undefined);
    };
    window.addEventListener('focus', recheck);
    document.addEventListener('visibilitychange', recheck);
    return () => {
      window.removeEventListener('focus', recheck);
      document.removeEventListener('visibilitychange', recheck);
    };
  }, [pending, reloadUser]);

  if (!pending || !user) return null;

  const handleResend = async () => {
    try {
      await resend.mutateAsync();
      message.success(t('ui.resendVerificationSuccess'));
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  return (
    <div data-tour="email-verification">
      <Alert
        banner
        type="warning"
        className="email-verification-banner"
        message={t('ui.emailVerificationBanner', { email: user.email })}
        action={
          <Button size="small" loading={resend.isPending} onClick={() => void handleResend()}>
            {t('ui.resendVerification')}
          </Button>
        }
      />
    </div>
  );
}
