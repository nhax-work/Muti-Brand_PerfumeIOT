import {
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  RollbackOutlined,
  SendOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Radio,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type BottleReturn,
  type BottleReturnCreate,
  type BottleReturnHandover,
  useBottleReturn,
  useBottleReturns,
  useCreateBottleReturn,
  useHandOverBottleReturn,
} from './api';

export default function BottleReturnsPage() {
  const { t } = useI18n();

  // Filters
  const [openOnly, setOpenOnly] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);

  // Queries
  const {
    data: returnsData,
    isLoading,
    refetch,
  } = useBottleReturns({
    page,
    pageSize,
    open: openOnly ? true : undefined,
  });

  // State
  const [selectedReturnId, setSelectedReturnId] = useState<string | null>(null);
  const [isDetailDrawerOpen, setIsDetailDrawerOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isHandoverModalOpen, setIsHandoverModalOpen] = useState(false);
  const [handoverTarget, setHandoverTarget] = useState<BottleReturn | null>(null);

  // Forms
  const [createForm] = Form.useForm();
  const [handoverForm] = Form.useForm();

  // Mutations
  const createMutation = useCreateBottleReturn();
  const handoverMutation = useHandOverBottleReturn();

  // Detail query
  const { data: detailData, isLoading: isDetailLoading } = useBottleReturn(
    selectedReturnId ?? undefined,
  );

  const handleOpenDetail = (record: BottleReturn) => {
    setSelectedReturnId(record.id);
    setIsDetailDrawerOpen(true);
  };

  const handleOpenHandover = (record: BottleReturn) => {
    setHandoverTarget(record);
    handoverForm.resetFields();
    handoverForm.setFieldsValue({
      recipientName: record.recipientName ?? '',
      trackingNumber: record.trackingNumber ?? '',
    });
    setIsHandoverModalOpen(true);
  };

  const handleCreateSubmit = async (values: {
    slotRentalId: string;
    bottles: Array<{ bottleId: string; measuredWeightG: number }>;
  }) => {
    try {
      const payload: BottleReturnCreate = {
        slotRentalId: values.slotRentalId.trim(),
        bottles: values.bottles.map((b) => ({
          bottleId: b.bottleId.trim(),
          measuredWeightG: Number(b.measuredWeightG),
        })),
      };
      await createMutation.mutateAsync(payload);
      message.success(t('ui.createReturnSuccess'));
      setIsCreateModalOpen(false);
      createForm.resetFields();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.internalError');
      message.error(msg);
    }
  };

  const handleHandoverSubmit = async (values: {
    recipientName: string;
    trackingNumber?: string;
  }) => {
    if (!handoverTarget) return;
    try {
      const payload: BottleReturnHandover = {
        recipientName: values.recipientName.trim(),
        trackingNumber: values.trackingNumber?.trim() || undefined,
        handedOverAt: new Date().toISOString(),
      };
      await handoverMutation.mutateAsync({
        id: handoverTarget.id,
        body: payload,
      });
      message.success(t('ui.handoverSuccess'));
      setIsHandoverModalOpen(false);
      handoverForm.resetFields();
      if (selectedReturnId === handoverTarget.id) {
        setIsDetailDrawerOpen(false);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.internalError');
      message.error(msg);
    }
  };

  const renderStatusTag = (record: BottleReturn) => {
    if (record.handedOverAt) {
      return <Tag color="green">{t('ui.statusHandedOver')}</Tag>;
    }
    if (record.forfeitedAt) {
      return <Tag color="red">{t('ui.statusForfeited')}</Tag>;
    }
    const isOverdue = dayjs(record.pickupDeadline).isBefore(dayjs());
    return (
      <Tag color={isOverdue ? 'error' : 'processing'}>
        {t('ui.statusWaitingPickup')}
        {isOverdue ? ' (Quá hạn)' : ''}
      </Tag>
    );
  };

  const columns: ColumnsType<BottleReturn> = [
    {
      title: 'Mã phiếu',
      dataIndex: 'id',
      key: 'id',
      width: 140,
      render: (id: string) => (
        <Typography.Text copyable ellipsis>
          {id}
        </Typography.Text>
      ),
    },
    {
      title: t('ui.slotRentalId'),
      dataIndex: 'slotRentalId',
      key: 'slotRentalId',
      width: 140,
      render: (id: string) => (
        <Typography.Text copyable ellipsis>
          {id}
        </Typography.Text>
      ),
    },
    {
      title: t('ui.returnMethod'),
      dataIndex: 'returnMethod',
      key: 'returnMethod',
      width: 160,
      render: (m: string) => (
        <Tag color={m === 'SHIP_TO_BRAND' ? 'blue' : 'orange'}>
          {m === 'SHIP_TO_BRAND' ? 'Giao tận nơi' : 'Nhận tại kho'}
        </Tag>
      ),
    },
    {
      title: t('ui.bottleCount'),
      key: 'bottleCount',
      width: 100,
      align: 'center',
      render: (_, record) => record.bottles.length,
    },
    {
      title: t('ui.readyAt'),
      dataIndex: 'readyAt',
      key: 'readyAt',
      width: 160,
      render: (val: string) => formatDateTime(val),
    },
    {
      title: t('ui.pickupDeadline'),
      dataIndex: 'pickupDeadline',
      key: 'pickupDeadline',
      width: 160,
      render: (val: string) => {
        const isNear = dayjs(val).diff(dayjs(), 'day') <= 3;
        return (
          <Typography.Text type={isNear ? 'danger' : undefined}>
            {formatDateTime(val)}
          </Typography.Text>
        );
      },
    },
    {
      title: 'Trạng thái',
      key: 'status',
      width: 150,
      render: (_, record) => renderStatusTag(record),
    },
    {
      title: 'Hành động',
      key: 'action',
      width: 180,
      fixed: 'right',
      render: (_, record) => {
        const isClosed = Boolean(record.handedOverAt || record.forfeitedAt);
        return (
          <Space>
            <Button
              type="text"
              icon={<EyeOutlined />}
              size="small"
              onClick={() => handleOpenDetail(record)}
            >
              {t('ui.details')}
            </Button>
            {!isClosed && (
              <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'INVENTORY_STAFF']}>
                <Button
                  type="primary"
                  size="small"
                  icon={<SendOutlined />}
                  onClick={() => handleOpenHandover(record)}
                >
                  {t('ui.handoverReturn')}
                </Button>
              </RequireRole>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <Typography.Title level={4} style={{ margin: 0 }}>
              <RollbackOutlined style={{ marginRight: 8 }} />
              {t('ui.bottleReturnsTitle')}
            </Typography.Title>
            <Typography.Text type="secondary">{t('ui.bottleReturnsSubtitle')}</Typography.Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={() => void refetch()}>
              {t('ui.refresh')}
            </Button>
            <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'INVENTORY_STAFF']}>
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  createForm.resetFields();
                  createForm.setFieldsValue({
                    bottles: [{ bottleId: '', measuredWeightG: 100 }],
                  });
                  setIsCreateModalOpen(true);
                }}
              >
                {t('ui.createBottleReturn')}
              </Button>
            </RequireRole>
          </Space>
        </div>

        {/* Filter bar */}
        <div style={{ marginBottom: 16 }}>
          <Radio.Group
            value={openOnly}
            onChange={(e) => {
              setOpenOnly(e.target.value);
              setPage(1);
            }}
          >
            <Radio.Button value={false}>{t('ui.all')}</Radio.Button>
            <Radio.Button value={true}>{t('ui.openReturnsOnly')}</Radio.Button>
          </Radio.Group>
        </div>

        <Table
          rowKey="id"
          columns={columns}
          dataSource={returnsData?.items ?? []}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: returnsData?.meta.total ?? 0,
            showSizeChanger: true,
            onChange: (p, ps) => {
              setPage(p);
              setPageSize(ps);
            },
          }}
          scroll={{ x: 1050 }}
        />
      </Card>

      {/* Detail Drawer */}
      <Drawer
        title={t('ui.details')}
        width={620}
        open={isDetailDrawerOpen}
        onClose={() => setIsDetailDrawerOpen(false)}
      >
        {isDetailLoading || !detailData ? (
          <Typography.Text>Đang tải...</Typography.Text>
        ) : (
          <div>
            <Descriptions bordered size="small" column={1} style={{ marginBottom: 20 }}>
              <Descriptions.Item label="Mã phiếu trả hàng">
                <Typography.Text copyable>{detailData.id}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.slotRentalId')}>
                <Typography.Text copyable>{detailData.slotRentalId}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Mã thương hiệu">
                <Typography.Text copyable>{detailData.brandId}</Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.returnMethod')}>
                <Tag color={detailData.returnMethod === 'SHIP_TO_BRAND' ? 'blue' : 'orange'}>
                  {detailData.returnMethod === 'SHIP_TO_BRAND'
                    ? 'Giao tận nơi cho thương hiệu'
                    : 'Nhận tại kho / trạm'}
                </Tag>
              </Descriptions.Item>
              {detailData.shippingAddress && (
                <Descriptions.Item label={t('ui.shippingAddress')}>
                  {detailData.shippingAddress}
                </Descriptions.Item>
              )}
              <Descriptions.Item label={t('ui.readyAt')}>
                {formatDateTime(detailData.readyAt)}
              </Descriptions.Item>
              <Descriptions.Item label={t('ui.pickupDeadline')}>
                <Typography.Text
                  type={dayjs(detailData.pickupDeadline).isBefore(dayjs()) ? 'danger' : undefined}
                >
                  {formatDateTime(detailData.pickupDeadline)}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="Trạng thái">
                {renderStatusTag(detailData)}
              </Descriptions.Item>
              {detailData.handedOverAt && (
                <>
                  <Descriptions.Item label={t('ui.handedOverAt')}>
                    {formatDateTime(detailData.handedOverAt)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('ui.recipientName')}>
                    {detailData.recipientName ?? '-'}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('ui.trackingNumber')}>
                    {detailData.trackingNumber ?? '-'}
                  </Descriptions.Item>
                </>
              )}
              {detailData.forfeitedAt && (
                <Descriptions.Item label={t('ui.forfeitedAt')}>
                  {formatDateTime(detailData.forfeitedAt)}
                </Descriptions.Item>
              )}
            </Descriptions>

            <Typography.Title level={5} style={{ marginTop: 24, marginBottom: 12 }}>
              {t('ui.bottlesToReturn')} ({detailData.bottles.length})
            </Typography.Title>
            <Table
              size="small"
              rowKey="id"
              pagination={false}
              dataSource={detailData.bottles}
              columns={[
                {
                  title: 'Mã định danh',
                  dataIndex: 'identifier',
                  key: 'identifier',
                },
                {
                  title: 'Dung tích còn (ml)',
                  dataIndex: 'currentEstimatedMl',
                  key: 'currentEstimatedMl',
                },
                {
                  title: 'Trạng thái chai',
                  dataIndex: 'status',
                  key: 'status',
                  render: (s: string) => <Tag color="cyan">{s}</Tag>,
                },
              ]}
            />

            {!detailData.handedOverAt && !detailData.forfeitedAt && (
              <div style={{ marginTop: 24, textAlign: 'right' }}>
                <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'INVENTORY_STAFF']}>
                  <Button
                    type="primary"
                    icon={<SendOutlined />}
                    onClick={() => handleOpenHandover(detailData)}
                  >
                    {t('ui.handoverReturn')}
                  </Button>
                </RequireRole>
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* Create Modal */}
      <Modal
        title={t('ui.createBottleReturnTitle')}
        open={isCreateModalOpen}
        onCancel={() => setIsCreateModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={createForm}
          layout="vertical"
          onFinish={(values) => void handleCreateSubmit(values)}
        >
          <Alert
            message="Lưu ý tháo chai"
            description="Sau khi lập phiếu, các chai sẽ chuyển trạng thái RETURNED_TO_BRAND, slot máy sẽ chuyển sang UNAVAILABLE và hóa đơn thuê sẽ CLOSED."
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
          />

          <Form.Item
            name="slotRentalId"
            label={t('ui.slotRentalId')}
            rules={[{ required: true, message: 'Bắt buộc nhập mã hóa đơn thuê slot' }]}
          >
            <Input placeholder="UUID của slot_rentals đã báo không gia hạn" />
          </Form.Item>

          <Form.List name="bottles">
            {(fields, { add, remove }) => (
              <>
                <Typography.Text strong style={{ display: 'block', marginBottom: 8 }}>
                  {t('ui.bottlesToReturn')}
                </Typography.Text>
                {fields.map(({ key, name, ...restField }) => (
                  <Space key={key} style={{ display: 'flex', marginBottom: 8 }} align="baseline">
                    <Form.Item
                      {...restField}
                      name={[name, 'bottleId']}
                      rules={[{ required: true, message: 'Nhập ID chai' }]}
                      style={{ width: 260 }}
                    >
                      <Input placeholder="UUID chai nước hoa" />
                    </Form.Item>
                    <Form.Item
                      {...restField}
                      name={[name, 'measuredWeightG']}
                      rules={[{ required: true, message: 'Nhập khối lượng' }]}
                    >
                      <InputNumber min={1} placeholder="Cân nặng (g)" addonAfter="g" />
                    </Form.Item>
                    {fields.length > 1 && (
                      <Button danger type="link" onClick={() => remove(name)}>
                        Xóa
                      </Button>
                    )}
                  </Space>
                ))}
                <Form.Item>
                  <Button type="dashed" onClick={() => add()} block icon={<PlusOutlined />}>
                    Thêm chai
                  </Button>
                </Form.Item>
              </>
            )}
          </Form.List>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setIsCreateModalOpen(false)}>{t('ui.cancel')}</Button>
              <Button type="primary" htmlType="submit" loading={createMutation.isPending}>
                {t('ui.confirm')}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>

      {/* Handover Modal */}
      <Modal
        title={t('ui.handoverReturnTitle')}
        open={isHandoverModalOpen}
        onCancel={() => setIsHandoverModalOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={handoverForm}
          layout="vertical"
          onFinish={(values) => void handleHandoverSubmit(values)}
        >
          {handoverTarget?.returnMethod === 'SHIP_TO_BRAND' && (
            <Alert
              message="Yêu cầu mã vận đơn"
              description="Phiếu này có phương thức trả hàng là giao hàng tận nơi. Bắt buộc nhập mã vận đơn để đối soát."
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          <Form.Item
            name="recipientName"
            label={t('ui.recipientName')}
            rules={[{ required: true, message: 'Vui lòng nhập tên người nhận bàn giao' }]}
          >
            <Input placeholder="Tên đại diện thương hiệu hoặc đơn vị vận chuyển" />
          </Form.Item>

          <Form.Item
            name="trackingNumber"
            label={t('ui.trackingNumber')}
            rules={[
              {
                required: handoverTarget?.returnMethod === 'SHIP_TO_BRAND',
                message: 'Bắt buộc nhập mã vận đơn khi giao hàng tận nơi',
              },
            ]}
          >
            <Input placeholder="Mã vận đơn (bắt buộc nếu SHIP_TO_BRAND)" />
          </Form.Item>

          <div style={{ textAlign: 'right', marginTop: 16 }}>
            <Space>
              <Button onClick={() => setIsHandoverModalOpen(false)}>{t('ui.cancel')}</Button>
              <Button type="primary" htmlType="submit" loading={handoverMutation.isPending}>
                {t('ui.handoverReturn')}
              </Button>
            </Space>
          </div>
        </Form>
      </Modal>
    </div>
  );
}
