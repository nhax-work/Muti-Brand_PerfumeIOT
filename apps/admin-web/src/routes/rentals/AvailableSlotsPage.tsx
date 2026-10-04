import { useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Form,
  Row,
  Select,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  AppstoreAddOutlined,
  CheckCircleOutlined,
  DollarCircleOutlined,
  ShoppingCartOutlined,
} from '@ant-design/icons';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { useAvailableSlots, useCreateCheckout, useRentalQuote, type AvailableSlot } from './api';

const { Title, Text, Paragraph } = Typography;

interface SelectedSlotConfig {
  slotId: string;
  rentalPackageId?: string;
  storagePlanId?: string;
}

function SlotQuoteSelector({
  slot,
  config,
  onChange,
}: {
  slot: AvailableSlot;
  config: SelectedSlotConfig;
  onChange: (updated: SelectedSlotConfig) => void;
}) {
  const { t } = useI18n();
  const { data: quote, isLoading } = useRentalQuote(slot.slotId);

  if (isLoading) {
    return <Spin size="small" />;
  }

  if (!quote) {
    return <Text type="secondary">{t('common.notFound')}</Text>;
  }

  const selectedPkg = quote.packages.find((p) => p.rentalPackageId === config.rentalPackageId);
  const selectedPlan = quote.storagePlans.find((p) => p.id === config.storagePlanId);

  const estimatedRent = selectedPkg ? Number(selectedPkg.rentAmount) : 0;
  const estimatedStorage =
    selectedPlan && selectedPkg
      ? Number(selectedPlan.monthlyPrice) * selectedPkg.durationMonths
      : 0;
  const slotTotal = estimatedRent + estimatedStorage;

  return (
    <Card
      size="small"
      style={{ marginTop: 8, background: '#fafafa', borderColor: '#d9d9d9' }}
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            Slot {slot.slotNumber} • {Number(slot.monthlyRentPrice || 0).toLocaleString('vi-VN')}{' '}
            đ/tháng
          </span>
          {slotTotal > 0 && (
            <Tag color="blue">
              {slotTotal.toLocaleString('vi-VN')} {quote.currency}
            </Tag>
          )}
        </div>
      }
    >
      <Row gutter={12}>
        <Col xs={24} sm={12}>
          <Form.Item label={t('ui.selectPackage')} required style={{ marginBottom: 8 }}>
            <Select
              placeholder={t('ui.selectPackage')}
              value={config.rentalPackageId}
              onChange={(val) => onChange({ ...config, rentalPackageId: val })}
              options={quote.packages.map((pkg) => ({
                label: `${pkg.name} (${pkg.durationMonths} tháng${
                  pkg.discountPercent > 0 ? ` • -${pkg.discountPercent}%` : ''
                }) — ${Number(pkg.rentAmount).toLocaleString('vi-VN')} đ`,
                value: pkg.rentalPackageId,
              }))}
            />
          </Form.Item>
        </Col>
        <Col xs={24} sm={12}>
          <Form.Item label={t('ui.selectStoragePlan')} required style={{ marginBottom: 8 }}>
            <Select
              placeholder={t('ui.selectStoragePlan')}
              value={config.storagePlanId}
              onChange={(val) => onChange({ ...config, storagePlanId: val })}
              options={quote.storagePlans.map((plan) => ({
                label: `${plan.name} (${Number(plan.monthlyPrice).toLocaleString('vi-VN')} đ/tháng • Bồi thường ${
                  plan.coveragePercent
                }%)`,
                value: plan.id,
              }))}
            />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );
}

