import { PlusOutlined } from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import type { components } from '@scentstation/contracts';
import {
  Alert,
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
import { useMemo, useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type RoleCode,
  type User,
  type UserCreate,
  useBrandOptions,
  useCreateUser,
  useDisableUser,
  useResetPassword,
  useUsers,
} from './api';

type UserStatus = components['schemas']['UserStatus'];

const ROLE_LABELS: Record<RoleCode, MessageKey> = {
  PLATFORM_SUPER_ADMIN: 'ui.rolePlatformSuperAdmin',
  OPERATIONS_STAFF: 'ui.roleOperationsStaff',
  INVENTORY_STAFF: 'ui.roleInventoryStaff',
  BRAND_ADMIN: 'ui.roleBrandAdmin',
};

const STATUS_TAGS: Record<UserStatus, { color: string; label: MessageKey }> = {
  INVITED: { color: 'gold', label: 'ui.userInvited' },
  ACTIVE: { color: 'green', label: 'ui.userActive' },
  LOCKED: { color: 'orange', label: 'ui.userLocked' },
  DISABLED: { color: 'default', label: 'ui.userDisabled' },
};

/** Vai trò Super Admin được tạo qua màn hình này — tài khoản Super Admin mới không tạo từ giao diện. */
const CREATABLE_ROLES: readonly RoleCode[] = ['OPERATIONS_STAFF', 'INVENTORY_STAFF', 'BRAND_ADMIN'];

/**
 * Tài khoản trên nền tảng (FR-USR-01 ÷ 05). Mật khẩu tạm chỉ xuất hiện đúng một lần trong phản hồi
 * tạo tài khoản hoặc đặt lại mật khẩu, không truy xuất lại được (ADR-0004) — màn hình hiện nó trong
 * hộp thoại và không lưu ở đâu khác.
 */
export default function UsersPage() {
  const { t } = useI18n();
  const { user: me } = useAuth();
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<RoleCode | undefined>();
  const [brandId, setBrandId] = useState<string | undefined>();
  const { data, isLoading } = useUsers({ page, pageSize: 20, role, brandId });
  const brands = useBrandOptions();
  const create = useCreateUser();
  const disable = useDisableUser();
  const reset = useResetPassword();
  const [creating, setCreating] = useState(false);
  const [secret, setSecret] = useState<{ email: string; password: string } | null>(null);
  const [form] = Form.useForm<UserCreate>();

  const brandName = useMemo(
    () => new Map((brands.data?.items ?? []).map((b) => [b.id, b.name])),
    [brands.data],
  );
  const brandOptions = (brands.data?.items ?? []).map((b) => ({ value: b.id, label: b.name }));

  const submit = async () => {
    // Form sai: antd đã hiện lỗi cạnh từng ô — không ném tiếp thành lỗi promise không ai bắt.
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    try {
      const created = await create.mutateAsync({
        email: v.email,
        fullName: v.fullName,
        role: v.role,
        ...(v.role === 'BRAND_ADMIN' ? { brandId: v.brandId } : {}),
      });
      setCreating(false);
      setSecret({ email: created.email, password: created.temporaryPassword });
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const doReset = async (u: User) => {
    try {
      const { temporaryPassword } = await reset.mutateAsync(u.id);
      setSecret({ email: u.email, password: temporaryPassword });
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<User> = [
    {
      title: t('ui.userFullName'),
      key: 'name',
      render: (_, u) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>{u.fullName}</Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {u.email}
          </Typography.Text>
        </Space>
      ),
    },
    {
      title: t('ui.userRole'),
      key: 'roles',
      render: (_, u) => u.roles.map((r) => <Tag key={r}>{t(ROLE_LABELS[r])}</Tag>),
    },
    {
      title: t('ui.userBrand'),
      key: 'brand',
      render: (_, u) => (u.brandId ? (brandName.get(u.brandId) ?? '…') : '—'),
    },
    {
      title: t('ui.pricingStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: UserStatus) => <Tag color={STATUS_TAGS[s].color}>{t(STATUS_TAGS[s].label)}</Tag>,
    },
    {
      title: t('ui.userLastLogin'),
      key: 'lastLogin',
      render: (_, u) => formatDateTime(u.lastLoginAt),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, u) =>
        u.id === me?.id || u.status === 'DISABLED' ? null : (
          <Space>
            <Popconfirm
              title={t('ui.userResetConfirm')}
              okText={t('ui.confirm')}
              cancelText={t('ui.cancel')}
              onConfirm={() => doReset(u)}
            >
              <Button type="link" size="small">
                {t('ui.userResetPassword')}
              </Button>
            </Popconfirm>
            <Popconfirm
              title={t('ui.userDisableConfirm')}
              okText={t('ui.userDisable')}
              cancelText={t('ui.cancel')}
              onConfirm={() =>
                disable
                  .mutateAsync(u.id)
                  .then(() => message.success(t('ui.userDisabledNotice')))
                  .catch((e) => message.error(errorMessage(e, t)))
              }
            >
              <Button type="link" size="small" danger>
                {t('ui.userDisable')}
              </Button>
            </Popconfirm>
          </Space>
        ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.users')}</Typography.Title>
        <Space style={{ marginBottom: 16 }} wrap>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setCreating(true);
            }}
          >
            {t('ui.userAdd')}
          </Button>
          <Select<RoleCode | 'ALL'>
            style={{ width: 220 }}
            value={role ?? 'ALL'}
            onChange={(v) => {
              setRole(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.userAllRoles') },
              ...(Object.keys(ROLE_LABELS) as RoleCode[]).map((r) => ({
                value: r,
                label: t(ROLE_LABELS[r]),
              })),
            ]}
          />
          <Select
            allowClear
            style={{ width: 240 }}
            placeholder={t('ui.userBrand')}
            value={brandId}
            onChange={(v: string | undefined) => {
              setBrandId(v);
              setPage(1);
            }}
            options={brandOptions}
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
          open={creating}
          title={t('ui.userAdd')}
          okText={t('ui.userCreate')}
          cancelText={t('ui.cancel')}
          confirmLoading={create.isPending}
          onOk={() => void submit()}
          onCancel={() => setCreating(false)}
          destroyOnHidden
        >
          <Form form={form} layout="vertical" initialValues={{ role: 'BRAND_ADMIN' }}>
            <Form.Item
              name="fullName"
              label={t('ui.userFullName')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[
                { required: true, message: t('validation.required') },
                { type: 'email', message: t('validation.invalidEmail') },
              ]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="role" label={t('ui.userRole')} rules={[{ required: true }]}>
              <Select
                options={CREATABLE_ROLES.map((r) => ({ value: r, label: t(ROLE_LABELS[r]) }))}
              />
            </Form.Item>
            {/* Brand Admin bắt buộc gắn thương hiệu (FR-AUTH-05). Đọc vai trò qua `dependencies`,
                không qua useWatch: useWatch chưa thấy giá trị khởi tạo ở lần dựng đầu, ô thương hiệu
                ẩn đi và tài khoản Brand Admin bị gửi đi không có thương hiệu. */}
            <Form.Item noStyle dependencies={['role']}>
              {({ getFieldValue }) =>
                getFieldValue('role') === 'BRAND_ADMIN' && (
                  <Form.Item
                    name="brandId"
                    label={t('ui.userBrand')}
                    rules={[{ required: true, message: t('validation.required') }]}
                  >
                    <Select showSearch optionFilterProp="label" options={brandOptions} />
                  </Form.Item>
                )
              }
            </Form.Item>
          </Form>
        </Modal>

        <Modal
          open={secret !== null}
          title={t('ui.userTempPasswordTitle')}
          onCancel={() => setSecret(null)}
          footer={
            <Button type="primary" onClick={() => setSecret(null)}>
              {t('ui.userTempPasswordDone')}
            </Button>
          }
          destroyOnHidden
        >
          <Alert
            type="warning"
            showIcon
            message={t('ui.userTempPasswordWarning')}
            style={{ marginBottom: 16 }}
          />
          <Typography.Paragraph>{secret?.email}</Typography.Paragraph>
          <Typography.Paragraph copyable code style={{ fontSize: 18 }}>
            {secret?.password}
          </Typography.Paragraph>
        </Modal>
      </div>
    </RequireRole>
  );
}
