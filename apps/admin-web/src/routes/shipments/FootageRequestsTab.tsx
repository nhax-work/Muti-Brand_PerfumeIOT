import type { MessageKey } from '@scentstation/i18n';
import { Button, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import {
  FOOTAGE_STATUS_COLOR,
  type FootageRequest,
  type FootageRequestStatus,
  type RefillEvidenceSession,
  RefillEvidenceDrawer,
  useFootageRequests,
} from '@/shared/evidence';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';

const STATUSES: readonly FootageRequestStatus[] = ['OPEN', 'FULFILLED', 'UNAVAILABLE'];

/**
 * Yêu cầu trích hình phiếu nạp (FR-INV-39, ADR-0032). Nhân sự có `machine.operate` thấy mọi yêu cầu
 * và mở phiếu nạp để gắn hình; Brand Admin thấy yêu cầu của mình. Cũ nhất trước.
 */
export function FootageRequestsTab({
  canOperate,
  isBrand,
  currentUserId,
}: {
  canOperate: boolean;
  isBrand: boolean;
  currentUserId: string | null;
}) {
  const { t } = useI18n();
  const [status, setStatus] = useState<FootageRequestStatus | undefined>(
    canOperate ? 'OPEN' : undefined,
  );
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<RefillEvidenceSession | null>(null);
  const { data, isLoading } = useFootageRequests({ status, page });

  const columns: ColumnsType<FootageRequest> = [
    { title: t('ui.refillWorkBrandProduct'), dataIndex: 'brandName', key: 'brandName' },
    {
      title: t('ui.invMachine'),
      key: 'machine',
      render: (_, r) => `${r.machineName ?? '—'} · ${t('ui.invSlot')} ${r.slotNumber ?? '—'}`,
    },
    {
      title: t('ui.invStartedAt'),
      dataIndex: 'sessionStartedAt',
      key: 'sessionStartedAt',
      render: (value: string | undefined) => formatDateTime(value),
    },
    { title: t('ui.footageRequestReason'), dataIndex: 'reason', key: 'reason' },
    {
      title: t('ui.footageCreatedAt'),
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value: string) => formatDateTime(value),
    },
    {
      title: t('ui.invStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: FootageRequestStatus) => (
        <Tag color={FOOTAGE_STATUS_COLOR[s]}>{t(`footageRequestStatus.${s}` as MessageKey)}</Tag>
      ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, r) => (
        <Button
          type="link"
          size="small"
          onClick={() =>
            setSelected({
              id: r.refillSessionId,
              // Người nạp không có trong yêu cầu: máy chủ vẫn chặn họ tự nộp (EVIDENCE_SELF_REVIEW).
              performedBy: '',
              startedAt: r.sessionStartedAt ?? r.createdAt,
              ...(r.slotNumber !== undefined ? { slotNumber: r.slotNumber } : {}),
              ...(r.brandName !== undefined ? { brandName: r.brandName } : {}),
            })
          }
        >
          {t('ui.refillEvidenceAction')}
        </Button>
      ),
    },
  ];

  return (
    <Space orientation="vertical" size="middle" className="evidence-panel">
      <Typography.Text type="secondary">{t('ui.footageRequestsHint')}</Typography.Text>
      <Select<FootageRequestStatus | 'ALL'>
        className="footage-status-filter"
        value={status ?? 'ALL'}
        onChange={(v) => {
          setStatus(v === 'ALL' ? undefined : v);
          setPage(1);
        }}
        options={[
          { value: 'ALL', label: t('ui.claimAllStatuses') },
          ...STATUSES.map((s) => ({
            value: s,
            label: t(`footageRequestStatus.${s}` as MessageKey),
          })),
        ]}
      />
      <Table<FootageRequest>
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data?.items ?? []}
        locale={{ emptyText: t('ui.footageEmpty') }}
        pagination={{
          current: page,
          pageSize: 20,
          total: data?.meta.total ?? 0,
          onChange: setPage,
        }}
      />
      <RefillEvidenceDrawer
        session={selected}
        canOperate={canOperate}
        isBrand={isBrand}
        currentUserId={currentUserId}
        onClose={() => setSelected(null)}
      />
    </Space>
  );
}
