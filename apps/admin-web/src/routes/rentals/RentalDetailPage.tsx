import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  CalendarOutlined,
  CheckCircleOutlined,
  DeleteOutlined,
  DollarCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  StopOutlined,
  SwapOutlined,
  TagOutlined,
  UndoOutlined,
} from '@ant-design/icons';
import { RequireRole } from '@/app/guards/RequireRole';
import { useMyBrand } from '@/routes/brand-profile/api';
import { useRentalPackages, useStoragePlans } from '@/routes/pricing/api';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { useI18n } from '@/shared/i18n';
import {
  useAssignProduct,
  useAvailableSlots,
  useBrandProducts,
  useCloseSlotRental,
  useLiquidateSlotRental,
  useRentalInvoice,
  useRenewSlotRental,
  useRequestNonRenewal,
  useSetGracePeriod,
  useSetPricePerSpray,
  useSlotRental,
  useSwapSlot,
  useWithdrawNonRenewal,
  type BottleReturnMethod,
  type RentalInvoiceStage,
} from './api';

const { Title, Text, Paragraph } = Typography;

const STAGE_TAGS: Record<RentalInvoiceStage, { color: string; labelKey: string }> = {
  AWAITING_PAYMENT: { color: 'orange', labelKey: 'ui.stageAwaitingPayment' },
  AWAITING_STOCK: { color: 'cyan', labelKey: 'ui.stageAwaitingStock' },
  ACTIVE: { color: 'green', labelKey: 'ui.stageActive' },
  EXPIRING: { color: 'gold', labelKey: 'ui.stageExpiring' },
  GRACE: { color: 'magenta', labelKey: 'ui.stageGrace' },
  LIQUIDATED: { color: 'purple', labelKey: 'ui.stageLiquidated' },
  ENDED: { color: 'default', labelKey: 'ui.stageEnded' },
  CANCELLED: { color: 'red', labelKey: 'ui.stageCancelled' },
};

