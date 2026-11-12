import { PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { codeLabel } from '@/shared/codes';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type RefillRequest,
  type RefillRequestReason,
  type RefillRequestStatus,
  type ReviewAction,
  useCreateRefillRequest,
  useMyRentals,
  useOpenRefillForRequest,
  useRefillRequests,
  useReviewRefillRequest,
} from './api';

const STATUS_COLOR: Record<RefillRequestStatus, string> = {
  SUBMITTED: 'blue',
  ACCEPTED: 'cyan',
  SCHEDULED: 'purple',
  COMPLETED: 'green',
  REJECTED: 'red',
  CANCELLED: 'default',
};
const STATUSES = Object.keys(STATUS_COLOR) as RefillRequestStatus[];
const REASONS: readonly RefillRequestReason[] = ['LOW_STOCK', 'EXPIRING', 'PRODUCT_CHANGE'];
/** Giai đoạn hóa đơn còn nhận hàng — trùng tập máy chủ cho phép (FR-RFQ-01 AC3). */
const STOCKABLE_STAGES = ['AWAITING_STOCK', 'ACTIVE', 'EXPIRING', 'GRACE'];

interface CreateValues {
  slotRentalId: string;
  reason: RefillRequestReason;
  note?: string;
}

/**
 * Yêu cầu bổ sung nước hoa (FR-RFQ-01 ÷ 12). Brand Admin gửi yêu cầu cho slot mình thuê và theo dõi
 * tiến trình; nhân sự có `refill.fulfill` chấp nhận, từ chối, lên lịch, hủy; người có
 * `inventory.manage` mở phiếu nạp xử lý yêu cầu đã duyệt. Nút hiện theo trạng thái máy chủ trả về —
 * máy chủ mới là nơi kiểm chuyển hợp lệ (FE5).
 *
 * `?rentalId=` mở sẵn hộp tạo yêu cầu cho hóa đơn đó — lối vào từ gợi ý "sắp hết" ở "Slot của tôi"
 * (FR-RFQ-03).
 */
