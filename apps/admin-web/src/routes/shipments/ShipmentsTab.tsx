import {
  AuditOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  PictureOutlined,
  PlusOutlined,
} from '@ant-design/icons';
import type { MessageKey } from '@scentstation/i18n';
import {
  Alert,
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
  type UploadFile,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { errorMessage } from '@/shared/api';
import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { useI18n } from '@/shared/i18n';
import {
  type ShipmentDeclaration,
  type ShipmentPhotoKind,
  type ShipmentStatus,
  useAddShipmentPhoto,
  useBrandProducts,
  useCreateShipmentDeclaration,
  useReceiveShipment,
  useShipmentDeclarations,
} from './api';
import { hasAllPhotoKinds, usePhotoKindText } from './shipment-photos';
import { PhotoPicker, ShipmentPhotoGallery, ShipmentPhotosModal } from './ShipmentPhotos';

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
  /** Ảnh giữ ở trình duyệt tới khi khai báo được tạo (ADR-0024). */
  beforePacking: UploadFile[];
  packed: UploadFile[];
}

interface ReceiveValues {
  receivedQuantity: number;
  batchNumber: string;
  expiresAt?: PickedDate;
  discrepancyNotes?: string;
}

const PHOTO_FIELDS: readonly { kind: ShipmentPhotoKind; name: 'beforePacking' | 'packed' }[] = [
  { kind: 'BEFORE_PACKING', name: 'beforePacking' },
  { kind: 'PACKED', name: 'packed' },
];

