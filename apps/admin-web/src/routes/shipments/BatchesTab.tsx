import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileUnknownOutlined,
  PlusOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Button,
  DatePicker,
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
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import {
  type AuthenticityStatus,
  type InventoryBatch,
  useAllBrands,
  useApproveAuthenticity,
  useBrandProducts,
  useCreateInventoryBatch,
  useInventoryBatches,
  useRejectAuthenticity,
  useSubmitAuthenticity,
} from './api';

const STATUS_TAGS: Record<AuthenticityStatus, { color: string; icon: React.ReactNode }> = {
  NOT_SUBMITTED: { color: 'default', icon: <FileUnknownOutlined /> },
  PENDING: { color: 'gold', icon: <ClockCircleOutlined /> },
  APPROVED: { color: 'green', icon: <SafetyCertificateOutlined /> },
  REJECTED: { color: 'red', icon: <CloseCircleOutlined /> },
};

const DOCUMENT_TYPES: readonly { value: string; label: MessageKey }[] = [
  { value: 'PURCHASE_INVOICE', label: 'ui.documentTypePurchaseInvoice' },
  { value: 'CERTIFICATE_OF_ORIGIN', label: 'ui.documentTypeCertificateOfOrigin' },
  { value: 'DISTRIBUTION_AUTH', label: 'ui.documentTypeDistributionAuth' },
];

/** Giá trị DatePicker của antd — tránh kéo thêm kiểu trực tiếp từ dayjs. */
interface PickedDate {
  toISOString(): string;
}

interface CreateBatchValues {
  brandId: string;
  fragranceProductId: string;
  batchNumber: string;
  quantityReceived: number;
  receivedAt?: PickedDate;
  expiresAt?: PickedDate;
}

