import { PictureOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Empty,
  Form,
  Modal,
  Select,
  Space,
  Steps,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useInventoryBatches, useShipmentDeclarations } from '@/routes/shipments/api';
import { errorMessage } from '@/shared/api';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  PRODUCT_PARAM,
  RETURN_TO_PARAM,
  slotSetupReturnPath,
  withParams,
} from '@/shared/return-to';
import { useAssignProduct, useBrandProducts, type Product, type SlotRental } from './api';

interface SetupForm {
  productId?: string;
}

type StepStatus = 'wait' | 'process' | 'finish';

interface StepView {
  readonly title: string;
  readonly status: StepStatus;
  readonly content?: ReactNode;
}

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

/** Một dòng mô tả của bước, kèm nút hành động nếu thương hiệu cần làm gì đó. */
function StepNote({ text, action }: { text: string; action?: ReactNode }) {
  return (
    <Space orientation="vertical" size={4}>
      <Typography.Text type="secondary">{text}</Typography.Text>
      {action}
    </Space>
  );
}

/**
 * Cấu hình một slot đang thuê: gán sản phẩm (FR-SLT-27, FR-SLT-28) — giá đi theo sản phẩm (ADR-0023).
 * Danh sách bước dẫn Brand Admin tới lúc slot bán được (FR-SLT-29): gửi hàng về kho (FR-INV-22), giấy
 * tờ chính hãng của lô (FR-INV-33) và lắp chai. Trạng thái từng bước chỉ đọc dữ liệu máy chủ (FE5).
 */
