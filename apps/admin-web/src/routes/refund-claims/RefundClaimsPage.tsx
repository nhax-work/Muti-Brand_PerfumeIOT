import type { MessageKey } from '@scentstation/i18n';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { ReauthCancelled, useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';
import {
  type RefundAccountView,
  type RefundClaim,
  type RefundClaimStatus,
  useAssignClaim,
  useOperationsStaff,
  useRecordPayout,
  useRefundClaims,
  useRejectClaim,
  useRevealAccount,
} from './api';

const STATUS_TAGS: Record<RefundClaimStatus, { color: string; label: MessageKey }> = {
  OPEN: { color: 'gold', label: 'ui.claimStatusOpen' },
  REFUNDED: { color: 'green', label: 'ui.claimStatusRefunded' },
  REJECTED: { color: 'default', label: 'ui.claimStatusRejected' },
  EXPIRED: { color: 'red', label: 'ui.claimStatusExpired' },
};

function money(amount: string, currency: string): string {
  return `${Number(amount).toLocaleString('vi-VN')} ${currency}`;
}

/**
 * Hàng phiếu khiếu nại hoàn tiền thủ công (ADR-0012, FR-ORD-20, FR-ORD-30). Operations Staff nhận
 * phiếu, xem tài khoản nhận tiền (xác thực lại, có nhật ký), chuyển khoản ngoài hệ thống rồi ghi
 * nhận mã giao dịch hoặc từ chối. Super Admin theo dõi và phân công.
 */
export default function RefundClaimsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const isOps = user?.roles.includes('OPERATIONS_STAFF') ?? false;
  const isAdmin = user?.roles.includes('PLATFORM_SUPER_ADMIN') ?? false;

  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<RefundClaimStatus | undefined>('OPEN');
  const [onlyMine, setOnlyMine] = useState(false);
  const [selected, setSelected] = useState<RefundClaim | null>(null);

  const { data, isLoading } = useRefundClaims({
    page,
    status,
    assignedToMe: onlyMine || undefined,
  });

  const assigneeLabel = (claim: RefundClaim) =>
    !claim.assignedTo
      ? t('ui.claimUnassigned')
      : claim.assignedTo === user?.id
        ? t('ui.claimAssignedToMe')
        : claim.assignedTo.slice(0, 8);

  const columns: ColumnsType<RefundClaim> = [
    {
      title: t('ui.claimPaymentReference'),
      dataIndex: 'paymentReference',
      key: 'paymentReference',
      render: (ref: string) => <Typography.Text strong>{ref}</Typography.Text>,
    },
    {
      title: t('ui.claimAmount'),
      key: 'amount',
      render: (_, c) => money(c.amount, c.currency),
    },
    {
      title: t('ui.claimType'),
      key: 'type',
      render: (_, c) => (c.refundOrder ? t('ui.claimTypeOrder') : t('ui.claimTypeExtra')),
    },
    {
      title: t('ui.claimSlaDue'),
      key: 'slaDueAt',
      render: (_, c) => {
        const overdue = c.status === 'OPEN' && new Date(c.slaDueAt).getTime() < Date.now();
        return (
          <Space direction="vertical" size={0}>
            <span>{new Date(c.slaDueAt).toLocaleString('vi-VN')}</span>
            {overdue && <Tag color="red">{t('ui.claimOverdue')}</Tag>}
          </Space>
        );
      },
    },
    { title: t('ui.claimAssignee'), key: 'assignee', render: (_, c) => assigneeLabel(c) },
    {
      title: t('ui.claimStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: RefundClaimStatus) => (
        <Tag color={STATUS_TAGS[s].color}>{t(STATUS_TAGS[s].label)}</Tag>
      ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, c) => (
        <Button type="link" size="small" onClick={() => setSelected(c)}>
          {t('ui.claimDetail')}
        </Button>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF']}>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.refundClaims')}</Typography.Title>
        <Space style={{ marginBottom: 16 }} wrap>
          <Select<RefundClaimStatus | 'ALL'>
            style={{ width: 180 }}
            value={status ?? 'ALL'}
            onChange={(v) => {
              setStatus(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.claimAllStatuses') },
              ...(Object.keys(STATUS_TAGS) as RefundClaimStatus[]).map((s) => ({
                value: s,
                label: t(STATUS_TAGS[s].label),
              })),
            ]}
          />
          {isOps && (
            <Space>
              <Switch
                checked={onlyMine}
                onChange={setOnlyMine}
                aria-label={t('ui.claimOnlyMine')}
              />
              <span>{t('ui.claimOnlyMine')}</span>
            </Space>
          )}
        </Space>

        <Table<RefundClaim>
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

        <ClaimDrawer
          claim={selected}
          isOps={isOps}
          isAdmin={isAdmin}
          currentUserId={user?.id ?? null}
          onClose={() => setSelected(null)}
        />
      </div>
    </RequireRole>
  );
}

function ClaimDrawer({
  claim,
  isOps,
  isAdmin,
  currentUserId,
  onClose,
}: {
  claim: RefundClaim | null;
  isOps: boolean;
  isAdmin: boolean;
  currentUserId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const assign = useAssignClaim();
  const reveal = useRevealAccount();
  const payout = useRecordPayout();
  const reject = useRejectClaim();
  const staff = useOperationsStaff(isAdmin && claim?.status === 'OPEN');
  const [account, setAccount] = useState<RefundAccountView | null>(null);
  const [payoutReference, setPayoutReference] = useState('');
  const [reason, setReason] = useState('');

  const close = () => {
    // Không giữ tài khoản khách trong bộ nhớ trang khi đóng ngăn kéo.
    setAccount(null);
    setPayoutReference('');
    setReason('');
    onClose();
  };

  const report = (error: unknown) => {
    if (!(error instanceof ReauthCancelled)) void message.error(errorMessage(error, t));
  };

  if (!claim) return <Drawer open={false} onClose={close} />;
  const open = claim.status === 'OPEN';
  const mine = claim.assignedTo === currentUserId;

  return (
    <Drawer open width={480} title={t('ui.claimDetail')} onClose={close} destroyOnHidden>
      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('ui.claimPaymentReference')}>
          {claim.paymentReference}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.claimAmount')}>
          {money(claim.amount, claim.currency)}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.claimType')}>
          {claim.refundOrder ? t('ui.claimTypeOrder') : t('ui.claimTypeExtra')}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.claimCreatedAt')}>
          {new Date(claim.createdAt).toLocaleString('vi-VN')}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.claimSlaDue')}>
          {new Date(claim.slaDueAt).toLocaleString('vi-VN')}
        </Descriptions.Item>
        <Descriptions.Item label={t('ui.claimStatus')}>
          <Tag color={STATUS_TAGS[claim.status].color}>{t(STATUS_TAGS[claim.status].label)}</Tag>
        </Descriptions.Item>
        {claim.payoutReference && (
          <Descriptions.Item label={t('ui.claimPayoutReference')}>
            {claim.payoutReference}
          </Descriptions.Item>
        )}
        {claim.resolutionNote && (
          <Descriptions.Item label={t('ui.claimRejectReason')}>
            {claim.resolutionNote}
          </Descriptions.Item>
        )}
      </Descriptions>

      {open && isOps && !mine && currentUserId && (
        <Button
          type="primary"
          block
          style={{ marginTop: 16 }}
          loading={assign.isPending}
          onClick={() =>
            assign.mutate(
              { id: claim.id, assigneeId: currentUserId },
              {
                onSuccess: () => void message.success(t('ui.claimAssignedNotice')),
                onError: report,
              },
            )
          }
        >
          {t('ui.claimTakeOver')}
        </Button>
      )}

      {open && isAdmin && (
        <Space direction="vertical" style={{ width: '100%', marginTop: 16 }}>
          <Typography.Text>{t('ui.claimAssignTo')}</Typography.Text>
          <Select
            style={{ width: '100%' }}
            loading={staff.isLoading}
            value={claim.assignedTo ?? undefined}
            options={(staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName }))}
            onChange={(assigneeId: string) =>
              assign.mutate(
                { id: claim.id, assigneeId },
                {
                  onSuccess: () => void message.success(t('ui.claimAssignedNotice')),
                  onError: report,
                },
              )
            }
          />
        </Space>
      )}

      {open && mine && (
        <Space direction="vertical" style={{ width: '100%', marginTop: 24 }} size="middle">
          {account ? (
            <>
              <Alert type="warning" showIcon message={t('ui.claimAccountWarning')} />
              <Descriptions column={1} size="small" bordered>
                <Descriptions.Item label={t('ui.claimBank')}>{account.bankBin}</Descriptions.Item>
                <Descriptions.Item label={t('ui.claimAccountNumber')}>
                  <Typography.Text copyable={false} strong>
                    {account.accountNumber}
                  </Typography.Text>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.claimAccountName')}>
                  {account.accountName}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.claimContactLabel')}>
                  {account.contact ?? '-'}
                </Descriptions.Item>
              </Descriptions>
            </>
          ) : (
            <Button
              block
              loading={reveal.isPending}
              onClick={() => reveal.mutate(claim.id, { onSuccess: setAccount, onError: report })}
            >
              {t('ui.claimViewAccount')}
            </Button>
          )}

          <Input
            placeholder={t('ui.claimPayoutReference')}
            value={payoutReference}
            maxLength={100}
            onChange={(e) => setPayoutReference(e.target.value)}
          />
          <Button
            type="primary"
            block
            disabled={!payoutReference.trim()}
            loading={payout.isPending}
            onClick={() =>
              payout.mutate(
                { id: claim.id, payoutReference: payoutReference.trim() },
                {
                  onSuccess: () => {
                    void message.success(t('ui.claimPayoutRecorded'));
                    close();
                  },
                  onError: report,
                },
              )
            }
          >
            {t('ui.claimRecordPayout')}
          </Button>

          <Input.TextArea
            placeholder={t('ui.claimRejectReason')}
            value={reason}
            maxLength={1000}
            rows={2}
            onChange={(e) => setReason(e.target.value)}
          />
          <Button
            danger
            block
            disabled={!reason.trim()}
            loading={reject.isPending}
            onClick={() =>
              reject.mutate(
                { id: claim.id, reason: reason.trim() },
                {
                  onSuccess: () => {
                    void message.success(t('ui.claimRejectedNotice'));
                    close();
                  },
                  onError: report,
                },
              )
            }
          >
            {t('ui.claimReject')}
          </Button>
        </Space>
      )}
    </Drawer>
  );
}