export default function RentalDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();

  const { data: invoice, isLoading, error, refetch } = useRentalInvoice(id);
  const { data: rental, refetch: refetchRental } = useSlotRental(id);
  const { data: productsData } = useBrandProducts();
  const { data: brand } = useMyBrand();
  const { data: packages = [] } = useRentalPackages();
  const { data: plans = [] } = useStoragePlans();
  const assignProduct = useAssignProduct();
  const setPricePerSpray = useSetPricePerSpray();
  const swapSlot = useSwapSlot();
  const requestNonRenewal = useRequestNonRenewal();
  const withdrawNonRenewal = useWithdrawNonRenewal();
  const renewRental = useRenewSlotRental();
  const setGracePeriod = useSetGracePeriod();
  const liquidateRental = useLiquidateSlotRental();
  const closeRental = useCloseSlotRental();

  const { user } = useAuth();
  const isSuperAdmin = user?.roles.includes('PLATFORM_SUPER_ADMIN') ?? false;
  const isBrandAdmin = user?.roles.includes('BRAND_ADMIN') ?? false;

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [isNonRenewalModalOpen, setIsNonRenewalModalOpen] = useState(false);
  const [returnMethod, setReturnMethod] = useState<BottleReturnMethod>('WAREHOUSE_PICKUP');
  const [isWithdrawModalOpen, setIsWithdrawModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [priceInput, setPriceInput] = useState<string>('');
  const [selectedTargetSlotId, setSelectedTargetSlotId] = useState<string | undefined>(undefined);

  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [selectedRenewalPackageId, setSelectedRenewalPackageId] = useState<string | undefined>(
    undefined,
  );
  const [selectedRenewalPlanId, setSelectedRenewalPlanId] = useState<string | undefined>(undefined);

  const [isGracePeriodModalOpen, setIsGracePeriodModalOpen] = useState(false);
  const [graceEndsAtInput, setGraceEndsAtInput] = useState<string>('');

  const [isLiquidateModalOpen, setIsLiquidateModalOpen] = useState(false);
  const [reauthPassword, setReauthPassword] = useState<string>('');

  const [currentTimestamp] = useState(() => Date.now());

  const { data: availableSlotsData, isLoading: isAvailableSlotsLoading } = useAvailableSlots({
    machineId: invoice?.machineId,
    pageSize: 100,
  });

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !invoice) {
    return (
      <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <Alert
          type="error"
          message={error ? errorMessage(error, t) : t('common.notFound')}
          showIcon
        />
        <Button
          icon={<ArrowLeftOutlined />}
          style={{ marginTop: 16 }}
          onClick={() => void navigate('/rentals')}
        >
          {t('ui.back')}
        </Button>
      </div>
    );
  }

  const products = productsData?.items ?? [];
  const isPaid = Boolean(invoice.paidAt);
  const stageConfig = STAGE_TAGS[invoice.stage] || { color: 'default', labelKey: invoice.stage };

  const swapWindowHours = SPEC_CONSTRAINTS.SLOT_SWAP_WINDOW_HOURS;
  const isAwaitingStock = invoice.stage === 'AWAITING_STOCK' || rental?.status === 'DRAFT';
  const hasNotSwapped = !rental?.swappedFromSlotId;
  const withinSwapWindow = Boolean(
    invoice.paidAt &&
    currentTimestamp - new Date(invoice.paidAt).getTime() <= swapWindowHours * 3600 * 1000,
  );
  const canSwap = isPaid && isAwaitingStock && hasNotSwapped && withinSwapWindow;

  const isRentalActiveOrExpiring = ['ACTIVE', 'EXPIRING'].includes(rental?.status ?? invoice.stage);
  const isBeforeEndsAt = invoice.endsAt
    ? new Date(invoice.endsAt).getTime() > currentTimestamp
    : true;
  const canRequestNonRenewal =
    isPaid && isRentalActiveOrExpiring && isBeforeEndsAt && !rental?.nonRenewalRequestedAt;
  const canWithdrawNonRenewal =
    isPaid && isRentalActiveOrExpiring && isBeforeEndsAt && Boolean(rental?.nonRenewalRequestedAt);

  const brandContact = (brand?.contactInfo ?? {}) as Record<string, unknown>;
  const brandAddress =
    typeof brandContact['address'] === 'string' ? brandContact['address'] : undefined;
  const brandPhone = typeof brandContact['phone'] === 'string' ? brandContact['phone'] : undefined;
  const brandEmail = typeof brandContact['email'] === 'string' ? brandContact['email'] : undefined;

  const candidateSlots = (availableSlotsData?.items ?? []).filter(
    (s) =>
      s.slotId !== invoice.slotId &&
      Number(s.monthlyRentPrice) === Number(invoice.monthlyRentPrice),
  );

  const handleSwapSlotSubmit = async () => {
    if (!id || !selectedTargetSlotId) return;
    try {
      await swapSlot.mutateAsync({ rentalId: id, targetSlotId: selectedTargetSlotId });
      message.success(t('ui.swapSlotSuccess'));
      setIsSwapModalOpen(false);
      setSelectedTargetSlotId(undefined);
      void refetch();
      void refetchRental();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleAssignProductSubmit = async () => {
    if (!id || !selectedProductId) return;
    try {
      await assignProduct.mutateAsync({ rentalId: id, fragranceProductId: selectedProductId });
      message.success(t('ui.productAssigned'));
      setIsAssignModalOpen(false);
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleSetPriceSubmit = async () => {
    if (!id || !priceInput) return;
    try {
      await setPricePerSpray.mutateAsync({ rentalId: id, pricePerSpray: priceInput });
      message.success(t('ui.pricePerSprayUpdated'));
      setIsPriceModalOpen(false);
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleNonRenewalSubmit = async () => {
    if (!id) return;
    try {
      await requestNonRenewal.mutateAsync({ rentalId: id, returnMethod });
      message.success(t('ui.nonRenewalSuccess'));
      setIsNonRenewalModalOpen(false);
      void refetch();
      void refetchRental();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleWithdrawNonRenewalSubmit = async () => {
    if (!id) return;
    try {
      await withdrawNonRenewal.mutateAsync(id);
      message.success(t('ui.withdrawNonRenewalSuccess'));
      setIsWithdrawModalOpen(false);
      void refetch();
      void refetchRental();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const canRenew = isBrandAdmin && ['EXPIRING', 'GRACE'].includes(rental?.status ?? invoice.stage);
  const canEditGracePeriod = isSuperAdmin && (rental?.status ?? invoice.stage) === 'GRACE';
  const canLiquidate = isSuperAdmin && (rental?.status ?? invoice.stage) === 'GRACE';
  const canCloseRental = isSuperAdmin && (rental?.status ?? invoice.stage) === 'LIQUIDATED';

  const handleRenewSubmit = async () => {
    if (!id || !selectedRenewalPackageId || !selectedRenewalPlanId) return;
    try {
      const checkout = await renewRental.mutateAsync({
        rentalId: id,
        rentalPackageId: selectedRenewalPackageId,
        storagePlanId: selectedRenewalPlanId,
      });
      message.success(t('ui.renewSuccess'));
      setIsRenewModalOpen(false);
      void navigate(`/rentals/checkouts/${checkout.id}`);
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleSetGracePeriodSubmit = async () => {
    if (!id || !graceEndsAtInput) return;
    try {
      await setGracePeriod.mutateAsync({
        rentalId: id,
        graceEndsAt: new Date(graceEndsAtInput).toISOString(),
      });
      message.success(t('ui.gracePeriodUpdated'));
      setIsGracePeriodModalOpen(false);
      void refetch();
      void refetchRental();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleLiquidateSubmit = async () => {
    if (!id || !reauthPassword) return;
    try {
      await liquidateRental.mutateAsync({
        rentalId: id,
        password: reauthPassword,
      });
      message.success(t('ui.liquidateSuccess'));
      setIsLiquidateModalOpen(false);
      setReauthPassword('');
      void refetch();
      void refetchRental();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleCloseRentalSubmit = async () => {
    if (!id) return;
    try {
      await closeRental.mutateAsync(id);
      message.success(t('ui.closeRentalSuccess'));
      void refetch();
      void refetchRental();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  return (
    <RequireRole allow={['BRAND_ADMIN', 'PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          style={{ marginBottom: 16 }}
          onClick={() => void navigate('/rentals')}
        >
          {t('ui.rentalsList')}
        </Button>

        {rental?.swappedFromSlotId && (
          <Alert
            type="info"
            message={t('ui.swappedFromNotice', {
              time: rental.swappedAt ? new Date(rental.swappedAt).toLocaleString('vi-VN') : '',
            })}
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {rental?.nonRenewalRequestedAt && isRentalActiveOrExpiring && isBeforeEndsAt && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={t('ui.nonRenewalActiveTitle')}
            description={
              <div>
                <div>
                  {t('ui.nonRenewalActiveDesc', {
                    date: new Date(rental.nonRenewalRequestedAt).toLocaleString('vi-VN'),
                    method:
                      rental.returnMethod === 'WAREHOUSE_PICKUP'
                        ? t('ui.warehousePickup')
                        : t('ui.shipToBrand'),
                  })}
                </div>
                {rental.returnMethod === 'SHIP_TO_BRAND' && (
                  <div style={{ marginTop: 4 }}>
                    <Text strong>{t('ui.returnAddress')}: </Text>
                    <Text>{brandAddress || t('ui.noAddressConfigured')}</Text>
                  </div>
                )}
              </div>
            }
            action={
              canWithdrawNonRenewal && (
                <Button size="small" onClick={() => setIsWithdrawModalOpen(true)}>
                  {t('ui.withdrawNonRenewal')}
                </Button>
              )
            }
          />
        )}

        <Card style={{ marginBottom: 24 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}
          >
            <div>
              <Title level={3} style={{ marginBottom: 4 }}>
                <FileTextOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                {t('ui.invoiceDetailTitle', {
                  number: invoice.invoiceNumber || t('ui.unpaid'),
                })}
              </Title>
              <Space>
                <Tag color={stageConfig.color}>{t(stageConfig.labelKey as never)}</Tag>
                {rental?.nonRenewalRequestedAt && (
                  <Tag color="orange">{t('ui.nonRenewingTag')}</Tag>
                )}
                {invoice.checkoutId && <Text type="secondary">Mã phiên: {invoice.checkoutId}</Text>}
              </Space>
            </div>

            {isPaid && (
              <Space>
                {canSwap && (
                  <Button
                    icon={<SwapOutlined />}
                    onClick={() => {
                      setSelectedTargetSlotId(undefined);
                      setIsSwapModalOpen(true);
                    }}
                  >
                    {t('ui.swapSlot')}
                  </Button>
                )}
                {isBrandAdmin && (
                  <Button
                    icon={<TagOutlined />}
                    onClick={() => {
                      setSelectedProductId(undefined);
                      setIsAssignModalOpen(true);
                    }}
                  >
                    {t('ui.assignProduct')}
                  </Button>
                )}
                {isBrandAdmin && (
                  <Button
                    type="primary"
                    icon={<DollarCircleOutlined />}
                    onClick={() => {
                      setPriceInput('');
                      setIsPriceModalOpen(true);
                    }}
                  >
                    {t('ui.setPricePerSpray')}
                  </Button>
                )}
                {canRequestNonRenewal && (
                  <Button
                    danger
                    icon={<StopOutlined />}
                    onClick={() => {
                      setReturnMethod('WAREHOUSE_PICKUP');
                      setIsNonRenewalModalOpen(true);
                    }}
                  >
                    {t('ui.nonRenewal')}
                  </Button>
                )}
                {canWithdrawNonRenewal && (
                  <Button icon={<UndoOutlined />} onClick={() => setIsWithdrawModalOpen(true)}>
                    {t('ui.withdrawNonRenewal')}
                  </Button>
                )}
                {canRenew && (
                  <Button
                    type="primary"
                    icon={<ReloadOutlined />}
                    onClick={() => {
                      setSelectedRenewalPackageId(undefined);
                      setSelectedRenewalPlanId(undefined);
                      setIsRenewModalOpen(true);
                    }}
                  >
                    {t('ui.renew')}
                  </Button>
                )}
                {canEditGracePeriod && (
                  <Button
                    icon={<CalendarOutlined />}
                    onClick={() => {
                      setGraceEndsAtInput('');
                      setIsGracePeriodModalOpen(true);
                    }}
                  >
                    {t('ui.editGracePeriod')}
                  </Button>
                )}
                {canLiquidate && (
                  <Button
                    danger
                    icon={<DeleteOutlined />}
                    onClick={() => {
                      setReauthPassword('');
                      setIsLiquidateModalOpen(true);
                    }}
                  >
                    {t('ui.liquidate')}
                  </Button>
                )}
                {canCloseRental && (
                  <Popconfirm
                    title={t('ui.closeRental')}
                    description={t('ui.closeRentalConfirmText')}
                    onConfirm={handleCloseRentalSubmit}
                    okText={t('ui.confirm')}
                    cancelText={t('ui.cancel')}
                  >
                    <Button type="primary" icon={<CheckCircleOutlined />}>
                      {t('ui.closeRental')}
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            )}
          </div>

          <Divider />

          <Descriptions bordered column={{ xs: 1, sm: 2, md: 3 }}>
            <Descriptions.Item label={t('ui.location')}>{invoice.locationName}</Descriptions.Item>
            <Descriptions.Item label={t('ui.machineInfo')}>
              {invoice.machineDisplayName || invoice.machineId}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.slotNumber')}>
              Slot #{invoice.slotNumber}
            </Descriptions.Item>

            <Descriptions.Item label={t('ui.rentalPeriod')}>
              {invoice.rentalPackage.name} ({invoice.durationMonths} tháng)
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.selectStoragePlan')}>
              {invoice.storagePlan.name} (Bồi thường {invoice.storagePlan.coveragePercent}%)
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.validUntil')}>
              {invoice.startsAt && invoice.endsAt ? (
                `${new Date(invoice.startsAt).toLocaleDateString('vi-VN')} - ${new Date(
                  invoice.endsAt,
                ).toLocaleDateString('vi-VN')}`
              ) : (
                <Text italic type="secondary">
                  {t('ui.validStartsOnStocking')}
                </Text>
              )}
            </Descriptions.Item>
            {rental?.graceEndsAt && (
              <Descriptions.Item label={t('ui.graceEndsAt')}>
                <Text type="danger">
                  {new Date(rental.graceEndsAt).toLocaleDateString('vi-VN')}{' '}
                  {new Date(rental.graceEndsAt).toLocaleTimeString('vi-VN', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          <Title level={4}>{t('ui.financialBreakdown')}</Title>
          <Descriptions bordered column={1}>
            <Descriptions.Item label={t('ui.rentFee')}>
              {Number(invoice.rentAmount).toLocaleString('vi-VN')} {invoice.currency}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.storageFee')}>
              {Number(invoice.storageAmount).toLocaleString('vi-VN')} {invoice.currency}
            </Descriptions.Item>
            {Number(invoice.graceFeeAmount) > 0 && (
              <Descriptions.Item label={t('ui.graceFee')}>
                {Number(invoice.graceFeeAmount).toLocaleString('vi-VN')} {invoice.currency}
              </Descriptions.Item>
            )}
            <Descriptions.Item label={t('ui.totalFee')}>
              <Text strong style={{ fontSize: 16, color: '#1677ff' }}>
                {Number(invoice.totalAmount).toLocaleString('vi-VN')} {invoice.currency}
              </Text>
            </Descriptions.Item>
          </Descriptions>
        </Card>

        {/* Modal Gán/Đổi sản phẩm */}
        <Modal
          title={t('ui.assignProduct')}
          open={isAssignModalOpen}
          onCancel={() => setIsAssignModalOpen(false)}
          onOk={handleAssignProductSubmit}
          confirmLoading={assignProduct.isPending}
        >
          <Form layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label={t('ui.selectProductPlaceholder')} required>
              <Select
                placeholder={t('ui.selectProductPlaceholder')}
                value={selectedProductId}
                onChange={setSelectedProductId}
                options={products.map((p) => ({
                  label: `${p.name} • SKU: ${p.sku}`,
                  value: p.id,
                }))}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal Đặt giá lượt xịt */}
        <Modal
          title={t('ui.setPricePerSpray')}
          open={isPriceModalOpen}
          onCancel={() => setIsPriceModalOpen(false)}
          onOk={handleSetPriceSubmit}
          confirmLoading={setPricePerSpray.isPending}
        >
          <Form layout="vertical" style={{ marginTop: 16 }}>
            <Form.Item label={t('ui.pricePerSprayVND')} required>
              <Input
                type="number"
                min="1000"
                step="1000"
                placeholder="VD: 15000"
                value={priceInput}
                onChange={(e) => setPriceInput(e.target.value)}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal Đổi slot (FR-SLT-55, ADR-0014) */}
        <Modal
          title={t('ui.swapSlotTitle')}
          open={isSwapModalOpen}
          onCancel={() => {
            setIsSwapModalOpen(false);
            setSelectedTargetSlotId(undefined);
          }}
          onOk={handleSwapSlotSubmit}
          confirmLoading={swapSlot.isPending}
          okButtonProps={{ disabled: !selectedTargetSlotId }}
          okText={t('ui.swapSlotConfirm')}
        >
          <Paragraph type="secondary">{t('ui.swapSlotDesc')}</Paragraph>
          <div
            style={{
              marginBottom: 16,
              padding: '8px 12px',
              background: '#fafafa',
              borderRadius: 6,
              border: '1px solid #f0f0f0',
            }}
          >
            <Text strong>{t('ui.currentSlotInfo')}: </Text>
            <Text>
              Slot #{invoice.slotNumber} • Giá niêm yết:{' '}
              {Number(invoice.monthlyRentPrice).toLocaleString('vi-VN')} {invoice.currency}/tháng
            </Text>
          </div>

          <Title level={5}>{t('ui.selectCandidateSlot')}</Title>
          {isAvailableSlotsLoading ? (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <Spin />
            </div>
          ) : candidateSlots.length === 0 ? (
            <Empty description={t('ui.noCandidateSlots')} />
          ) : (
            <Radio.Group
              value={selectedTargetSlotId}
              onChange={(e) => setSelectedTargetSlotId(e.target.value)}
              style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}
            >
              {candidateSlots.map((slot) => (
                <Radio
                  key={slot.slotId}
                  value={slot.slotId}
                  style={{
                    padding: '10px 14px',
                    border: '1px solid #d9d9d9',
                    borderRadius: 6,
                    background: selectedTargetSlotId === slot.slotId ? '#e6f4ff' : '#fff',
                  }}
                >
                  <Text strong>Slot #{slot.slotNumber}</Text> • {slot.locationName} (
                  {Number(slot.monthlyRentPrice).toLocaleString('vi-VN')} {invoice.currency}/tháng)
                </Radio>
              ))}
            </Radio.Group>
          )}
        </Modal>

        {/* Modal Báo không gia hạn (FR-EXP-23, ADR-0014) */}
        <Modal
          title={t('ui.nonRenewalModalTitle')}
          open={isNonRenewalModalOpen}
          onCancel={() => setIsNonRenewalModalOpen(false)}
          onOk={handleNonRenewalSubmit}
          confirmLoading={requestNonRenewal.isPending}
          okText={t('ui.requestNonRenewal')}
          okButtonProps={{ danger: true }}
        >
          <Paragraph type="secondary">{t('ui.nonRenewalModalDesc')}</Paragraph>
          <Divider />
          <Title level={5}>{t('ui.selectReturnMethod')}</Title>
          <Radio.Group
            value={returnMethod}
            onChange={(e) => setReturnMethod(e.target.value)}
            style={{
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              marginTop: 8,
            }}
          >
            <Radio
              value="WAREHOUSE_PICKUP"
              style={{
                padding: '10px 14px',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                background: returnMethod === 'WAREHOUSE_PICKUP' ? '#e6f4ff' : '#fff',
              }}
            >
              <Text strong>{t('ui.warehousePickup')}</Text>
            </Radio>
            <Radio
              value="SHIP_TO_BRAND"
              style={{
                padding: '10px 14px',
                border: '1px solid #d9d9d9',
                borderRadius: 6,
                background: returnMethod === 'SHIP_TO_BRAND' ? '#e6f4ff' : '#fff',
              }}
            >
              <Text strong>{t('ui.shipToBrand')}</Text>
            </Radio>
          </Radio.Group>

          {returnMethod === 'SHIP_TO_BRAND' && (
            <div
              style={{
                marginTop: 16,
                padding: '12px 16px',
                background: '#fafafa',
                borderRadius: 6,
                border: '1px solid #f0f0f0',
              }}
            >
              <Text strong>{t('ui.returnAddress')}: </Text>
              {!brandAddress ? (
                <Alert
                  type="warning"
                  showIcon
                  message={t('ui.noAddressConfigured')}
                  style={{ marginTop: 8 }}
                />
              ) : (
                <Paragraph style={{ margin: '4px 0 0' }}>{brandAddress}</Paragraph>
              )}
              {(brandPhone || brandEmail) && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  {[brandPhone && `SĐT: ${brandPhone}`, brandEmail && `Email: ${brandEmail}`]
                    .filter(Boolean)
                    .join(' • ')}
                </Text>
              )}
            </div>
          )}
        </Modal>

        {/* Modal Rút lại báo không gia hạn (FR-EXP-24, ADR-0014) */}
        <Modal
          title={t('ui.withdrawNonRenewalConfirmTitle')}
          open={isWithdrawModalOpen}
          onCancel={() => setIsWithdrawModalOpen(false)}
          onOk={handleWithdrawNonRenewalSubmit}
          confirmLoading={withdrawNonRenewal.isPending}
          okText={t('ui.withdrawNonRenewal')}
        >
          <Paragraph>{t('ui.withdrawNonRenewalConfirmDesc')}</Paragraph>
        </Modal>

        {/* Modal Gia hạn slot (FR-SLT-12, FR-EXP-12) */}
        <Modal
          title={t('ui.renewModalTitle')}
          open={isRenewModalOpen}
          onCancel={() => setIsRenewModalOpen(false)}
          onOk={handleRenewSubmit}
          confirmLoading={renewRental.isPending}
          okButtonProps={{ disabled: !selectedRenewalPackageId || !selectedRenewalPlanId }}
          okText={t('ui.renew')}
        >
          <Paragraph type="secondary">
            Gia hạn slot #{invoice.slotNumber} tại {invoice.locationName}. Sau khi chọn gói, bạn sẽ
            được chuyển đến trang thanh toán.
          </Paragraph>
          {Number(invoice.graceFeeAmount) > 0 && (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={`Phí lưu kho ân hạn tạm tính: ${Number(invoice.graceFeeAmount).toLocaleString('vi-VN')} ${invoice.currency}`}
              description="Khoản phí này được cộng vào phiên thanh toán gia hạn theo quy định."
            />
          )}
          <Form layout="vertical">
            <Form.Item label={t('ui.selectPackage')} required>
              <Select
                placeholder={t('ui.selectPackagePlaceholder')}
                value={selectedRenewalPackageId}
                onChange={setSelectedRenewalPackageId}
                options={packages
                  .filter((p) => p.isActive)
                  .map((p) => ({
                    label: `${p.name} (${p.durationMonths} tháng${
                      p.discountPercent > 0 ? ` - Giảm ${p.discountPercent}%` : ''
                    })`,
                    value: p.id,
                  }))}
              />
            </Form.Item>
            <Form.Item label={t('ui.selectStoragePlan')} required>
              <Select
                placeholder={t('ui.selectStoragePlanPlaceholder')}
                value={selectedRenewalPlanId}
                onChange={setSelectedRenewalPlanId}
                options={plans
                  .filter((p) => p.isActive)
                  .map((p) => ({
                    label: `${p.name} (${Number(p.monthlyPrice).toLocaleString('vi-VN')} ${
                      p.currency
                    }/tháng - Bồi thường ${p.coveragePercent}%)`,
                    value: p.id,
                  }))}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal Sửa thời hạn ân hạn (FR-EXP-07) - Super Admin */}
        <Modal
          title={t('ui.editGracePeriod')}
          open={isGracePeriodModalOpen}
          onCancel={() => setIsGracePeriodModalOpen(false)}
          onOk={handleSetGracePeriodSubmit}
          confirmLoading={setGracePeriod.isPending}
          okButtonProps={{ disabled: !graceEndsAtInput }}
          okText={t('ui.save')}
        >
          <Paragraph type="secondary">
            Cập nhật ngày kết thúc giai đoạn ân hạn cho slot #{invoice.slotNumber}. Ngày được chọn
            phải ở tương lai.
          </Paragraph>
          {rental?.graceEndsAt && (
            <div style={{ marginBottom: 16 }}>
              <Text strong>{t('ui.graceEndsAt')} hiện tại: </Text>
              <Text>{new Date(rental.graceEndsAt).toLocaleString('vi-VN')}</Text>
            </div>
          )}
          <Form layout="vertical">
            <Form.Item label={t('ui.graceEndsAt')} required>
              <DatePicker
                showTime
                style={{ width: '100%' }}
                onChange={(d) => setGraceEndsAtInput(d ? d.toISOString() : '')}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal Thanh lý hàng tồn (FR-EXP-14, FR-EXP-15) - Super Admin */}
        <Modal
          title={t('ui.liquidateModalTitle')}
          open={isLiquidateModalOpen}
          onCancel={() => {
            setIsLiquidateModalOpen(false);
            setReauthPassword('');
          }}
          onOk={handleLiquidateSubmit}
          confirmLoading={liquidateRental.isPending}
          okText={t('ui.liquidateConfirmText')}
          okButtonProps={{ danger: true, disabled: !reauthPassword }}
        >
          <div style={{ marginTop: 16 }}>
            <Paragraph type="secondary">
              {t('slt.rentalLiquidatedContent', {
                invoiceNumber: invoice.invoiceNumber || invoice.rentalId,
              })}
            </Paragraph>
            <Form layout="vertical">
              <Form.Item label={t('ui.reauthPasswordLabel')} required>
                <Input.Password
                  placeholder={t('ui.reauthPasswordPlaceholder')}
                  value={reauthPassword}
                  onChange={(e) => setReauthPassword(e.target.value)}
                />
              </Form.Item>
            </Form>
          </div>
        </Modal>
      </div>
    </RequireRole>
  );
}
