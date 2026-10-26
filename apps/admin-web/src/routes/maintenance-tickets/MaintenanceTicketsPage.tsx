import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  EyeOutlined,
  PlusOutlined,
  ReloadOutlined,
  ToolOutlined,
  UserOutlined,
} from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Drawer,
  Form,
  Input,
  Modal,
  Radio,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { useMemo, useState } from 'react';
import { RequireRole } from '@/app/guards/RequireRole';
import { useMachines } from '@/routes/machines/api';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import {
  type AlertSeverity,
  type MaintenanceTicket,
  type MaintenanceTicketCreate,
  type MaintenanceTicketResolve,
  type PostTestSubmit,
  type TicketPriority,
  type TicketStatus,
  useAssignMaintenanceTicket,
  useCreateMaintenanceTicket,
  useMaintenanceActivities,
  useMaintenanceTicket,
  useMaintenanceTickets,
  useResolveMaintenanceTicket,
  useSubmitPostTest,
} from './api';

export default function MaintenanceTicketsPage() {
  const { t } = useI18n();

  // Filters
  const [machineId, setMachineId] = useState<string | undefined>(undefined);
  const [status, setStatus] = useState<TicketStatus | undefined>(undefined);
  const [severity, setSeverity] = useState<AlertSeverity | undefined>(undefined);
  const [priority, setPriority] = useState<TicketPriority | undefined>(undefined);
  const [page, setPage] = useState<number>(1);
  const pageSize = 15;

  const {
    data: ticketsRes,
    isLoading,
    refetch,
  } = useMaintenanceTickets({
    page,
    pageSize,
    machineId,
    status,
    severity,
    priority,
  });

  const { data: machinesRes } = useMachines({ page: 1, pageSize: 200 });

  // Mutations
  const createMutation = useCreateMaintenanceTicket();
  const assignMutation = useAssignMaintenanceTicket();
  const resolveMutation = useResolveMaintenanceTicket();
  const postTestMutation = useSubmitPostTest();

  // Modals state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [assignTicketId, setAssignTicketId] = useState<string | null>(null);
  const [resolveTicketId, setResolveTicketId] = useState<string | null>(null);
  const [postTestTicketId, setPostTestTicketId] = useState<string | null>(null);
  const [viewTicketId, setViewTicketId] = useState<string | null>(null);

  // Forms
  const [createForm] = Form.useForm<MaintenanceTicketCreate & { dueAtDate?: dayjs.Dayjs }>();
  const [assignForm] = Form.useForm<{ assignedTo: string; notes?: string }>();
  const [resolveForm] = Form.useForm<MaintenanceTicketResolve & { costAmount?: string }>();
  const [postTestForm] = Form.useForm<PostTestSubmit>();

  const tickets = useMemo(() => ticketsRes?.items ?? [], [ticketsRes]);

  const { data: viewingTicket } = useMaintenanceTicket(viewTicketId ?? undefined);
  const { data: activities } = useMaintenanceActivities(viewTicketId ?? undefined);

  // Handlers
  const handleCreate = async () => {
    try {
      const values = await createForm.validateFields();
      await createMutation.mutateAsync({
        machineId: values.machineId,
        category: values.category,
        severity: values.severity,
        priority: values.priority,
        description: values.description,
        dueAt: values.dueAtDate ? values.dueAtDate.toISOString() : undefined,
      });
      message.success(t('ui.success') ?? 'Thành công');
      setIsCreateOpen(false);
      createForm.resetFields();
    } catch {
      // Form validation error
    }
  };

  const handleAssign = async () => {
    if (!assignTicketId) return;
    try {
      const values = await assignForm.validateFields();
      await assignMutation.mutateAsync({
        id: assignTicketId,
        assignedTo: values.assignedTo,
        notes: values.notes,
      });
      message.success(t('ui.success') ?? 'Thành công');
      setAssignTicketId(null);
      assignForm.resetFields();
    } catch {
      // Error
    }
  };

  const handleResolve = async () => {
    if (!resolveTicketId) return;
    try {
      const values = await resolveForm.validateFields();
      const parts = values.replacementParts
        ? Array.isArray(values.replacementParts)
          ? values.replacementParts
          : String(values.replacementParts)
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
        : undefined;

      await resolveMutation.mutateAsync({
        id: resolveTicketId,
        body: {
          diagnosis: values.diagnosis,
          correctiveAction: values.correctiveAction,
          replacementParts: parts,
          cost: values.costAmount ? String(values.costAmount) : undefined,
        },
      });
      message.success(t('ui.success') ?? 'Thành công');
      setResolveTicketId(null);
      resolveForm.resetFields();
    } catch {
      // Error
    }
  };

  const handlePostTest = async () => {
    if (!postTestTicketId) return;
    try {
      const values = await postTestForm.validateFields();
      await postTestMutation.mutateAsync({
        id: postTestTicketId,
        body: {
          checklistCompleted: true,
          result: values.result,
          notes: values.notes,
        },
      });
      message.success(t('ui.success') ?? 'Thành công');
      setPostTestTicketId(null);
      postTestForm.resetFields();
    } catch {
      // Error
    }
  };

  const columns: ColumnsType<MaintenanceTicket> = [
    {
      title: t('ui.ticketNumber') ?? 'Mã phiếu',
      dataIndex: 'ticketNumber',
      key: 'ticketNumber',
      render: (num: string, record) => (
        <a onClick={() => setViewTicketId(record.id)}>
          <strong>{num}</strong>
        </a>
      ),
    },
    {
      title: t('ui.machine') ?? 'Máy Kiosk',
      dataIndex: 'machineId',
      key: 'machineId',
      render: (mId: string) => {
        const found = machinesRes?.items?.find((m) => m.id === mId);
        return found ? (
          <span>
            {found.displayName} ({found.serialNumber})
          </span>
        ) : (
          <code>{mId.slice(0, 8)}</code>
        );
      },
    },
    {
      title: t('ui.ticketCategory') ?? 'Hạng mục',
      dataIndex: 'category',
      key: 'category',
    },
    {
      title: t('ui.ticketPriority') ?? 'Ưu tiên',
      dataIndex: 'priority',
      key: 'priority',
      render: (p: TicketPriority) => {
        const color =
          p === 'CRITICAL' ? 'red' : p === 'HIGH' ? 'orange' : p === 'MEDIUM' ? 'blue' : 'default';
        return <Tag color={color}>{p}</Tag>;
      },
    },
    {
      title: t('ui.ticketSeverity') ?? 'Mức độ',
      dataIndex: 'severity',
      key: 'severity',
      render: (s: AlertSeverity) => {
        const color = s === 'CRITICAL' ? 'red' : s === 'WARNING' ? 'gold' : 'blue';
        return <Tag color={color}>{s}</Tag>;
      },
    },
    {
      title: t('ui.ticketStatus') ?? 'Trạng thái',
      dataIndex: 'status',
      key: 'status',
      render: (st: TicketStatus) => {
        const color =
          st === 'OPEN'
            ? 'default'
            : st === 'ASSIGNED'
              ? 'processing'
              : st === 'IN_PROGRESS'
                ? 'warning'
                : st === 'RESOLVED'
                  ? 'cyan'
                  : 'success';
        return <Tag color={color}>{st}</Tag>;
      },
    },
    {
      title: t('ui.ticketPostTestResult') ?? 'Checklist sau bảo trì',
      dataIndex: 'postTestResult',
      key: 'postTestResult',
      render: (res: string | null) =>
        res === 'PASS' ? (
          <Tag color="success" icon={<CheckCircleOutlined />}>
            PASS
          </Tag>
        ) : res === 'FAIL' ? (
          <Tag color="error" icon={<CloseCircleOutlined />}>
            FAIL
          </Tag>
        ) : (
          <span style={{ color: '#aaa' }}>-</span>
        ),
    },
    {
      title: t('ui.ticketDueAt') ?? 'Hạn xử lý',
      dataIndex: 'dueAt',
      key: 'dueAt',
      render: (date: string | null) => (date ? formatDateTime(date) : '-'),
    },
    {
      title: t('ui.actions') ?? 'Thao tác',
      key: 'actions',
      render: (_, record) => (
        <Space wrap>
          <Button size="small" icon={<EyeOutlined />} onClick={() => setViewTicketId(record.id)}>
            {t('ui.details') ?? 'Xem'}
          </Button>

          {record.status !== 'CLOSED' && (
            <Button
              size="small"
              icon={<UserOutlined />}
              onClick={() => {
                setAssignTicketId(record.id);
                assignForm.setFieldsValue({ assignedTo: record.assignedTo ?? '' });
              }}
            >
              {t('ui.ticketAssign') ?? 'Phân công'}
            </Button>
          )}

          {record.status !== 'CLOSED' && record.status !== 'RESOLVED' && (
            <Button
              size="small"
              type="primary"
              ghost
              icon={<ToolOutlined />}
              onClick={() => {
                setResolveTicketId(record.id);
                resolveForm.setFieldsValue({
                  diagnosis: record.diagnosis ?? '',
                  correctiveAction: record.correctiveAction ?? '',
                  replacementParts: record.replacementParts ?? [],
                });
              }}
            >
              {t('ui.ticketResolve') ?? 'Xử lý'}
            </Button>
          )}

          {record.status === 'RESOLVED' && record.postTestResult !== 'PASS' && (
            <Button
              size="small"
              type="primary"
              icon={<CheckCircleOutlined />}
              onClick={() => {
                setPostTestTicketId(record.id);
                postTestForm.resetFields();
              }}
            >
              {t('ui.ticketPostTest') ?? 'Checklist'}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <RequireRole allow={['PLATFORM_SUPER_ADMIN', 'OPERATIONS_STAFF']}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <div>
          <Typography.Title level={3} style={{ margin: 0 }}>
            {t('ui.maintenanceTickets') ?? 'Phiếu bảo trì'}
          </Typography.Title>
          <Typography.Text type="secondary">
            {t('ui.maintenanceTicketsSubtitle') ??
              'Quản lý vòng đời sửa chữa, phân công nhân viên và checklist kiểm tra sau bảo trì (FR-MNT-01 ÷ 14).'}
          </Typography.Text>
        </div>

        <Card size="small">
          <Row justify="space-between" align="middle" gutter={[16, 16]}>
            <Col>
              <Space wrap>
                <Select
                  style={{ width: 200 }}
                  placeholder={t('ui.selectMachine') ?? 'Chọn máy'}
                  allowClear
                  value={machineId}
                  onChange={setMachineId}
                  options={(machinesRes?.items ?? []).map((m) => ({
                    label: `${m.displayName} (${m.serialNumber})`,
                    value: m.id,
                  }))}
                />
                <Select
                  style={{ width: 140 }}
                  placeholder={t('ui.ticketStatus') ?? 'Trạng thái'}
                  allowClear
                  value={status}
                  onChange={setStatus}
                  options={[
                    { label: 'OPEN', value: 'OPEN' },
                    { label: 'ASSIGNED', value: 'ASSIGNED' },
                    { label: 'IN_PROGRESS', value: 'IN_PROGRESS' },
                    { label: 'RESOLVED', value: 'RESOLVED' },
                    { label: 'CLOSED', value: 'CLOSED' },
                  ]}
                />
                <Select
                  style={{ width: 130 }}
                  placeholder={t('ui.ticketPriority') ?? 'Ưu tiên'}
                  allowClear
                  value={priority}
                  onChange={setPriority}
                  options={[
                    { label: 'LOW', value: 'LOW' },
                    { label: 'MEDIUM', value: 'MEDIUM' },
                    { label: 'HIGH', value: 'HIGH' },
                    { label: 'CRITICAL', value: 'CRITICAL' },
                  ]}
                />
                <Select
                  style={{ width: 130 }}
                  placeholder={t('ui.ticketSeverity') ?? 'Mức độ'}
                  allowClear
                  value={severity}
                  onChange={setSeverity}
                  options={[
                    { label: 'INFO', value: 'INFO' },
                    { label: 'WARNING', value: 'WARNING' },
                    { label: 'CRITICAL', value: 'CRITICAL' },
                  ]}
                />
              </Space>
            </Col>
            <Col>
              <Space>
                <Button
                  icon={<ReloadOutlined />}
                  onClick={() => void refetch()}
                  loading={isLoading}
                >
                  {t('ui.refresh') ?? 'Làm mới'}
                </Button>
                <Button
                  type="primary"
                  icon={<PlusOutlined />}
                  onClick={() => setIsCreateOpen(true)}
                >
                  {t('ui.createTicket') ?? 'Tạo phiếu mới'}
                </Button>
              </Space>
            </Col>
          </Row>
        </Card>

        <Table<MaintenanceTicket>
          rowKey="id"
          columns={columns}
          dataSource={tickets}
          loading={isLoading}
          pagination={{
            current: page,
            pageSize,
            total: ticketsRes?.meta?.total,
            onChange: setPage,
          }}
        />

        {/* Modal Tạo phiếu bảo trì */}
        <Modal
          title={t('ui.createTicket') ?? 'Tạo phiếu bảo trì'}
          open={isCreateOpen}
          onOk={handleCreate}
          onCancel={() => setIsCreateOpen(false)}
          confirmLoading={createMutation.isPending}
        >
          <Form form={createForm} layout="vertical">
            <Form.Item
              name="machineId"
              label={t('ui.machine') ?? 'Máy Kiosk'}
              rules={[{ required: true }]}
            >
              <Select
                placeholder={t('ui.selectMachine') ?? 'Chọn máy'}
                options={(machinesRes?.items ?? []).map((m) => ({
                  label: `${m.displayName} (${m.serialNumber})`,
                  value: m.id,
                }))}
              />
            </Form.Item>
            <Form.Item
              name="category"
              label={t('ui.ticketCategory') ?? 'Hạng mục'}
              rules={[{ required: true }]}
            >
              <Input placeholder="Vòi xịt, Màn hình, Khóa vỏ, Cảm biến..." />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item
                  name="priority"
                  label={t('ui.ticketPriority') ?? 'Ưu tiên'}
                  initialValue="MEDIUM"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { label: 'LOW', value: 'LOW' },
                      { label: 'MEDIUM', value: 'MEDIUM' },
                      { label: 'HIGH', value: 'HIGH' },
                      { label: 'CRITICAL', value: 'CRITICAL' },
                    ]}
                  />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item
                  name="severity"
                  label={t('ui.ticketSeverity') ?? 'Mức độ'}
                  initialValue="WARNING"
                  rules={[{ required: true }]}
                >
                  <Select
                    options={[
                      { label: 'INFO', value: 'INFO' },
                      { label: 'WARNING', value: 'WARNING' },
                      { label: 'CRITICAL', value: 'CRITICAL' },
                    ]}
                  />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="dueAtDate" label={t('ui.ticketDueAt') ?? 'Hạn xử lý'}>
              <DatePicker showTime style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item name="description" label={t('ui.description') ?? 'Mô tả chi tiết'}>
              <Input.TextArea rows={3} placeholder="Mô tả sự cố hoặc yêu cầu bảo trì..." />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal Phân công */}
        <Modal
          title={t('ui.ticketAssignTitle') ?? 'Phân công nhân viên bảo trì'}
          open={Boolean(assignTicketId)}
          onOk={handleAssign}
          onCancel={() => setAssignTicketId(null)}
          confirmLoading={assignMutation.isPending}
        >
          <Form form={assignForm} layout="vertical">
            <Form.Item
              name="assignedTo"
              label={t('ui.assignedStaffId') ?? 'User ID nhân sự thực hiện'}
              rules={[{ required: true }]}
            >
              <Input placeholder="Nhập ID nhân viên kỹ thuật" />
            </Form.Item>
            <Form.Item name="notes" label={t('ui.notes') ?? 'Ghi chú phân công'}>
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal Ghi nhận xử lý */}
        <Modal
          title={t('ui.ticketResolveTitle') ?? 'Ghi nhận kết quả xử lý'}
          open={Boolean(resolveTicketId)}
          onOk={handleResolve}
          onCancel={() => setResolveTicketId(null)}
          confirmLoading={resolveMutation.isPending}
        >
          <Form form={resolveForm} layout="vertical">
            <Form.Item
              name="diagnosis"
              label={t('ui.ticketDiagnosis') ?? 'Chẩn đoán sự cố'}
              rules={[{ required: true }]}
            >
              <Input.TextArea rows={2} placeholder="Nguyên nhân gây ra sự cố..." />
            </Form.Item>
            <Form.Item
              name="correctiveAction"
              label={t('ui.ticketCorrectiveAction') ?? 'Biện pháp khắc phục'}
              rules={[{ required: true }]}
            >
              <Input.TextArea rows={2} placeholder="Các thao tác đã xử lý, sửa chữa..." />
            </Form.Item>
            <Form.Item
              name="replacementParts"
              label={t('ui.ticketReplacementParts') ?? 'Linh kiện thay thế (cách nhau dấu phẩy)'}
            >
              <Input placeholder="Cụm van xịt, Bơm áp lực..." />
            </Form.Item>
            <Form.Item name="costAmount" label={t('ui.ticketCost') ?? 'Chi phí sửa chữa (VND)'}>
              <Input placeholder="350000" />
            </Form.Item>
          </Form>
        </Modal>

        {/* Modal Checklist sau bảo trì */}
        <Modal
          title={t('ui.ticketPostTestTitle') ?? 'Checklist kiểm tra sau bảo trì'}
          open={Boolean(postTestTicketId)}
          onOk={handlePostTest}
          onCancel={() => setPostTestTicketId(null)}
          confirmLoading={postTestMutation.isPending}
        >
          <div style={{ marginBottom: 16 }}>
            <Alert
              type="info"
              showIcon
              message={
                t('ui.checklistRequirement') ??
                'Quy định: Máy chỉ được phép quay lại chế độ NORMAL sau khi checklist sau bảo trì đạt kết quả PASS (FR-MNT-11, 12).'
              }
            />
          </div>
          <Form form={postTestForm} layout="vertical">
            <Form.Item
              name="checklistCompleted"
              valuePropName="checked"
              rules={[
                {
                  validator: (_, value) =>
                    value
                      ? Promise.resolve()
                      : Promise.reject(
                          new Error(
                            t('ui.checklistConfirmError') ??
                              'Vui lòng xác nhận đã hoàn thành kiểm tra',
                          ),
                        ),
                },
              ]}
            >
              <Checkbox>
                {t('ui.checklistConfirm') ??
                  'Tôi xác nhận đã hoàn thành đầy đủ các bước kiểm tra theo quy trình.'}
              </Checkbox>
            </Form.Item>
            <Form.Item
              name="result"
              label={t('ui.ticketPostTestResult') ?? 'Kết quả kiểm tra'}
              rules={[{ required: true }]}
            >
              <Radio.Group>
                <Radio value="PASS">
                  <Tag color="success">PASS</Tag> -{' '}
                  {t('ui.ticketPostTestPass') ?? 'Đạt (Cho phép đưa máy về NORMAL)'}
                </Radio>
                <div style={{ marginTop: 8 }}>
                  <Radio value="FAIL">
                    <Tag color="error">FAIL</Tag> -{' '}
                    {t('ui.ticketPostTestFail') ?? 'Không đạt (Tiếp tục xử lý)'}
                  </Radio>
                </div>
              </Radio.Group>
            </Form.Item>
            <Form.Item name="notes" label={t('ui.notes') ?? 'Ghi chú kiểm tra'}>
              <Input.TextArea rows={2} />
            </Form.Item>
          </Form>
        </Modal>

        {/* Drawer Chi tiết phiếu & Timeline Hoạt động */}
        <Drawer
          title={viewingTicket ? `${viewingTicket.ticketNumber} - ${viewingTicket.category}` : ''}
          open={Boolean(viewTicketId)}
          onClose={() => setViewTicketId(null)}
          width={600}
        >
          {viewingTicket && (
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <Descriptions column={2} bordered size="small">
                <Descriptions.Item label={t('ui.ticketNumber') ?? 'Mã phiếu'}>
                  <strong>{viewingTicket.ticketNumber}</strong>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.ticketStatus') ?? 'Trạng thái'}>
                  <Tag>{viewingTicket.status}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.ticketPriority') ?? 'Ưu tiên'}>
                  <Tag>{viewingTicket.priority}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.ticketSeverity') ?? 'Mức độ'}>
                  <Tag>{viewingTicket.severity}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.ticketDueAt') ?? 'Hạn xử lý'} span={2}>
                  {viewingTicket.dueAt ? formatDateTime(viewingTicket.dueAt) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('ui.ticketPostTestResult') ?? 'Checklist'} span={2}>
                  {viewingTicket.postTestResult ? (
                    <Tag color={viewingTicket.postTestResult === 'PASS' ? 'success' : 'error'}>
                      {viewingTicket.postTestResult}
                    </Tag>
                  ) : (
                    '-'
                  )}
                </Descriptions.Item>
                {viewingTicket.diagnosis && (
                  <Descriptions.Item label={t('ui.ticketDiagnosis') ?? 'Chẩn đoán'} span={2}>
                    {viewingTicket.diagnosis}
                  </Descriptions.Item>
                )}
                {viewingTicket.correctiveAction && (
                  <Descriptions.Item label={t('ui.ticketCorrectiveAction') ?? 'Khắc phục'} span={2}>
                    {viewingTicket.correctiveAction}
                  </Descriptions.Item>
                )}
                {viewingTicket.replacementParts && viewingTicket.replacementParts.length > 0 && (
                  <Descriptions.Item label={t('ui.ticketReplacementParts') ?? 'Linh kiện'} span={2}>
                    {viewingTicket.replacementParts.join(', ')}
                  </Descriptions.Item>
                )}
              </Descriptions>

              <div>
                <Typography.Title level={5}>
                  {t('ui.ticketActivities') ?? 'Nhật ký hoạt động'}
                </Typography.Title>
                <Timeline
                  items={(activities ?? []).map((act) => ({
                    color: act.activityType.includes('RESOLV')
                      ? 'blue'
                      : act.activityType.includes('TEST')
                        ? 'green'
                        : 'gray',
                    children: (
                      <div>
                        <strong>{act.activityType}</strong> -{' '}
                        <span style={{ fontSize: 12, color: '#888' }}>
                          {formatDateTime(act.createdAt)}
                        </span>
                        {act.notes && <p style={{ margin: '4px 0 0' }}>{act.notes}</p>}
                      </div>
                    ),
                  }))}
                />
              </div>
            </Space>
          )}
        </Drawer>
      </Space>
    </RequireRole>
  );
}
