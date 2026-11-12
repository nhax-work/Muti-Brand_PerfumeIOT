import type { MessageKey } from '@scentstation/i18n';
import { Alert, Button, Space, Typography } from 'antd';
import { useNavigate } from 'react-router';
import { useAuth } from '@/shared/auth';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { type MachineSalesStop, useMachineSalesStops } from './status-api';

/**
 * Banner "máy đang dừng bán" trên mọi trang quản trị (ADR-0028, FR-MCH-19). Máy chủ tính bằng đúng
 * luật kiosk dùng khi tạo đơn, nên banner hiện khi và chỉ khi kiosk đang từ chối khách. Tự biến mất
 * khi máy bán lại. Brand Admin chỉ thấy máy có slot mình thuê và lý do chung.
 */
export function SalesStopBanner() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { user } = useAuth();
  const stops = useMachineSalesStops(!!user);
  const items = stops.data?.items ?? [];
  if (items.length === 0) return null;

  const canHandleRefill = user?.permissions.includes('inventory.manage') ?? false;

  const describe = (s: MachineSalesStop) => {
    if (s.refillSession) {
      return t('ui.salesStopRefillDetail', {
        slotNumber: s.refillSession.slotNumber,
        time: formatDateTime(s.refillSession.startedAt),
        name: s.refillSession.performedByName,
      });
    }
    const reason = t(`salesStopReason.${s.reason}` as MessageKey);
    return s.since
      ? `${reason} · ${t('ui.salesStopSince', { time: formatDateTime(s.since) })}`
      : reason;
  };

  return (
    <Alert
      type="warning"
      showIcon
      banner
      role="status"
      title={t('ui.salesStopTitle', { count: items.length })}
      description={
        <Space orientation="vertical" size={2} style={{ width: '100%' }}>
          {items.map((s) => (
            <Space key={s.machineId} size={8} wrap>
              <Typography.Text strong>{s.machineName}</Typography.Text>
              <Typography.Text type="secondary">{s.locationName}</Typography.Text>
              <Typography.Text>— {describe(s)}</Typography.Text>
              {s.reason === 'REFILL_SESSION' && canHandleRefill && (
                <Button
                  size="small"
                  type="link"
                  onClick={() => void navigate('/shipments?tab=refill')}
                >
                  {t('ui.salesStopGoRefill')}
                </Button>
              )}
            </Space>
          ))}
        </Space>
      }
    />
  );
}