/** FR-INV-01, 33, 34: Inventory Staff tạo lô thủ công; Brand Admin nộp giấy tờ; Super Admin duyệt/từ chối. */
export function BatchesTab({
  canCreate = false,
  canSubmit,
  canReview,
}: {
  readonly canCreate?: boolean;
  readonly canSubmit: boolean;
  readonly canReview: boolean;
}) {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<AuthenticityStatus | undefined>(
    canReview ? 'PENDING' : undefined,
  );
  const batches = useInventoryBatches(statusFilter);
  const brands = useAllBrands(canCreate);
  const products = useBrandProducts(canCreate);
  const createBatch = useCreateInventoryBatch();
  const submit = useSubmitAuthenticity();
  const approve = useApproveAuthenticity();
  const reject = useRejectAuthenticity();

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm] = Form.useForm<CreateBatchValues>();
  const [selectedBrandId, setSelectedBrandId] = useState<string | undefined>(undefined);

  const [submitting, setSubmitting] = useState<InventoryBatch | null>(null);
  const [submitForm] = Form.useForm<{ documentUrl: string; documentType: string }>();
  const [rejecting, setRejecting] = useState<InventoryBatch | null>(null);
  const [rejectForm] = Form.useForm<{ reason: string }>();

  const run = async (work: () => Promise<unknown>, success: MessageKey) => {
    try {
      await work();
      void message.success(t(success));
      return true;
    } catch (error) {
      void message.error(errorMessage(error, t));
      return false;
    }
  };

  const handleCreate = async () => {
    const values = await createForm.validateFields().catch(() => null);
    if (!values) return;
    const receivedAt = values.receivedAt
      ? values.receivedAt.toISOString()
      : new Date().toISOString();
    const ok = await run(
      () =>
        createBatch.mutateAsync({
          brandId: values.brandId,
          fragranceProductId: values.fragranceProductId,
          batchNumber: values.batchNumber.trim(),
          quantityReceived: values.quantityReceived,
          receivedAt,
          ...(values.expiresAt ? { expiresAt: values.expiresAt.toISOString() } : {}),
        }),
      'inv.batchCreated',
    );
    if (ok) {
      setCreateOpen(false);
      setSelectedBrandId(undefined);
      createForm.resetFields();
    }
  };

  const handleSubmit = async () => {
    if (!submitting) return;
    const values = await submitForm.validateFields().catch(() => null);
    if (!values) return;
    const ok = await run(
      () => submit.mutateAsync({ batchId: submitting.id, ...values }),
      'inv.authenticitySubmitted',
    );
    if (ok) setSubmitting(null);
  };

  const handleReject = async () => {
    if (!rejecting) return;
    const values = await rejectForm.validateFields().catch(() => null);
    if (!values) return;
    const ok = await run(
      () => reject.mutateAsync({ batchId: rejecting.id, reason: values.reason }),
      'inv.batchRejected',
    );
    if (ok) setRejecting(null);
  };

  const columns: ColumnsType<InventoryBatch> = [
    {
      title: t('ui.batchNumberLabel'),
      dataIndex: 'batchNumber',
      key: 'batchNumber',
      render: (value: string) => <Typography.Text strong>{value}</Typography.Text>,
    },
    { title: t('ui.invProduct'), dataIndex: 'productName', key: 'productName' },
    {
      title: t('ui.receivedQuantity'),
      dataIndex: 'quantityReceived',
      key: 'quantityReceived',
      align: 'right',
    },
    {
      title: t('ui.authenticityStatusLabel'),
      dataIndex: 'authenticityStatus',
      key: 'authenticityStatus',
      render: (status: AuthenticityStatus, record) => (
        <Space direction="vertical" size={0}>
          <Tag color={STATUS_TAGS[status].color} icon={STATUS_TAGS[status].icon}>
            {t(`authenticityStatus.${status}` as MessageKey)}
          </Tag>
          {record.authenticityRejectionReason && (
            <Typography.Text type="danger">{record.authenticityRejectionReason}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: t('ui.invDocument'),
      dataIndex: 'authenticityDocumentUrl',
      key: 'authenticityDocumentUrl',
      render: (url: string | null) =>
        url ? (
          <Typography.Link href={url} target="_blank" rel="noopener noreferrer">
            {t('ui.viewDocument')}
          </Typography.Link>
        ) : (
          '—'
        ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, record) => (
        <Space>
          {canSubmit && record.authenticityStatus !== 'APPROVED' && (
            <Button
              size="small"
              onClick={() => {
                setSubmitting(record);
                submitForm.setFieldsValue({
                  documentUrl: record.authenticityDocumentUrl ?? '',
                  documentType: record.authenticityDocumentType ?? 'PURCHASE_INVOICE',
                });
              }}
            >
              {t('ui.submitAuthenticity')}
            </Button>
          )}
          {canReview && record.authenticityStatus === 'PENDING' && (
            <>
              <Popconfirm
                title={t('ui.approveAuthenticityConfirm', { batch: record.batchNumber })}
                onConfirm={() =>
                  void run(() => approve.mutateAsync(record.id), 'inv.batchApproved')
                }
              >
                <Button size="small" type="primary">
                  {t('ui.approveAuthenticity')}
                </Button>
              </Popconfirm>
              <Button size="small" danger onClick={() => setRejecting(record)}>
                {t('ui.rejectAuthenticity')}
              </Button>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <Select
          allowClear
          style={{ width: 240 }}
          placeholder={t('ui.filterAllStatuses')}
          value={statusFilter}
          onChange={(value: AuthenticityStatus | undefined) => setStatusFilter(value)}
          options={(Object.keys(STATUS_TAGS) as AuthenticityStatus[]).map((status) => ({
            value: status,
            label: t(`authenticityStatus.${status}` as MessageKey),
          }))}
        />
        {canCreate && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            {t('ui.createBatch')}
          </Button>
        )}
      </div>
      <Table
        columns={columns}
        dataSource={batches.data ? [...batches.data.items] : []}
        rowKey="id"
        loading={batches.isLoading}
        locale={{ emptyText: t('ui.noBatchesFound') }}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={t('ui.createBatch')}
        okText={t('ui.createBatchSubmit')}
        open={createOpen}
        onOk={handleCreate}
        confirmLoading={createBatch.isPending}
        onCancel={() => {
          setCreateOpen(false);
          setSelectedBrandId(undefined);
          createForm.resetFields();
        }}
        destroyOnHidden
      >
        <Form form={createForm} layout="vertical">
          <Form.Item
            name="brandId"
            label={t('ui.batchBrandLabel')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              loading={brands.isLoading}
              placeholder={t('ui.selectBrandPlaceholder')}
              onChange={(value: string) => {
                setSelectedBrandId(value);
                createForm.setFieldValue('fragranceProductId', undefined);
              }}
              options={(brands.data?.items ?? []).map((b) => ({
                label: b.name,
                value: b.id,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="fragranceProductId"
            label={t('ui.invProduct')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              disabled={!selectedBrandId}
              loading={products.isLoading}
              placeholder={t('ui.selectProductPlaceholder')}
              options={(products.data?.items ?? [])
                .filter((p) => !selectedBrandId || p.brandId === selectedBrandId)
                .map((p) => ({
                  label: p.name,
                  value: p.id,
                }))}
            />
          </Form.Item>
          <Form.Item
            name="batchNumber"
            label={t('ui.batchNumberLabel')}
            rules={[{ required: true, whitespace: true, message: t('validation.required') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item
            name="quantityReceived"
            label={t('ui.receivedQuantity')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="receivedAt" label={t('ui.batchReceivedAtLabel')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="expiresAt"
            label={t('ui.batchExpiresAtLabel')}
            rules={[
              {
                validator: async (_rule, value: PickedDate | undefined) => {
                  if (!value) return;
                  const received = createForm.getFieldValue('receivedAt') as PickedDate | undefined;
                  const receivedMs = received
                    ? new Date(received.toISOString()).getTime()
                    : Date.now();
                  if (new Date(value.toISOString()).getTime() <= receivedMs) {
                    throw new Error(t('inv.expiresBeforeReceived'));
                  }
                },
              },
            ]}
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('ui.submitAuthenticity')}
        open={submitting !== null}
        onOk={handleSubmit}
        confirmLoading={submit.isPending}
        onCancel={() => setSubmitting(null)}
        destroyOnClose
      >
        <Form form={submitForm} layout="vertical">
          <Form.Item
            name="documentUrl"
            label={t('ui.documentUrlLabel')}
            rules={[{ required: true, whitespace: true, message: t('validation.required') }]}
          >
            <Input maxLength={1000} placeholder="https://" />
          </Form.Item>
          <Form.Item name="documentType" label={t('ui.documentTypeLabel')}>
            <Select options={DOCUMENT_TYPES.map((d) => ({ value: d.value, label: t(d.label) }))} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('ui.rejectAuthenticity')}
        open={rejecting !== null}
        onOk={handleReject}
        confirmLoading={reject.isPending}
        onCancel={() => setRejecting(null)}
        destroyOnClose
      >
        <Form form={rejectForm} layout="vertical">
          <Form.Item
            name="reason"
            label={t('ui.rejectionReasonLabel')}
            rules={[{ required: true, whitespace: true, message: t('inv.reasonRequired') }]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
