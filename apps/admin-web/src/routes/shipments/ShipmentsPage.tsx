import {
  AuditOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ExclamationCircleOutlined,
  InboxOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Row,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';
import {
  type AuthenticityStatus,
  type InventoryBatchItem,
  type RefillSessionItem,
  type RefillStatus,
  type ShipmentItem,
  type ShipmentStatus,
  useApproveAuthenticity,
  useBottles,
  useCloseRefillSession,
  useCreateShipmentDeclaration,
  useInventoryBatches,
  useOpenRefillSession,
  useReceiveShipment,
  useRefillSessions,
  useRejectAuthenticity,
  useShipmentDeclarations,
  useSubmitAuthenticity,
} from './api';

const SHIPMENT_STATUS_TAGS: Record<
  ShipmentStatus,
  { color: string; label: MessageKey; icon: React.ReactNode }
> = {
  DECLARED: { color: 'blue', label: 'shipmentStatus.DECLARED', icon: <ClockCircleOutlined /> },
  RECEIVED: { color: 'green', label: 'shipmentStatus.RECEIVED', icon: <CheckCircleOutlined /> },
  DISCREPANCY: {
    color: 'gold',
    label: 'shipmentStatus.DISCREPANCY',
    icon: <ExclamationCircleOutlined />,
  },
  CANCELLED: { color: 'default', label: 'shipmentStatus.CANCELLED', icon: <CloseCircleOutlined /> },
};

const AUTH_STATUS_TAGS: Record<
  AuthenticityStatus,
  { color: string; label: MessageKey; icon: React.ReactNode }
> = {
  PENDING: { color: 'gold', label: 'authenticityStatus.PENDING', icon: <ClockCircleOutlined /> },
  APPROVED: {
    color: 'green',
    label: 'authenticityStatus.APPROVED',
    icon: <SafetyCertificateOutlined />,
  },
  REJECTED: { color: 'red', label: 'authenticityStatus.REJECTED', icon: <CloseCircleOutlined /> },
};

const REFILL_STATUS_TAGS: Record<
  RefillStatus,
  { color: string; label: MessageKey; icon: React.ReactNode }
> = {
  STARTED: { color: 'blue', label: 'refillSessionStatus.STARTED', icon: <ToolOutlined /> },
  COMPLETED: {
    color: 'green',
    label: 'refillSessionStatus.COMPLETED',
    icon: <CheckCircleOutlined />,
  },
  ABORTED: {
    color: 'default',
    label: 'refillSessionStatus.ABORTED',
    icon: <CloseCircleOutlined />,
  },
};

export default function ShipmentsPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  const isBrand = user?.roles.includes('BRAND_ADMIN') ?? false;
  const isSuperAdmin = user?.roles.includes('PLATFORM_SUPER_ADMIN') ?? false;
  const isStaff =
    user?.roles.includes('PLATFORM_SUPER_ADMIN') ||
    user?.roles.includes('OPERATIONS_STAFF') ||
    user?.roles.includes('INVENTORY_STAFF');

  const [activeTab, setActiveTab] = useState<string>('shipments');

  // Queries
  const {
    data: shipmentsData,
    isLoading: isShipmentsLoading,
    refetch: refetchShipments,
    isFetching: isShipmentsFetching,
  } = useShipmentDeclarations();
  const {
    data: batchesData,
    isLoading: isBatchesLoading,
    refetch: refetchBatches,
    isFetching: isBatchesFetching,
  } = useInventoryBatches();
  const {
    data: refillData,
    isLoading: isRefillLoading,
    refetch: refetchRefill,
    isFetching: isRefillFetching,
  } = useRefillSessions();
  const { data: bottlesData } = useBottles({ status: 'IN_STOCK' });

  // Mutations
  const createDeclaration = useCreateShipmentDeclaration();
  const receiveShipment = useReceiveShipment();
  const submitAuthenticity = useSubmitAuthenticity();
  const approveAuthenticity = useApproveAuthenticity();
  const rejectAuthenticity = useRejectAuthenticity();
  const openRefill = useOpenRefillSession();
  const closeRefill = useCloseRefillSession();

  // Modals state
  const [declareModalOpen, setDeclareModalOpen] = useState(false);
  const [declareForm] = Form.useForm();

  const [receiveModalItem, setReceiveModalItem] = useState<ShipmentItem | null>(null);
  const [receiveForm] = Form.useForm();

  const [authModalBatch, setAuthModalBatch] = useState<InventoryBatchItem | null>(null);
  const [authForm] = Form.useForm();

  const [rejectModalBatch, setRejectModalBatch] = useState<InventoryBatchItem | null>(null);
  const [rejectForm] = Form.useForm();

  const [openRefillModalOpen, setOpenRefillModalOpen] = useState(false);
  const [openRefillForm] = Form.useForm();

  const [closeRefillSessionItem, setCloseRefillSessionItem] = useState<RefillSessionItem | null>(
    null,
  );
  const [closeRefillForm] = Form.useForm();

  // Handlers
  const handleDeclare = async () => {
    try {
      const values = await declareForm.validateFields();
      await createDeclaration.mutateAsync({
        fragranceProductId: values.fragranceProductId,
        declaredQuantity: values.declaredQuantity,
        declaredBottleVolumeMl: String(values.declaredBottleVolumeMl),
        expectedShipDate: values.expectedShipDate || null,
      });
      message.success(t('inv.shipmentDeclared'));
      setDeclareModalOpen(false);
      declareForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(errorMessage(err, t));
    }
  };

  const handleReceive = async () => {
    if (!receiveModalItem) return;
    try {
      const values = await receiveForm.validateFields();
      await receiveShipment.mutateAsync({
        id: receiveModalItem.id,
        receivedQuantity: values.receivedQuantity,
        discrepancyNotes: values.discrepancyNotes,
      });
      message.success(t('inv.shipmentReceived'));
      setReceiveModalItem(null);
      receiveForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(errorMessage(err, t));
    }
  };

  const handleSubmitAuth = async () => {
    if (!authModalBatch) return;
    try {
      const values = await authForm.validateFields();
      await submitAuthenticity.mutateAsync({
        batchId: authModalBatch.id,
        documentUrl: values.documentUrl,
        documentType: values.documentType,
      });
      message.success(t('inv.authenticitySubmitted'));
      setAuthModalBatch(null);
      authForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(errorMessage(err, t));
    }
  };

  const handleApproveAuth = async (batchId: string) => {
    try {
      await approveAuthenticity.mutateAsync(batchId);
      message.success(t('inv.batchApproved'));
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  const handleRejectAuth = async () => {
    if (!rejectModalBatch) return;
    try {
      const values = await rejectForm.validateFields();
      await rejectAuthenticity.mutateAsync({
        batchId: rejectModalBatch.id,
        reason: values.reason,
      });
      message.success(t('inv.batchRejected'));
      setRejectModalBatch(null);
      rejectForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(errorMessage(err, t));
    }
  };

  const handleOpenRefill = async () => {
    try {
      const values = await openRefillForm.validateFields();
      await openRefill.mutateAsync({
        machineId: values.machineId,
        slotId: values.slotId,
        notes: values.notes,
      });
      message.success(t('inv.refillSessionOpened'));
      setOpenRefillModalOpen(false);
      openRefillForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(errorMessage(err, t));
    }
  };

  const handleCloseRefill = async () => {
    if (!closeRefillSessionItem) return;
    try {
      const values = await closeRefillForm.validateFields();
      await closeRefill.mutateAsync({
        id: closeRefillSessionItem.id,
        newBottleId: values.newBottleId,
        initialMeasuredWeightG: values.initialMeasuredWeightG,
        checklistCompleted: values.checklistCompleted,
        notes: values.notes,
      });
      message.success(t('inv.refillSessionClosed'));
      setCloseRefillSessionItem(null);
      closeRefillForm.resetFields();
    } catch (err: any) {
      if (err?.errorFields) return;
      message.error(errorMessage(err, t));
    }
  };

  // Columns Tab 1: Khai báo gửi hàng
  const shipmentColumns: ColumnsType<ShipmentItem> = [
    {
      title: 'Mã khai báo',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => (
        <Typography.Text copyable ellipsis>
          {val}
        </Typography.Text>
      ),
    },
    {
      title: 'Sản phẩm',
      dataIndex: 'fragranceProductId',
      key: 'fragranceProductId',
      render: (val: string) => <Typography.Text code>{val}</Typography.Text>,
    },
    {
      title: t('ui.declaredQuantity'),
      dataIndex: 'declaredQuantity',
      key: 'declaredQuantity',
      align: 'right',
    },
    {
      title: t('ui.receivedQuantity'),
      dataIndex: 'receivedQuantity',
      key: 'receivedQuantity',
      align: 'right',
      render: (val: number | null) => (val != null ? val : '—'),
    },
    {
      title: t('ui.bottleVolume'),
      dataIndex: 'declaredBottleVolumeMl',
      key: 'declaredBottleVolumeMl',
      render: (val: string) => `${val} ml`,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: ShipmentStatus) => {
        const conf = SHIPMENT_STATUS_TAGS[st] ?? { color: 'default', label: st as any, icon: null };
        return (
          <Tag color={conf.color} icon={conf.icon}>
            {t(conf.label)}
          </Tag>
        );
      },
    },
    {
      title: t('ui.discrepancyNotes'),
      dataIndex: 'discrepancyNotes',
      key: 'discrepancyNotes',
      render: (val: string | null) =>
        val ? <Typography.Text type="warning">{val}</Typography.Text> : '—',
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, record) => (
        <Space>
          {isStaff && record.status === 'DECLARED' && (
            <Button
              type="primary"
              size="small"
              icon={<AuditOutlined />}
              onClick={() => {
                setReceiveModalItem(record);
                receiveForm.setFieldsValue({ receivedQuantity: record.declaredQuantity });
              }}
            >
              {t('ui.receiveShipment')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  // Columns Tab 2: Lô hàng & Giấy tờ chính hãng
  const batchColumns: ColumnsType<InventoryBatchItem> = [
    {
      title: t('ui.batchNumberLabel'),
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      render: (val: string) => <Typography.Text strong>{val}</Typography.Text>,
    },
    {
      title: 'Sản phẩm',
      dataIndex: 'fragranceProductId',
      key: 'fragranceProductId',
      render: (val: string) => <Typography.Text code>{val}</Typography.Text>,
    },
    {
      title: 'Số lượng thực nhận',
      dataIndex: 'quantityReceived',
      key: 'quantityReceived',
      align: 'right',
    },
    {
      title: t('ui.authenticityStatusLabel'),
      key: 'authenticityStatus',
      render: (_, record) => {
        const st: AuthenticityStatus = record.supplierInfo?.authenticityStatus ?? 'PENDING';
        const conf = AUTH_STATUS_TAGS[st];
        return (
          <Tag color={conf.color} icon={conf.icon}>
            {t(conf.label)}
          </Tag>
        );
      },
    },
    {
      title: 'Giấy tờ / Chứng từ',
      key: 'documentUrl',
      render: (_, record) => {
        const url = record.supplierInfo?.documentUrl;
        return url ? (
          <Typography.Link href={url} target="_blank" rel="noopener noreferrer">
            Xem tài liệu
          </Typography.Link>
        ) : (
          <Typography.Text type="secondary">Chưa nộp</Typography.Text>
        );
      },
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, record) => {
        const st = record.supplierInfo?.authenticityStatus ?? 'PENDING';
        return (
          <Space>
            {isBrand && (
              <Button
                size="small"
                onClick={() => {
                  setAuthModalBatch(record);
                  authForm.setFieldsValue({
                    documentUrl: record.supplierInfo?.documentUrl,
                    documentType: record.supplierInfo?.documentType ?? 'PURCHASE_INVOICE',
                  });
                }}
              >
                {t('ui.submitAuthenticity')}
              </Button>
            )}

            {isSuperAdmin && st !== 'APPROVED' && (
              <Popconfirm
                title="Xác nhận duyệt chính hãng cho lô hàng này?"
                onConfirm={() => handleApproveAuth(record.id)}
              >
                <Button size="small" type="primary">
                  {t('ui.approveAuthenticity')}
                </Button>
              </Popconfirm>
            )}

            {isSuperAdmin && st !== 'REJECTED' && (
              <Button
                size="small"
                danger
                onClick={() => {
                  setRejectModalBatch(record);
                }}
              >
                {t('ui.rejectAuthenticity')}
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  // Columns Tab 3: Phiếu nạp
  const refillColumns: ColumnsType<RefillSessionItem> = [
    {
      title: 'Mã phiếu',
      dataIndex: 'id',
      key: 'id',
      render: (val: string) => (
        <Typography.Text copyable ellipsis>
          {val}
        </Typography.Text>
      ),
    },
    {
      title: 'Máy',
      dataIndex: 'machineId',
      key: 'machineId',
      render: (val: string) => <Typography.Text code>{val}</Typography.Text>,
    },
    {
      title: 'Slot',
      dataIndex: 'slotId',
      key: 'slotId',
      render: (val: string) => <Typography.Text code>{val}</Typography.Text>,
    },
    {
      title: 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: RefillStatus) => {
        const conf = REFILL_STATUS_TAGS[st] ?? { color: 'default', label: st as any, icon: null };
        return (
          <Tag color={conf.color} icon={conf.icon}>
            {t(conf.label)}
          </Tag>
        );
      },
    },
    {
      title: 'Chai mới',
      dataIndex: 'newBottleId',
      key: 'newBottleId',
      render: (val: string | null) => (val ? <Typography.Text code>{val}</Typography.Text> : '—'),
    },
    {
      title: 'Cân nặng (g)',
      dataIndex: 'afterWeightG',
      key: 'afterWeightG',
      render: (val: string | null) => (val ? `${val}g` : '—'),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, record) => (
        <Space>
          {isStaff && record.status === 'STARTED' && (
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setCloseRefillSessionItem(record);
                closeRefillForm.resetFields();
              }}
            >
              {t('ui.closeRefillSession')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'BRAND_ADMIN']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        {/* Header */}
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {t('ui.shipments')}
            </Typography.Title>
            <Typography.Text type="secondary">
              Quản lý khai báo gửi hàng, đối soát thực nhận tại kho, xác minh giấy tờ chính hãng và
              phiếu nạp máy (FR-INV-22..35).
            </Typography.Text>
          </Col>
          <Col>
            <Space>
              <Button
                icon={
                  <ReloadOutlined
                    spin={isShipmentsFetching || isBatchesFetching || isRefillFetching}
                  />
                }
                onClick={() => {
                  void refetchShipments();
                  void refetchBatches();
                  void refetchRefill();
                }}
              >
                {t('ui.reset')}
              </Button>

              {isBrand && (
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setDeclareModalOpen(true)}
                >
                  {t('ui.declareShipment')}
                </Button>
              )}

              {isStaff && (
                <Button
                  type="primary"
                  icon={<ToolOutlined />}
                  onClick={() => setOpenRefillModalOpen(true)}
                >
                  {t('ui.openRefillSession')}
                </Button>
              )}
            </Space>
          </Col>
        </Row>

        {/* Tabs */}
        <Card>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'shipments',
                label: (
                  <span>
                    <InboxOutlined />
                    {t('ui.shipmentDeclarations')}
                  </span>
                ),
                children: (
                  <Table
                    columns={shipmentColumns}
                    dataSource={shipmentsData?.items ? [...shipmentsData.items] : []}
                    rowKey="id"
                    loading={isShipmentsLoading}
                    pagination={{ pageSize: 10 }}
                  />
                ),
              },
              {
                key: 'batches',
                label: (
                  <span>
                    <SafetyCertificateOutlined />
                    {t('ui.inventoryBatches')}
                  </span>
                ),
                children: (
                  <Table
                    columns={batchColumns}
                    dataSource={batchesData?.items ? [...batchesData.items] : []}
                    rowKey="id"
                    loading={isBatchesLoading}
                    pagination={{ pageSize: 10 }}
                  />
                ),
              },
              {
                key: 'refill',
                label: (
                  <span>
                    <ToolOutlined />
                    {t('ui.refillSessions')}
                  </span>
                ),
                children: (
                  <Table
                    columns={refillColumns}
                    dataSource={refillData?.items ? [...refillData.items] : []}
                    rowKey="id"
                    loading={isRefillLoading}
                    pagination={{ pageSize: 10 }}
                  />
                ),
              },
            ]}
          />
        </Card>

        {/* Modal 1: Khai báo gửi hàng */}
        <Modal
          title={t('ui.declareShipment')}
          open={declareModalOpen}
          onOk={handleDeclare}
          confirmLoading={createDeclaration.isPending}
          onCancel={() => setDeclareModalOpen(false)}
          destroyOnClose
        >
          <Form form={declareForm} layout="vertical">
            <Form.Item
              name="fragranceProductId"
              label="Mã sản phẩm nước hoa"
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input placeholder="Ví dụ: prod-1111-..." />
            </Form.Item>
            <Form.Item
              name="declaredQuantity"
              label={t('ui.declaredQuantity')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <InputNumber min={1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="declaredBottleVolumeMl"
              label={t('ui.bottleVolume')}
              initialValue="50"
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input placeholder="50" />
            </Form.Item>
            <Form.Item name="expectedShipDate" label={t('ui.expectedShipDate')}>
              <Input type="date" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal 2: Tiếp nhận & Đối soát kho */}
        <Modal
          title={t('ui.receiveShipment')}
          open={!!receiveModalItem}
          onOk={handleReceive}
          confirmLoading={receiveShipment.isPending}
          onCancel={() => setReceiveModalItem(null)}
          destroyOnClose
        >
          {receiveModalItem && (
            <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
              <Descriptions.Item label="Mã khai báo">{receiveModalItem.id}</Descriptions.Item>
              <Descriptions.Item label="Số lượng khai báo">
                {receiveModalItem.declaredQuantity} chai
              </Descriptions.Item>
            </Descriptions>
          )}
          <Form form={receiveForm} layout="vertical">
            <Form.Item
              name="receivedQuantity"
              label={t('ui.receivedQuantity')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="discrepancyNotes"
              label={t('ui.discrepancyNotes')}
              extra="Bắt buộc nhập ghi chú khi số lượng thực nhận khác số khai báo (FR-INV-25 AC2)."
            >
              <Input.TextArea rows={3} placeholder="Ghi chú lý do chênh lệch (nếu có)..." />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal 3: Nộp giấy tờ chính hãng */}
        <Modal
          title={t('ui.submitAuthenticity')}
          open={!!authModalBatch}
          onOk={handleSubmitAuth}
          confirmLoading={submitAuthenticity.isPending}
          onCancel={() => setAuthModalBatch(null)}
          destroyOnClose
        >
          <Form form={authForm} layout="vertical">
            <Form.Item
              name="documentUrl"
              label={t('ui.documentUrlLabel')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input placeholder="https://example.com/invoice.pdf" />
            </Form.Item>
            <Form.Item
              name="documentType"
              label={t('ui.documentTypeLabel')}
              initialValue="PURCHASE_INVOICE"
            >
              <Select
                options={[
                  { label: 'Hóa đơn mua hàng (Purchase Invoice)', value: 'PURCHASE_INVOICE' },
                  {
                    label: 'Chứng nhận xuất xứ (Certificate of Origin)',
                    value: 'CERTIFICATE_OF_ORIGIN',
                  },
                  {
                    label: 'Ủy quyền phân phối (Distribution Authorization)',
                    value: 'DISTRIBUTION_AUTH',
                  },
                ]}
              />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal 4: Từ chối giấy tờ chính hãng */}
        <Modal
          title={t('ui.rejectAuthenticity')}
          open={!!rejectModalBatch}
          onOk={handleRejectAuth}
          confirmLoading={rejectAuthenticity.isPending}
          onCancel={() => setRejectModalBatch(null)}
          destroyOnClose
        >
          <Form form={rejectForm} layout="vertical">
            <Form.Item
              name="reason"
              label={t('ui.rejectionReasonLabel')}
              rules={[{ required: true, message: t('mch.reasonRequired') }]}
            >
              <Input.TextArea rows={3} placeholder="Nhập lý do từ chối tài liệu..." />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal 5: Mở phiếu nạp */}
        <Modal
          title={t('ui.openRefillSession')}
          open={openRefillModalOpen}
          onOk={handleOpenRefill}
          confirmLoading={openRefill.isPending}
          onCancel={() => setOpenRefillModalOpen(false)}
          destroyOnClose
        >
          <Typography.Paragraph type="warning">
            Hệ thống sẽ kiểm tra chốt chặn an toàn: Nếu máy đang có đơn chờ thanh toán hoặc lệnh xịt
            dở dang, thao tác sẽ bị từ chối (FR-INV-32, ADR-0015).
          </Typography.Paragraph>
          <Form form={openRefillForm} layout="vertical">
            <Form.Item
              name="machineId"
              label="Mã máy"
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input placeholder="Nhập ID máy..." />
            </Form.Item>
            <Form.Item
              name="slotId"
              label="Mã slot"
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input placeholder="Nhập ID slot..." />
            </Form.Item>
            <Form.Item name="notes" label="Ghi chú">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal 6: Hoàn tất nạp */}
        <Modal
          title={t('ui.closeRefillSession')}
          open={!!closeRefillSessionItem}
          onOk={handleCloseRefill}
          confirmLoading={closeRefill.isPending}
          onCancel={() => setCloseRefillSessionItem(null)}
          destroyOnClose
        >
          <Form form={closeRefillForm} layout="vertical">
            <Form.Item
              name="newBottleId"
              label="Chai nước hoa lắp mới"
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Select
                placeholder="Chọn chai nước hoa trong kho..."
                options={bottlesData?.items.map((b) => ({
                  label: `${b.identifier} (${b.initialVolumeMl}ml)`,
                  value: b.id,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="initialMeasuredWeightG"
              label={t('ui.initialMeasuredWeightLabel')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <InputNumber min={0.1} step={0.1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item
              name="checklistCompleted"
              valuePropName="checked"
              rules={[
                {
                  validator: (_, value) =>
                    value
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('inv.checklistRequired'))),
                },
              ]}
            >
              <Checkbox>{t('ui.checklistCompletedLabel')}</Checkbox>
            </Form.Item>
            <Form.Item name="notes" label="Ghi chú">
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>
      </Space>
    </RequireRole>
  );
}
