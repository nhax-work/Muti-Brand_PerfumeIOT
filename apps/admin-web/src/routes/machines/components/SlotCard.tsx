import { useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Modal,
  Progress,
  Space,
  Tag,
  Tooltip,
  Typography,
  notification,
} from 'antd';
import {
  SettingOutlined,
  PoweroffOutlined,
  ShopOutlined,
  ExperimentOutlined,
  AlertOutlined,
  CheckCircleFilled,
} from '@ant-design/icons';
import type { SlotStatus } from '@scentstation/contracts';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useSetSlotEnabled, type Brand, type MachineSlot, type SlotRental } from '../api';

const SLOT_STATUS_COLOR: Record<SlotStatus, string> = {
  AVAILABLE: 'success',
  UNAVAILABLE: 'default',
  MAINTENANCE: 'orange',
  DISABLED: 'error',
};

export interface SlotProductInfo {
  readonly id?: string;
  readonly name: string;
  readonly sku?: string;
}

interface SlotCardProps {
  readonly slot: MachineSlot;
  readonly rental: SlotRental | undefined;
  readonly brand: Brand | undefined;
  readonly product?: SlotProductInfo | undefined;
  readonly onOpenConfig: (slot: MachineSlot) => void;
}

export function SlotCard({ slot, rental, brand, product, onOpenConfig }: SlotCardProps) {
  const { t } = useI18n();
  const setSlotEnabled = useSetSlotEnabled();
  const [toggleModalOpen, setToggleModalOpen] = useState(false);

  const remainingMl = slot.estimatedRemainingMl ?? 0;
  const remainingSprays = slot.estimatedRemainingSprays ?? 0;

  const isLowStock =
    slot.lowStockThresholdMl !== null &&
    slot.lowStockThresholdMl !== undefined &&
    remainingMl <= slot.lowStockThresholdMl;

  const isAvailable = slot.status === 'AVAILABLE';
  const isUnavailable = slot.status === 'UNAVAILABLE';
  const isMaintenance = slot.status === 'MAINTENANCE';

  const progressPercent = Math.min(100, Math.max(0, Math.round((remainingMl / 50) * 100)));

  const handleConfirmToggle = async () => {
    try {
      const nextEnabled = !isAvailable;
      await setSlotEnabled.mutateAsync({
        id: slot.id,
        enabled: nextEnabled,
        reason: nextEnabled
          ? `Admin kích hoạt slot ${slot.slotNumber}`
          : `Admin tạm dừng slot ${slot.slotNumber}`,
      });
      setToggleModalOpen(false);

      notification.open({
        message: (
          <span style={{ fontWeight: 700, fontSize: 15, color: '#0f172a' }}>
            {nextEnabled
              ? t('ui.slotEnabledSuccess', { slotNumber: slot.slotNumber })
              : t('ui.slotDisabledSuccess', { slotNumber: slot.slotNumber })}
          </span>
        ),
        description: (
          <div style={{ fontSize: 13, color: '#475569', marginTop: 4 }}>
            {nextEnabled
              ? t('ui.slotEnabledDesc', { slotNumber: slot.slotNumber })
              : t('ui.slotDisabledDesc', { slotNumber: slot.slotNumber })}
          </div>
        ),
        icon: nextEnabled ? (
          <CheckCircleFilled style={{ color: '#10b981', fontSize: 24 }} />
        ) : (
          <PoweroffOutlined style={{ color: '#ef4444', fontSize: 24 }} />
        ),
        placement: 'topRight',
        duration: 4,
        style: {
          borderRadius: 14,
          border: '1px solid #e2e8f0',
          boxShadow:
            '0 10px 25px -5px rgba(15, 23, 42, 0.15), 0 8px 10px -6px rgba(15, 23, 42, 0.1)',
        },
      });
    } catch (err) {
      notification.error({
        message: 'Thao tác không thành công',
        description: errorMessage(err, t),
        placement: 'topRight',
      });
    }
  };

  return (
    <>
      <Card
        className={`slot-bay-card ${isUnavailable ? 'slot-unavailable' : ''}`}
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span
              className={`iot-status-dot ${
                isAvailable ? 'online' : isMaintenance ? 'unstable' : 'offline'
              }`}
              style={{ flexShrink: 0 }}
            />
            <Typography.Text strong style={{ fontSize: 15, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {t('ui.slotNumber', { slotNumber: slot.slotNumber })}
            </Typography.Text>
            <Tag
              color={
                isAvailable ? 'success' : isUnavailable ? 'default' : SLOT_STATUS_COLOR[slot.status]
              }
              style={{
                fontWeight: 600,
                margin: 0,
                whiteSpace: 'nowrap',
                flexShrink: 0,
                display: 'inline-flex',
                alignItems: 'center',
                padding: '1px 8px',
                borderRadius: 4,
              }}
            >
              {isUnavailable
                ? 'Tạm ngưng'
                : slot.status === 'AVAILABLE'
                  ? 'Khả dụng'
                  : t(`slotStatus.${slot.status}`)}
            </Tag>
          </div>
        }
        extra={
          <Space size={6} style={{ flexShrink: 0 }}>
            <Button size="small" icon={<SettingOutlined />} onClick={() => onOpenConfig(slot)}>
              {t('ui.configSlot')}
            </Button>

            {isAvailable ? (
              <Button
                size="small"
                className="btn-slot-disable"
                icon={<PoweroffOutlined />}
                onClick={() => setToggleModalOpen(true)}
              >
                {t('ui.disableSlot')}
              </Button>
            ) : isUnavailable ? (
              <Button
                size="small"
                className="btn-slot-enable"
                icon={<PoweroffOutlined />}
                onClick={() => setToggleModalOpen(true)}
              >
                {t('ui.enableSlot')}
              </Button>
            ) : (
              <Tooltip title="Slot đang trong trạng thái bảo trì hoặc vô hiệu hóa">
                <Button size="small" disabled icon={<PoweroffOutlined />}>
                  {t('ui.disableSlot')}
                </Button>
              </Tooltip>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        {/* KHỐI THƯƠNG HIỆU THUÊ */}
        <div>
          <Typography.Text
            type="secondary"
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              display: 'block',
              marginBottom: 6,
            }}
          >
            {t('ui.rentedBrand')}
          </Typography.Text>
          {rental && brand ? (
            <div
              style={{
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                borderRadius: 10,
                padding: '10px 12px',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}
                >
                  <Avatar
                    src={brand.logoUrl}
                    icon={<ShopOutlined />}
                    shape="square"
                    size="large"
                    style={{
                      backgroundColor: '#0284c7',
                      boxShadow: '0 2px 6px rgba(2, 132, 199, 0.25)',
                      flexShrink: 0,
                    }}
                  />
                  <div style={{ minWidth: 0, overflow: 'hidden' }}>
                    <Typography.Text
                      strong
                      ellipsis
                      style={{
                        display: 'block',
                        fontSize: 14,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {brand.name}
                    </Typography.Text>
                    <Typography.Text
                      type="secondary"
                      style={{
                        fontSize: 12,
                        display: 'block',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {brand.code}
                    </Typography.Text>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <Tag color="cyan" style={{ margin: 0, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    {t(`slotRentalStatus.${rental.status}`)}
                  </Tag>
                  <Typography.Text
                    strong
                    style={{
                      fontSize: 12,
                      display: 'block',
                      marginTop: 4,
                      color: '#0369a1',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {Number(rental.pricePerSpray).toLocaleString()} VND
                  </Typography.Text>
                </div>
              </div>
            </div>
          ) : (
            <div
              style={{
                background: '#fafafa',
                border: '1px dashed #cbd5e1',
                borderRadius: 10,
                padding: '12px 14px',
                textAlign: 'center',
              }}
            >
              <Tag
                color="default"
                style={{ margin: 0, padding: '2px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}
              >
                {t('ui.vacantSlot')}
              </Tag>
              <Typography.Text
                type="secondary"
                style={{ fontSize: 12, display: 'block', marginTop: 4, whiteSpace: 'nowrap' }}
              >
                {t('ui.vacantSlotDesc')}
              </Typography.Text>
            </div>
          )}
        </div>

        {/* THÔNG SỐ VÒI XỊT & LƯỢNG NƯỚC HOA TRONG BUỒNG */}
        <div className="slot-liquid-chamber">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
              gap: 8,
            }}
          >
            <Space size={4} style={{ flexShrink: 0 }}>
              <ExperimentOutlined style={{ color: '#0284c7' }} />
              <Typography.Text style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap' }}>
                {t('ui.remainingVolume')}
              </Typography.Text>
            </Space>
            <Typography.Text strong style={{ fontSize: 13, whiteSpace: 'nowrap', flexShrink: 0 }}>
              {remainingMl.toFixed(2)} ml ({remainingSprays} {t('ui.sprays')})
            </Typography.Text>
          </div>
          <Progress
            percent={progressPercent}
            showInfo={false}
            status={isLowStock ? 'exception' : 'active'}
            strokeColor={
              isLowStock
                ? '#ef4444'
                : {
                    '0%': '#38bdf8',
                    '100%': '#0284c7',
                  }
            }
          />
          {isLowStock && (
            <Alert
              message={
                <Space size={4}>
                  <AlertOutlined />
                  <span>{t('ui.lowStockAlert')}</span>
                </Space>
              }
              type="error"
              showIcon={false}
              style={{ marginTop: 8, padding: '4px 8px', fontSize: 11 }}
            />
          )}
        </div>

        {/* THÔNG TIN CHI TIẾT CẤU HÌNH VÒI XỊT & CHAI */}
        <Descriptions column={1} size="small">
          <Descriptions.Item label={t('ui.calibratedDosage')}>
            <Typography.Text strong style={{ whiteSpace: 'nowrap' }}>
              {slot.calibratedDosageMl} ml
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.lowStockThreshold')}>
            <Typography.Text style={{ whiteSpace: 'nowrap' }}>
              {slot.lowStockThresholdMl !== null && slot.lowStockThresholdMl !== undefined
                ? `${slot.lowStockThresholdMl} ml`
                : '-'}
            </Typography.Text>
          </Descriptions.Item>
          <Descriptions.Item label={t('ui.activeBottle')}>
            {product?.name ? (
              <div
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
              >
                <Typography.Text strong style={{ color: '#0f172a', fontSize: 13 }}>
                  {product.name}
                </Typography.Text>
                {product.sku && (
                  <Tag
                    color="purple"
                    style={{
                      fontSize: 10,
                      fontWeight: 600,
                      margin: 0,
                      padding: '0 6px',
                      borderRadius: 4,
                      lineHeight: '18px',
                    }}
                  >
                    {product.sku}
                  </Tag>
                )}
                {slot.activeBottleId && (
                  <Tooltip title={`Mã định danh chai: ${slot.activeBottleId}`}>
                    <Tag
                      style={{
                        fontSize: 10,
                        margin: 0,
                        cursor: 'pointer',
                        background: '#f1f5f9',
                        color: '#64748b',
                        borderRadius: 4,
                        lineHeight: '18px',
                        border: '1px solid #e2e8f0',
                      }}
                    >
                      BTL #{slot.slotNumber}
                    </Tag>
                  </Tooltip>
                )}
              </div>
            ) : slot.activeBottleId ? (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Typography.Text strong style={{ fontSize: 13 }}>
                  Chai #{slot.slotNumber}
                </Typography.Text>
                <Typography.Text copyable code style={{ fontSize: 11, maxWidth: 140 }} ellipsis>
                  {slot.activeBottleId}
                </Typography.Text>
              </div>
            ) : (
              <Typography.Text type="secondary" italic>
                {t('ui.noBottleInstalled')}
              </Typography.Text>
            )}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* MODAL XÁC NHẬN BẬT / TẮT SLOT THIẾT KẾ CAO CẤP */}
      <Modal
        open={toggleModalOpen}
        onCancel={() => setToggleModalOpen(false)}
        footer={null}
        centered
        width={440}
        styles={{
          body: {
            padding: '12px 8px',
          },
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div className={`slot-modal-icon-badge ${isAvailable ? 'danger' : 'success'}`}>
            <PoweroffOutlined
              style={{
                fontSize: 26,
                color: isAvailable ? '#ef4444' : '#10b981',
              }}
            />
          </div>

          <Typography.Title level={4} style={{ margin: '0 0 8px 0', fontWeight: 700 }}>
            {isAvailable
              ? t('ui.confirmDisableSlotTitle', { slotNumber: slot.slotNumber })
              : t('ui.confirmEnableSlotTitle', { slotNumber: slot.slotNumber })}
          </Typography.Title>

          <Typography.Paragraph
            type="secondary"
            style={{ fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}
          >
            {isAvailable ? t('ui.disableSlotWarning') : t('ui.enableSlotNotice')}
          </Typography.Paragraph>

          {/* Card preview thông tin buồng chứa */}
          <div
            style={{
              background: '#f8fafc',
              border: '1px solid #e2e8f0',
              borderRadius: 12,
              padding: '12px 16px',
              textAlign: 'left',
              marginBottom: 20,
            }}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Buồng chứa:
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 13 }}>
                Slot {slot.slotNumber}
              </Typography.Text>
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: 6,
              }}
            >
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Thương hiệu thuê:
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 13, color: '#0369a1' }}>
                {brand?.name ?? t('ui.vacantSlot')}
              </Typography.Text>
            </div>
            {product?.name && (
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: 6,
                }}
              >
                <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                  {t('ui.installedFragrance')}:
                </Typography.Text>
                <Typography.Text strong style={{ fontSize: 13, color: '#0f172a' }}>
                  {product.name} {product.sku ? `(${product.sku})` : ''}
                </Typography.Text>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                Dung tích còn lại:
              </Typography.Text>
              <Typography.Text strong style={{ fontSize: 13 }}>
                {remainingMl.toFixed(2)} ml ({remainingSprays} {t('ui.sprays')})
              </Typography.Text>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button
              style={{ borderRadius: 8, flex: 1 }}
              onClick={() => setToggleModalOpen(false)}
              disabled={setSlotEnabled.isPending}
            >
              {t('ui.cancel')}
            </Button>
            <Button
              type="primary"
              danger={isAvailable}
              style={{
                borderRadius: 8,
                flex: 1.3,
                fontWeight: 600,
                background: isAvailable
                  ? 'linear-gradient(135deg, #ef4444, #dc2626)'
                  : 'linear-gradient(135deg, #10b981, #059669)',
                borderColor: isAvailable ? '#dc2626' : '#059669',
                boxShadow: isAvailable
                  ? '0 4px 12px rgba(239, 68, 68, 0.35)'
                  : '0 4px 12px rgba(16, 185, 129, 0.35)',
              }}
              loading={setSlotEnabled.isPending}
              onClick={handleConfirmToggle}
            >
              {isAvailable ? t('ui.confirmDisableSlotBtn') : t('ui.confirmEnableSlotBtn')}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
