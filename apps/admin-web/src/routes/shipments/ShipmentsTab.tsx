import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Button,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import {
  type ShipmentDeclaration,
  type ShipmentStatus,
  useBrandProducts,
  useCreateShipmentDeclaration,
  useReceiveShipment,
  useShipmentDeclarations,
} from './api';

const STATUS_TAGS: Record<ShipmentStatus, { color: string; icon: React.ReactNode }> = {
  DECLARED: { color: 'blue', icon: <ClockCircleOutlined /> },
  RECEIVED: { color: 'green', icon: <CheckCircleOutlined /> },
  DISCREPANCY: { color: 'gold', icon: <ExclamationCircleOutlined /> },
  CANCELLED: { color: 'default', icon: <CloseCircleOutlined /> },
};

/** Giá trị DatePicker của antd — chỉ dùng hai phương thức này, không kéo thêm kiểu của dayjs. */
interface PickedDate {
  format(pattern: string): string;
  toISOString(): string;
}

interface DeclareValues {
  fragranceProductId: string;
  declaredQuantity: number;
  declaredBottleVolumeMl: number;
  expectedShipDate?: PickedDate;
}

interface ReceiveValues {
  receivedQuantity: number;
  batchNumber: string;
  expiresAt?: PickedDate;
  discrepancyNotes?: string;
}

