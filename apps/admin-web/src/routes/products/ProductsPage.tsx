import { PictureOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type Product,
  type ProductStatus,
  useDeleteProductImage,
  useDiscontinueProduct,
  useProducts,
  useSaveProduct,
  useUploadProductImage,
} from './api';
import { type ImageChange } from './product-image';
import { ProductImageField } from './ProductImageField';

interface ProductForm {
  sku: string;
  name: string;
  description?: string;
  defaultPrice: number;
  fullBottleRetailPrice?: number | null;
  fullBottleVolumeMl?: number | null;
}

/**
 * Danh mục sản phẩm (FR-PRD-01 ÷ 03). Brand Admin tạo, sửa, ngừng kinh doanh sản phẩm của thương
 * hiệu mình — điều kiện để gán sản phẩm vào slot đã thuê (FR-SLT-27). Super Admin chỉ xem: máy chủ
 * từ chối tạo sản phẩm từ tài khoản không gắn thương hiệu.
 */
export default function ProductsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const canEdit = Boolean(user?.brandId);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ProductStatus | undefined>();
  const { data, isLoading } = useProducts({ page, pageSize: 20, status });
  const save = useSaveProduct();
  const discontinue = useDiscontinueProduct();
  // `?new=1`: tới từ nút "Tạo sản phẩm" ở modal cấu hình slot — mở sẵn pop-up tạo sản phẩm.
  const [searchParams, setSearchParams] = useSearchParams();
  const wantsNew = canEdit && searchParams.get('new') === '1';
  const [editing, setEditing] = useState<Product | 'new' | null>(() => (wantsNew ? 'new' : null));
  // Bỏ tham số sau lần mở đầu để tải lại trang không bật pop-up lần nữa.
  useEffect(() => {
    if (wantsNew) setSearchParams({}, { replace: true });
  }, [wantsNew, setSearchParams]);
  const [form] = Form.useForm<ProductForm>();
  const uploadImage = useUploadProductImage();
  const deleteImage = useDeleteProductImage();
  const [imageChange, setImageChange] = useState<ImageChange>({ kind: 'keep' });

  const open = (product: Product | 'new') => {
    setEditing(product);
    setImageChange({ kind: 'keep' });
    form.resetFields();
    if (product !== 'new') {
      form.setFieldsValue({
        sku: product.sku,
        name: product.name,
        description: product.description ?? undefined,
        defaultPrice: Number(product.defaultPrice),
        fullBottleRetailPrice: product.fullBottleRetailPrice
          ? Number(product.fullBottleRetailPrice)
          : null,
        fullBottleVolumeMl: product.fullBottleVolumeMl,
      });
    }
  };

  const submit = async () => {
    // Form sai: antd đã hiện lỗi cạnh từng ô — không ném tiếp thành lỗi promise không ai bắt.
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    let saved: Product;
    try {
      // imageUrl không gửi kèm: ảnh đổi qua endpoint riêng bên dưới, gửi lại URL cũ là thừa.
      saved = await save.mutateAsync({
        id: editing === 'new' ? undefined : (editing as Product).id,
        body: {
          sku: v.sku,
          name: v.name,
          description: v.description || undefined,
          defaultPrice: String(v.defaultPrice),
          currency: 'VND',
          fullBottleRetailPrice:
            v.fullBottleRetailPrice != null ? String(v.fullBottleRetailPrice) : undefined,
          fullBottleVolumeMl: v.fullBottleVolumeMl ?? undefined,
        },
      });
    } catch (error) {
      message.error(errorMessage(error, t));
      return;
    }
    // Sản phẩm mới phải có id trước mới upload ảnh được (ADR-0020). Ảnh lỗi thì sản phẩm vẫn đã lưu:
    // giữ pop-up mở ở chế độ sửa để người dùng thử lại ảnh mà không tạo trùng sản phẩm.
    try {
      if (imageChange.kind === 'upload') {
        await uploadImage.mutateAsync({ id: saved.id, file: imageChange.file });
      } else if (imageChange.kind === 'remove') {
        await deleteImage.mutateAsync(saved.id);
      }
    } catch (error) {
      message.error(t('ui.productImageSaveFailed', { reason: errorMessage(error, t) }));
      setEditing(saved);
      return;
    }
    message.success(t('ui.productSaved'));
    setEditing(null);
  };

  const columns: ColumnsType<Product> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    {
      title: t('ui.productName'),
      key: 'name',
      render: (_, p) => (
        <Space>
          {/* Khung 4:5 như trên kiosk; chưa có ảnh thì hiện biểu tượng, không để trống lệch hàng. */}
          {p.imageUrl ? (
            <img
              src={p.imageUrl}
              alt=""
              width={40}
              height={50}
              style={{ objectFit: 'cover', borderRadius: 4, display: 'block' }}
            />
          ) : (
            <div
              aria-label={t('ui.productNoImage')}
              style={{
                width: 40,
                height: 50,
                borderRadius: 4,
                background: '#f1f5f9',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <PictureOutlined style={{ color: '#94a3b8' }} />
            </div>
          )}
          <Typography.Text strong>{p.name}</Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.productDefaultPrice'),
      key: 'price',
      render: (_, p) => formatVnd(p.defaultPrice),
    },
    {
      title: t('ui.productRetailPrice'),
      key: 'retail',
      render: (_, p) =>
        p.fullBottleRetailPrice
          ? `${formatVnd(p.fullBottleRetailPrice)} / ${p.fullBottleVolumeMl ?? '—'} ml`
          : '—',
    },
    {
      title: t('ui.pricingStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: ProductStatus) =>
        s === 'ACTIVE' ? (
          <Tag color="green">{t('ui.productActive')}</Tag>
        ) : (
          <Tag>{t('ui.productDiscontinued')}</Tag>
        ),
    },
    ...(canEdit
      ? [
          {
            title: t('ui.actions'),
            key: 'actions',
            render: (_: unknown, p: Product) => (
              <Space>
                <Button type="link" size="small" onClick={() => open(p)}>
                  {t('ui.pricingEdit')}
                </Button>
                {p.status === 'ACTIVE' && (
                  <Popconfirm
                    title={t('ui.productDiscontinueConfirm')}
                    okText={t('ui.productDiscontinue')}
                    cancelText={t('ui.cancel')}
                    onConfirm={() =>
                      discontinue.mutateAsync(p.id).catch((e) => message.error(errorMessage(e, t)))
                    }
                  >
                    <Button type="link" size="small" danger>
                      {t('ui.productDiscontinue')}
                    </Button>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <RequireRole allow={['BRAND_ADMIN', 'PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.products')}</Typography.Title>
        <Space style={{ marginBottom: 16 }}>
          {canEdit && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
              {t('ui.productAdd')}
            </Button>
          )}
          <Select<ProductStatus | 'ALL'>
            style={{ width: 200 }}
            value={status ?? 'ALL'}
            onChange={(v) => {
              setStatus(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.allStatuses') },
              { value: 'ACTIVE', label: t('ui.productActive') },
              { value: 'DISCONTINUED', label: t('ui.productDiscontinued') },
            ]}
          />
        </Space>
        <Table
          rowKey="id"
          loading={isLoading}
          columns={columns}
          dataSource={data?.items ?? []}
          pagination={{
            current: page,
            pageSize: 20,
            total: data?.meta.total ?? 0,
            onChange: setPage,
          }}
        />
        <Modal
          open={editing !== null}
          title={editing === 'new' ? t('ui.productAdd') : t('ui.productEdit')}
          okText={t('ui.save')}
          cancelText={t('ui.cancel')}
          confirmLoading={save.isPending || uploadImage.isPending || deleteImage.isPending}
          onOk={() => void submit()}
          onCancel={() => setEditing(null)}
          destroyOnHidden
        >
          <Form form={form} layout="vertical">
            <Form.Item
              name="sku"
              label="SKU"
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={100} disabled={editing !== 'new'} />
            </Form.Item>
            <Form.Item
              name="name"
              label={t('ui.productName')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="description" label={t('ui.pricingDescription')}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item label={t('ui.productImage')}>
              <ProductImageField
                currentUrl={editing && editing !== 'new' ? editing.imageUrl : null}
                value={imageChange}
                onChange={setImageChange}
              />
            </Form.Item>
            <Form.Item
              name="defaultPrice"
              label={t('ui.productDefaultPrice')}
              extra={t('ui.productDefaultPriceHint')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <InputNumber min={0} precision={0} suffix="VND" style={{ width: '100%' }} />
            </Form.Item>
            {/* Lưới co theo bề rộng modal — chiều rộng cố định từng làm ô dung tích tràn ra ngoài. */}
            <Row gutter={12}>
              <Col xs={24} sm={14}>
                <Form.Item name="fullBottleRetailPrice" label={t('ui.productRetailPrice')}>
                  <InputNumber min={0} precision={0} suffix="VND" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} sm={10}>
                <Form.Item name="fullBottleVolumeMl" label={t('ui.productVolumeMl')}>
                  <InputNumber min={0} suffix="ml" style={{ width: '100%' }} />
                </Form.Item>
              </Col>
            </Row>
            <Typography.Paragraph type="secondary" style={{ marginTop: -12 }}>
              {t('ui.productRetailPriceHint')}
            </Typography.Paragraph>
          </Form>
        </Modal>
      </div>
    </RequireRole>
  );
}
