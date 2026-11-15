import type { ForgotPasswordRequest } from '@scentstation/contracts';
import { Alert, Button, Card, Form, Input, Result, Typography } from 'antd';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { api, errorMessage, unwrap } from '@/shared/api';
import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { useI18n } from '@/shared/i18n';

/**
 * Quên mật khẩu (FR-AUTH-13, ADR-0030). Máy chủ luôn trả 204 dù email có tài khoản hay không, nên màn
 * hình cũng chỉ có một câu trả lời "kiểm tra hộp thư" — không gợi ý email nào tồn tại.
 */
export default function ForgotPasswordPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [sending, setSending] = useState(false);

  const submit = async ({ email }: ForgotPasswordRequest) => {
    setSending(true);
    setError(null);
    try {
      await unwrap(api.POST('/auth/forgot-password', { body: { email } }));
      setSentTo(email);
    } catch (err) {
      setError(err);
    } finally {
      setSending(false);
    }
  };

  if (sentTo) {
    return (
      <Card className="login-card">
        <Result
          status="success"
          title={t('ui.forgotPasswordSentTitle')}
          subTitle={t('ui.forgotPasswordSentDesc', {
            email: sentTo,
            minutes: SPEC_CONSTRAINTS.PASSWORD_RESET_TOKEN_TTL_MIN,
          })}
          extra={[
            <Button type="primary" key="login" onClick={() => void navigate('/login')}>
              {t('ui.backToLogin')}
            </Button>,
          ]}
        />
      </Card>
    );
  }

  return (
    <Card title={t('ui.forgotPasswordTitle')} className="login-card">
      <Typography.Paragraph type="secondary">{t('ui.forgotPasswordDesc')}</Typography.Paragraph>
      {error !== null && (
        <Alert type="error" showIcon message={errorMessage(error, t)} className="login-error" />
      )}
      <Form<ForgotPasswordRequest>
        layout="vertical"
        onFinish={(v) => void submit(v)}
        disabled={sending}
      >
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
        <Button type="primary" htmlType="submit" block loading={sending}>
          {t('ui.sendResetLink')}
        </Button>
        <div className="login-links">
          <Link to="/login">{t('ui.backToLogin')}</Link>
        </div>
      </Form>
    </Card>
  );
}
