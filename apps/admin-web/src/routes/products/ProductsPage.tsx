import { PlusOutlined } from '@ant-design/icons';
import {
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type Product,
  type ProductStatus,
  useDiscontinueProduct,
  useProducts,
  useSaveProduct,
} from './api';

interface ProductForm {
  sku: string;
  name: string;
  description?: string;
  imageUrl?: string;
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
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [form] = Form.useForm<ProductForm>();

  const open = (product: Product | 'new') => {
    setEditing(product);
    form.resetFields();
    if (product !== 'new') {
      form.setFieldsValue({
        sku: product.sku,
        name: product.name,
        description: product.description ?? undefined,
        imageUrl: product.imageUrl ?? undefined,
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
    try {
      await save.mutateAsync({
        id: editing === 'new' ? undefined : (editing as Product).id,
        body: {
          sku: v.sku,
          name: v.name,
          description: v.description || undefined,
          imageUrl: v.imageUrl || undefined,
          defaultPrice: String(v.defaultPrice),
          currency: 'VND',
          fullBottleRetailPrice:
            v.fullBottleRetailPrice != null ? String(v.fullBottleRetailPrice) : undefined,
          fullBottleVolumeMl: v.fullBottleVolumeMl ?? undefined,
        },
      });
      message.success(t('ui.productSaved'));
      setEditing(null);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<Product> = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    {
      title: t('ui.productName'),
      key: 'name',
      render: (_, p) => (
        <Space>
          {p.imageUrl && (
            <img
              src={p.imageUrl}
              alt=""
              width={32}
              height={32}
              style={{ objectFit: 'cover', borderRadius: 4 }}
            />
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
          confirmLoading={save.isPending}
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
            <Form.Item name="imageUrl" label={t('ui.productImageUrl')} rules={[{ type: 'url' }]}>
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item
              name="defaultPrice"
              label={t('ui.productDefaultPrice')}
              extra={t('ui.productDefaultPriceHint')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <InputNumber min={0} precision={0} addonAfter="VND" style={{ width: '100%' }} />
            </Form.Item>
            <Space style={{ display: 'flex' }} align="start">
              <Form.Item
                name="fullBottleRetailPrice"
                label={t('ui.productRetailPrice')}
                extra={t('ui.productRetailPriceHint')}
              >
                <InputNumber min={0} precision={0} addonAfter="VND" style={{ width: 240 }} />
              </Form.Item>
              <Form.Item name="fullBottleVolumeMl" label={t('ui.productVolumeMl')}>
                <InputNumber min={0} addonAfter="ml" style={{ width: 160 }} />
              </Form.Item>
            </Space>
          </Form>
        </Modal>
      </div>
    </RequireRole>
  );
}
