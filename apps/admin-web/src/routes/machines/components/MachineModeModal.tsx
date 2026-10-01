import { useState, useEffect } from 'react';
import { Button, Form, Input, Modal, Tag, Typography, notification } from 'antd';
import {
  ThunderboltFilled,
  CheckCircleFilled,
  ToolFilled,
  StopFilled,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
  CheckOutlined,
} from '@ant-design/icons';
import type { MachineOperatingMode } from '@scentstation/contracts';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useSetMachineMode, type Machine } from '../api';

interface MachineModeModalProps {
  readonly machine: Machine | null;
  readonly open: boolean;
  readonly onClose: () => void;
}

interface ModeCardOption {
  value: MachineOperatingMode;
  title: string;
  badge: string;
  description: string;
  icon: React.ReactNode;
  themeColor: string;
  activeBg: string;
  activeBorder: string;
}

export function MachineModeModal({ machine, open, onClose }: MachineModeModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<{ operatingMode: MachineOperatingMode; reason?: string }>();
  const [submitting, setSubmitting] = useState(false);
  const setMachineMode = useSetMachineMode();

  const currentMode = machine?.operatingMode ?? 'NORMAL';
  const selectedMode = Form.useWatch('operatingMode', form) ?? currentMode;

  useEffect(() => {
    if (open && machine) {
      form.setFieldsValue({
        operatingMode: machine.operatingMode,
        reason: '',
      });
    }
  }, [open, machine, form]);

  const modeOptions: ModeCardOption[] = [
    {
      value: 'NORMAL',
      title: t('ui.modeNormalTitle'),
      badge: t('ui.modeNormalBadge'),
      description: t('ui.modeNormalDesc'),
      icon: <CheckCircleFilled style={{ fontSize: 22, color: '#10b981' }} />,
      themeColor: '#10b981',
      activeBg: '#f0fdf4',
      activeBorder: '#10b981',
    },
    {
      value: 'MAINTENANCE',
      title: t('ui.modeMaintTitle'),
      badge: t('ui.modeMaintBadge'),
      description: t('ui.modeMaintDesc'),
      icon: <ToolFilled style={{ fontSize: 22, color: '#f59e0b' }} />,
      themeColor: '#f59e0b',
      activeBg: '#fffbeb',
      activeBorder: '#f59e0b',
    },
    {
      value: 'DISABLED',
      title: t('ui.modeDisabledTitle'),
      badge: t('ui.modeDisabledBadge'),
      description: t('ui.modeDisabledDesc'),
      icon: <StopFilled style={{ fontSize: 22, color: '#ef4444' }} />,
      themeColor: '#ef4444',
      activeBg: '#fef2f2',
      activeBorder: '#ef4444',
    },
  ];

  const currentOption: ModeCardOption =
    modeOptions.find((opt) => opt.value === selectedMode) ?? (modeOptions[0] as ModeCardOption);

  const handleOk = async () => {
    if (!machine) return;
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      await setMachineMode.mutateAsync({
        id: machine.id,
        operatingMode: values.operatingMode,
        reason: values.reason?.trim() ? values.reason.trim() : undefined,
      });

      notification.open({
        message: (
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
            {t('ui.modeChangeSuccess')}
          </span>
        ),
        description: (
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            {t('ui.modeChangeSuccessDesc', {
              displayName: machine.displayName,
              modeTitle: currentOption.title,
            })}
          </div>
        ),
        icon: currentOption.icon,
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
        // Người dùng chủ động hủy hộp thoại nhập mật khẩu xác thực lại
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

  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      centered
      width={580}
      destroyOnClose
      styles={{
        body: {
          padding: '24px 28px',
        },
      }}
    >
      {/* HEADER SANG TRỌNG VỚI ICON GRADIENT */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontSize: 24,
            boxShadow: '0 6px 16px rgba(2, 132, 199, 0.3)',
            flexShrink: 0,
          }}
        >
          <ThunderboltFilled />
        </div>
        <div style={{ minWidth: 0 }}>
          <Typography.Title
            level={4}
            style={{ margin: 0, fontWeight: 800, color: '#0f172a', fontSize: 18 }}
          >
            {t('ui.changeModeTitle')}
          </Typography.Title>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
              flexWrap: 'wrap',
            }}
          >
            <Typography.Text type="secondary" style={{ fontSize: 13 }}>
              {machine?.displayName}
            </Typography.Text>
            <span style={{ color: '#cbd5e1' }}>•</span>
            <Tag
              color="cyan"
              style={{ margin: 0, fontSize: 11, fontFamily: 'monospace', fontWeight: 600 }}
            >
              S/N: {machine?.serialNumber}
            </Tag>
          </div>
        </div>
      </div>

      <Form
        form={form}
        layout="vertical"
        initialValues={{
          operatingMode: currentMode,
          reason: '',
        }}
      >
        {/* TIÊU ĐỀ & TRẠNG THÁI HIỆN TẠI VỚI KHOẢNG CÁCH RỘNG RÃI */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
            paddingBottom: 8,
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <span
            style={{
              fontWeight: 700,
              fontSize: 12,
              color: '#475569',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
            }}
          >
            {t('ui.selectNewMode')}
          </span>

          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              padding: '4px 12px',
              borderRadius: 20,
              fontSize: 12,
            }}
          >
            <span style={{ color: '#64748b' }}>{t('ui.currentModeLabel')}:</span>
            <Tag
              color={
                currentMode === 'NORMAL'
                  ? 'success'
                  : currentMode === 'MAINTENANCE'
                    ? 'warning'
                    : 'error'
              }
              style={{
                margin: 0,
                fontSize: 11,
                fontWeight: 600,
                borderRadius: 4,
                padding: '0 8px',
                lineHeight: '20px',
              }}
            >
              {modeOptions.find((m) => m.value === currentMode)?.title}
            </Tag>
          </div>
        </div>

        {/* DANH SÁCH 3 CHẾ ĐỘ THIẾT KẾ CARD THÔNG MINH */}
        <Form.Item name="operatingMode" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {modeOptions.map((opt) => {
              const isSelected = selectedMode === opt.value;
              const isCurrent = currentMode === opt.value;

              return (
                <div
                  key={opt.value}
                  onClick={() => form.setFieldValue('operatingMode', opt.value)}
                  style={{
                    border: `1.5px solid ${isSelected ? opt.activeBorder : '#e2e8f0'}`,
                    background: isSelected ? opt.activeBg : '#ffffff',
                    borderRadius: 12,
                    padding: '14px 18px',
                    cursor: 'pointer',
                    transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    boxShadow: isSelected
                      ? `0 4px 14px ${opt.themeColor}25`
                      : '0 1px 3px rgba(0, 0, 0, 0.02)',
                  }}
                >
                  <div
                    style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 0 }}
                  >
                    <div
                      style={{
                        width: 38,
                        height: 38,
                        borderRadius: 10,
                        background: '#ffffff',
                        border: `1px solid ${isSelected ? opt.activeBorder : '#e2e8f0'}`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 6px rgba(0, 0, 0, 0.04)',
                        flexShrink: 0,
                      }}
                    >
                      {opt.icon}
                    </div>

                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Typography.Text strong style={{ fontSize: 14, color: '#0f172a' }}>
                          {opt.title}
                        </Typography.Text>
                        <Tag
                          color={
                            isSelected
                              ? opt.value === 'NORMAL'
                                ? 'success'
                                : opt.value === 'MAINTENANCE'
                                  ? 'warning'
                                  : 'error'
                              : 'default'
                          }
                          style={{ margin: 0, fontSize: 11, fontWeight: 600, borderRadius: 4 }}
                        >
                          {opt.badge}
                        </Tag>
                        {isCurrent && (
                          <span style={{ fontSize: 11, color: '#64748b', fontStyle: 'italic' }}>
                            {t('ui.currentModeBadge')}
                          </span>
                        )}
                      </div>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: 12, display: 'block', marginTop: 2, lineHeight: 1.35 }}
                      >
                        {opt.description}
                      </Typography.Text>
                    </div>
                  </div>

                  {/* CHECKMARK INDICATOR */}
                  <div
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      border: `2px solid ${isSelected ? opt.themeColor : '#cbd5e1'}`,
                      background: isSelected ? opt.themeColor : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ffffff',
                      fontSize: 11,
                      flexShrink: 0,
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {isSelected && <CheckOutlined />}
                  </div>
                </div>
              );
            })}
          </div>
        </Form.Item>

        {/* CẢNH BÁO BẢO MẬT & THAO TÁC NHẠY CẢM */}
        <div
          style={{
            background: '#f8fafc',
            border: '1px solid #e2e8f0',
            borderRadius: 10,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 16,
          }}
        >
          <SafetyCertificateOutlined style={{ fontSize: 18, color: '#0284c7', flexShrink: 0 }} />
          <Typography.Text type="secondary" style={{ fontSize: 12, lineHeight: 1.45 }}>
            {t('ui.modeReauthNotice')}
          </Typography.Text>
        </div>

        {/* Ô NHẬP LÝ DO THAY ĐỔI */}
        <Form.Item
          name="reason"
          label={
            <span style={{ fontWeight: 700, fontSize: 13, color: '#334155' }}>
              {t('ui.reasonLabel')}
            </span>
          }
          style={{ marginBottom: 20 }}
        >
          <Input.TextArea
            rows={2}
            placeholder={t('ui.reasonPlaceholderFull')}
            maxLength={255}
            showCount
            style={{ borderRadius: 8, padding: '8px 12px', fontSize: 13 }}
          />
        </Form.Item>

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
            icon={<ArrowRightOutlined />}
            style={{
              borderRadius: 8,
              fontWeight: 700,
              height: 40,
              padding: '0 24px',
              background:
                selectedMode === 'NORMAL'
                  ? 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)'
                  : selectedMode === 'MAINTENANCE'
                    ? 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)'
                    : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderColor: 'transparent',
              boxShadow: `0 4px 14px ${currentOption.themeColor}35`,
            }}
          >
            {selectedMode === 'NORMAL'
              ? t('ui.btnActivateNormal')
              : selectedMode === 'MAINTENANCE'
                ? t('ui.btnSwitchMaintenance')
                : t('ui.btnConfirmDisabled')}
          </Button>
        </div>
      </Form>
    </Modal>
  );
}
