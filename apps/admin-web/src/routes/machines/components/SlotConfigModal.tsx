import { Form, InputNumber, Modal, message } from 'antd';
import { useEffect, useState } from 'react';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useUpdateSlotConfig, type MachineSlot } from '../api';

interface SlotConfigModalProps {
  readonly slot: MachineSlot | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function SlotConfigModal({ slot, open, onClose }: SlotConfigModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<{ calibratedDosageMl: number; lowStockThresholdMl: number }>();
  const [submitting, setSubmitting] = useState(false);
  const updateSlotConfig = useUpdateSlotConfig();

  useEffect(() => {
    if (slot) {
      form.setFieldsValue({
        calibratedDosageMl: slot.calibratedDosageMl ?? 0.12,
        lowStockThresholdMl: slot.lowStockThresholdMl ?? 5.0,
      });
    }
  }, [slot, form]);

  const handleOk = async () => {
    if (!slot) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await updateSlotConfig.mutateAsync({
        id: slot.id,
        calibratedDosageMl: values.calibratedDosageMl,
        lowStockThresholdMl: values.lowStockThresholdMl,
      });
      message.success(t('ui.success'));
      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'ReauthCancelled') {
        return;
      }
      message.error(errorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={t('ui.configSlotTitle', { slotNumber: slot?.slotNumber ?? 1 })}
      open={open}
      onOk={handleOk}
      onCancel={onClose}
      confirmLoading={submitting}
      destroyOnClose
    >
      <Form form={form} layout="vertical">
        <Form.Item
          name="calibratedDosageMl"
          label={t('ui.dosageMl')}
          rules={[
            { required: true, message: t('validation.required') },
            {
              validator: (_, value) =>
                value > 0 ? Promise.resolve() : Promise.reject(new Error(t('mch.dosagePositive'))),
            },
          ]}
        >
          <InputNumber style={{ width: '100%' }} step={0.01} precision={4} min={0.0001} />
        </Form.Item>

        <Form.Item
          name="lowStockThresholdMl"
          label={t('ui.thresholdMl')}
          rules={[
            { required: true, message: t('validation.required') },
            {
              validator: (_, value) =>
                value >= 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('mch.thresholdNonNegative'))),
            },
          ]}
        >
          <InputNumber style={{ width: '100%' }} step={0.5} precision={2} min={0} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
