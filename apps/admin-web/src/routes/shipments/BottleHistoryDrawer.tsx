import type { MessageKey } from '@scentstation/i18n';
import {
  Alert,
  Descriptions,
  Drawer,
  Empty,
  Pagination,
  Space,
  Spin,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { codeLabel } from '@/shared/codes';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { useNameLookups } from '@/shared/lookups';
import { type AuditLogEntry, BOTTLE_STATUS_COLOR, type Bottle, useBottleHistory } from './api';

const ACTION_LABELS: Record<string, MessageKey> = {
  'inv.bottle.registered': 'ui.bottleHistoryRegistered',
  'inv.bottle.installed': 'ui.bottleHistoryInstalled',
  'inv.bottle.removed': 'ui.bottleHistoryRemoved',
  'inv.inventory.adjusted': 'ui.bottleHistoryAdjusted',
  'inv.bottle.damaged': 'ui.bottleHistoryDamaged',
  'slt.bottle.liquidated': 'ui.bottleHistoryLiquidated',
  'exp.bottle.returned': 'ui.bottleHistoryReturned',
  'exp.bottle.forfeited': 'ui.bottleHistoryForfeited',
};

const HISTORY_PAGE_SIZE = 20;

function numberProp(obj: Record<string, unknown> | null | undefined, key: string): number | null {
  const value = obj?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function stringProp(obj: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = obj?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function entryColor(action: string): string {
  if (action === 'inv.bottle.damaged' || action === 'exp.bottle.forfeited') return 'red';
  if (action === 'slt.bottle.liquidated') return 'purple';
  if (action === 'inv.bottle.installed') return 'green';
  if (action === 'inv.inventory.adjusted' || action === 'inv.bottle.removed') return 'orange';
  return 'blue';
}

export interface BottleHistoryDrawerProps {
  readonly bottle: Bottle | null;
  readonly productName?: string;
  readonly batchNumber?: string;
  readonly onClose: () => void;
}

/** FR-INV-17: Drawer hiển thị dòng thời gian vòng đời của từng chai nước hoa. */
export function BottleHistoryDrawer({
  bottle,
  productName,
  batchNumber,
  onClose,
}: BottleHistoryDrawerProps) {
  const { t } = useI18n();
  const [pagination, setPagination] = useState<{ bottleId: string | undefined; page: number }>({
    bottleId: undefined,
    page: 1,
  });
  const page = pagination.bottleId === bottle?.id ? pagination.page : 1;
  const history = useBottleHistory(bottle?.id, page, HISTORY_PAGE_SIZE);
  const { brandName, slotLabel, userName } = useNameLookups();

  const items = history.data?.items ?? [];
  const total = history.data?.meta.total ?? 0;

  const renderEntry = (entry: AuditLogEntry) => {
    const labelKey = ACTION_LABELS[entry.action];
    const title = labelKey ? t(labelKey) : entry.action;

    const beforeMl =
      numberProp(entry.beforeData, 'currentEstimatedMl') ??
      numberProp(entry.afterData, 'beforeQuantityMl');
    const afterMl =
      numberProp(entry.afterData, 'currentEstimatedMl') ??
      numberProp(entry.afterData, 'afterQuantityMl') ??
      numberProp(entry.afterData, 'initialVolumeMl');

    const reason = stringProp(entry.afterData, 'reason') ?? stringProp(entry.afterData, 'notes');

    const actorLabel =
      entry.actorType === 'USER' && entry.actorId
        ? userName(entry.actorId)
        : codeLabel(t, 'actorType', entry.actorType);

    return {
      key: entry.id,
      color: entryColor(entry.action),
      content: (
        <Space orientation="vertical" size={2}>
          <Typography.Text strong>{title}</Typography.Text>
          <Typography.Text type="secondary">
            {formatDateTime(entry.occurredAt)} · {actorLabel}
          </Typography.Text>
          {beforeMl !== null && afterMl !== null ? (
            <Typography.Text>
              {t('ui.bottleHistoryVolumeDelta', {
                before: String(beforeMl),
                after: String(afterMl),
              })}
            </Typography.Text>
          ) : (
            afterMl !== null && (
              <Typography.Text>
                {t('ui.bottleHistoryVolume', { ml: String(afterMl) })}
              </Typography.Text>
            )
          )}
          {reason && (
            <Typography.Text type="secondary">
              {t('ui.bottleHistoryReason', { reason })}
            </Typography.Text>
          )}
        </Space>
      ),
    };
  };

  return (
    <Drawer
      title={
        bottle ? t('ui.bottleHistoryTitle', { bottle: bottle.identifier }) : t('ui.bottleHistory')
      }
      size={640}
      open={bottle !== null}
      onClose={onClose}
      destroyOnHidden
    >
      {bottle && (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions size="small" column={2} bordered>
            <Descriptions.Item label={t('ui.bottleIdentifierLabel')}>
              <Typography.Text strong>{bottle.identifier}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.invStatus')}>
              <Tag color={BOTTLE_STATUS_COLOR[bottle.status]}>
                {codeLabel(t, 'bottleStatus', bottle.status)}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.batchBrandLabel')}>
              {brandName(bottle.brandId)}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.invProduct')}>{productName ?? '—'}</Descriptions.Item>
            <Descriptions.Item label={t('ui.bottleBatchLabel')}>
              {batchNumber ?? '—'}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.bottleRemainingMl')}>
              {bottle.currentEstimatedMl} ml
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.slot')}>
              {bottle.installedSlotId
                ? slotLabel(bottle.installedSlotId)
                : t('ui.inStockSlotLabel')}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.bottleOwnerLabel')}>
              <Tag color={bottle.owner === 'BRAND' ? 'blue' : 'purple'}>
                {codeLabel(t, 'revenueOwner', bottle.owner)}
              </Tag>
            </Descriptions.Item>
          </Descriptions>

          {history.isLoading ? (
            <Spin />
          ) : history.error ? (
            <Alert type="error" showIcon title={errorMessage(history.error, t)} />
          ) : items.length === 0 ? (
            <Empty description={t('ui.noBottleHistory')} />
          ) : (
            <>
              <Timeline items={items.map(renderEntry)} />
              {total > HISTORY_PAGE_SIZE && (
                <Pagination
                  size="small"
                  current={page}
                  pageSize={HISTORY_PAGE_SIZE}
                  total={total}
                  onChange={(nextPage) => setPagination({ bottleId: bottle.id, page: nextPage })}
                  showSizeChanger={false}
                />
              )}
            </>
          )}
        </Space>
      )}
    </Drawer>
  );
}
