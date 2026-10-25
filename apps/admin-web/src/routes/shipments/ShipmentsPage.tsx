import { InboxOutlined, SafetyCertificateOutlined, ToolOutlined } from '@ant-design/icons';
import { Card, Space, Tabs, Typography } from 'antd';
import { RequireRole } from '@/app/guards/RequireRole';
import { useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';
import { BatchesTab } from './BatchesTab';
import { RefillTab } from './RefillTab';
import { ShipmentsTab } from './ShipmentsTab';

/**
 * Kho: khai báo gửi hàng (FR-INV-22 ÷ 28), lô và giấy tờ chính hãng (FR-INV-33 ÷ 35), phiếu nạp
 * (FR-INV-29 ÷ 32). Nút thao tác hiện theo quyền mà máy chủ cũng kiểm (ADR-0017 mục 7) — máy chủ
 * mới là nơi chặn (FE5).
 */
export default function ShipmentsPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;
  const isBrand = user?.brandId != null;

  return (
    <RequireRole
      allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF', 'INVENTORY_STAFF', 'BRAND_ADMIN']}
    >
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('ui.shipments')}
          </Typography.Title>
          <Typography.Text type="secondary">{t('ui.shipmentsSubtitle')}</Typography.Text>
        </div>
        <Card>
          <Tabs
            items={[
              {
                key: 'shipments',
                label: (
                  <span>
                    <InboxOutlined /> {t('ui.shipmentDeclarations')}
                  </span>
                ),
                children: (
                  <ShipmentsTab
                    canDeclare={isBrand && can('inventory.declare')}
                    canReceive={can('inventory.manage')}
                  />
                ),
              },
              {
                key: 'batches',
                label: (
                  <span>
                    <SafetyCertificateOutlined /> {t('ui.inventoryBatches')}
                  </span>
                ),
                children: (
                  <BatchesTab
                    canSubmit={isBrand && can('inventory.declare')}
                    canReview={can('inventory.verify')}
                  />
                ),
              },
              {
                key: 'refill',
                label: (
                  <span>
                    <ToolOutlined /> {t('ui.refillSessions')}
                  </span>
                ),
                children: (
                  <RefillTab
                    canOperate={can('inventory.manage')}
                    canSeeMachines={can('machine.view')}
                  />
                ),
              },
            ]}
          />
        </Card>
      </Space>
    </RequireRole>
  );
}
