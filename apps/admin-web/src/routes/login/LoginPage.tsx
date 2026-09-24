import type { LoginRequest } from '@scentstation/contracts';
import { Alert, Button, Card, Form, Input } from 'antd';
import { Navigate, useLocation, useNavigate, type Location } from 'react-router';
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
    <Card title={t('ui.loginTitle')} className="login-card">
      {login.isError && (
        <Alert
          type="error"
          showIcon
          message={errorMessage(login.error, t)}
          className="login-error"
        />
      )}
      <Form<LoginRequest> layout="vertical" onFinish={handleFinish} disabled={login.isPending}>
        <Form.Item
          name="email"
          label={t('ui.email')}
          rules={[
            { required: true, message: t('validation.required') },
            { type: 'email', message: t('validation.invalidEmail') },
          ]}
        >
          <Input autoComplete="username" autoFocus />
        </Form.Item>
        <Form.Item
          name="password"
          label={t('ui.password')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={login.isPending}>
          {t('ui.login')}
        </Button>
      </Form>
    </Card>
  );
}
