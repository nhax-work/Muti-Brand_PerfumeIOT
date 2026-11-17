import { useQuery } from '@tanstack/react-query';
import type { components } from '@scentstation/contracts';
import type { MessageKey } from '@scentstation/i18n';
import { Alert, Button, Card, Descriptions, Form, Input, Steps, Typography } from 'antd';
import { useSearchParams } from 'react-router';
import { api, errorMessage, unwrap } from '@/shared/api';
import { EvidenceMedia, usePublicClaimEvidence } from '@/shared/evidence';
import { useI18n } from '@/shared/i18n';
import { looksLikeClaimCode } from './claim-code';

type Tracking = components['schemas']['RefundClaimTracking'];
type Stage = Tracking['stage'];

const RESULT_LABEL: Partial<Record<Stage, MessageKey>> = {
  REFUNDED: 'ui.claimResultRefunded',
  REJECTED: 'ui.claimResultRejected',
  EXPIRED: 'ui.claimResultExpired',
};

const STEP_INDEX: Record<Stage, number> = {
  RECEIVED: 0,
  PROCESSING: 1,
  REFUNDED: 2,
  REJECTED: 2,
  EXPIRED: 2,
};

/**
 * Trang công khai cho khách tra cứu phiếu khiếu nại bằng mã (FR-ORD-36, ADR-0031). Mở từ liên kết
 * trong email thì mã đã có trên đường dẫn (?code=…) và tra ngay; `key` trong liên kết dành cho
 * bằng chứng hình ảnh (ADR-0032). Không hiện tài khoản ngân hàng hay email.
 */
export default function ClaimStatusPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const code = params.get('code')?.trim() ?? '';

  const tracking = useQuery({
    queryKey: ['claim-tracking', code],
    queryFn: () => unwrap(api.GET('/public/refund-claims/{code}', { params: { path: { code } } })),
    enabled: code !== '',
    retry: false,
  });

  const lookup = ({ value }: { value: string }) => {
    // Đổi mã thì bỏ `key` — khóa xem bằng chứng chỉ đúng với mã trong email.
    setParams({ code: value.trim() });
  };

  return (
    <Card className="login-card">
      <Typography.Title level={3}>{t('ui.claimTrackPageTitle')}</Typography.Title>

      {tracking.data ? (
        <TrackingResult
          data={tracking.data}
          viewKey={params.get('key')}
          onAnother={() => setParams({})}
        />
      ) : (
        <>
          <Typography.Paragraph>{t('ui.claimTrackPageIntro')}</Typography.Paragraph>
          {tracking.isError && (
            <Alert
              type="error"
              showIcon
              className="claim-track-error"
              title={errorMessage(tracking.error, t)}
            />
          )}
          <Form<{ value: string }>
            layout="vertical"
            requiredMark={false}
            initialValues={{ value: code }}
            onFinish={lookup}
          >
            <Form.Item
              name="value"
              label={t('ui.claimCodeLabel')}
              rules={[
                {
                  validator: (_, value: string | undefined) =>
                    looksLikeClaimCode(value ?? '')
                      ? Promise.resolve()
                      : Promise.reject(new Error(t('ui.claimTrackCodeInvalid'))),
                },
              ]}
            >
              <Input
                placeholder="KN-XXXXX-XXXXX"
                autoComplete="off"
                autoCapitalize="characters"
                maxLength={20}
              />
            </Form.Item>
            <Button type="primary" htmlType="submit" block loading={tracking.isFetching}>
              {t('ui.claimTrackSubmit')}
            </Button>
          </Form>
        </>
      )}
    </Card>
  );
}

