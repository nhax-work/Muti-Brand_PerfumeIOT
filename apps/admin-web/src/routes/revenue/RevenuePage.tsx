import { Alert, Card, Col, DatePicker, Row, Select, Space, Statistic, Typography } from 'antd';
import { useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { formatVnd } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { useMachineOptions, useRevenueSplit } from './api';

/**
 * Doanh thu tách hai nguồn (FR-REV-04): phần thuộc thương hiệu và phần thuộc nền tảng (hàng đã thanh
 * lý, FR-REV-02). Chỉ Super Admin — Brand Admin không bao giờ thấy phần PLATFORM (FR-REV-06).
 */
export default function RevenuePage() {
  const { t } = useI18n();
  const [range, setRange] = useState<[string, string] | undefined>();
  const [machineId, setMachineId] = useState<string | undefined>();

  const split = useRevenueSplit({ from: range?.[0], to: range?.[1], machineId });
  const machines = useMachineOptions();
  const data = split.data;

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN']}>
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.revenueSplit')}</Typography.Title>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('ui.revenueSplitHint')}
        />
        <Space style={{ marginBottom: 16 }} wrap>
          <DatePicker.RangePicker
            onChange={(dates) =>
              setRange(
                dates?.[0] && dates[1]
                  ? [
                      dates[0].startOf('day').toISOString(),
                      dates[1].add(1, 'day').startOf('day').toISOString(),
                    ]
                  : undefined,
              )
            }
          />
          <Select<string>
            style={{ width: 260 }}
            value={machineId ?? 'ALL'}
            showSearch
            optionFilterProp="label"
            onChange={(v) => setMachineId(v === 'ALL' ? undefined : v)}
            options={[
              { value: 'ALL', label: t('ui.allMachines') },
              ...(machines.data?.items ?? []).map((m) => ({
                value: m.id,
                label: `${m.displayName} (${m.serialNumber})`,
              })),
            ]}
          />
        </Space>
        {data && (
          <Typography.Paragraph type="secondary">
            {t('ui.revenuePeriod', { from: data.periodStart, to: data.periodEnd })}
          </Typography.Paragraph>
        )}
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Card loading={split.isLoading}>
              <Statistic title={t('ui.revenueBrand')} value={formatVnd(data?.brandRevenue)} />
              <Typography.Text type="secondary">
                {t('ui.revenueOrderCount', { count: data?.orderCountBrand ?? 0 })}
              </Typography.Text>
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card loading={split.isLoading}>
              <Statistic title={t('ui.revenuePlatform')} value={formatVnd(data?.platformRevenue)} />
              <Typography.Text type="secondary">
                {t('ui.revenueOrderCount', { count: data?.orderCountPlatform ?? 0 })}
              </Typography.Text>
            </Card>
          </Col>
        </Row>
      </div>
    </RequireRole>
  );
}