export default function RefillRequestsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;
  const isBrand = user?.brandId != null;
  const canCreate = isBrand && can('refill.request');
  const canReview = can('refill.fulfill');
  const canOperate = can('inventory.manage');

  const [params, setParams] = useSearchParams();
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RefillRequestStatus | undefined>();
  const [creating, setCreating] = useState(false);
  const [rejecting, setRejecting] = useState<RefillRequest | null>(null);
  const [scheduling, setScheduling] = useState<RefillRequest | null>(null);

  const requests = useRefillRequests({ page, pageSize: 20, status });
  const review = useReviewRefillRequest();
  const openRefill = useOpenRefillForRequest();

  const presetRental = params.get('rentalId');
  // Lối vào từ gợi ý "sắp hết": có `?rentalId=` thì hộp tạo yêu cầu mở sẵn.
  const createOpen = creating || (presetRental !== null && canCreate);

  const run = async (request: RefillRequest, action: ReviewAction, done: string) => {
    try {
      await review.mutateAsync({ id: request.id, action });
      message.success(done);
      return true;
    } catch (error) {
      message.error(errorMessage(error, t));
      return false;
    }
  };

  const columns: ColumnsType<RefillRequest> = [
    {
      title: t('ui.refillRequestSlot'),
      key: 'slot',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Typography.Text strong>
            {r.machineSerial} · Slot #{r.slotNumber}
          </Typography.Text>
          <Typography.Text type="secondary">{r.productName}</Typography.Text>
        </Space>
      ),
    },
    ...(isBrand
      ? []
      : [
          {
            title: t('ui.payoutBrand'),
            key: 'brand',
            render: (_: unknown, r: RefillRequest) => r.brandName,
          },
        ]),
    {
      title: t('ui.refillRequestReason'),
      key: 'reason',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          {codeLabel(t, 'refillRequestReason', r.reason)}
          {r.note && <Typography.Text type="secondary">{r.note}</Typography.Text>}
        </Space>
      ),
    },
    {
      title: t('ui.pricingStatus'),
      key: 'status',
      render: (_, r) => (
        <Space direction="vertical" size={0}>
          <Tag color={STATUS_COLOR[r.status]}>{codeLabel(t, 'refillRequestStatus', r.status)}</Tag>
          {r.rejectionReason && (
            <Typography.Text type="secondary">{r.rejectionReason}</Typography.Text>
          )}
        </Space>
      ),
    },
    {
      title: t('ui.refillRequestScheduledAt'),
      key: 'scheduledAt',
      render: (_, r) => formatDateTime(r.scheduledAt),
    },
    {
      title: t('ui.refillRequestCreatedAt'),
      key: 'createdAt',
      render: (_, r) => formatDateTime(r.createdAt),
    },
    ...(canReview || canOperate
      ? [
          {
            title: t('ui.actions'),
            key: 'actions',
            render: (_: unknown, r: RefillRequest) => (
              <Space wrap>
                {canReview && r.status === 'SUBMITTED' && (
                  <>
                    <Button
                      size="small"
                      type="primary"
                      loading={review.isPending}
                      onClick={() => void run(r, { kind: 'accept' }, t('ui.refillRequestAccepted'))}
                    >
                      {t('ui.refillRequestAccept')}
                    </Button>
                    <Button size="small" danger onClick={() => setRejecting(r)}>
                      {t('ui.refillRequestReject')}
                    </Button>
                  </>
                )}
                {canReview && (r.status === 'ACCEPTED' || r.status === 'SCHEDULED') && (
                  <Button size="small" onClick={() => setScheduling(r)}>
                    {t('ui.refillRequestSchedule')}
                  </Button>
                )}
                {canOperate &&
                  (r.status === 'ACCEPTED' || r.status === 'SCHEDULED') &&
                  !r.refillSessionId && (
                    <Button
                      size="small"
                      loading={openRefill.isPending}
                      onClick={() =>
                        openRefill
                          .mutateAsync(r)
                          .then(() => message.success(t('ui.refillRequestSessionOpened')))
                          .catch((error: unknown) => message.error(errorMessage(error, t)))
                      }
                    >
                      {t('ui.refillRequestOpenSession')}
                    </Button>
                  )}
                {canReview &&
                  (r.status === 'ACCEPTED' || r.status === 'SCHEDULED') &&
                  !r.refillSessionId && (
                    <Button
                      size="small"
                      type="link"
                      danger
                      onClick={() =>
                        Modal.confirm({
                          title: t('ui.refillRequestCancelConfirm'),
                          okButtonProps: { danger: true },
                          okText: t('ui.refillRequestCancel'),
                          cancelText: t('ui.cancel'),
                          onOk: () => run(r, { kind: 'cancel' }, t('ui.refillRequestCancelled')),
                        })
                      }
                    >
                      {t('ui.refillRequestCancel')}
                    </Button>
                  )}
                {r.refillSessionId && r.status !== 'COMPLETED' && (
                  <Tag color="processing">{t('ui.refillRequestInSession')}</Tag>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'INVENTORY_STAFF', 'BRAND_ADMIN']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between' }} wrap>
          <div>
            <Typography.Title level={3} style={{ margin: 0 }}>
              {t('ui.refillRequests')}
            </Typography.Title>
            <Typography.Text type="secondary">{t('ui.refillRequestsSubtitle')}</Typography.Text>
          </div>
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
              {t('ui.refillRequestCreate')}
            </Button>
          )}
        </Space>
        <Card>
          <Select<RefillRequestStatus | 'ALL'>
            style={{ width: 220, marginBottom: 16 }}
            value={status ?? 'ALL'}
            onChange={(v) => {
              setStatus(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.allStatuses') },
              ...STATUSES.map((s) => ({ value: s, label: codeLabel(t, 'refillRequestStatus', s) })),
            ]}
          />
          <Table
            rowKey="id"
            loading={requests.isLoading}
            columns={columns}
            dataSource={requests.data?.items ?? []}
            scroll={{ x: 1000 }}
            locale={{ emptyText: t('ui.noRefillRequests') }}
            pagination={{
              current: page,
              pageSize: 20,
              total: requests.data?.meta.total ?? 0,
              onChange: setPage,
            }}
          />
        </Card>
      </Space>

      {canCreate && (
        <CreateModal
          open={createOpen}
          presetRentalId={presetRental}
          onClose={() => {
            setCreating(false);
            if (presetRental) {
              params.delete('rentalId');
              setParams(params, { replace: true });
            }
          }}
        />
      )}
      <ReasonModal
        request={rejecting}
        onClose={() => setRejecting(null)}
        onSubmit={async (reason) => {
          if (
            rejecting &&
            (await run(rejecting, { kind: 'reject', reason }, t('ui.refillRequestRejected')))
          ) {
            setRejecting(null);
          }
        }}
        loading={review.isPending}
      />
      <ScheduleModal
        request={scheduling}
        onClose={() => setScheduling(null)}
        onSubmit={async (at) => {
          if (
            scheduling &&
            (await run(
              scheduling,
              { kind: 'schedule', scheduledAt: at },
              t('ui.refillRequestScheduled'),
            ))
          ) {
            setScheduling(null);
          }
        }}
        loading={review.isPending}
      />
    </RequireRole>
  );
}

function CreateModal({
  open,
  presetRentalId,
  onClose,
}: {
  open: boolean;
  presetRentalId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const [form] = Form.useForm<CreateValues>();
  const rentals = useMyRentals(open);
  const create = useCreateRefillRequest();
  const options = useMemo(
    () =>
      (rentals.data?.items ?? [])
        .filter((r) => r.stage && STOCKABLE_STAGES.includes(r.stage))
        .map((r) => ({ value: r.id, label: r.invoiceNumber ?? r.id.slice(0, 8) })),
    [rentals.data],
  );

  useEffect(() => {
    if (open)
      form.setFieldsValue({ slotRentalId: presetRentalId ?? undefined, reason: 'LOW_STOCK' });
  }, [open, presetRentalId, form]);

  const submit = async (values: CreateValues) => {
    try {
      await create.mutateAsync({
        slotRentalId: values.slotRentalId,
        reason: values.reason,
        ...(values.note?.trim() ? { note: values.note.trim() } : {}),
      });
      message.success(t('ui.refillRequestCreated'));
      form.resetFields();
      onClose();
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  return (
    <Modal
      open={open}
      title={t('ui.refillRequestCreate')}
      okText={t('ui.refillRequestSubmit')}
      cancelText={t('ui.cancel')}
      confirmLoading={create.isPending}
      onOk={() => form.submit()}
      onCancel={onClose}
      destroyOnHidden
    >
      <Form form={form} layout="vertical" onFinish={(v) => void submit(v)}>
        <Form.Item
          name="slotRentalId"
          label={t('ui.refillRequestInvoice')}
          rules={[{ required: true, message: t('ui.refillRequestInvoiceRequired') }]}
        >
          <Select
            options={options}
            loading={rentals.isLoading}
            placeholder={t('ui.refillRequestInvoice')}
          />
        </Form.Item>
        <Form.Item name="reason" label={t('ui.refillRequestReason')} rules={[{ required: true }]}>
          <Select
            options={REASONS.map((r) => ({
              value: r,
              label: codeLabel(t, 'refillRequestReason', r),
            }))}
          />
        </Form.Item>
        <Form.Item name="note" label={t('ui.refillRequestNote')}>
          <Input.TextArea rows={3} maxLength={2000} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

function ReasonModal({
  request,
  onClose,
  onSubmit,
  loading,
}: {
  request: RefillRequest | null;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
  loading: boolean;
}) {
  const { t } = useI18n();
  const [reason, setReason] = useState('');
  return (
    <Modal
      open={request !== null}
      title={t('ui.refillRequestReject')}
      okText={t('ui.refillRequestReject')}
      okButtonProps={{ danger: true, disabled: !reason.trim(), loading }}
      cancelText={t('ui.cancel')}
      onOk={() => void onSubmit(reason.trim()).then(() => setReason(''))}
      onCancel={() => {
        setReason('');
        onClose();
      }}
      destroyOnHidden
    >
      <Input.TextArea
        rows={3}
        maxLength={2000}
        placeholder={t('ui.refillRequestRejectPlaceholder')}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
    </Modal>
  );
}

function ScheduleModal({
  request,
  onClose,
  onSubmit,
  loading,
}: {
  request: RefillRequest | null;
  onClose: () => void;
  onSubmit: (scheduledAt: string) => Promise<void>;
  loading: boolean;
}) {
  const { t } = useI18n();
  const [at, setAt] = useState<string | null>(null);
  return (
    <Modal
      open={request !== null}
      title={t('ui.refillRequestSchedule')}
      okText={t('ui.refillRequestSchedule')}
      okButtonProps={{ disabled: !at, loading }}
      cancelText={t('ui.cancel')}
      onOk={() => at && void onSubmit(at).then(() => setAt(null))}
      onCancel={() => {
        setAt(null);
        onClose();
      }}
      destroyOnHidden
    >
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 12 }}
        message={t('ui.refillRequestScheduleHint')}
      />
      <DatePicker
        showTime
        style={{ width: '100%' }}
        onChange={(value) => setAt(value ? value.toISOString() : null)}
        placeholder={t('ui.refillRequestScheduledAt')}
      />
    </Modal>
  );
}
