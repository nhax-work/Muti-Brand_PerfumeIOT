import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, Card, Col, Row, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import {
  AppstoreAddOutlined,
  EyeOutlined,
  FileTextOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import { RequireRole } from '@/app/guards/RequireRole';
import { useI18n } from '@/shared/i18n';
import { useSlotRentals, type RentalInvoiceStage, type SlotRental } from './api';

const { Title, Text } = Typography;

const STAGE_TAGS: Record<RentalInvoiceStage, { color: string; labelKey: string }> = {
  AWAITING_PAYMENT: { color: 'orange', labelKey: 'ui.stageAwaitingPayment' },
  AWAITING_STOCK: { color: 'cyan', labelKey: 'ui.stageAwaitingStock' },
  ACTIVE: { color: 'green', labelKey: 'ui.stageActive' },
  EXPIRING: { color: 'gold', labelKey: 'ui.stageExpiring' },
  GRACE: { color: 'magenta', labelKey: 'ui.stageGrace' },
  LIQUIDATED: { color: 'purple', labelKey: 'ui.stageLiquidated' },
  ENDED: { color: 'default', labelKey: 'ui.stageEnded' },
  CANCELLED: { color: 'red', labelKey: 'ui.stageCancelled' },
};

export default function RentalsPage() {
  const { t } = useI18n();
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [stageFilter, setStageFilter] = useState<RentalInvoiceStage | undefined>(undefined);

  const { data, isLoading, refetch } = useSlotRentals({
    page,
    pageSize,
    stage: stageFilter,
  });

  const rentals = data?.items ?? [];
  const total = data?.meta?.total ?? 0;

  const columns: ColumnsType<SlotRental> = [
    {
      title: t('ui.invoiceNumber'),
      dataIndex: 'invoiceNumber',
      key: 'invoiceNumber',
      render: (invoiceNumber: string | null, record) => (
        <Space direction="vertical" size={2}>
          <Text strong style={{ color: invoiceNumber ? '#1677ff' : '#8c8c8c' }}>
            {invoiceNumber || t('ui.unpaid')}
          </Text>
          {record.checkoutId && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Phiên: {record.checkoutId.slice(0, 8)}...
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('ui.rentalStage'),
      dataIndex: 'stage',
      key: 'stage',
      render: (stage: RentalInvoiceStage) => {
        const config = STAGE_TAGS[stage] || { color: 'default', labelKey: stage };
        return <Tag color={config.color}>{t(config.labelKey as never)}</Tag>;
      },
    },
    {
      title: t('ui.totalFee'),
      dataIndex: 'totalAmount',
      key: 'totalAmount',
      render: (amount: string | null, record) => (
        <Text strong>
          {Number(amount || 0).toLocaleString('vi-VN')} {record.currency}
        </Text>
      ),
    },
    {
      title: t('ui.rentalPeriod'),
      key: 'period',
      render: (_, record) => (
        <Space direction="vertical" size={2}>
          <Text style={{ fontSize: 13 }}>
            {record.durationMonths ? `${record.durationMonths} tháng` : '-'}
          </Text>
          {record.paidAt && (
            <Text type="secondary" style={{ fontSize: 12 }}>
              Thanh toán: {new Date(record.paidAt).toLocaleDateString('vi-VN')}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('ui.pricePerSpray'),
      dataIndex: 'pricePerSpray',
      key: 'pricePerSpray',
      render: (price: string | null, record) => (
        <Text>{price ? `${Number(price).toLocaleString('vi-VN')} ${record.currency}` : '-'}</Text>
      ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, record) => {
        if (record.stage === 'AWAITING_PAYMENT' && record.checkoutId) {
          return (
            <Button
              type="primary"
              size="small"
              onClick={() => void navigate(`/rentals/checkouts/${record.checkoutId}`)}
            >
              {t('ui.payNow')}
            </Button>
          );
        }
        return (
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => void navigate(`/rentals/${record.id}`)}
          >
            {t('ui.viewDetail')}
          </Button>
        );
      },
    },
  ];

  return (
    <RequireRole allow={['BRAND_ADMIN']}>
      <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 24,
          }}
        >
          <div>
            <Title level={2} style={{ marginBottom: 4 }}>
              <FileTextOutlined style={{ marginRight: 8, color: '#1677ff' }} />
              {t('ui.rentalsList')}
            </Title>
          </div>
          <Space>
            <Button
              type="primary"
              icon={<AppstoreAddOutlined />}
              onClick={() => void navigate('/rentals/available')}
            >
              {t('ui.rentNewSlot')}
            </Button>
            <Button icon={<ReloadOutlined />} onClick={() => void refetch()} />
          </Space>
        </div>

        <Card style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]} align="middle">
            <Col xs={24} sm={8}>
              <Select
                allowClear
                placeholder={t('ui.rentalStage')}
                style={{ width: '100%' }}
                value={stageFilter}
                onChange={setStageFilter}
                options={Object.keys(STAGE_TAGS).map((stage) => ({
                  label: t(STAGE_TAGS[stage as RentalInvoiceStage].labelKey as never),
                  value: stage,
                }))}
              />
            </Col>
          </Row>
        </Card>

        <Card>
          <Table
            rowKey="id"
            columns={columns}
            dataSource={rentals}
            loading={isLoading}
            pagination={{
              current: page,
              pageSize,
              total,
              onChange: (p, ps) => {
                setPage(p);
                setPageSize(ps);
              },
            }}
          />
        </Card>
      </div>
    </RequireRole>
  );
}
