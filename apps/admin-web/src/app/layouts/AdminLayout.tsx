import { GlobalOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { LOCALES, translate, type Locale } from '@scentstation/i18n';
import { Avatar, Button, Layout, Menu, Select, Space, Typography } from 'antd';
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
      {/* SIDER MENU CỐ ĐỊNH BÊN TRÁI */}
      <Layout.Sider breakpoint="lg" collapsedWidth={0} className="admin-sider">
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

      {/* KHUNG NỘI DUNG CHÍNH (HEADER CỐ ĐỊNH, CHỈ CUỘN PHẦN BODY) */}
      <Layout className="admin-main-layout">
        <Layout.Header className="admin-header">
          {/* GÓC TRÁI HEADER: Xin chào, Fullname! */}
          <div className="admin-header-left">
            <Space align="center" size={10}>
              <Avatar
                size="default"
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  fontWeight: 700,
                  boxShadow: '0 2px 6px rgba(2, 132, 199, 0.35)',
                }}
                icon={<UserOutlined />}
              >
                {user?.fullName?.charAt(0).toUpperCase()}
              </Avatar>
              <Typography.Text style={{ fontSize: 14, color: '#334155' }}>
                {t('ui.welcomeUser', { fullName: user?.fullName || 'Admin' })}
              </Typography.Text>
            </Space>
          </div>

          {/* GÓC PHẢI HEADER: Chuyển đổi ngôn ngữ & Nút Đăng xuất */}
          <div className="admin-header-right">
            <Space align="center" size={12}>
              <Select<Locale>
                value={locale}
                onChange={setLocale}
                options={localeOptions}
                aria-label={t('ui.language')}
                style={{ width: 130 }}
                prefix={<GlobalOutlined style={{ color: '#64748b' }} />}
              />
              <Button
                icon={<LogoutOutlined />}
                onClick={() => void logout()}
                danger
                style={{
                  borderRadius: 8,
                  fontWeight: 500,
                }}
              >
                {t('ui.logout')}
              </Button>
            </Space>
          </div>
        </Layout.Header>

        {/* NỘI DUNG CUỘN CHUỘT (BODY) */}
        <Layout.Content className="admin-content">
          <Outlet />
        </Layout.Content>
      </Layout>
    </Layout>
  );
}
