import { PlusOutlined } from '@ant-design/icons';
import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Form, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { api, errorMessage, unwrap } from '@/shared/api';
import { useI18n } from '@/shared/i18n';

type Location = components['schemas']['Location'];
type LocationCreate = components['schemas']['LocationCreate'];

/** Địa điểm đặt máy của nền tảng (FR-MCH-03) — phải có trước khi đăng ký máy. */
export default function LocationsPage() {
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm<LocationCreate>();

  const locations = useQuery({
    queryKey: ['locations', page],
    queryFn: () => unwrap(api.GET('/locations', { params: { query: { page, pageSize: 20 } } })),
  });
  const create = useMutation({
    mutationFn: (body: LocationCreate) => unwrap(api.POST('/locations', { body })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['locations'] }),
  });

  const submit = async () => {
    // Form sai: antd đã hiện lỗi cạnh từng ô — không ném tiếp thành lỗi promise không ai bắt.
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    try {
      await create.mutateAsync(values);
      message.success(t('ui.locationSaved'));
      setCreating(false);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<Location> = [
    { title: t('ui.locationCode'), dataIndex: 'code', key: 'code' },
    { title: t('ui.location'), dataIndex: 'name', key: 'name' },
    { title: t('ui.brandAddress'), key: 'address', render: (_, l) => l.address ?? '—' },
    { title: t('ui.locationTimezone'), dataIndex: 'timezone', key: 'timezone' },
    {
      title: t('ui.pricingStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: Location['status']) =>
        s === 'ACTIVE' ? <Tag color="green">{t('ui.active')}</Tag> : <Tag>{t('ui.inactive')}</Tag>,
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.locations')}</Typography.Title>
        <Space style={{ marginBottom: 16 }}>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setCreating(true);
            }}
          >
            {t('ui.locationAdd')}
          </Button>
        </Space>
        <Table
          rowKey="id"
          loading={locations.isLoading}
          columns={columns}
          dataSource={locations.data?.items ?? []}
          pagination={{
            current: page,
            pageSize: 20,
            total: locations.data?.meta.total ?? 0,
            onChange: setPage,
          }}
        />
        <Modal
          open={creating}
          title={t('ui.locationAdd')}
          okText={t('ui.save')}
          cancelText={t('ui.cancel')}
          confirmLoading={create.isPending}
          onOk={() => void submit()}
          onCancel={() => setCreating(false)}
          destroyOnHidden
        >
          <Form form={form} layout="vertical" initialValues={{ timezone: 'Asia/Ho_Chi_Minh' }}>
            <Form.Item
              name="code"
              label={t('ui.locationCode')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={50} placeholder="VCB-DK" />
            </Form.Item>
            <Form.Item
              name="name"
              label={t('ui.location')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item name="address" label={t('ui.brandAddress')}>
              <Input />
            </Form.Item>
            <Form.Item name="timezone" label={t('ui.locationTimezone')}>
              <Input />
            </Form.Item>
          </Form>
        </Modal>
      </div>
    </RequireRole>
  );
}
