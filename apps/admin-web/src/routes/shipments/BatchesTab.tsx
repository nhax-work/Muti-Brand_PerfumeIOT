import {
  ClockCircleOutlined,
  CloseCircleOutlined,
  FileUnknownOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
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
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import {
  type AuthenticityStatus,
  type InventoryBatch,
  useApproveAuthenticity,
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

/** FR-INV-33, 34: Brand Admin nộp giấy tờ, Super Admin duyệt hoặc từ chối lô đang PENDING. */
export function BatchesTab({
  canSubmit,
  canReview,
}: {
  readonly canSubmit: boolean;
  readonly canReview: boolean;
}) {
  const { t } = useI18n();
  const [statusFilter, setStatusFilter] = useState<AuthenticityStatus | undefined>(
    canReview ? 'PENDING' : undefined,
  );
  const batches = useInventoryBatches(statusFilter);
  const submit = useSubmitAuthenticity();
  const approve = useApproveAuthenticity();
  const reject = useRejectAuthenticity();

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
      <Table
        columns={columns}
        dataSource={batches.data ? [...batches.data.items] : []}
        rowKey="id"
        loading={batches.isLoading}
        pagination={{ pageSize: 10 }}
      />

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
