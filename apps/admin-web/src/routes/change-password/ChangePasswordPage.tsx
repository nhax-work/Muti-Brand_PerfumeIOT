import { LockOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Form, Input, Typography, message } from 'antd';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { api, errorMessage, unwrap } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';

interface ChangePasswordForm {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Đổi mật khẩu (ADR-0004). Tài khoản mới tạo hoặc vừa đặt lại mật khẩu ở INVITED: `RequireAuth` đưa
 * thẳng tới đây, vì mọi endpoint khác trả FORBIDDEN_SCOPE cho tới khi đổi xong. Đổi xong máy chủ thu hồi
 * MỌI phiên, kể cả phiên này — nên xóa phiên phía client và quay về trang đăng nhập.
 */
export default function ChangePasswordPage() {
  const { t } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [form] = Form.useForm<ChangePasswordForm>();
  const [saving, setSaving] = useState(false);

  const submit = async (v: ChangePasswordForm) => {
    setSaving(true);
    try {
      await unwrap(
        api.POST('/auth/change-password', {
          body: { currentPassword: v.currentPassword, newPassword: v.newPassword },
        }),
      );
      await logout();
      message.success(t('ui.passwordChanged'));
      void navigate('/login', { replace: true });
    } catch (error) {
      message.error(errorMessage(error, t));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card style={{ maxWidth: 420, margin: '10vh auto' }}>
      <Typography.Title level={3}>
        <LockOutlined /> {t('ui.changePassword')}
      </Typography.Title>
      {user?.mustChangePassword && (
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('ui.mustChangePasswordNotice')}
        />
      )}
      <Form form={form} layout="vertical" onFinish={(v) => void submit(v)}>
        <Form.Item
          name="currentPassword"
          label={t('ui.currentPassword')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Form.Item
          name="newPassword"
          label={t('ui.newPassword')}
          rules={[
            { required: true, message: t('validation.required') },
            { min: 8, message: t('ui.passwordMinLength') },
            ({ getFieldValue }) => ({
              validator: (_, value: string | undefined) =>
                value && value === getFieldValue('currentPassword')
                  ? Promise.reject(new Error(t('ui.passwordMustDiffer')))
                  : Promise.resolve(),
            }),
          ]}
        >
          <Input.Password autoComplete="new-password" />
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
          {t('ui.changePassword')}
        </Button>
        <Button type="link" block style={{ marginTop: 8 }} onClick={() => void logout()}>
          {t('ui.logout')}
        </Button>
      </Form>
    </Card>
  );
}
