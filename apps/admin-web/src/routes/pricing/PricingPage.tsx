import { Alert, Tabs, Typography } from 'antd';
import { RequireRole } from '@/app/guards/RequireRole';
import { useI18n } from '@/shared/i18n';
import { PackagesTab } from './components/PackagesTab';
import { PlansTab } from './components/PlansTab';
import { SlotPricesTab } from './components/SlotPricesTab';

/**
 * Bảng giá thuê slot của Platform Super Admin (FR-SLT-30 ÷ 32, ADR-0006): gói thuê, gói bảo quản và
 * giá niêm yết từng slot. Mọi thay đổi chỉ áp cho lượt mua sau — hóa đơn đã tạo giữ ảnh chụp giá
 * (FR-SLT-33), máy chủ bảo đảm điều đó.
 */
export default function PricingPage() {
  const { t } = useI18n();
  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.pricing')}</Typography.Title>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('ui.pricingNotAffectInvoices')}
        />
        <Tabs
          items={[
            { key: 'packages', label: t('ui.pricingPackagesTab'), children: <PackagesTab /> },
            { key: 'plans', label: t('ui.pricingPlansTab'), children: <PlansTab /> },
            { key: 'slots', label: t('ui.pricingSlotPricesTab'), children: <SlotPricesTab /> },
          ]}
        />
      </div>
    </RequireRole>
  );
}
