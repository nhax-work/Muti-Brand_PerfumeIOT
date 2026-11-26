import { PictureOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
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
import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { formatDate, formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  PRODUCT_PARAM,
  RETURN_TO_PARAM,
  slotSetupReturnPath,
  withParams,
} from '@/shared/return-to';
import { useAssignProduct, useBrandProducts, type Product, type SlotRental } from './api';
import {
  hasPendingShipment,
  inWarehouse,
  lessReady,
  productReadiness,
  type ProductReadiness,
} from './slot-product-readiness';

interface SetupForm {
  productId?: string;
}

type StepStatus = 'wait' | 'process' | 'finish';

type LockReason = NonNullable<SlotRental['productLockReason']>;

const LOCK_MESSAGE = {
  INSTALLED: 'ui.slotSetupLockedInstalled',
  STOCK_IN_WAREHOUSE: 'ui.slotSetupLockedStock',
  REFILL_IN_PROGRESS: 'ui.slotSetupLockedRefill',
} as const satisfies Record<LockReason, string>;

const READINESS_LABEL = {
  READY: 'ui.slotSetupReadyInstall',
  DOCS: 'ui.slotSetupReadyDocs',
  SHIPPING: 'ui.slotSetupReadyShipping',
  NONE: 'ui.slotSetupReadyNone',
} as const satisfies Record<ProductReadiness, string>;

const READINESS_COLOR: Record<ProductReadiness, string | undefined> = {
  READY: 'green',
  DOCS: 'blue',
  SHIPPING: 'gold',
  NONE: undefined,
};

/** Hạn lắp chai: `RENTAL_MAX_STOCKING_DAYS` ngày kể từ lúc thanh toán (ADR-0006, ADR-0035 mục 3). */
function stockingDeadline(paidAt: string): Date {
  const deadline = new Date(paidAt);
  deadline.setDate(deadline.getDate() + SPEC_CONSTRAINTS.RENTAL_MAX_STOCKING_DAYS);
  return deadline;
}

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
 *
 * ADR-0035: máy chủ báo `productLockReason` khi slot đã lắp chai, kho đã có hàng hoặc kho đang nạp —
 * khi đó chỉ cho xem sản phẩm. Còn đổi được thì mỗi sản phẩm kèm nhãn mức sẵn sàng, và trước khi lưu
 * hiện hộp xác nhận nêu hậu quả (kho chuẩn bị lại, hạn lắp chai, khóa sau khi lưu).
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
  const lockReason = rental.productLockReason ?? null;

  const batchItems = batches.data?.items ?? [];
  const declarationItems = (shipments.data?.items ?? []).filter((d) => d.status !== 'CANCELLED');
  const readinessOf = (productId: string) =>
    productReadiness(productId, batchItems, declarationItems);

  const returnTo = slotSetupReturnPath(location.pathname, rental.id);
  const goCreateProduct = () =>
    void navigate(withParams('/products', { new: '1', [RETURN_TO_PARAM]: returnTo }));

  const submit = async (productId: string) => {
    try {
      await assignProduct.mutateAsync({ rentalId: rental.id, fragranceProductId: productId });
      message.success(t('ui.slotSetupSaved'));
      onClose();
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  /** Hậu quả của lần lưu này, mỗi ý một đoạn (ADR-0035 mục 6). Rỗng thì lưu luôn không cần hỏi. */
  const consequences = (productId: string): string[] => {
    const previousId = rental.fragranceProductId;
    const next = readinessOf(productId);
    const nextName = products.find((p) => p.id === productId)?.name ?? '';
    const lines: string[] = [];
    if (previousId) {
      const previousName = products.find((p) => p.id === previousId)?.name ?? '';
      lines.push(t('ui.slotSetupConfirmChange'));
      if (
        rental.stage === 'AWAITING_STOCK' &&
        rental.paidAt &&
        !inWarehouse(next) &&
        lessReady(next, readinessOf(previousId))
      ) {
        lines.push(
          t('ui.slotSetupConfirmNoStock', {
            product: nextName,
            deadline: formatDate(stockingDeadline(rental.paidAt)),
          }),
        );
      }
      if (hasPendingShipment(previousId, declarationItems)) {
        lines.push(t('ui.slotSetupConfirmDeclared', { product: previousName }));
      }
    }
    if (inWarehouse(next)) lines.push(t('ui.slotSetupConfirmWillLock', { product: nextName }));
    return lines;
  };

  const save = async () => {
    const v = await form.validateFields().catch(() => null);
    if (!v?.productId) return;
    if (v.productId === rental.fragranceProductId) {
      onClose();
      return;
    }
    const lines = consequences(v.productId);
    if (lines.length === 0) {
      await submit(v.productId);
      return;
    }
    const productId = v.productId;
    Modal.confirm({
      title: t(
        rental.fragranceProductId
          ? 'ui.slotSetupConfirmChangeTitle'
          : 'ui.slotSetupConfirmAssignTitle',
      ),
      content: (
        <Space orientation="vertical" size={8}>
          {lines.map((line) => (
            <Typography.Paragraph key={line} style={{ marginBottom: 0 }}>
              {line}
            </Typography.Paragraph>
          ))}
        </Space>
      ),
      okText: t('ui.slotSetupSave'),
      cancelText: t('ui.cancel'),
      onOk: () => submit(productId),
    });
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
      centered
      destroyOnHidden
      className="slot-setup-modal"
      styles={{
        header: {
          paddingBottom: 16,
          marginBottom: 20,
          borderBottom: '1px solid var(--line, #f0f0f0)',
        },
        body: {
          maxHeight: 'calc(85vh - 160px)',
          overflowY: 'auto',
          paddingRight: 6,
        },
        footer: {
          paddingTop: 16,
          marginTop: 20,
          borderTop: '1px solid var(--line, #f0f0f0)',
        },
      }}
      footer={
        lockReason
          ? [
              <Button key="close" onClick={onClose}>
                {t('ui.close')}
              </Button>,
            ]
          : [
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
            ]
      }
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
            lockReason ? undefined : (
              <Button type="link" size="small" icon={<PlusOutlined />} onClick={goCreateProduct}>
                {t('ui.slotSetupCreateProduct')}
              </Button>
            )
          }
        >
          {lockReason && (
            <Alert
              type="info"
              showIcon
              message={t(LOCK_MESSAGE[lockReason])}
              style={{ marginBottom: 12 }}
            />
          )}
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
                  disabled={lockReason !== null}
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
                    const readiness = readinessOf(p.id);
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
                        {p.status === 'DISCONTINUED' ? (
                          <Tag>{t('ui.productDiscontinued')}</Tag>
                        ) : (
                          <Tag color={READINESS_COLOR[readiness]}>
                            {t(READINESS_LABEL[readiness])}
                          </Tag>
                        )}
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
