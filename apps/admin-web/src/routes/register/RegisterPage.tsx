import type { BrandRegisterRequest } from '@scentstation/contracts';
import { Alert, Button, Card, Form, Input, Result } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage, unwrap } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

interface FormValues extends BrandRegisterRequest {
  confirmPassword?: string;
}

export default function RegisterPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);

  const handleFinish = async (values: FormValues) => {
    setLoading(true);
    setError(null);
    try {
      await unwrap(
        api.POST('/auth/register-brand', {
          body: {
            brandName: values.brandName.trim(),
            email: values.email.trim(),
            password: values.password,
          },
        }),
      );
      setRegisteredEmail(values.email.trim());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  if (registeredEmail) {
    return (
      <Card className="login-card">
        <Result
          status="success"
          title={t('ui.registerSuccessTitle')}
          subTitle={t('ui.registerSuccessDesc', { email: registeredEmail })}
          extra={[
            <Button type="primary" key="login" onClick={() => navigate('/login')}>
              {t('ui.backToLogin')}
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <Card title={t('ui.registerTitle')} className="login-card">
      {Boolean(error) && (
        <Alert
          type="error"
          showIcon
          message={errorMessage(error, t)}
          className="login-error"
          style={{ marginBottom: 16 }}
        />
      )}
      <Form<FormValues> layout="vertical" onFinish={handleFinish} disabled={loading}>
        <Form.Item
          name="brandName"
          label={t('ui.brandName')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Input autoFocus placeholder={t('ui.brandName')} />
        </Form.Item>

        <Form.Item
          name="email"
          label={t('ui.email')}
          rules={[
            { required: true, message: t('validation.required') },
            { type: 'email', message: t('validation.invalidEmail') },
          ]}
        >
          <Input autoComplete="email" placeholder="contact@example.com" />
        </Form.Item>

        <Form.Item
          name="password"
          label={t('ui.password')}
          rules={[
            { required: true, message: t('validation.required') },
            { min: 8, message: t('validation.tooSmall') },
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Form.Item
          name="confirmPassword"
          label={t('ui.confirmPassword')}
          dependencies={['password']}
          rules={[
            { required: true, message: t('validation.required') },
            ({ getFieldValue }) => ({
              validator(_, value) {
                if (!value || getFieldValue('password') === value) {
                  return Promise.resolve();
                }
                return Promise.reject(new Error(t('ui.passwordMismatch')));
              },
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
        </Form.Item>

        <Button type="primary" htmlType="submit" block loading={loading}>
          {t('ui.register')}
        </Button>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Link to="/login">{t('ui.backToLogin')}</Link>
        </div>
      </Form>
    </Card>
  );
}