export default function AvailableSlotsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading, error } = useAvailableSlots({ pageSize: 50 });
  const createCheckout = useCreateCheckout();

  const [selectedConfigs, setSelectedConfigs] = useState<Map<string, SelectedSlotConfig>>(
    new Map(),
  );

  const slots = data?.items ?? [];

  const handleToggleSlot = (slot: AvailableSlot, checked: boolean) => {
    const next = new Map(selectedConfigs);
    if (checked) {
      next.set(slot.slotId, { slotId: slot.slotId });
    } else {
      next.delete(slot.slotId);
    }
    setSelectedConfigs(next);
  };

  const handleUpdateConfig = (config: SelectedSlotConfig) => {
    const next = new Map(selectedConfigs);
    next.set(config.slotId, config);
    setSelectedConfigs(next);
  };

  const handleCheckout = async () => {
    const items = Array.from(selectedConfigs.values());
    if (items.length === 0) {
      message.warning(t('slt.emptyCart'));
      return;
    }

    for (const item of items) {
      if (!item.rentalPackageId || !item.storagePlanId) {
        message.error(t('slt.storagePlanRequired'));
        return;
      }
    }

    try {
      const checkout = await createCheckout.mutateAsync({
        items: items.map((i) => ({
          slotId: i.slotId,
          rentalPackageId: i.rentalPackageId!,
          storagePlanId: i.storagePlanId!,
        })),
      });
      message.success(t('ui.holdAndCheckout'));
      void navigate(`/rentals/checkouts/${checkout.id}`);
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  return (
    <RequireRole allow={['BRAND_ADMIN']}>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <Title level={2} style={{ marginBottom: 4 }}>
            <AppstoreAddOutlined style={{ marginRight: 8, color: '#1677ff' }} />
            {t('ui.availableSlotsTitle')}
          </Title>
          <Paragraph type="secondary">{t('ui.availableSlotsSubtitle')}</Paragraph>
        </div>

        {error && (
          <Alert
            type="error"
            message={errorMessage(error, t)}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" />
          </div>
        ) : slots.length === 0 ? (
          <Empty description={t('ui.noAvailableSlots')} />
        ) : (
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={16}>
              <Card title={`${t('ui.slots')} (${slots.length})`}>
                {slots.map((slot) => {
                  const isSelected = selectedConfigs.has(slot.slotId);
                  const config = selectedConfigs.get(slot.slotId);

                  return (
                    <div
                      key={slot.slotId}
                      style={{
                        padding: '12px',
                        marginBottom: '12px',
                        border: '1px solid #f0f0f0',
                        borderRadius: '8px',
                        background: isSelected ? '#f6ffed' : '#fff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <Checkbox
                          checked={isSelected}
                          onChange={(e) => handleToggleSlot(slot, e.target.checked)}
                        >
                          <Text strong style={{ fontSize: 16 }}>
                            Slot #{slot.slotNumber}
                          </Text>{' '}
                          <Text type="secondary">
                            ({slot.machineDisplayName || slot.machineId} • {slot.locationName})
                          </Text>
                        </Checkbox>
                        <Tag color="green">
                          {Number(slot.monthlyRentPrice || 0).toLocaleString('vi-VN')} đ/tháng
                        </Tag>
                      </div>

                      {isSelected && config && (
                        <SlotQuoteSelector
                          slot={slot}
                          config={config}
                          onChange={handleUpdateConfig}
                        />
                      )}
                    </div>
                  );
                })}
              </Card>
            </Col>

            <Col xs={24} lg={8}>
              <Card
                title={
                  <span>
                    <ShoppingCartOutlined style={{ marginRight: 8 }} />
                    {t('ui.cartSummary')}
                  </span>
                }
                style={{ position: 'sticky', top: 24 }}
              >
                <Statistic
                  title={t('ui.selectedSlotsCount', { count: selectedConfigs.size })}
                  value={selectedConfigs.size}
                  prefix={<CheckCircleOutlined />}
                  valueStyle={{ color: '#1677ff' }}
                />

                <div style={{ marginTop: 24 }}>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<DollarCircleOutlined />}
                    disabled={selectedConfigs.size === 0}
                    loading={createCheckout.isPending}
                    onClick={handleCheckout}
                  >
                    {t('ui.holdAndCheckout')}
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>
        )}
      </div>
    </RequireRole>
  );
}
