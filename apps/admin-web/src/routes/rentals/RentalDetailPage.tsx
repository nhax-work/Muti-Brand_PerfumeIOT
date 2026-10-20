import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Empty,
  Form,
  Input,
  Modal,
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
  DollarCircleOutlined,
  FileTextOutlined,
  SwapOutlined,
  TagOutlined,
} from '@ant-design/icons';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import {
  useAssignProduct,
  useAvailableSlots,
  useBrandProducts,
  useRentalInvoice,
  useSetPricePerSpray,
  useSlotRental,
  useSwapSlot,
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
  const assignProduct = useAssignProduct();
  const setPricePerSpray = useSetPricePerSpray();
  const swapSlot = useSwapSlot();

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [priceInput, setPriceInput] = useState<string>('');
  const [selectedTargetSlotId, setSelectedTargetSlotId] = useState<string | undefined>(undefined);

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

  const swapWindowHours = 48;
  const isAwaitingStock = invoice.stage === 'AWAITING_STOCK' || rental?.status === 'DRAFT';
  const hasNotSwapped = !rental?.swappedFromSlotId;
  const within48Hours = Boolean(
    invoice.paidAt &&
    currentTimestamp - new Date(invoice.paidAt).getTime() <= swapWindowHours * 3600 * 1000,
  );
  const canSwap = isPaid && isAwaitingStock && hasNotSwapped && within48Hours;

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

  return (
    <RequireRole allow={['BRAND_ADMIN']}>
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
              slotNumber: rental.swappedFromSlotId.slice(0, 8),
              time: rental.swappedAt ? new Date(rental.swappedAt).toLocaleString('vi-VN') : '',
            })}
            showIcon
            style={{ marginBottom: 16 }}
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
                <Button
                  icon={<TagOutlined />}
                  onClick={() => {
                    setSelectedProductId(undefined);
                    setIsAssignModalOpen(true);
                  }}
                >
                  {t('ui.assignProduct')}
                </Button>
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
      </div>
    </RequireRole>
  );
}
