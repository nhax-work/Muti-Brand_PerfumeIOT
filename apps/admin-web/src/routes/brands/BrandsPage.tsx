import { PlusOutlined } from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Avatar,
  Button,
  Form,
  Input,
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
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { type Brand, type BrandStatus, useBrands, useSaveBrand, useSetBrandStatus } from './api';

const STATUS_TAGS: Record<BrandStatus, { color: string; label: MessageKey }> = {
  ACTIVE: { color: 'green', label: 'ui.brandActive' },
  SUSPENDED: { color: 'orange', label: 'ui.brandSuspended' },
  DISABLED: { color: 'default', label: 'ui.brandDisabled' },
};

interface BrandForm {
  code: string;
  name: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
}

/** `contactInfo` là jsonb tự do; màn hình này dùng ba khóa email, phone, address. */
function contactOf(brand: Brand): { email?: string; phone?: string; address?: string } {
  const info = (brand.contactInfo ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof info[k] === 'string' ? (info[k] as string) : undefined);
  return { email: pick('email'), phone: pick('phone'), address: pick('address') };
}

/**
 * Quản lý thương hiệu của Platform Super Admin (FR-BND-01 ÷ 03, 07). Đình chỉ thì slot của thương
 * hiệu ngừng nhận đơn (FR-BND-04) — máy chủ bảo đảm, màn hình chỉ đổi trạng thái.
 */
export default function BrandsPage() {
  const { t } = useI18n();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<BrandStatus | undefined>();
  const { data, isLoading } = useBrands({ page, pageSize: 20, status });
  const save = useSaveBrand();
  const setBrandStatus = useSetBrandStatus();
  const [editing, setEditing] = useState<Brand | 'new' | null>(null);
  const [form] = Form.useForm<BrandForm>();

  const open = (brand: Brand | 'new') => {
    setEditing(brand);
    form.resetFields();
    if (brand !== 'new') {
      form.setFieldsValue({
        code: brand.code,
        name: brand.name,
        description: brand.description ?? undefined,
        ...contactOf(brand),
      });
    }
  };

  const submit = async () => {
    // Form sai: antd đã hiện lỗi cạnh từng ô — không ném tiếp thành lỗi promise không ai bắt.
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const contactInfo = Object.fromEntries(
      Object.entries({ email: v.email, phone: v.phone, address: v.address }).filter(([, x]) => x),
    );
    try {
      await save.mutateAsync({
        id: editing === 'new' ? undefined : (editing as Brand).id,
        body: { code: v.code, name: v.name, description: v.description, contactInfo },
      });
      message.success(t('ui.brandSaved'));
      setEditing(null);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const toggle = (brand: Brand) =>
    setBrandStatus
      .mutateAsync({ id: brand.id, status: brand.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE' })
      .then(() => message.success(t('ui.brandSaved')))
      .catch((e) => message.error(errorMessage(e, t)));

  const columns: ColumnsType<Brand> = [
    {
      title: t('ui.brandName'),
      key: 'name',
      render: (_, b) => (
        <Space>
          <Avatar src={b.logoUrl ?? undefined}>{b.name.charAt(0)}</Avatar>
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{b.name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {b.code}
            </Typography.Text>
          </Space>
        </Space>
      ),
    },
    {
      title: t('ui.brandContact'),
      key: 'contact',
      render: (_, b) => {
        const c = contactOf(b);
        return [c.email, c.phone].filter(Boolean).join(' · ') || '—';
      },
    },
    {
      title: t('ui.brandLegal'),
      key: 'legal',
      render: (_, b) =>
        b.legalVerifiedAt ? (
          <Tag color="green">{t('ui.brandLegalVerified')}</Tag>
        ) : (
          <Tag>{t('ui.brandLegalUnverified')}</Tag>
        ),
    },
    {
      title: t('ui.pricingStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: BrandStatus) => <Tag color={STATUS_TAGS[s].color}>{t(STATUS_TAGS[s].label)}</Tag>,
    },
    { title: t('ui.createdAt'), key: 'createdAt', render: (_, b) => formatDateTime(b.createdAt) },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, b) => (
        <Space>
          <Button type="link" size="small" onClick={() => open(b)}>
            {t('ui.pricingEdit')}
          </Button>
          {b.status !== 'DISABLED' && (
            <Popconfirm
              title={
                b.status === 'ACTIVE' ? t('ui.brandSuspendConfirm') : t('ui.brandActivateConfirm')
              }
              okText={t('ui.confirm')}
              cancelText={t('ui.cancel')}
              onConfirm={() => toggle(b)}
            >
              <Button type="link" size="small" danger={b.status === 'ACTIVE'}>
                {b.status === 'ACTIVE' ? t('ui.brandSuspend') : t('ui.brandActivate')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.brands')}</Typography.Title>
        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => open('new')}>
            {t('ui.brandAdd')}
          </Button>
          <Select<BrandStatus | 'ALL'>
            style={{ width: 200 }}
            value={status ?? 'ALL'}
            onChange={(v) => {
              setStatus(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.allStatuses') },
              ...(Object.keys(STATUS_TAGS) as BrandStatus[]).map((s) => ({
                value: s,
                label: t(STATUS_TAGS[s].label),
              })),
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
          title={editing === 'new' ? t('ui.brandAdd') : t('ui.brandEdit')}
          okText={t('ui.save')}
          cancelText={t('ui.cancel')}
          confirmLoading={save.isPending}
          onOk={() => void submit()}
          onCancel={() => setEditing(null)}
          destroyOnHidden
        >
          <Form form={form} layout="vertical">
            <Form.Item
              name="code"
              label={t('ui.brandCode')}
              extra={t('ui.brandCodeHint')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={50} />
            </Form.Item>
            <Form.Item
              name="name"
              label={t('ui.brandName')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="description" label={t('ui.pricingDescription')}>
              <Input.TextArea rows={2} />
            </Form.Item>
            <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="phone" label={t('ui.brandPhone')}>
              <Input />
            </Form.Item>
            <Form.Item name="address" label={t('ui.brandAddress')}>
              <Input />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </RequireRole>
  );
}
