import { Typography } from 'antd';
import { useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';

/** Chỗ giữ chỗ — các ô số liệu tổng quan thuộc FR nhóm RPT, làm khi có acceptance criteria. */
export default function DashboardPage() {
  const { t } = useI18n();
  const { user } = useAuth();

  return (
    <>
      <Typography.Title level={3}>
        {t('ui.dashboardWelcome', { fullName: user?.fullName ?? '' })}
      </Typography.Title>
      <Typography.Paragraph>{t('ui.dashboardHint')}</Typography.Paragraph>
    </>
  );
}
