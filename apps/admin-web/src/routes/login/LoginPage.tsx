import { MailOutlined } from '@ant-design/icons';
import type { LoginRequest } from '@scentstation/contracts';
import { Alert, Button, Form, Input, Typography } from 'antd';
import { Link, Navigate, useLocation, useNavigate, type Location } from 'react-router';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';
import { useLogin } from './useLogin';

export default function LoginPage() {
  const { t } = useI18n();
  const { status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const login = useLogin();

  const from = (location.state as { from?: Location } | null)?.from?.pathname ?? '/';
  if (status === 'authenticated') return <Navigate to={from} replace />;

  const handleFinish = (values: LoginRequest) => {
    login.mutate(values, { onSuccess: () => void navigate(from, { replace: true }) });
  };

  return (
    <div className="auth-form">
      <Typography.Title level={3} className="auth-title">
        {t('ui.loginHeading')}
      </Typography.Title>
      {login.isError && (
        <Alert
          type="error"
          showIcon
          message={errorMessage(login.error, t)}
          className="login-error"
        />
      )}
      <Form<LoginRequest>
        layout="vertical"
        requiredMark={false}
        onFinish={handleFinish}
        disabled={login.isPending}
      >
        <Form.Item
          name="email"
          label={t('ui.email')}
          rules={[
            { required: true, message: t('validation.required') },
            { type: 'email', message: t('validation.invalidEmail') },
          ]}
        >
          <Input
            autoComplete="username"
            autoFocus
            placeholder="brand@perfume.com"
            suffix={<MailOutlined className="auth-input-icon" />}
          />
        </Form.Item>
        <Form.Item
          name="password"
          label={t('ui.password')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <div className="login-forgot">
          <Link to="/forgot-password">{t('ui.forgotPasswordLink')}</Link>
        </div>
        <Button
          type="primary"
          htmlType="submit"
          block
          loading={login.isPending}
          className="auth-submit"
        >
          {t('ui.loginSubmit')}
        </Button>
      </Form>
      <p className="auth-switch">
        {t('ui.loginNoAccount')} <Link to="/register">{t('ui.loginRegisterNow')}</Link>
      </p>
    </div>
  );
}