/** FR-INV-22 ÷ 27 */
export function ShipmentsTab({
  canDeclare,
  canReceive,
}: {
  readonly canDeclare: boolean;
  readonly canReceive: boolean;
}) {
  const { t } = useI18n();
  const shipments = useShipmentDeclarations();
  const products = useBrandProducts(canDeclare);
  const create = useCreateShipmentDeclaration();
  const receive = useReceiveShipment();

  const [declareOpen, setDeclareOpen] = useState(false);
  const [declareForm] = Form.useForm<DeclareValues>();
  const [receiving, setReceiving] = useState<ShipmentDeclaration | null>(null);
  const [receiveForm] = Form.useForm<ReceiveValues>();
  const receivedQuantity = Form.useWatch('receivedQuantity', receiveForm);

  const handleDeclare = async () => {
    const values = await declareForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      await create.mutateAsync({
        fragranceProductId: values.fragranceProductId,
        declaredQuantity: values.declaredQuantity,
        declaredBottleVolumeMl: values.declaredBottleVolumeMl,
        ...(values.expectedShipDate
          ? { expectedShipDate: values.expectedShipDate.format('YYYY-MM-DD') }
          : {}),
      });
      void message.success(t('inv.shipmentDeclared'));
      setDeclareOpen(false);
      declareForm.resetFields();
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const handleReceive = async () => {
    if (!receiving) return;
    const values = await receiveForm.validateFields().catch(() => null);
    if (!values) return;
    try {
      const result = await receive.mutateAsync({
        id: receiving.id,
        receivedQuantity: values.receivedQuantity,
        batchNumber: values.batchNumber,
        ...(values.expiresAt ? { expiresAt: values.expiresAt.toISOString() } : {}),
        ...(values.discrepancyNotes ? { discrepancyNotes: values.discrepancyNotes } : {}),
      });
      void message.success(t(result.batch ? 'inv.shipmentReceived' : 'ui.shipmentReceivedNoBatch'));
      setReceiving(null);
      receiveForm.resetFields();
    } catch (error) {
      void message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<ShipmentDeclaration> = [
    { title: t('ui.invProduct'), dataIndex: 'productName', key: 'productName' },
    {
      title: t('ui.declaredQuantity'),
      dataIndex: 'declaredQuantity',
      key: 'declaredQuantity',
      align: 'right',
    },
    {
      title: t('ui.receivedQuantity'),
      dataIndex: 'receivedQuantity',
      key: 'receivedQuantity',
      align: 'right',
      render: (value: number | null) => value ?? '—',
    },
    {
      title: t('ui.bottleVolume'),
      dataIndex: 'declaredBottleVolumeMl',
      key: 'declaredBottleVolumeMl',
      align: 'right',
    },
    {
      title: t('ui.expectedShipDate'),
      dataIndex: 'expectedShipDate',
      key: 'expectedShipDate',
      render: (value: string | null) => value ?? '—',
    },
    {
      title: t('ui.invStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (status: ShipmentStatus) => (
        <Tag color={STATUS_TAGS[status].color} icon={STATUS_TAGS[status].icon}>
          {t(`shipmentStatus.${status}` as MessageKey)}
        </Tag>
      ),
    },
    {
      title: t('ui.discrepancyNotes'),
      dataIndex: 'discrepancyNotes',
      key: 'discrepancyNotes',
      render: (value: string | null) =>
        value ? <Typography.Text type="warning">{value}</Typography.Text> : '—',
    },
    ...(canReceive
      ? [
          {
            title: t('ui.actions'),
            key: 'actions',
            render: (_: unknown, record: ShipmentDeclaration) =>
              record.status === 'DECLARED' ? (
                <Button
                  type="primary"
                  size="small"
                  icon={<AuditOutlined />}
                  onClick={() => {
                    setReceiving(record);
                    receiveForm.setFieldsValue({ receivedQuantity: record.declaredQuantity });
                  }}
                >
                  {t('ui.receiveShipment')}
                </Button>
              ) : null,
          },
        ]
      : []),
  ];

  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {canDeclare && (
        <Button type="primary" icon={<PlusOutlined />} onClick={() => setDeclareOpen(true)}>
          {t('ui.declareShipment')}
        </Button>
      )}
      <Table
        columns={columns}
        dataSource={shipments.data ? [...shipments.data.items] : []}
        rowKey="id"
        loading={shipments.isLoading}
        pagination={{ pageSize: 10 }}
      />

      <Modal
        title={t('ui.declareShipment')}
        open={declareOpen}
        onOk={handleDeclare}
        confirmLoading={create.isPending}
        onCancel={() => setDeclareOpen(false)}
        destroyOnClose
      >
        <Form form={declareForm} layout="vertical" initialValues={{ declaredBottleVolumeMl: 50 }}>
          <Form.Item
            name="fragranceProductId"
            label={t('ui.invProduct')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Select
              placeholder={t('ui.selectProductPlaceholder')}
              loading={products.isLoading}
              options={(products.data?.items ?? []).map((p) => ({ label: p.name, value: p.id }))}
            />
          </Form.Item>
          <Form.Item
            name="declaredQuantity"
            label={t('ui.declaredQuantity')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber min={1} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="declaredBottleVolumeMl"
            label={t('ui.bottleVolume')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber min={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expectedShipDate" label={t('ui.expectedShipDate')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={t('ui.receiveShipment')}
        open={receiving !== null}
        onOk={handleReceive}
        confirmLoading={receive.isPending}
        onCancel={() => setReceiving(null)}
        destroyOnClose
      >
        {receiving && (
          <Descriptions size="small" column={1} style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('ui.invProduct')}>
              {receiving.productName}
            </Descriptions.Item>
            <Descriptions.Item label={t('ui.declaredQuantity')}>
              {receiving.declaredQuantity}
            </Descriptions.Item>
          </Descriptions>
        )}
        <Form form={receiveForm} layout="vertical">
          <Form.Item
            name="receivedQuantity"
            label={t('ui.receivedQuantity')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber min={0} precision={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="batchNumber"
            label={t('ui.batchNumberLabel')}
            rules={[{ required: true, whitespace: true, message: t('validation.required') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="expiresAt" label={t('ui.batchExpiresAtLabel')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="discrepancyNotes"
            label={t('ui.discrepancyNotes')}
            extra={t('ui.discrepancyNotesHelp')}
            rules={[
              {
                required: receiving !== null && receivedQuantity !== receiving.declaredQuantity,
                whitespace: true,
                message: t('inv.discrepancyNotesRequired'),
              },
            ]}
          >
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
