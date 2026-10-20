import type { MessageKey } from '@scentstation/i18n';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Divider,
  Form,
  Input,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { useEffect } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { errorMessage } from '@/shared/api';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type Brand,
  useMyBrand,
  useUpdateMyBrand,
  useUpdateMyBrandLegalProfile,
} from './api';

const STATUS_LABELS: Record<Brand['status'], MessageKey> = {
  ACTIVE: 'ui.brandActive',
  SUSPENDED: 'ui.brandSuspended',
  DISABLED: 'ui.brandDisabled',
};

interface ProfileForm {
  name: string;
  logoUrl?: string;
  description?: string;
  email?: string;
  phone?: string;
  address?: string;
}

interface LegalForm {
  taxCode: string;
  businessLicenseNumber?: string;
  bankCode?: string;
  accountNumber?: string;
  accountHolder?: string;
}

function contactOf(brand: Brand): Record<string, string | undefined> {
  const info = (brand.contactInfo ?? {}) as Record<string, unknown>;
  const pick = (k: string) => (typeof info[k] === 'string' ? (info[k] as string) : undefined);
  return { email: pick('email'), phone: pick('phone'), address: pick('address') };
}

/**
 * Hồ sơ thương hiệu của Brand Admin (FR-BND-06, FR-BND-09): tên hiển thị trên kiosk, logo, mô tả, liên hệ.
 * Hồ sơ pháp nhân và tài khoản nhận doanh thu (FR-BND-09, ADR-0013) được mã hóa tầng ứng dụng.
 */
