import { Alert, Button, Card, Form, Input, Result } from 'antd';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api, errorMessage, unwrap } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

interface ResetPasswordForm {
  newPassword: string;
  confirmPassword: string;
}

/**
 * Đặt mật khẩu mới từ liên kết trong email (FR-AUTH-13, ADR-0030). Đặt xong máy chủ thu hồi mọi phiên
 * của tài khoản, nên chỉ còn đường quay về trang đăng nhập.
 */
export default function ResetPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [saving, setSaving] = useState(false);

  const submit = async ({ newPassword }: ResetPasswordForm) => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await unwrap(api.POST('/auth/reset-password', { body: { token, newPassword } }));
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
    }
  };

  if (!token) {
    return (
      <Card className="login-card">
        <Result
          status="warning"
          title={t('ui.resetPasswordTitle')}
          subTitle={t('ui.resetPasswordMissingToken')}
          extra={[
            <Button type="primary" key="again" onClick={() => void navigate('/forgot-password')}>
              {t('ui.requestNewResetLink')}
            </Button>,
          ]}
        />
      </Card>
    );
  }

  if (done) {
    return (
      <Card className="login-card">
        <Result
          status="success"
          title={t('ui.resetPasswordSuccessTitle')}
          subTitle={t('ui.resetPasswordSuccessDesc')}
          extra={[
            <Button type="primary" key="login" onClick={() => void navigate('/login')}>
              {t('ui.login')}
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <Card title={t('ui.resetPasswordTitle')} className="login-card">
      {error !== null && (
        <Alert
          type="error"
          showIcon
          message={errorMessage(error, t)}
          className="login-error"
          action={<Link to="/forgot-password">{t('ui.requestNewResetLink')}</Link>}
        />
      )}
      <Form<ResetPasswordForm> layout="vertical" onFinish={(v) => void submit(v)} disabled={saving}>
        <Form.Item
          name="newPassword"
          label={t('ui.newPassword')}
          rules={[
            { required: true, message: t('validation.required') },
            { min: 8, message: t('ui.passwordMinLength') },
          ]}
        >
          <Input.Password autoComplete="new-password" autoFocus />
        </Form.Item>
        <Form.Item
          name="confirmPassword"
          label={t('ui.confirmPassword')}
          dependencies={['newPassword']}
          rules={[
            { required: true, message: t('validation.required') },
            ({ getFieldValue }) => ({
              validator: (_, value: string | undefined) =>
                !value || value === getFieldValue('newPassword')
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('ui.passwordMismatch'))),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={saving}>
          {t('ui.resetPasswordSubmit')}
        </Button>
        <div className="login-links">
          <Link to="/login">{t('ui.backToLogin')}</Link>
        </div>
      </Form>
    </Card>
  );
}
