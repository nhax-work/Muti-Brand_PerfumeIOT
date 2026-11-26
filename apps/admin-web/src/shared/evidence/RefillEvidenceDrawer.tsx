import type { MessageKey } from '@scentstation/i18n';
import { Alert, Button, Descriptions, Drawer, Input, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  FOOTAGE_STATUS_COLOR,
  useCreateFootageRequest,
  useFootageRequests,
  useResolveFootageRequest,
} from './api';
import { EvidencePanel } from './EvidencePanel';

export interface RefillEvidenceSession {
  readonly id: string;
  readonly performedBy: string;
  readonly startedAt: string;
  readonly slotNumber?: number;
  readonly brandName?: string;
}

/**
 * Hình camera của một phiếu nạp (ADR-0032, FR-INV-38, 39). Nhân sự có `machine.operate` gắn hình và
 * đóng yêu cầu trích hình — trừ chính người đã nạp; Brand Admin xem hình và gửi yêu cầu trích hình.
 */
export function RefillEvidenceDrawer({
  session,
  canOperate,
  isBrand,
  currentUserId,
  onClose,
}: {
  session: RefillEvidenceSession | null;
  canOperate: boolean;
  isBrand: boolean;
  currentUserId: string | null;
  onClose: () => void;
}) {
  const { t } = useI18n();
  return (
    <Drawer
      open={session !== null}
      width={560}
      title={t('ui.refillEvidenceDrawerTitle')}
      onClose={onClose}
      destroyOnHidden
    >
      {session && (
        <RefillEvidenceBody
          session={session}
          canOperate={canOperate}
          isBrand={isBrand}
          currentUserId={currentUserId}
        />
      )}
    </Drawer>
  );
}

function RefillEvidenceBody({
  session,
  canOperate,
  isBrand,
  currentUserId,
}: {
  session: RefillEvidenceSession;
  canOperate: boolean;
  isBrand: boolean;
  currentUserId: string | null;
}) {
  const { t } = useI18n();
  const requests = useFootageRequests({ refillSessionId: session.id });
  const create = useCreateFootageRequest();
  const resolve = useResolveFootageRequest();
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');

  const items = requests.data?.items ?? [];
  const open = items.find((r) => r.status === 'OPEN') ?? null;
  // Đã trả lời thương hiệu thì bằng chứng của phiếu nạp không gỡ được nữa (máy chủ cũng chặn).
  const closed = items.some((r) => r.status !== 'OPEN');
  const maxDays = SPEC_CONSTRAINTS.CAMERA_FOOTAGE_REQUEST_MAX_DAYS;
  // Mốc lúc mở ngăn kéo — máy chủ vẫn là nơi chặn quá hạn (FOOTAGE_REQUEST_EXPIRED).
  const [openedAt] = useState(Date.now);
  const canStillRequest = openedAt - Date.parse(session.startedAt) <= maxDays * 24 * 3600 * 1000;
  const report = (e: unknown) => void message.error(errorMessage(e, t));

  return (
    <Space orientation="vertical" size="large" className="evidence-panel">
      <Descriptions column={1} size="small" bordered>
        {session.brandName && (
          <Descriptions.Item label={t('ui.refillWorkBrandProduct')}>
            {session.brandName}
          </Descriptions.Item>
        )}
        {session.slotNumber !== undefined && (
          <Descriptions.Item label={t('ui.invSlot')}>{session.slotNumber}</Descriptions.Item>
        )}
        <Descriptions.Item label={t('ui.invStartedAt')}>
          {formatDateTime(session.startedAt)}
        </Descriptions.Item>
      </Descriptions>

      {items.map((r) => (
        <Space key={r.id} orientation="vertical" size={4} className="evidence-item">
          <Space>
            <Typography.Text strong>{t('ui.footageRequestCurrent')}</Typography.Text>
            <Tag color={FOOTAGE_STATUS_COLOR[r.status]}>
              {t(`footageRequestStatus.${r.status}` as MessageKey)}
            </Tag>
          </Space>
          <Typography.Text>{r.reason}</Typography.Text>
          <Typography.Text type="secondary">
            {t('ui.footageCreatedAt')}: {formatDateTime(r.createdAt)}
          </Typography.Text>
          {r.responseNote && (
            <Typography.Text>
              {t('ui.footageResponse')}: {r.responseNote}
            </Typography.Text>
          )}
        </Space>
      ))}

      {isBrand && !open && (
        <Space orientation="vertical" className="evidence-panel">
          {canStillRequest ? (
            <>
              <Typography.Text type="secondary">
                {t('ui.footageRequestHint', { days: maxDays })}
              </Typography.Text>
              <Input.TextArea
                rows={2}
                maxLength={1000}
                placeholder={t('ui.footageRequestReason')}
                aria-label={t('ui.footageRequestReason')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <Button
                type="primary"
                disabled={!reason.trim()}
                loading={create.isPending}
                onClick={() =>
                  create.mutate(
                    { sessionId: session.id, reason: reason.trim() },
                    {
                      onSuccess: () => {
                        void message.success(t('ui.footageRequestSent'));
                        setReason('');
                      },
                      onError: report,
                    },
                  )
                }
              >
                {t('ui.footageRequestAction')}
              </Button>
            </>
          ) : (
            <Alert type="info" showIcon title={t('ui.footageRequestHint', { days: maxDays })} />
          )}
        </Space>
      )}

      <EvidencePanel
        target={{ kind: 'refill', id: session.id }}
        canUpload={canOperate && session.performedBy !== currentUserId}
        closed={closed}
        currentUserId={currentUserId}
      />

      {canOperate && open && (
        <Space orientation="vertical" className="evidence-panel">
          <Button
            type="primary"
            block
            loading={resolve.isPending}
            onClick={() =>
              resolve.mutate(
                { id: open.id, outcome: 'FULFILLED' },
                { onSuccess: () => void message.success(t('ui.footageResolved')), onError: report },
              )
            }
          >
            {t('ui.footageResolveFulfilled')}
          </Button>
          <Input.TextArea
            rows={2}
            maxLength={1000}
            placeholder={t('ui.footageResolveNote')}
            aria-label={t('ui.footageResolveNote')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          <Button
            block
            disabled={!note.trim()}
            loading={resolve.isPending}
            onClick={() =>
              resolve.mutate(
                { id: open.id, outcome: 'UNAVAILABLE', note: note.trim() },
                { onSuccess: () => void message.success(t('ui.footageResolved')), onError: report },
              )
            }
          >
            {t('ui.footageResolveUnavailable')}
          </Button>
        </Space>
      )}
    </Space>
  );
}