export default function BrandProfilePage() {
  const { t } = useI18n();
  const { data: brand, isLoading } = useMyBrand();
  const update = useUpdateMyBrand();
  const updateLegal = useUpdateMyBrandLegalProfile();
  const [form] = Form.useForm<ProfileForm>();
  const [legalForm] = Form.useForm<LegalForm>();

  useEffect(() => {
    if (brand) {
      form.setFieldsValue({
        name: brand.name,
        logoUrl: brand.logoUrl ?? undefined,
        description: brand.description ?? undefined,
        ...contactOf(brand),
      });

      legalForm.setFieldsValue({
        taxCode: brand.taxCode ?? '',
        businessLicenseNumber: brand.businessLicenseNumber ?? undefined,
        bankCode: brand.payoutAccountMasked?.bankCode ?? undefined,
        accountHolder: brand.payoutAccountMasked?.accountHolder ?? undefined,
        accountNumber: undefined,
      });
    }
  }, [brand, form, legalForm]);

  const submit = async () => {
    const v = await form.validateFields();
    // Giữ các khóa liên hệ khác (nếu có) — contactInfo là jsonb tự do.
    const contactInfo = {
      ...((brand?.contactInfo ?? {}) as Record<string, unknown>),
      email: v.email || undefined,
      phone: v.phone || undefined,
      address: v.address || undefined,
    };
    try {
      await update.mutateAsync({
        name: v.name,
        logoUrl: v.logoUrl || undefined,
        description: v.description,
        contactInfo,
      });
      message.success(t('ui.brandSaved'));
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const submitLegal = async () => {
    const v = await legalForm.validateFields();
    try {
      const payoutAccount =
        v.bankCode && v.accountNumber && v.accountHolder
          ? {
              bankCode: v.bankCode,
              accountNumber: v.accountNumber,
              accountHolder: v.accountHolder,
            }
          : undefined;

      await updateLegal.mutateAsync({
        taxCode: v.taxCode,
        businessLicenseNumber: v.businessLicenseNumber || undefined,
        payoutAccount,
      });
      message.success(t('ui.brandSaved'));
      legalForm.setFieldValue('accountNumber', undefined);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  if (isLoading || !brand) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <RequireRole allow={['BRAND_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 900, margin: '0 auto' }}>
        <Space align="center" style={{ marginBottom: 16 }}>
          <Avatar size={56} src={brand.logoUrl ?? undefined}>
            {brand.name.charAt(0)}
          </Avatar>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('ui.brandProfile')}
          </Typography.Title>
        </Space>

        <Card style={{ marginBottom: 16 }}>
          <Descriptions column={{ xs: 1, md: 2 }} size="small">
            <Descriptions.Item label={t('ui.brandCode')}>{brand.code}</Descriptions.Item>
            <Descriptions.Item label={t('ui.pricingStatus')}>
              <Tag color={brand.status === 'ACTIVE' ? 'green' : 'orange'}>
                {t(STATUS_LABELS[brand.status])}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.brandLegal')}>
              {brand.legalVerifiedAt ? (
                <Tag color="green">{t('ui.brandLegalVerified')}</Tag>
              ) : (
                <Tag>{t('ui.brandLegalUnverified')}</Tag>
              )}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.createdAt')}>
              {formatDateTime(brand.createdAt)}
            </Descriptions.Item>
          </Descriptions>
          {brand.status !== 'ACTIVE' && (
            <Alert
              style={{ marginTop: 12 }}
              type="warning"
              showIcon
              message={t('ui.brandSuspendedNotice')}
            />
          )}
        </Card>

        <Card title={t('ui.brandProfileEdit')} style={{ marginBottom: 16 }}>
          <Form form={form} layout="vertical" onFinish={() => void submit()}>
            <Form.Item
              name="name"
              label={t('ui.brandName')}
              extra={t('ui.brandNameHint')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Form.Item
              name="logoUrl"
              label={t('ui.brandLogoUrl')}
              rules={[{ type: 'url', message: t('validation.invalidUrl') }]}
            >
              <Input placeholder="https://" />
            </Form.Item>
            <Form.Item name="description" label={t('ui.pricingDescription')}>
              <Input.TextArea rows={3} />
            </Form.Item>
            <Form.Item
              name="email"
              label="Email"
              rules={[{ type: 'email', message: t('validation.invalidEmail') }]}
            >
              <Input />
            </Form.Item>
            <Form.Item name="phone" label={t('ui.brandPhone')}>
              <Input />
            </Form.Item>
            <Form.Item name="address" label={t('ui.brandAddress')}>
              <Input />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={update.isPending}>
              {t('ui.save')}
            </Button>
          </Form>
        </Card>

        <Card title={t('ui.brandLegalProfile')}>
          {brand.legalVerifiedAt ? (
            <Alert
              style={{ marginBottom: 16 }}
              type="success"
              showIcon
              message={`${t('ui.brandLegalVerified')} — ${formatDateTime(brand.legalVerifiedAt)}`}
            />
          ) : (
            <Alert
              style={{ marginBottom: 16 }}
              type="info"
              showIcon
              message={t('ui.brandLegalUnverified')}
            />
          )}
          <Alert
            style={{ marginBottom: 16 }}
            type="warning"
            showIcon
            message={t('ui.brandLegalNotice')}
          />
          <Form form={legalForm} layout="vertical" onFinish={() => void submitLegal()}>
            <Form.Item
              name="taxCode"
              label={t('ui.brandTaxCode')}
              extra={t('ui.brandTaxCodeHint')}
              rules={[
                { required: true, message: t('validation.required') },
                { min: 10, max: 20, message: t('ui.brandTaxCodeHint') },
              ]}
            >
              <Input maxLength={20} />
            </Form.Item>
            <Form.Item
              name="businessLicenseNumber"
              label={t('ui.brandBusinessLicense')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={100} />
            </Form.Item>

            <Divider>{t('ui.brandPayoutAccount')}</Divider>

            {brand.payoutAccountMasked && (
              <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
                <Descriptions.Item label={t('ui.brandPayoutAccountMasked')}>
                  {brand.payoutAccountMasked.bankCode} ·{' '}
                  {brand.payoutAccountMasked.maskedAccountNumber} (
                  {brand.payoutAccountMasked.accountHolder})
                </Descriptions.Item>
              </Descriptions>
            )}

            <Form.Item
              name="bankCode"
              label={t('ui.brandBankCode')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input placeholder={t('ui.brandBankCodePlaceholder')} maxLength={20} />
            </Form.Item>
            <Form.Item
              name="accountNumber"
              label={t('ui.brandAccountNumber')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input placeholder="Nhập số tài khoản" maxLength={30} />
            </Form.Item>
            <Form.Item
              name="accountHolder"
              label={t('ui.brandAccountHolder')}
              extra={t('ui.brandAccountHolderHint')}
              rules={[{ required: true, message: t('validation.required') }]}
            >
              <Input maxLength={200} />
            </Form.Item>
            <Button type="primary" htmlType="submit" loading={updateLegal.isPending}>
              {t('ui.save')}
            </Button>
          </Form>
        </Card>
      </div>
    </RequireRole>
  );
}

