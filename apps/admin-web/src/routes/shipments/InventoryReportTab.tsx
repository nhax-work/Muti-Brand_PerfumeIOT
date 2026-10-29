import { AlertOutlined, CheckCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { Button, Card, Col, Row, Select, Space, Statistic, Switch, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo, useState } from 'react';
import { useI18n } from '@/shared/i18n';
import { type InventoryReportItem, useInventoryReport, useMachinesForRefill } from './api';

export function InventoryReportTab() {
  const { t } = useI18n();
  const [lowStockOnly, setLowStockOnly] = useState<boolean>(false);
  const [selectedMachineId, setSelectedMachineId] = useState<string | undefined>(undefined);

  const { data: machinesRes } = useMachinesForRefill(true);
  const { data, isLoading, refetch } = useInventoryReport({
    lowStockOnly: lowStockOnly || undefined,
    machineId: selectedMachineId || undefined,
  });

  const items = useMemo(() => data ?? [], [data]);

  const stats = useMemo(() => {
    const total = items.length;
    const lowStockCount = items.filter((i) => i.lowStock).length;
    const totalMl = items.reduce((acc, curr) => acc + (curr.estimatedRemainingMl || 0), 0);
    return { total, lowStockCount, totalMl };
  }, [items]);

  const machineOptions = useMemo(() => {
    const list = machinesRes?.items ?? [];
    return [
      { label: t('ui.all') ?? 'Tất cả', value: '' },
      ...list.map((m) => ({
        label: `${m.displayName} (${m.serialNumber})`,
        value: m.id,
      })),
    ];
  }, [machinesRes, t]);

  const columns: ColumnsType<InventoryReportItem> = [
    {
      title: t('ui.productName') ?? 'Sản phẩm',
      dataIndex: 'productName',
      key: 'productName',
      render: (name: string | undefined, record) => (
        <div>
          <span style={{ fontWeight: 600 }}>{name || record.fragranceProductId}</span>
          {record.fragranceProductId && (
            <div style={{ fontSize: 12, color: '#888' }}>
              ID: {record.fragranceProductId.slice(0, 8)}...
            </div>
          )}
        </div>
      ),
    },
    {
      title: t('ui.machine') ?? 'Máy',
      dataIndex: 'machineId',
      key: 'machineId',
      render: (mId: string | null) => {
        if (!mId) return <span style={{ color: '#aaa' }}>-</span>;
        const found = machinesRes?.items?.find((m) => m.id === mId);
        return <span>{found?.displayName ?? mId.slice(0, 8)}</span>;
      },
    },
    {
      title: t('ui.slot') ?? 'Slot',
      dataIndex: 'slotId',
      key: 'slotId',
      render: (sId: string | null) =>
        sId ? <code>{sId.slice(0, 8)}</code> : <span style={{ color: '#aaa' }}>-</span>,
    },
    {
      title: t('ui.batch') ?? 'Lô',
      dataIndex: 'batchId',
      key: 'batchId',
      render: (bId: string | null) =>
        bId ? <code>{bId.slice(0, 8)}</code> : <span style={{ color: '#aaa' }}>-</span>,
    },
    {
      title: t('ui.estimatedRemainingMl') ?? 'Dung tích còn (ml)',
      dataIndex: 'estimatedRemainingMl',
      key: 'estimatedRemainingMl',
      align: 'right',
      render: (ml: number) => <strong>{ml.toLocaleString()} ml</strong>,
      sorter: (a, b) => a.estimatedRemainingMl - b.estimatedRemainingMl,
    },
    {
      title: t('ui.estimatedRemainingSprays') ?? 'Lượt xịt ước tính',
      dataIndex: 'estimatedRemainingSprays',
      key: 'estimatedRemainingSprays',
      align: 'right',
      render: (sprays: number | undefined) => (sprays != null ? sprays.toLocaleString() : '-'),
      sorter: (a, b) => (a.estimatedRemainingSprays ?? 0) - (b.estimatedRemainingSprays ?? 0),
    },
    {
      title: t('ui.stockStatus') ?? 'Tình trạng',
      dataIndex: 'lowStock',
      key: 'lowStock',
      align: 'center',
      render: (isLow: boolean) =>
        isLow ? (
          <Tag color="error" icon={<AlertOutlined />}>
            {t('ui.lowStock') ?? 'Sắp hết'}
          </Tag>
        ) : (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            {t('ui.normalStock') ?? 'Bình thường'}
          </Tag>
        ),
      filters: [
        { text: t('ui.lowStock') ?? 'Sắp hết', value: true },
        { text: t('ui.normalStock') ?? 'Bình thường', value: false },
      ],
      onFilter: (value, record) => record.lowStock === value,
    },
  ];

  return (
    <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('ui.totalInventoryItems') ?? 'Tổng số mặt hàng'}
              value={stats.total}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('ui.lowStockSlots') ?? 'Vị trí sắp hết'}
              value={stats.lowStockCount}
              valueStyle={{ color: stats.lowStockCount > 0 ? '#cf1322' : '#3f8600' }}
            />
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small">
            <Statistic
              title={t('ui.totalEstimatedVolume') ?? 'Tổng dung tích (ml)'}
              value={stats.totalMl}
              precision={1}
              suffix="ml"
            />
          </Card>
        </Col>
      </Row>

      <Card size="small">
        <Row justify="space-between" align="middle" gutter={[16, 16]}>
          <Col>
            <Space wrap size="middle">
              <Space>
                <span>{t('ui.machine') ?? 'Máy'}:</span>
                <Select
                  style={{ width: 220 }}
                  options={machineOptions}
                  value={selectedMachineId ?? ''}
                  onChange={(val) => setSelectedMachineId(val ? val : undefined)}
                  placeholder={t('ui.selectMachine') ?? 'Chọn máy'}
                />
              </Space>
              <Space>
                <span>{t('ui.lowStockOnly') ?? 'Chỉ hiện sắp hết'}:</span>
                <Switch checked={lowStockOnly} onChange={setLowStockOnly} />
              </Space>
            </Space>
          </Col>
          <Col>
            <Button icon={<ReloadOutlined />} onClick={() => void refetch()} loading={isLoading}>
              {t('ui.refresh') ?? 'Làm mới'}
            </Button>
          </Col>
        </Row>
      </Card>

      <Table<InventoryReportItem>
        rowKey={(r) => `${r.slotId ?? ''}-${r.fragranceProductId}-${r.batchId ?? ''}`}
        columns={columns}
        dataSource={items}
        loading={isLoading}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
    </Space>
  );
}
