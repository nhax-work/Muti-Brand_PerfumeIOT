import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Empty,
  Image,
  Modal,
  Popconfirm,
  Space,
  Typography,
  Upload,
  message,
  type UploadFile,
} from 'antd';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { ACCEPTED_IMAGE_TYPES, bytesToMb, validateImageFile } from '@/shared/image-upload';
import {
  type ShipmentDeclaration,
  type ShipmentPhoto,
  type ShipmentPhotoKind,
  useAddShipmentPhoto,
  useDeleteShipmentPhoto,
} from './api';
import {
  PHOTO_KINDS,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_PER_KIND,
  usePhotoKindText,
} from './shipment-photos';

/** Kiểm tệp ở trình duyệt; sai thì báo lỗi và trả `false`. Máy chủ vẫn kiểm lại theo nội dung tệp. */
function useCheckPhoto() {
  const { t } = useI18n();
  return (file: File): boolean => {
    const problem = validateImageFile(file, PHOTO_MAX_BYTES);
    if (problem === 'type') message.error(t('ui.productImageInvalidType'));
    if (problem === 'size') {
      message.error(t('ui.productImageTooLarge', { maxMb: bytesToMb(PHOTO_MAX_BYTES) }));
    }
    return problem === null;
  };
}

/**
 * Ô chọn ảnh trong pop-up khai báo: giữ tệp ở trình duyệt (không upload ngay) vì khai báo phải được
 * tạo trước mới có id để gắn ảnh (ADR-0024). Dùng trong `Form.Item` với `valuePropName="fileList"`.
 */
export function PhotoPicker({
  fileList,
  onChange,
  testId,
}: {
  fileList?: UploadFile[];
  onChange?: (fileList: UploadFile[]) => void;
  testId?: string;
}) {
  const { t } = useI18n();
  const check = useCheckPhoto();
  return (
    <Upload
      listType="picture-card"
      accept={ACCEPTED_IMAGE_TYPES.join(',')}
      multiple
      maxCount={PHOTO_MAX_PER_KIND}
      fileList={fileList ?? []}
      beforeUpload={(file) => (check(file) ? false : Upload.LIST_IGNORE)}
      onChange={({ fileList: next }) => onChange?.(next)}
      data-testid={testId}
    >
      {(fileList?.length ?? 0) < PHOTO_MAX_PER_KIND && (
        <button type="button" className="shipment-photo-add">
          <PlusOutlined />
          <span>{t('ui.shipmentPhotoAdd')}</span>
        </button>
      )}
    </Upload>
  );
}

/** Ảnh của một khai báo, nhóm theo loại; bấm vào ảnh để xem lớn. */
export function ShipmentPhotoGallery({
  photos,
  onDelete,
  deletingId,
}: {
  photos: readonly ShipmentPhoto[];
  onDelete?: (photo: ShipmentPhoto) => void;
  deletingId?: string;
}) {
  const { t } = useI18n();
  const kindText = usePhotoKindText();
  return (
    <Image.PreviewGroup>
      <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
        {PHOTO_KINDS.map((kind) => {
          const ofKind = photos.filter((p) => p.kind === kind);
          return (
            <div key={kind}>
              <Typography.Text strong>{kindText.label(kind)}</Typography.Text>
              <div className="shipment-photo-row">
                {ofKind.length === 0 ? (
                  <Typography.Text type="secondary">{t('ui.shipmentPhotosNone')}</Typography.Text>
                ) : (
                  ofKind.map((photo) => (
                    <div key={photo.id} className="shipment-photo-item">
                      <Image
                        src={photo.url}
                        alt={kindText.label(kind)}
                        width={96}
                        height={96}
                        className="shipment-photo-image"
                      />
                      {onDelete && (
                        <Popconfirm
                          title={t('ui.productImageRemove')}
                          okText={t('ui.productImageRemove')}
                          cancelText={t('ui.cancel')}
                          onConfirm={() => onDelete(photo)}
                        >
                          <Button
                            size="small"
                            type="text"
                            danger
                            icon={<DeleteOutlined />}
                            loading={deletingId === photo.id}
                            aria-label={t('ui.productImageRemove')}
                          />
                        </Popconfirm>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </Space>
    </Image.PreviewGroup>
  );
}

/**
 * Xem và bổ sung ảnh của một khai báo. Thương hiệu thêm/xóa được khi khai báo còn DECLARED; sau khi
 * kho đã nhận, ảnh chỉ để xem (ADR-0024).
 */
export function ShipmentPhotosModal({
  declaration,
  canEdit,
  onClose,
}: {
  declaration: ShipmentDeclaration | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const kindText = usePhotoKindText();
  const check = useCheckPhoto();
  const add = useAddShipmentPhoto();
  const remove = useDeleteShipmentPhoto();
  const photos = declaration?.photos ?? [];
  const editable = canEdit && declaration?.status === 'DECLARED';

  const upload = async (kind: ShipmentPhotoKind, file: File) => {
    if (!declaration || !check(file)) return;
    try {
      await add.mutateAsync({ id: declaration.id, kind, file });
    } catch (err) {
      message.error(errorMessage(err, t));
    }
  };

  return (
    <Modal
      title={t('ui.shipmentPhotosManage')}
      open={declaration !== null}
      onCancel={onClose}
      footer={<Button onClick={onClose}>{t('ui.close')}</Button>}
      width={640}
      destroyOnHidden
    >
      {declaration && (
        <Space orientation="vertical" size="middle" style={{ width: '100%' }}>
          <Typography.Text type="secondary">{declaration.productName}</Typography.Text>
          {!editable && declaration.status !== 'DECLARED' && (
            <Alert type="info" showIcon title={t('ui.shipmentPhotosLocked')} />
          )}
          {photos.length === 0 && !editable ? (
            <Empty description={t('ui.shipmentPhotosNone')} />
          ) : (
            <ShipmentPhotoGallery
              photos={photos}
              deletingId={remove.isPending ? remove.variables?.photoId : undefined}
              onDelete={
                editable
                  ? (photo) =>
                      void remove
                        .mutateAsync({ id: declaration.id, photoId: photo.id })
                        .catch((err: unknown) => message.error(errorMessage(err, t)))
                  : undefined
              }
            />
          )}
          {editable && (
            <Space wrap>
              {PHOTO_KINDS.map((kind) => (
                <Upload
                  key={kind}
                  accept={ACCEPTED_IMAGE_TYPES.join(',')}
                  showUploadList={false}
                  disabled={photos.filter((p) => p.kind === kind).length >= PHOTO_MAX_PER_KIND}
                  beforeUpload={(file) => {
                    void upload(kind, file);
                    return false;
                  }}
                >
                  <Button
                    icon={<PlusOutlined />}
                    loading={add.isPending && add.variables?.kind === kind}
                    disabled={photos.filter((p) => p.kind === kind).length >= PHOTO_MAX_PER_KIND}
                  >
                    {kindText.label(kind)}
                  </Button>
                </Upload>
              ))}
            </Space>
          )}
        </Space>
      )}
    </Modal>
  );
}
