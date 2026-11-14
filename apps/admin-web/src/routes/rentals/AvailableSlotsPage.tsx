import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Col,
  Empty,
  Form,
  Row,
  Select,
  Skeleton,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { CloseOutlined, DollarCircleOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { RequireRole } from '@/app/guards/RequireRole';
import { FrameworkAgreementModal } from '@/shared/agreement';
import { ApiRequestError, errorMessage } from '@/shared/api';
import { useResendVerification } from '@/shared/auth';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { useAvailableSlots, useCreateCheckout, useRentalQuote, type AvailableSlot } from './api';
import { RentMachineCard } from './RentMachineCard';
import { groupByMachine } from './rentMachines';

const { Title, Text } = Typography;

interface SelectedSlotConfig {
  slotId: string;
  rentalPackageId?: string;
  storagePlanId?: string;
  estimatedTotal?: number;
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

  useEffect(() => {
    if (quote && (!config.rentalPackageId || !config.storagePlanId)) {
      const defaultPkg = config.rentalPackageId ?? quote.packages[0]?.rentalPackageId;
      const defaultPlan = config.storagePlanId ?? quote.storagePlans[0]?.id;
      const pkg = quote.packages.find((p) => p.rentalPackageId === defaultPkg);
      const plan = quote.storagePlans.find((p) => p.id === defaultPlan);
      const rent = pkg ? Number(pkg.rentAmount) : 0;
      const storage = plan && pkg ? Number(plan.monthlyPrice) * pkg.durationMonths : 0;
      onChange({
        ...config,
        rentalPackageId: defaultPkg,
        storagePlanId: defaultPlan,
        estimatedTotal: rent + storage,
      });
    }
  }, [quote, config.rentalPackageId, config.storagePlanId]);

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

  const handlePackageChange = (val: string) => {
    const pkg = quote.packages.find((p) => p.rentalPackageId === val);
    const plan = quote.storagePlans.find((p) => p.id === config.storagePlanId);
    const rent = pkg ? Number(pkg.rentAmount) : 0;
    const storage = plan && pkg ? Number(plan.monthlyPrice) * pkg.durationMonths : 0;
    onChange({
      ...config,
      rentalPackageId: val,
      estimatedTotal: rent + storage,
    });
  };

  const handlePlanChange = (val: string) => {
    const pkg = quote.packages.find((p) => p.rentalPackageId === config.rentalPackageId);
    const plan = quote.storagePlans.find((p) => p.id === val);
    const rent = pkg ? Number(pkg.rentAmount) : 0;
    const storage = plan && pkg ? Number(plan.monthlyPrice) * pkg.durationMonths : 0;
    onChange({
      ...config,
      storagePlanId: val,
      estimatedTotal: rent + storage,
    });
  };

  return (
    <div className="rent-config">
      <div className="rent-config-head">
        <Text strong>{t('ui.slotNumber', { slotNumber: slot.slotNumber })}</Text>
        {slotTotal > 0 && (
          <Text strong className="rent-config-total">
            {formatVnd(String(slotTotal))}
          </Text>
        )}
      </div>
      <Form layout="vertical" component="div">
        <Row gutter={12}>
          <Col xs={24} sm={12}>
            <Form.Item label={t('ui.selectPackage')} required className="rent-config-field">
              <Select
                placeholder={t('ui.selectPackage')}
                value={config.rentalPackageId}
                onChange={handlePackageChange}
                options={quote.packages.map((pkg) => ({
                  label: `${
                    pkg.discountPercent > 0
                      ? t('ui.packageWithMonthsDiscount', {
                          name: pkg.name,
                          months: pkg.durationMonths,
                          discount: pkg.discountPercent,
                        })
                      : t('ui.packageWithMonths', { name: pkg.name, months: pkg.durationMonths })
                  } — ${formatVnd(pkg.rentAmount)}`,
                  value: pkg.rentalPackageId,
                }))}
              />
            </Form.Item>
          </Col>
          <Col xs={24} sm={12}>
            <Form.Item label={t('ui.selectStoragePlan')} required className="rent-config-field">
              <Select
                placeholder={t('ui.selectStoragePlan')}
                value={config.storagePlanId}
                onChange={handlePlanChange}
                options={quote.storagePlans.map((plan) => ({
                  label: t('ui.storagePlanOption', {
                    name: plan.name,
                    price: formatVnd(plan.monthlyPrice),
                    percent: plan.coveragePercent,
                  }),
                  value: plan.id,
                }))}
              />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </div>
  );
}

export default function AvailableSlotsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { data, isLoading, error, refetch } = useAvailableSlots({ pageSize: 50 });
  const createCheckout = useCreateCheckout();
  const resendVerification = useResendVerification();

  const [selectedConfigs, setSelectedConfigs] = useState<Map<string, SelectedSlotConfig>>(
    new Map(),
  );
  const [isAgreementModalOpen, setIsAgreementModalOpen] = useState(false);
  const [unverifiedEmailAlert, setUnverifiedEmailAlert] = useState(false);
  const [holdLimitAlert, setHoldLimitAlert] = useState(false);

  const slots = useMemo(() => data?.items ?? [], [data]);
  const machines = useMemo(() => groupByMachine(slots), [slots]);
  const slotById = useMemo(() => new Map(slots.map((s) => [s.slotId, s])), [slots]);
  const selectedIds = useMemo(() => new Set(selectedConfigs.keys()), [selectedConfigs]);

  // Chưa bấm máy nào thì mở sẵn máy đầu tiên để thấy ngay dãy ô.
  const [expandedIds, setExpandedIds] = useState<ReadonlySet<string> | null>(null);
  const isExpanded = (machineId: string) =>
    expandedIds ? expandedIds.has(machineId) : machines[0]?.machineId === machineId;
  const toggleExpanded = (machineId: string) => {
    const next = new Set(expandedIds ?? (machines[0] ? [machines[0].machineId] : []));
    if (next.has(machineId)) next.delete(machineId);
    else next.add(machineId);
    setExpandedIds(next);
  };

  const handleToggleSlot = (slot: AvailableSlot, checked = !selectedConfigs.has(slot.slotId)) => {
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

  const handleResendVerification = async () => {
    try {
      await resendVerification.mutateAsync();
      message.success(t('ui.resendVerificationSuccess'));
    } catch (resendErr) {
      message.error(errorMessage(resendErr, t));
    }
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
      if (err instanceof ApiRequestError) {
        if (err.code === 'EMAIL_NOT_VERIFIED') {
          setUnverifiedEmailAlert(true);
          message.error(errorMessage(err, t));
          return;
        }
        if (err.code === 'AGREEMENT_NOT_ACCEPTED') {
          setIsAgreementModalOpen(true);
          message.warning(t('ui.agreementRequiredNotice'));
          return;
        }
        if (err.code === 'HOLD_LIMIT_REACHED') {
          setHoldLimitAlert(true);
          message.error(t('slt.holdLimitReached') || errorMessage(err, t));
          return;
        }
      }

      message.error(errorMessage(err, t));

      // Tự động tải lại danh sách slot khả dụng từ server
      const updated = await refetch();
      const availableIds = new Set((updated.data?.items ?? []).map((s) => s.slotId));

      let hadRemoved = false;
      setSelectedConfigs((prev) => {
        const next = new Map<string, SelectedSlotConfig>();
        for (const [id, cfg] of prev.entries()) {
          if (availableIds.has(id)) {
            next.set(id, cfg);
          } else {
            hadRemoved = true;
          }
        }
        return next;
      });

      if (hadRemoved) {
        message.warning(t('ui.slotsOverlappedNotice'));
      }
    }
  };

  const totalEstimatedAmount = Array.from(selectedConfigs.values()).reduce(
    (sum, cfg) => sum + (cfg.estimatedTotal || 0),
    0,
  );

  const selectedSlots = Array.from(selectedConfigs.values())
    .map((cfg) => ({ cfg, slot: slotById.get(cfg.slotId) }))
    .filter((x): x is { cfg: SelectedSlotConfig; slot: AvailableSlot } => Boolean(x.slot));

  return (
    <RequireRole allow={['BRAND_ADMIN']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Title level={3} style={{ margin: 0 }}>
            {t('ui.availableSlotsTitle')}
          </Title>
          <Text type="secondary">{t('ui.availableSlotsSubtitle')}</Text>
        </div>

        {unverifiedEmailAlert && (
          <Alert
            type="warning"
            showIcon
            message={t('ui.emailNotVerifiedNotice')}
            action={
              <Button
                size="small"
                type="primary"
                loading={resendVerification.isPending}
                onClick={handleResendVerification}
              >
                {t('ui.resendVerification')}
              </Button>
            }
            closable
            onClose={() => setUnverifiedEmailAlert(false)}
          />
        )}

        {holdLimitAlert && (
          <Alert
            type="error"
            message={t('slt.holdLimitReached')}
            showIcon
            closable
            onClose={() => setHoldLimitAlert(false)}
          />
        )}

        {error && <Alert type="error" message={errorMessage(error, t)} showIcon />}

        {isLoading ? (
          <Card>
            <Skeleton active paragraph={{ rows: 6 }} />
          </Card>
        ) : slots.length === 0 ? (
          <Card>
            <Empty description={t('ui.noAvailableSlots')} />
          </Card>
        ) : (
          <Row gutter={[24, 24]} align="top">
            <Col xs={24} xl={16}>
              <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                <Text type="secondary">
                  {t('ui.rentMachinesCount', { count: machines.length, slots: slots.length })}
                </Text>
                {machines.map((machine) => (
                  <RentMachineCard
                    key={machine.machineId}
                    machine={machine}
                    expanded={isExpanded(machine.machineId)}
                    onToggleExpanded={() => toggleExpanded(machine.machineId)}
                    selectedSlotIds={selectedIds}
                    onToggleSlot={(slot) => handleToggleSlot(slot)}
                  >
                    {selectedSlots.some(({ slot }) => slot.machineId === machine.machineId) && (
                      <div className="rent-config-list">
                        <Text strong>{t('ui.rentConfigTitle')}</Text>
                        {selectedSlots
                          .filter(({ slot }) => slot.machineId === machine.machineId)
                          .sort((a, b) => a.slot.slotNumber - b.slot.slotNumber)
                          .map(({ slot, cfg }) => (
                            <SlotQuoteSelector
                              key={slot.slotId}
                              slot={slot}
                              config={cfg}
                              onChange={handleUpdateConfig}
                            />
                          ))}
                      </div>
                    )}
                  </RentMachineCard>
                ))}
              </Space>
            </Col>

            <Col xs={24} xl={8}>
              <Card
                className="rent-cart"
                title={
                  <Space size={8}>
                    <ShoppingCartOutlined />
                    {t('ui.cartSummary')}
                  </Space>
                }
                extra={
                  <Tag color={selectedConfigs.size > 0 ? 'blue' : 'default'}>
                    {t('ui.selectedSlotsCount', { count: selectedConfigs.size })}
                  </Tag>
                }
              >
                {selectedSlots.length === 0 ? (
                  <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.rentCartEmpty')} />
                ) : (
                  <ul className="rent-cart-list">
                    {selectedSlots.map(({ slot, cfg }) => (
                      <li key={slot.slotId}>
                        <div className="rent-cart-item-info">
                          <Text strong>{t('ui.slotNumber', { slotNumber: slot.slotNumber })}</Text>
                          <Text type="secondary" ellipsis>
                            {slot.machineDisplayName || slot.machineId}
                          </Text>
                        </div>
                        <Text className="rent-cart-item-amount">
                          {cfg.estimatedTotal ? formatVnd(String(cfg.estimatedTotal)) : '—'}
                        </Text>
                        <Button
                          type="text"
                          size="small"
                          icon={<CloseOutlined />}
                          aria-label={t('ui.rentRemoveSlot')}
                          onClick={() => handleToggleSlot(slot, false)}
                        />
                      </li>
                    ))}
                  </ul>
                )}

                <div className="rent-cart-total">
                  <Text type="secondary">{t('ui.estimatedTotal')}</Text>
                  <Text strong className="rent-cart-total-amount">
                    {formatVnd(String(totalEstimatedAmount))}
                  </Text>
                </div>

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
              </Card>
            </Col>
          </Row>
        )}

        <FrameworkAgreementModal
          open={isAgreementModalOpen}
          onClose={() => setIsAgreementModalOpen(false)}
          // Đồng ý xong thì tạo tiếp phiên thanh toán đang dở.
          onAccepted={handleCheckout}
          busy={createCheckout.isPending}
        />
      </Space>
    </RequireRole>
  );
}
