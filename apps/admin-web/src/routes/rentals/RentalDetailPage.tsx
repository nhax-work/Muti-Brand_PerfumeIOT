import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
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
  TagOutlined,
} from '@ant-design/icons';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import {
  useAssignProduct,
  useBrandProducts,
  useRentalInvoice,
  useSetPricePerSpray,
  type RentalInvoiceStage,
} from './api';

const { Title, Text } = Typography;

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

  const { data: invoice, isLoading, error } = useRentalInvoice(id);
  const { data: productsData } = useBrandProducts();
  const assignProduct = useAssignProduct();
  const setPricePerSpray = useSetPricePerSpray();

  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [isPriceModalOpen, setIsPriceModalOpen] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [priceInput, setPriceInput] = useState<string>('');

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
      </div>
    </RequireRole>
  );
}