export function SlotSetupModal({
  rental,
  slotLabel,
  locationName,
  open,
  onClose,
  initialProductId,
}: {
  rental: SlotRental;
  slotLabel: string;
  locationName?: string;
  open: boolean;
  onClose: () => void;
  /** Sản phẩm vừa tạo từ nút "Tạo sản phẩm" — chọn sẵn để chỉ cần bấm Lưu. */
  initialProductId?: string;
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [form] = Form.useForm<SetupForm>();
  const { data: productsData, isLoading: productsLoading } = useBrandProducts();
  const shipments = useShipmentDeclarations();
  const batches = useInventoryBatches();
  const assignProduct = useAssignProduct();

  // Sản phẩm ngừng kinh doanh không gán được nữa — chỉ giữ lại nếu slot đang dùng nó.
  const products = (productsData?.items ?? []).filter(
    (p) => p.status !== 'DISCONTINUED' || p.id === rental.fragranceProductId,
  );
  const selectedId = Form.useWatch('productId', form);
  const selected = products.find((p) => p.id === selectedId);
  const noProducts = !productsLoading && products.length === 0;

  const returnTo = slotSetupReturnPath(location.pathname, rental.id);
  const goCreateProduct = () =>
    void navigate(withParams('/products', { new: '1', [RETURN_TO_PARAM]: returnTo }));

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v?.productId) return;
    try {
      if (v.productId !== rental.fragranceProductId) {
        await assignProduct.mutateAsync({ rentalId: rental.id, fragranceProductId: v.productId });
      }
      message.success(t('ui.slotSetupSaved'));
      onClose();
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  const steps = buildSteps();

  function buildSteps(): StepView[] {
    const productId = rental.fragranceProductId;
    const installed = rental.stage !== 'AWAITING_STOCK';
    const declarations = (shipments.data?.items ?? []).filter(
      (d) => d.fragranceProductId === productId && d.status !== 'CANCELLED',
    );
    const received = declarations.some(
      (d) => d.status === 'RECEIVED' || d.status === 'DISCREPANCY',
    );
    const declared = declarations.some((d) => d.status === 'DECLARED');
    const productBatches = (batches.data?.items ?? []).filter(
      (b) => b.fragranceProductId === productId,
    );
    const approved = productBatches.some((b) => b.authenticityStatus === 'APPROVED');
    const pending = productBatches.some((b) => b.authenticityStatus === 'PENDING');

    const assign: StepView = {
      title: t('ui.slotSetupStepProduct'),
      status: productId ? 'finish' : 'process',
      content: productId ? undefined : <StepNote text={t('ui.slotSetupAssignPending')} />,
    };
    if (installed && productId) {
      return [
        assign,
        { title: t('ui.slotSetupStepShip'), status: 'finish' },
        { title: t('ui.slotSetupStepDocs'), status: 'finish' },
        {
          title: t('ui.slotSetupStepInstall'),
          status: 'finish',
          content: <StepNote text={t('ui.slotSetupInstallDone')} />,
        },
      ];
    }

    const declareLink = productId
      ? withParams('/shipments', {
          declare: '1',
          [PRODUCT_PARAM]: productId,
          [RETURN_TO_PARAM]: returnTo,
        })
      : null;
    const ship: StepView = !productId
      ? { title: t('ui.slotSetupStepShip'), status: 'wait' }
      : received
        ? {
            title: t('ui.slotSetupStepShip'),
            status: 'finish',
            content: <StepNote text={t('ui.slotSetupShipReceived')} />,
          }
        : declared
          ? {
              // Phần của thương hiệu ở bước này (khai báo, gửi hàng) đã xong; còn lại là kho nhận.
              title: t('ui.slotSetupStepShip'),
              status: 'finish',
              content: <StepNote text={t('ui.slotSetupShipDeclared')} />,
            }
          : {
              title: t('ui.slotSetupStepShip'),
              status: 'process',
              content: (
                <StepNote
                  text={t('ui.slotSetupShipNone')}
                  action={
                    <Button size="small" onClick={() => void navigate(declareLink!)}>
                      {t('ui.slotSetupDeclareShipment')}
                    </Button>
                  }
                />
              ),
            };

    const docs: StepView = approved
      ? {
          title: t('ui.slotSetupStepDocs'),
          status: 'finish',
          content: <StepNote text={t('ui.slotSetupDocsApproved')} />,
        }
      : pending
        ? {
            title: t('ui.slotSetupStepDocs'),
            status: 'process',
            content: <StepNote text={t('ui.slotSetupDocsPending')} />,
          }
        : productBatches.length > 0
          ? {
              title: t('ui.slotSetupStepDocs'),
              status: 'process',
              content: (
                <StepNote
                  text={t('ui.slotSetupDocsMissing')}
                  action={
                    <Button
                      size="small"
                      onClick={() => void navigate(withParams('/shipments', { tab: 'batches' }))}
                    >
                      {t('ui.slotSetupSubmitDocs')}
                    </Button>
                  }
                />
              ),
            }
          : {
              title: t('ui.slotSetupStepDocs'),
              status: 'wait',
              content: productId ? (
                <StepNote text={t('ui.slotSetupDocsWaitingBatch')} />
              ) : undefined,
            };

    return [
      assign,
      ship,
      docs,
      {
        title: t('ui.slotSetupStepInstall'),
        status: 'wait',
        content: <StepNote text={t('ui.slotSetupInstallWaiting')} />,
      },
    ];
  }

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
          loading={assignProduct.isPending}
          disabled={noProducts || !selectedId || selectedId === rental.fragranceProductId}
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
          {rental.stage === 'AWAITING_STOCK' && (
            <Tag color="blue">{t('ui.stageAwaitingStock')}</Tag>
          )}
        </div>

        <Card
          size="small"
          title={t('ui.slotSetupProductLabel')}
          extra={
            <Button type="link" size="small" icon={<PlusOutlined />} onClick={goCreateProduct}>
              {t('ui.slotSetupCreateProduct')}
            </Button>
          }
        >
          {noProducts ? (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('ui.slotSetupNoProducts')}>
              <Button type="primary" icon={<PlusOutlined />} onClick={goCreateProduct}>
                {t('ui.slotSetupCreateProduct')}
              </Button>
            </Empty>
          ) : (
            <Form
              form={form}
              layout="vertical"
              initialValues={{
                productId: initialProductId ?? rental.fragranceProductId ?? undefined,
              }}
            >
              <Form.Item
                name="productId"
                rules={[{ required: true, message: t('validation.required') }]}
                style={{ marginBottom: selected ? 8 : 0 }}
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
              {selected && (
                <div className="slot-setup-price">
                  <Typography.Text strong>
                    {t('ui.slotSetupProductPrice', { price: formatVnd(selected.defaultPrice) })}
                  </Typography.Text>
                  <Typography.Text type="secondary">
                    {t('ui.slotSetupProductPriceHint')}{' '}
                    <Typography.Link onClick={() => void navigate('/products')}>
                      {t('ui.slotSetupChangePrice')}
                    </Typography.Link>
                  </Typography.Text>
                </div>
              )}
            </Form>
          )}
        </Card>

        <Card size="small" title={t('ui.slotSetupProgressTitle')}>
          <Steps orientation="vertical" size="small" items={steps} />
        </Card>
      </Space>
    </Modal>
  );
}
