import { Alert, Form, Input, Modal, Typography } from 'antd';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { api, errorMessage, unwrap } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { ReauthCancelled, ReauthContext } from './reauth-context';

interface Pending {
  resolve: (token: string) => void;
  reject: (reason: unknown) => void;
}

/**
 * Hoàn tiền, điều chỉnh tồn kho, xịt chẩn đoán, thanh lý và đổi cấu hình máy phải xác thực lại
 * (FR-AUTH-09). Màn hình gọi `useReauth()` rồi gắn token vào request:
 *
 *   const reauthToken = await requestReauth();
 *   await unwrap(api.POST('/orders/{id}/refund', { params: { path: { id }, header: { 'X-Reauth-Token': reauthToken } }, body }));
 */
export function ReauthProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [form] = Form.useForm<{ password: string }>();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const pending = useRef<Pending | null>(null);

  const requestReauth = useCallback(
    () =>
      new Promise<string>((resolve, reject) => {
        pending.current?.reject(new ReauthCancelled());
        pending.current = { resolve, reject };
        form.resetFields();
        setError(null);
        setOpen(true);
      }),
    [form],
  );

  const close = () => {
    setOpen(false);
    pending.current = null;
  };

  const handleOk = async () => {
    const { password } = await form.validateFields();
    setSubmitting(true);
    try {
      const { reauthToken } = await unwrap(api.POST('/auth/reauth', { body: { password } }));
      pending.current?.resolve(reauthToken);
      close();
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    pending.current?.reject(new ReauthCancelled());
    close();
  };

  return (
    <ReauthContext.Provider value={requestReauth}>
      {children}
      <Modal
        open={open}
        title={t('ui.reauthTitle')}
        okText={t('ui.confirm')}
        cancelText={t('ui.cancel')}
        confirmLoading={submitting}
        onOk={() => void handleOk()}
        onCancel={handleCancel}
        destroyOnHidden
      >
        <Typography.Paragraph>{t('ui.reauthDescription')}</Typography.Paragraph>
        {error !== null && (
          <Alert
            type="error"
            showIcon
            message={errorMessage(error, t)}
            style={{ marginBottom: 16 }}
          />
        )}
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="password"
            label={t('ui.password')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Input.Password autoFocus autoComplete="current-password" />
          </Form.Item>
        </Form>
      </Modal>
    </ReauthContext.Provider>
  );
}
