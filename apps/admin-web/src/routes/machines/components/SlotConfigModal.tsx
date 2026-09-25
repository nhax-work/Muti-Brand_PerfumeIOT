import { useEffect, useState } from 'react';
import {
  Button,
  Col,
  Form,
  InputNumber,
  Modal,
  Row,
  Tag,
  Typography,
  notification,
} from 'antd';
import {
  ControlOutlined,
  ExperimentOutlined,
  SafetyCertificateOutlined,
  SaveOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
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

  const dosage = Form.useWatch('calibratedDosageMl', form) ?? slot?.calibratedDosageMl ?? 0.12;
  const threshold = Form.useWatch('lowStockThresholdMl', form) ?? slot?.lowStockThresholdMl ?? 5.0;

  useEffect(() => {
    if (slot && open) {
      form.setFieldsValue({
        calibratedDosageMl: slot.calibratedDosageMl ?? 0.12,
        lowStockThresholdMl: slot.lowStockThresholdMl ?? 5.0,
      });
    }
  }, [slot, open, form]);

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

      notification.open({
        message: (
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
            {t('ui.configSavedSuccess', { slotNumber: slot.slotNumber })}
          </span>
        ),
        description: (
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            {t('ui.configSavedDesc', {
              dosage: values.calibratedDosageMl,
              threshold: values.lowStockThresholdMl,
            })}
          </div>
        ),
        icon: <ControlOutlined style={{ color: '#6366f1', fontSize: 24 }} />,
        placement: 'topRight',
        duration: 4,
        style: {
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow: '0 10px 25px -5px rgba(15, 23, 42, 0.15)',
        },
      });

      onClose();
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'ReauthCancelled') {
        return;
      }
      notification.error({
        message: 'Thao tác không thành công',
        description: errorMessage(err, t),
        placement: 'topRight',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Tính toán số lượt xịt ước tính cho chai chuẩn 50ml
  const estimatedSpraysPerBottle = dosage > 0 ? Math.floor(50 / dosage) : 0;
  const spraysAtThreshold = dosage > 0 ? Math.floor(threshold / dosage) : 0;

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={540}
      destroyOnClose
      styles={{
        body: {
          padding: '24px 28px',
        },
      }}
    >
      {/* HEADER GRADIENT VỚI ICON ĐO LƯỜNG */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 24,
            boxShadow: '0 6px 16px rgba(99, 102, 241, 0.3)',
            flexShrink: 0,
          }}
        >
          <ControlOutlined />
        </div>
        <div>
          <Typography.Title
            level={4}
            style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: 18 }}
          >
            {t('ui.configSlotTitle', { slotNumber: slot?.slotNumber ?? 1 })}
          </Typography.Title>
          <Typography.Text
            type="secondary"
            style={{ fontSize: 13, marginTop: 4, display: 'block' }}
          >
            {t('ui.configSlotSubtitle')}
          </Typography.Text>
        </div>
      </div>

      <Form form={form} layout="vertical">
        {/* ĐỊNH LƯỢNG MỖI LƯỢT */}
        <Form.Item
          name="calibratedDosageMl"
          label={
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>
                {t('ui.dosageMl')}
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{t('ui.dosageUnit')}</span>
            </div>
          }
          rules={[
            { required: true, message: t('validation.required') },
            {
              validator: (_, value) =>
                value > 0 ? Promise.resolve() : Promise.reject(new Error(t('mch.dosagePositive'))),
            },
          ]}
          style={{ marginBottom: 12 }}
        >
          <InputNumber
            style={{ width: '100%', borderRadius: 8, height: 42, fontSize: 15 }}
            step={0.01}
            precision={4}
            min={0.0001}
            prefix={<ExperimentOutlined style={{ color: '#6366f1', marginRight: 4 }} />}
          />
        </Form.Item>

        {/* CÁC MỨC GỢI Ý NHANH (PRESETS) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
          <span style={{ fontSize: 12, color: '#64748b' }}>{t('ui.quickPresets')}:</span>
          <Tag
            color={dosage === 0.1 ? 'purple' : 'default'}
            onClick={() => form.setFieldValue('calibratedDosageMl', 0.1)}
            style={{ cursor: 'pointer', borderRadius: 4, fontWeight: 600 }}
          >
            {t('ui.presetEconomy')}
          </Tag>
          <Tag
            color={dosage === 0.12 ? 'purple' : 'default'}
            onClick={() => form.setFieldValue('calibratedDosageMl', 0.12)}
            style={{ cursor: 'pointer', borderRadius: 4, fontWeight: 600 }}
          >
            {t('ui.presetStandard')}
          </Tag>
          <Tag
            color={dosage === 0.15 ? 'purple' : 'default'}
            onClick={() => form.setFieldValue('calibratedDosageMl', 0.15)}
            style={{ cursor: 'pointer', borderRadius: 4, fontWeight: 600 }}
          >
            {t('ui.presetIntense')}
          </Tag>
        </div>

        {/* NGƯỠNG CẢNH BÁO SẮP HẾT */}
        <Form.Item
          name="lowStockThresholdMl"
          label={
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                width: '100%',
                alignItems: 'center',
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>
                {t('ui.thresholdMl')}
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{t('ui.thresholdUnit')}</span>
            </div>
          }
          rules={[
            { required: true, message: t('validation.required') },
            {
              validator: (_, value) =>
                value >= 0
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('mch.thresholdNonNegative'))),
            },
          ]}
          style={{ marginBottom: 18 }}
        >
          <InputNumber
            style={{ width: '100%', borderRadius: 8, height: 42, fontSize: 15 }}
            step={0.5}
            precision={2}
            min={0}
            prefix={<ThunderboltOutlined style={{ color: '#f59e0b', marginRight: 4 }} />}
          />
        </Form.Item>

        {/* BẢNG TÍNH TOÁN DUNG LƯỢNG THÔNG MINH */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)',
            border: '1px solid #e2e8f0',
            borderRadius: 12,
            padding: '12px 16px',
            marginBottom: 18,
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, color: '#475569', marginBottom: 8 }}>
            {t('ui.calcTitle')}
          </div>
          <Row gutter={12}>
            <Col span={12}>
              <div
                style={{
                  background: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                  {t('ui.calcTotalSprays')}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#6366f1' }}>
                  {t('ui.calcSpraysUnit', { count: estimatedSpraysPerBottle })}
                </span>
              </div>
            </Col>
            <Col span={12}>
              <div
                style={{
                  background: '#ffffff',
                  padding: '8px 12px',
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
              >
                <span style={{ fontSize: 11, color: '#64748b', display: 'block' }}>
                  {t('ui.calcAlertSprays')}
                </span>
                <span style={{ fontSize: 15, fontWeight: 700, color: '#f59e0b' }}>
                  {t('ui.calcSpraysUnit', { count: spraysAtThreshold })} ({threshold} ml)
                </span>
              </div>
            </Col>
          </Row>
        </div>

        {/* CẢNH BÁO BẢO MẬT */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 20,
          }}
        >
          <SafetyCertificateOutlined style={{ fontSize: 18, color: '#6366f1', flexShrink: 0 }} />
          <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.45 }}>
            {t('ui.configReauthNotice')}
          </Typography.Text>
        </div>

        {/* FOOTER ACTIONS */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            alignItems: 'center',
            gap: 12,
            paddingTop: 12,
            borderTop: '1px solid #f1f5f9',
          }}
        >
          <Button
            size="large"
            onClick={onClose}
            style={{
              borderRadius: 8,
              fontWeight: 600,
              padding: '0 20px',
              height: 40,
            }}
          >
            {t('ui.cancel')}
          </Button>

          <Button
            type="primary"
            size="large"
            onClick={handleOk}
            loading={submitting}
            icon={<SaveOutlined />}
            style={{
              borderRadius: 8,
              fontWeight: 700,
              height: 40,
              padding: '0 24px',
              background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)',
              borderColor: 'transparent',
              boxShadow: '0 4px 14px rgba(99, 102, 241, 0.35)',
            }}
          >
            {t('ui.save')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
