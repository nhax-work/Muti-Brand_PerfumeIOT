import { PictureOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Empty,
  Form,
  InputNumber,
  Modal,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import { useNavigate } from 'react-router';
import { errorMessage } from '@/shared/api';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  useAssignProduct,
  useBrandProducts,
  useSetPricePerSpray,
  type Product,
  type SlotRental,
} from './api';

interface SetupForm {
  productId?: string;
  price?: number | null;
}

/** Hiện số tiền có dấu chấm ngăn nghìn trong ô nhập (25000 → 25.000). */
const groupThousands = (value: string | number | undefined) =>
  `${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const ungroupThousands = (value: string | undefined) => (value ?? '').replace(/\./g, '');

function ProductThumb({ product }: { product: Product }) {
  return (
    <div className="slot-setup-thumb">
      {product.imageUrl ? (
        <img src={product.imageUrl} alt={product.name} />
      ) : (
        <PictureOutlined className="slot-setup-thumb-placeholder" />
      )}
    </div>
  );
}

/**
 * Cấu hình một slot đang thuê: chọn sản phẩm (FR-SLT-27, FR-SLT-28) và giá mỗi lượt xịt (FR-SLT-08)
 * trong một hộp thoại. Thanh bước chỉ đọc dữ liệu máy chủ (FE5) để Brand Admin thấy slot còn thiếu
 * gì trước khi kiosk bán được (FR-SLT-29).
 */
export function SlotSetupModal({
  rental,
  slotLabel,
  locationName,
  open,
  onClose,
}: {
  rental: SlotRental;
  slotLabel: string;
  locationName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [form] = Form.useForm<SetupForm>();
  const { data: productsData, isLoading: productsLoading } = useBrandProducts();
  const assignProduct = useAssignProduct();
  const setPrice = useSetPricePerSpray();

  // Sản phẩm ngừng kinh doanh không gán được nữa — chỉ giữ lại nếu slot đang dùng nó.
  const products = (productsData?.items ?? []).filter(
    (p) => p.status !== 'DISCONTINUED' || p.id === rental.fragranceProductId,
  );
  const selectedId = Form.useWatch('productId', form);
  const priceValue = Form.useWatch('price', form);
  const selected = products.find((p) => p.id === selectedId);

  const hasProduct = Boolean(rental.fragranceProductId);
  const hasPrice = Boolean(rental.pricePerSpray);
  const awaitingStock = rental.stage === 'AWAITING_STOCK';
  const saving = assignProduct.isPending || setPrice.isPending;

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v || !v.productId || v.price == null) return;
    try {
      if (v.productId !== rental.fragranceProductId) {
        await assignProduct.mutateAsync({ rentalId: rental.id, fragranceProductId: v.productId });
      }
      if (!rental.pricePerSpray || Number(rental.pricePerSpray) !== v.price) {
        await setPrice.mutateAsync({ rentalId: rental.id, pricePerSpray: String(v.price) });
      }
      message.success(t('ui.slotSetupSaved'));
      onClose();
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  const noProducts = !productsLoading && products.length === 0;

  return (
    <Modal
      title={t('ui.configSlot')}
      open={open}
      onCancel={onClose}
      width={720}
      destroyOnHidden
      footer={[
        <Button key="cancel" onClick={onClose}>
          {t('ui.cancel')}
        </Button>,
        <Button
          key="save"
          type="primary"
          loading={saving}
          disabled={noProducts}
          onClick={() => void save()}
        >
          {t('ui.slotSetupSave')}
        </Button>,
      ]}
    >
      <Space orientation="vertical" size="large" style={{ width: '100%' }}>
        <div className="slot-setup-heading">
          <div>
            <Typography.Text strong>{slotLabel}</Typography.Text>
            {locationName && (
              <div>
                <Typography.Text type="secondary">{locationName}</Typography.Text>
              </div>
            )}
          </div>
          {awaitingStock && <Tag color="blue">{t('ui.stageAwaitingStock')}</Tag>}
        </div>

        <Steps
          size="small"
          items={[
            {
              title: t('ui.slotSetupStepProduct'),
              status: hasProduct ? 'finish' : 'process',
            },
            {
              title: t('ui.slotSetupStepPrice'),
              status: hasPrice ? 'finish' : hasProduct ? 'process' : 'wait',
            },
            {
              title: t('ui.slotSetupStepStock'),
              content: awaitingStock ? t('ui.slotSetupStockWaiting') : undefined,
              status: awaitingStock ? 'wait' : 'finish',
            },
          ]}
        />

        <Form
          form={form}
          layout="vertical"
          requiredMark
          initialValues={{
            productId: rental.fragranceProductId ?? undefined,
            price: rental.pricePerSpray ? Number(rental.pricePerSpray) : undefined,
          }}
        >
          <Card size="small" title={t('ui.slotSetupProductLabel')} className="slot-setup-section">
            {noProducts ? (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.slotSetupNoProducts')}>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => void navigate('/products?new=1')}
                >
                  {t('ui.slotSetupCreateProduct')}
                </Button>
              </Empty>
            ) : (
              <Form.Item
                name="productId"
                rules={[{ required: true, message: t('validation.required') }]}
                style={{ marginBottom: 0 }}
              >
                <Select
                  showSearch
                  loading={productsLoading}
                  placeholder={t('ui.selectProductPlaceholder')}
                  optionFilterProp="searchText"
                  options={products.map((p) => ({
                    value: p.id,
                    label: p.name,
                    searchText: `${p.name} ${p.sku}`,
                    product: p,
                  }))}
                  optionRender={(option) => {
                    const p = option.data.product as Product;
                    return (
                      <div className="slot-setup-option">
                        <ProductThumb product={p} />
                        <div className="slot-setup-option-body">
                          <Typography.Text strong>{p.name}</Typography.Text>
                          <Typography.Text type="secondary">
                            {t('ui.slotSetupProductMeta', {
                              sku: p.sku,
                              price: formatVnd(p.defaultPrice),
                            })}
                          </Typography.Text>
                        </div>
                        {p.status === 'DISCONTINUED' && <Tag>{t('ui.productDiscontinued')}</Tag>}
                      </div>
                    );
                  }}
                />
              </Form.Item>
            )}
          </Card>

          <Card size="small" title={t('ui.pricePerSpray')} className="slot-setup-section">
            <Form.Item
              name="price"
              rules={[{ required: true, message: t('validation.required') }]}
              style={{ marginBottom: 0 }}
              extra={
                selected && (
                  <Space size={4} wrap>
                    {t('ui.slotSetupSuggestedPrice', { price: formatVnd(selected.defaultPrice) })}
                    {Number(selected.defaultPrice) !== priceValue && (
                      <Button
                        type="link"
                        size="small"
                        style={{ padding: 0 }}
                        onClick={() => form.setFieldValue('price', Number(selected.defaultPrice))}
                      >
                        {t('ui.slotSetupUseSuggested')}
                      </Button>
                    )}
                  </Space>
                )
              }
            >
              <InputNumber<number>
                min={1}
                step={1000}
                precision={0}
                suffix="VND"
                placeholder="25.000"
                formatter={groupThousands}
                parser={(v) => Number(ungroupThousands(v))}
                style={{ width: '100%' }}
                disabled={noProducts}
              />
            </Form.Item>
          </Card>
        </Form>

        <Alert
          type={hasProduct && hasPrice ? 'success' : 'info'}
          showIcon
          title={
            hasProduct && hasPrice
              ? awaitingStock
                ? t('ui.slotSetupReadyAwaitingStock')
                : t('ui.slotSetupReadySelling')
              : t('ui.slotSetupMissing')
          }
        />
      </Space>
    </Modal>
  );
}
