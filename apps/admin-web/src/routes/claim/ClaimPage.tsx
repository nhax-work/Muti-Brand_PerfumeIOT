import { useMutation } from '@tanstack/react-query';
import type { components } from '@scentstation/contracts';
import { Alert, Button, Card, Checkbox, Form, Input, Result, Select, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { api, errorMessage, unwrap } from '@/shared/api';
import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { useI18n } from '@/shared/i18n';

type ClaimCreate = components['schemas']['RefundClaimCreate'];

/**
 * Ngân hàng phổ biến theo mã BIN của VietQR. Tên ngân hàng là danh từ riêng, không dịch.
 * Thiếu ngân hàng của khách thì bổ sung vào danh sách này.
 */
const BANKS: readonly { bin: string; name: string }[] = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970422', name: 'MB Bank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970443', name: 'SHB' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970448', name: 'OCB' },
  { bin: '970426', name: 'MSB' },
];

interface ClaimFormValues {
  contact: string;
  bankBin: string;
  accountNumber: string;
  accountName: string;
  consent: boolean;
}

/**
 * Trang khiếu nại hoàn tiền công khai — khách mở bằng điện thoại sau khi quét QR sự cố trên kiosk
 * (FR-ORD-29, ADR-0012). Không cần đăng nhập; mã đơn và mã khiếu nại nằm trên đường dẫn (?o=…&t=…).
 */
export default function ClaimPage() {
  const { t } = useI18n();
  const [params] = useSearchParams();
  const orderId = params.get('o');
  const claimToken = params.get('t');

  const submit = useMutation({
    mutationFn: (body: ClaimCreate) => unwrap(api.POST('/public/refund-claims', { body })),
  });

  if (!orderId || !claimToken) {
    return (
      <Card style={{ maxWidth: 480, margin: '24px auto' }}>
        <Result status="warning" title={t('ui.claimLinkInvalid')} />
      </Card>
    );
  }

  if (submit.data) {
    const amount = `${Number(submit.data.amount).toLocaleString('vi-VN')} ${submit.data.currency}`;
    return (
      <Card style={{ maxWidth: 480, margin: '24px auto' }}>
        <Result
          status="success"
          title={t('ui.claimSubmitted')}
          subTitle={t('ui.claimSubmittedDetail', { amount, id: submit.data.id.slice(0, 8) })}
        />
      </Card>
    );
  }

  const onFinish = (values: ClaimFormValues) => {
    submit.mutate({
      orderId,
      claimToken,
      contact: values.contact.trim(),
      refundAccount: {
        bankBin: values.bankBin,
        accountNumber: values.accountNumber.trim(),
        accountName: values.accountName.trim().toUpperCase(),
      },
      consent: true,
    });
  };

  return (
    <Card style={{ maxWidth: 480, margin: '24px auto' }}>
      <Typography.Title level={3}>{t('ui.claimPageTitle')}</Typography.Title>
      <Typography.Paragraph>
        {t('ui.claimPageIntro', { hours: SPEC_CONSTRAINTS.REFUND_CLAIM_SLA_HOURS })}
      </Typography.Paragraph>

      {submit.isError && (
        <Alert
          type="error"
          showIcon
          style={{ marginBottom: 16 }}
          message={errorMessage(submit.error, t)}
        />
      )}

      <Form<ClaimFormValues> layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Form.Item
          name="contact"
          label={t('ui.claimContact')}
          extra={t('ui.claimContactHint')}
          rules={[{ required: true, min: 5, message: t('ui.claimFieldRequired') }]}
        >
          <Input autoComplete="tel" maxLength={200} />
        </Form.Item>
        <Form.Item
          name="bankBin"
          label={t('ui.claimBank')}
          rules={[{ required: true, message: t('ui.claimFieldRequired') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            options={BANKS.map((b) => ({ value: b.bin, label: b.name }))}
          />
        </Form.Item>
        <Form.Item
          name="accountNumber"
          label={t('ui.claimAccountNumber')}
          rules={[
            { required: true, message: t('ui.claimFieldRequired') },
            { pattern: /^[0-9]{6,19}$/, message: t('ui.claimAccountNumberInvalid') },
          ]}
        >
          <Input inputMode="numeric" maxLength={19} />
        </Form.Item>
        <Form.Item
          name="accountName"
          label={t('ui.claimAccountName')}
          extra={t('ui.claimAccountNameHint')}
          rules={[{ required: true, message: t('ui.claimFieldRequired') }]}
        >
          <Input maxLength={100} style={{ textTransform: 'uppercase' }} />
        </Form.Item>
        <Form.Item
          name="consent"
          valuePropName="checked"
          rules={[
            {
              validator: (_, checked: boolean) =>
                checked
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('ui.claimConsentRequired'))),
            },
          ]}
        >
          <Checkbox>
            {t('ui.claimConsent', { days: SPEC_CONSTRAINTS.REFUND_CLAIM_CONTACT_RETENTION_DAYS })}
          </Checkbox>
        </Form.Item>
        <Button type="primary" htmlType="submit" block loading={submit.isPending}>
          {t('ui.claimSubmit')}
        </Button>
      </Form>
    </Card>
  );
}
