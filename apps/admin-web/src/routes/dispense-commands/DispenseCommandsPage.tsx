import { Alert, DatePicker, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { RequireRole } from '@/app/guards/RequireRole';
import { codeLabel } from '@/shared/codes';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type CommandStatus,
  type DispenseCommand,
  type DispenseType,
  useDispenseCommands,
} from './api';

const STATUS_COLOR: Record<CommandStatus, string> = {
  CREATED: 'default',
  SENT: 'blue',
  ACKNOWLEDGED: 'geekblue',
  SUCCEEDED: 'green',
  FAILED: 'red',
  REJECTED: 'volcano',
  EXPIRED: 'default',
  UNKNOWN: 'orange',
};

const COMMAND_TYPES: readonly DispenseType[] = ['CUSTOMER', 'DIAGNOSTIC'];

/**
 * Lệnh xịt (FR-DSP-20). Operations Staff dùng để theo dõi lượt xịt chẩn đoán sau bảo trì (FR-MNT-09,
 * 11) và lệnh của khách bị UNKNOWN. Mở từ chi tiết máy thì đã lọc sẵn theo máy (`?machineId=`).
 */
export default function DispenseCommandsPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const machineId = params.get('machineId') ?? undefined;
  const [page, setPage] = useState(1);
  const [commandType, setCommandType] = useState<DispenseType | undefined>();
  const [status, setStatus] = useState<CommandStatus | undefined>();
  const [range, setRange] = useState<[string, string] | undefined>();

  const commands = useDispenseCommands({
    page,
    pageSize: 20,
    machineId,
    commandType,
    status,
    from: range?.[0],
    to: range?.[1],
  });

  const columns: ColumnsType<DispenseCommand> = [
    { title: t('ui.createdAt'), key: 'createdAt', render: (_, c) => formatDateTime(c.createdAt) },
    {
      title: t('ui.commandType'),
      dataIndex: 'commandType',
      key: 'commandType',
      render: (type: DispenseType) => (
        <Tag color={type === 'DIAGNOSTIC' ? 'purple' : 'cyan'}>
          {codeLabel(t, 'dispenseType', type)}
        </Tag>
      ),
    },
    {
      title: t('ui.pricingStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: CommandStatus) => (
        <Tag color={STATUS_COLOR[s]}>{codeLabel(t, 'commandStatus', s)}</Tag>
      ),
    },
    {
      title: t('ui.commandResult'),
      key: 'result',
      render: (_, c) =>
        !c.result
          ? '—'
          : c.result.success
            ? t('ui.commandSucceeded')
            : t('ui.commandFailedWith', {
                code: codeLabel(t, 'orderCode', c.result.failureCode ?? null),
              }),
    },
    {
      title: t('ui.commandToken'),
      dataIndex: 'commandToken',
      key: 'commandToken',
      render: (token: string) => (
        <Typography.Text copyable style={{ fontSize: 12 }}>
          {token}
        </Typography.Text>
      ),
    },
    {
      title: t('ui.commandCompletedAt'),
      key: 'completedAt',
      render: (_, c) => formatDateTime(c.completedAt),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF']}>
      <div style={{ padding: 24, maxWidth: 1300, margin: '0 auto' }}>
        <Typography.Title level={3}>{t('ui.dispenseCommands')}</Typography.Title>
        <Alert
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('ui.dispenseCommandsHint')}
        />
        <Space style={{ marginBottom: 16 }} wrap>
          {machineId && (
            <Tag
              closable
              color="blue"
              onClose={() => {
                setParams({});
                setPage(1);
              }}
            >
              {t('ui.filteredByMachine')}
            </Tag>
          )}
          <Select<DispenseType | 'ALL'>
            style={{ width: 200 }}
            value={commandType ?? 'ALL'}
            onChange={(v) => {
              setCommandType(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.allCommandTypes') },
              ...COMMAND_TYPES.map((type) => ({
                value: type,
                label: codeLabel(t, 'dispenseType', type),
              })),
            ]}
          />
          <Select<CommandStatus | 'ALL'>
            style={{ width: 200 }}
            value={status ?? 'ALL'}
            onChange={(v) => {
              setStatus(v === 'ALL' ? undefined : v);
              setPage(1);
            }}
            options={[
              { value: 'ALL', label: t('ui.allStatuses') },
              ...(Object.keys(STATUS_COLOR) as CommandStatus[]).map((s) => ({
                value: s,
                label: codeLabel(t, 'commandStatus', s),
              })),
            ]}
          />
          <DatePicker.RangePicker
            onChange={(dates) => {
              setRange(
                dates?.[0] && dates[1]
                  ? [
                      dates[0].startOf('day').toISOString(),
                      dates[1].add(1, 'day').startOf('day').toISOString(),
                    ]
                  : undefined,
              );
              setPage(1);
            }}
          />
        </Space>
        <Table
          rowKey="id"
          loading={commands.isLoading}
          columns={columns}
          dataSource={commands.data?.items ?? []}
          scroll={{ x: 1000 }}
          pagination={{
            current: page,
            pageSize: 20,
            total: commands.data?.meta.total ?? 0,
            onChange: setPage,
          }}
        />
      </div>
    </RequireRole>
  );
}
