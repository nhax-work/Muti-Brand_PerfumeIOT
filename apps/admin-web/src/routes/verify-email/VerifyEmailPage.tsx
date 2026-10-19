import { Button, Card, Result, Spin } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { api, errorMessage, unwrap } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

export default function VerifyEmailPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const hasCalled = useRef(false);

  useEffect(() => {
    if (!token) return;
    if (hasCalled.current) return;
    hasCalled.current = true;

    setLoading(true);
    unwrap(api.POST('/auth/verify-email', { body: { token } }))
      .then(() => {
        setSuccess(true);
      })
      .catch((err) => {
        setError(err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [token]);

  if (!token) {
    return (
      <Card className="login-card">
        <Result
          status="warning"
          title={t('ui.verifyEmailFailed')}
          subTitle={t('ui.invalidToken')}
          extra={[
            <Button type="primary" key="login" onClick={() => navigate('/login')}>
              {t('ui.backToLogin')}
            </Button>,
          ]}
        />
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="login-card" style={{ textAlign: 'center', padding: '40px 0' }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>{t('ui.verifyingEmail')}</div>
      </Card>
    );
  }

  if (success) {
    return (
      <Card className="login-card">
        <Result
          status="success"
          title={t('ui.verifyEmailSuccess')}
          subTitle={t('ui.verifyEmailSuccessDesc')}
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
    <Card className="login-card">
      <Result
        status="error"
        title={t('ui.verifyEmailFailed')}
        subTitle={error ? errorMessage(error, t) : t('ui.verifyEmailFailedDesc')}
        extra={[
          <Button type="primary" key="login" onClick={() => navigate('/login')}>
            {t('ui.backToLogin')}
          </Button>,
        ]}
      />
    </Card>
  );
}
