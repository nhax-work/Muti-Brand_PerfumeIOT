import { Form, Input, Modal, Radio, message } from 'antd';
import { useState } from 'react';
import type { MachineOperatingMode } from '@scentstation/contracts';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useSetMachineMode, type Machine } from '../api';

interface MachineModeModalProps {
  readonly machine: Machine | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function MachineModeModal({ machine, open, onClose }: MachineModeModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<{ operatingMode: MachineOperatingMode; reason?: string }>();
  const [submitting, setSubmitting] = useState(false);
  const setMachineMode = useSetMachineMode();

  const handleOk = async () => {
    if (!machine) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await setMachineMode.mutateAsync({
        id: machine.id,
        operatingMode: values.operatingMode,
        reason: values.reason,
      });
      message.success(t('ui.success'));
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'ReauthCancelled') {
        // Người dùng chủ động hủy hộp thoại nhập mật khẩu
        return;
      }
      message.error(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('ui.changeModeTitle')}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form
        form={form}
        layout="vertical"
        initialValues={{
          operatingMode: machine?.operatingMode ?? 'NORMAL',
          reason: '',
        }}
      >
        <Form.Item
          name="operatingMode"
          label={t('ui.newMode')}
          rules={[{ required: true, message: t('validation.required') }]}
        >
          <Radio.Group>
            <Radio.Button value="NORMAL">{t('machineOperatingMode.NORMAL')}</Radio.Button>
            <Radio.Button value="MAINTENANCE">{t('machineOperatingMode.MAINTENANCE')}</Radio.Button>
            <Radio.Button value="DISABLED">{t('machineOperatingMode.DISABLED')}</Radio.Button>
          </Radio.Group>
        </Form.Item>

        <Form.Item name="reason" label={t('ui.reason')}>
          <Input.TextArea
            rows={3}
            placeholder={t('ui.reasonPlaceholder')}
            maxLength={255}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