function TrackingResult({
  data,
  viewKey,
  onAnother,
}: {
  data: Tracking;
  /** Khóa xem bằng chứng trong liên kết email (ADR-0031 mục 4). */
  viewKey: string | null;
  onAnother: () => void;
}) {
  const { t, locale } = useI18n();
  const dateLocale = locale === 'vi' ? 'vi-VN' : 'en-GB';
  const formatDate = (iso: string) => new Date(iso).toLocaleString(dateLocale);
  const amount = `${Number(data.amount).toLocaleString(dateLocale)} ${data.currency}`;
  const resultLabel = RESULT_LABEL[data.stage];
  const failed = data.stage === 'REJECTED' || data.stage === 'EXPIRED';

  return (
    <>
      <Typography.Text type="secondary">{t('ui.claimCodeLabel')}</Typography.Text>
      <Typography.Title level={2} copyable className="claim-code">
        {data.code}
      </Typography.Title>

      <Steps
        orientation="vertical"
        size="small"
        current={STEP_INDEX[data.stage]}
        status={failed ? 'error' : data.stage === 'REFUNDED' ? 'finish' : 'process'}
        items={[
          { title: t('ui.claimStageReceived') },
          { title: t('ui.claimStageProcessing') },
          { title: resultLabel ? t(resultLabel) : t('ui.claimStageResult') },
        ]}
      />

      <Descriptions column={1} size="small" bordered>
        <Descriptions.Item label={t('ui.claimAmount')}>{amount}</Descriptions.Item>
        <Descriptions.Item label={t('ui.claimTrackSubmittedAt')}>
          {formatDate(data.createdAt)}
        </Descriptions.Item>
        {data.dueAt && (
          <Descriptions.Item label={t('ui.claimTrackDueAt')}>
            {formatDate(data.dueAt)}
          </Descriptions.Item>
        )}
        {data.closedAt && (
          <Descriptions.Item label={t('ui.claimTrackClosedAt')}>
            {formatDate(data.closedAt)}
          </Descriptions.Item>
        )}
        {data.payoutReference && (
          <Descriptions.Item label={t('ui.claimPayoutReference')}>
            <Typography.Text strong copyable>
              {data.payoutReference}
            </Typography.Text>
          </Descriptions.Item>
        )}
        {data.resolutionNote && (
          <Descriptions.Item label={t('ui.claimRejectReason')}>
            {data.resolutionNote}
          </Descriptions.Item>
        )}
      </Descriptions>

      {data.stage === 'REFUNDED' && (
        <Typography.Paragraph type="secondary" className="claim-track-hint">
          {t('ui.claimTrackRefundedHint')}
        </Typography.Paragraph>
      )}
      {data.stage === 'EXPIRED' && (
        <Typography.Paragraph type="secondary" className="claim-track-hint">
          {t('ui.claimTrackExpiredHint')}
        </Typography.Paragraph>
      )}

      {data.hasEvidence && <ClaimEvidence code={data.code} viewKey={viewKey} />}

      <Button block className="claim-track-another" onClick={onAnother}>
        {t('ui.claimTrackAnother')}
      </Button>
    </>
  );
}

/**
 * Hình ảnh đối chiếu của phiếu bị từ chối (FR-ORD-39, ADR-0032). Chỉ mở được bằng liên kết trong
 * email — người chỉ biết mã khiếu nại thấy dòng nhắc, không thấy hình.
 */
function ClaimEvidence({ code, viewKey }: { code: string; viewKey: string | null }) {
  const { t } = useI18n();
  const evidence = usePublicClaimEvidence(code, viewKey, true);
  const items = evidence.data?.items ?? [];

  return (
    <div className="claim-evidence">
      <Typography.Title level={5}>{t('ui.claimEvidenceTitle')}</Typography.Title>
      {!viewKey || evidence.isError ? (
        <Typography.Paragraph type="secondary">
          {t('ui.claimEvidenceNeedsEmail')}
        </Typography.Paragraph>
      ) : (
        <>
          <Typography.Paragraph type="secondary">{t('ui.claimEvidenceIntro')}</Typography.Paragraph>
          {items.map((item) => (
            <EvidenceMedia
              key={item.id}
              kind={item.kind}
              url={item.url}
              label={t('ui.claimEvidenceTitle')}
            />
          ))}
        </>
      )}
    </div>
  );
}
