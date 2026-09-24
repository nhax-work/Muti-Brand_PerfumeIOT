import { LOCALES, translate, type Locale } from '@scentstation/i18n';
import { Button, Layout, Menu, Select, Space, Typography } from 'antd';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';
import { NAV_ITEMS } from '../navigation';

/** Tên mỗi ngôn ngữ viết bằng chính ngôn ngữ đó, nên không đổi theo ngôn ngữ đang chọn. */
const localeOptions = LOCALES.map((l) => ({ value: l, label: translate(l, 'ui.localeName') }));

export function AdminLayout() {
  const { t, locale, setLocale } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();

  const items = NAV_ITEMS.filter(
    (item) => !item.roles || user?.roles.some((role) => item.roles?.includes(role)),
  ).map((item) => ({ key: item.path, icon: item.icon, label: t(item.label) }));

  return (
    <Layout className="admin-layout">
      <Layout.Sider breakpoint="lg" collapsedWidth={0}>
        <Typography.Title level={5} className="admin-brand">
          {t('ui.appName')}
        </Typography.Title>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[pathname]}
          items={items}
          onClick={({ key }) => void navigate(key)}
        />
      </Layout.Sider>
      <Layout>
        <Layout.Header className="admin-header">
          <Space>
            <Select<Locale>
              value={locale}
              onChange={setLocale}
              options={localeOptions}
              aria-label={t('ui.language')}
            />
            <Typography.Text>{user?.fullName}</Typography.Text>
            <Button onClick={() => void logout()}>{t('ui.logout')}</Button>
          </Space>
        </Layout.Header>
        <Layout.Content className="admin-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
