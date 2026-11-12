import {
  ExperimentOutlined,
  GlobalOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  QuestionCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { LOCALES, translate, type Locale } from '@scentstation/i18n';
import { Avatar, Button, Layout, Menu, Select, Space, Tooltip, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router';
import { FrameworkAgreementModal, useCurrentAgreement } from '@/shared/agreement';
import { useAuth } from '@/shared/auth';
import { useI18n } from '@/shared/i18n';
import { activeNavPath, groupOfPath, isNavGroup, visibleNav } from '../navigation';
import { BrandOnboardingTour } from '../onboarding/BrandOnboardingTour';
import { EmailVerificationBanner } from './EmailVerificationBanner';
import { NotificationBell } from './NotificationBell';
import { SalesStopBanner } from './SalesStopBanner';
import { isOnboardingDone, markOnboardingDone } from '../onboarding/onboarding-storage';

/** Tên mỗi ngôn ngữ viết bằng chính ngôn ngữ đó, nên không đổi theo ngôn ngữ đang chọn. */
const localeOptions = LOCALES.map((l) => ({ value: l, label: translate(l, 'ui.localeName') }));

/** Nhớ người dùng đã thu gọn menu hay chưa giữa các lần tải trang. */
const COLLAPSED_STORAGE_KEY = 'scentstation.admin.siderCollapsed';

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(COLLAPSED_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Trình duyệt chặn localStorage thì chỉ không nhớ được, menu vẫn chạy.
  }
}

export function AdminLayout() {
  const { t, locale, setLocale } = useI18n();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isBrandAdmin = user?.roles.includes('BRAND_ADMIN') ?? false;
  // Brand Admin mới: tự bật hướng dẫn ở lần đầu, và mở rộng menu để có chỗ trỏ vào.
  const [tourOpen, setTourOpen] = useState(
    () => isBrandAdmin && !!user && !isOnboardingDone(user.id),
  );
  const [collapsed, setCollapsed] = useState(() => readCollapsed() && !tourOpen);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const agreement = useCurrentAgreement({ enabled: isBrandAdmin });
  const agreementPending = !!agreement.data && agreement.data.acceptance === null;

  const entries = visibleNav(user?.roles ?? []);
  const activePath = activeNavPath(entries, pathname);
  const activeGroup = groupOfPath(entries, activePath);

  // `data-tour` cho màn hướng dẫn biết trỏ vào dòng menu nào.
  const items: MenuProps['items'] = entries.map((entry) =>
    isNavGroup(entry)
      ? {
          key: entry.key,
          icon: entry.icon,
          label: <span data-tour={entry.key}>{t(entry.label)}</span>,
          children: entry.children.map((item) => ({
            key: item.path,
            icon: item.icon,
            label: <span data-tour={item.path}>{t(item.label)}</span>,
          })),
        }
      : {
          key: entry.path,
          icon: entry.icon,
          label: <span data-tour={entry.path}>{t(entry.label)}</span>,
        },
  );
  const tourTargets = [
    ...entries.map((e) => (isNavGroup(e) ? e.key : e.path)),
    'help',
    ...(user?.emailVerificationPending ? ['email-verification'] : []),
  ];

  const startTour = () => {
    setCollapsed(false);
    setTourOpen(true);
  };
  const closeTour = () => {
    if (user) markOnboardingDone(user.id);
    setTourOpen(false);
  };

  const toggle = (next: boolean) => {
    setCollapsed(next);
    saveCollapsed(next);
  };
  const toggleLabel = collapsed ? t('ui.expandMenu') : t('ui.collapseMenu');

  return (
    <Layout className="admin-layout">
      {/* SIDER MENU CỐ ĐỊNH BÊN TRÁI — thu gọn còn cột icon */}
      <Layout.Sider
        className="admin-sider"
        width={240}
        collapsedWidth={72}
        collapsible
        collapsed={collapsed}
        trigger={null}
        breakpoint="lg"
        onBreakpoint={(narrow) => narrow && setCollapsed(true)}
      >
        <Typography.Title level={5} className="admin-brand">
          {collapsed ? <ExperimentOutlined aria-label={t('ui.appName')} /> : t('ui.appName')}
        </Typography.Title>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={activePath ? [activePath] : []}
          defaultOpenKeys={activeGroup ? [activeGroup] : []}
          items={items}
          onClick={({ key }) => void navigate(key)}
        />
      </Layout.Sider>

      {/* KHUNG NỘI DUNG CHÍNH (HEADER CỐ ĐỊNH, CHỈ CUỘN PHẦN BODY) */}
      <Layout className="admin-main-layout">
        <Layout.Header className="admin-header">
          {/* GÓC TRÁI HEADER: nút thu/mở menu, Xin chào, Fullname! */}
          <div className="admin-header-left">
            <Space align="center" size={10}>
              <Tooltip title={toggleLabel}>
                <Button
                  type="text"
                  icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                  onClick={() => toggle(!collapsed)}
                  aria-label={toggleLabel}
                  aria-expanded={!collapsed}
                  className="admin-sider-toggle"
                />
              </Tooltip>
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
              {isBrandAdmin && (
                <Tooltip title={t('ui.onboardingReplay')}>
                  <Button
                    type="text"
                    icon={<QuestionCircleOutlined />}
                    onClick={startTour}
                    aria-label={t('ui.onboardingReplay')}
                    data-tour="help"
                    className="admin-sider-toggle"
                  />
                </Tooltip>
              )}
              <NotificationBell />
              <Select<Locale>
                value={locale}
                onChange={setLocale}
                options={localeOptions}
                aria-label={t('ui.language')}
                style={{ width: 130 }}
                prefix={<GlobalOutlined style={{ color: '#64748b' }} />}
              />
              <Button
                icon={<LockOutlined />}
                onClick={() => void navigate('/change-password')}
                style={{ borderRadius: 8 }}
              >
                {t('ui.changePassword')}
              </Button>
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

        <EmailVerificationBanner />
        <SalesStopBanner />

        {/* NỘI DUNG CUỘN CHUỘT (BODY) */}
        <Layout.Content className="admin-content">
          <Outlet />
        </Layout.Content>
      </Layout>

      {isBrandAdmin && (
        <>
          <BrandOnboardingTour
            open={tourOpen}
            targets={tourTargets}
            agreementPending={agreementPending}
            onClose={closeTour}
            // Hoàn thành hướng dẫn thì mời đồng ý hợp đồng khung luôn (ADR-0013: một lần, lúc đăng ký).
            onFinish={() => agreementPending && setAgreementOpen(true)}
          />
          <FrameworkAgreementModal
            open={agreementOpen}
            onClose={() => setAgreementOpen(false)}
            cancelLabel="ui.agreementLater"
          />
        </>
      )}
    </Layout>
  );
}