/** FR-INV-22 ÷ 27; ảnh lô hàng và kiện hàng theo ADR-0024. */
export function ShipmentsTab({
  canDeclare,
  canReceive,
  initialDeclare,
}: {
  readonly canDeclare: boolean;
  readonly canReceive: boolean;
  /** Tới từ modal cấu hình slot: mở sẵn pop-up khai báo, khai báo xong quay về slot. */
  readonly initialDeclare?: { readonly productId?: string; readonly returnTo: string | null };
}) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const kindText = usePhotoKindText();
  const shipments = useShipmentDeclarations();
  const products = useBrandProducts(canDeclare);
  const create = useCreateShipmentDeclaration();
  const receive = useReceiveShipment();
  const addPhoto = useAddShipmentPhoto();

  const [declareOpen, setDeclareOpen] = useState(() => canDeclare && initialDeclare !== undefined);
  const [declareForm] = Form.useForm<DeclareValues>();
  const declareProductId = Form.useWatch('fragranceProductId', declareForm);
  // Thể tích chai lấy từ sản phẩm đã khai báo; vẫn sửa được nếu lô này gửi chai cỡ khác. Chạy cả khi
  // danh sách sản phẩm về sau sản phẩm chọn sẵn từ luồng cấu hình slot. Sản phẩm chưa khai thể tích
  // thì để trống cho người dùng nhập, không giữ số của sản phẩm chọn trước đó.
  // Phụ thuộc giá trị nguyên thủy, không phụ thuộc object sản phẩm: refetch danh sách không được ghi đè
  // số người dùng vừa sửa.
  const declareProduct = products.data?.items.find((p) => p.id === declareProductId);
  const declareProductFound = declareProduct !== undefined;
  const declareProductVolume = declareProduct?.fullBottleVolumeMl ?? null;
  useEffect(() => {
    if (!declareProductFound) return;
    declareForm.setFieldValue(
      'declaredBottleVolumeMl',
      declareProductVolume !== null && declareProductVolume > 0 ? declareProductVolume : undefined,
    );
  }, [declareForm, declareProductId, declareProductFound, declareProductVolume]);
  const [photosOf, setPhotosOf] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<ShipmentDeclaration | null>(null);
  const [receiveForm] = Form.useForm<ReceiveValues>();
  const receivedQuantity = Form.useWatch('receivedQuantity', receiveForm);
  const receiveBatchNumber = Form.useWatch('batchNumber', receiveForm);

  const handleDeclare = async () => {
    const values = await declareForm.validateFields().catch(() => null);
    if (!values) return;
    let declared: ShipmentDeclaration;
    try {
      declared = await create.mutateAsync({
        fragranceProductId: values.fragranceProductId,
        declaredQuantity: values.declaredQuantity,
        declaredBottleVolumeMl: values.declaredBottleVolumeMl,
        ...(values.expectedShipDate
          ? { expectedShipDate: values.expectedShipDate.format('YYYY-MM-DD') }
          : {}),
      });
    } catch (error) {
      void message.error(errorMessage(error, t));
      return;
    }
    // Khai báo đã có id mới gắn ảnh được. Ảnh lỗi thì khai báo vẫn còn: báo rõ và để thương hiệu bổ
    // sung từ cột Ảnh, không tạo trùng khai báo.
    try {
      for (const { kind, name } of PHOTO_FIELDS) {
        for (const f of values[name]) {
          if (f.originFileObj) {
            await addPhoto.mutateAsync({ id: declared.id, kind, file: f.originFileObj });
          }
        }
      }
      void message.success(t('inv.shipmentDeclared'));
    } catch (error) {
      void message.error(t('ui.shipmentPhotoUploadFailed', { reason: errorMessage(error, t) }));
    }
    setDeclareOpen(false);
    declareForm.resetFields();
    if (initialDeclare?.returnTo) void navigate(initialDeclare.returnTo);
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
      void message.success(
        result.batch
          ? t('ui.shipmentReceivedWithBottles', { count: result.batch.quantityReceived })
          : t('ui.shipmentReceivedNoBatch'),
      );
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
      title: t('ui.shipmentPhotos'),
      key: 'photos',
      render: (_: unknown, record: ShipmentDeclaration) => {
        const missing = record.status === 'DECLARED' && !hasAllPhotoKinds(record);
        return (
          <Space size={4} wrap>
            <Button
              type="link"
              size="small"
              icon={<PictureOutlined />}
              onClick={() => setPhotosOf(record.id)}
            >
              {canDeclare && missing
                ? t('ui.shipmentPhotosManageButton')
                : t('ui.shipmentPhotosCount', { count: record.photos?.length ?? 0 })}
            </Button>
            {missing && <Tag color="gold">{t('ui.shipmentPhotosMissing')}</Tag>}
          </Space>
        );
      },
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
        scroll={{ x: 'max-content' }}
      />

      <Modal
        title={t('ui.declareShipment')}
        open={declareOpen}
        onOk={handleDeclare}
        okText={t('ui.declareShipmentSubmit')}
        cancelText={t('ui.cancel')}
        confirmLoading={create.isPending || addPhoto.isPending}
        onCancel={() => setDeclareOpen(false)}
        width={640}
        destroyOnHidden
      >
        {initialDeclare?.returnTo && (
          <Alert
            type="info"
            showIcon
            style={{ marginBottom: 16 }}
            title={t('ui.shipmentReturnToSlotHint')}
          />
        )}
        <Form
          form={declareForm}
          layout="vertical"
          initialValues={{
            fragranceProductId: initialDeclare?.productId,
            beforePacking: [],
            packed: [],
          }}
        >
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
            dependencies={['declaredQuantity']}
            extra={t('inv.shipmentVolumeMinimum', {
              min: SPEC_CONSTRAINTS.SHIPMENT_MIN_TOTAL_VOLUME_ML,
            })}
            rules={[
              { required: true, message: t('validation.required') },
              ({ getFieldValue }) => ({
                validator(_, volume: number | null | undefined) {
                  const quantity = getFieldValue('declaredQuantity') as number | undefined;
                  if (volume == null || quantity == null) return Promise.resolve();
                  const total = volume * quantity;
                  return Number.isFinite(total) &&
                    total >= SPEC_CONSTRAINTS.SHIPMENT_MIN_TOTAL_VOLUME_ML
                    ? Promise.resolve()
                    : Promise.reject(
                        new Error(
                          t('inv.shipmentVolumeMinimum', {
                            min: SPEC_CONSTRAINTS.SHIPMENT_MIN_TOTAL_VOLUME_ML,
                          }),
                        ),
                      );
                },
              }),
            ]}
          >
            <InputNumber min={0.1} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="expectedShipDate" label={t('ui.expectedShipDate')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          {PHOTO_FIELDS.map(({ kind, name }) => (
            <Form.Item
              key={kind}
              name={name}
              label={kindText.label(kind)}
              extra={kindText.hint(kind)}
              valuePropName="fileList"
              rules={[
                { required: true, type: 'array', min: 1, message: t('ui.shipmentPhotoRequired') },
              ]}
            >
              <PhotoPicker testId={`photo-${name}`} />
            </Form.Item>
          ))}
        </Form>
      </Modal>

      <ShipmentPhotosModal
        declaration={(shipments.data?.items ?? []).find((d) => d.id === photosOf) ?? null}
        canEdit={canDeclare}
        onClose={() => setPhotosOf(null)}
      />

      <Modal
        title={t('ui.receiveShipment')}
        open={receiving !== null}
        onOk={handleReceive}
        okText={t('ui.receiveShipmentSubmit')}
        cancelText={t('ui.cancel')}
        confirmLoading={receive.isPending}
        onCancel={() => setReceiving(null)}
        width={640}
        destroyOnHidden
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
        {receiving && (
          <Space orientation="vertical" size="middle" style={{ width: '100%', marginBottom: 16 }}>
            {!hasAllPhotoKinds(receiving) && (
              <Alert type="warning" showIcon title={t('ui.shipmentPhotosMissingWarning')} />
            )}
            <ShipmentPhotoGallery photos={receiving.photos ?? []} />
          </Space>
        )}
        <Form form={receiveForm} layout="vertical">
          <Form.Item
            name="receivedQuantity"
            label={t('ui.receivedQuantity')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber
              min={0}
              max={SPEC_CONSTRAINTS.SHIPMENT_RECEIVE_MAX_BOTTLES}
              precision={0}
              style={{ width: '100%' }}
            />
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
        {/* ADR-0025: tiếp nhận tạo luôn từng chai — báo trước mã để kho dán nhãn lên chai thật. */}
        {typeof receivedQuantity === 'number' && receivedQuantity > 0 && (
          <Alert
            type="info"
            showIcon
            title={t('ui.receiveCreatesBottles', { count: receivedQuantity })}
            description={t('ui.receiveBottleCodeHint', {
              batchNumber: receiveBatchNumber?.trim() || t('ui.batchNumberLabel'),
            })}
          />
        )}
      </Modal>
    </Space>
  );
}
