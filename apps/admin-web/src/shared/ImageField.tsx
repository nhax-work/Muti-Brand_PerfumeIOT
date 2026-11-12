import { DeleteOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Space, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/shared/i18n';
import {
  ACCEPTED_IMAGE_TYPES,
  bytesToMb,
  validateImageFile,
  type ImageChange,
} from './image-upload';

/**
 * Ô chọn ảnh có xem trước theo đúng khung nơi ảnh hiển thị (4:5 cho sản phẩm trên kiosk, 1:1 cho
 * logo), để người dùng thấy trước ảnh sẽ bị cắt thế nào. Chỉ chọn tệp; upload do biểu mẫu chứa nó làm
 * sau khi lưu.
 */
export function ImageField({
  currentUrl,
  value,
  onChange,
  maxBytes,
  aspectRatio,
  alt,
  hint,
  testId,
}: {
  currentUrl: string | null | undefined;
  value: ImageChange;
  onChange: (change: ImageChange) => void;
  maxBytes: number;
  /** Tỉ lệ khung xem trước theo cú pháp CSS, ví dụ `4 / 5`. */
  aspectRatio: string;
  alt: string;
  hint: string;
  testId?: string;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Ảnh xem trước của tệp vừa chọn; giải phóng URL tạm khi đổi tệp hoặc đóng biểu mẫu.
  const previewUrl = useMemo(
    () => (value.kind === 'upload' ? URL.createObjectURL(value.file) : null),
    [value],
  );
  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const shown =
    value.kind === 'upload' ? previewUrl : value.kind === 'remove' ? null : (currentUrl ?? null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = validateImageFile(file, maxBytes);
    if (problem === 'type') {
      setError(t('ui.productImageInvalidType'));
      return;
    }
    if (problem === 'size') {
      setError(t('ui.productImageTooLarge', { maxMb: bytesToMb(maxBytes) }));
      return;
    }
    setError(null);
    onChange({ kind: 'upload', file });
  };

  return (
    <div className="image-field">
      <div className="image-field-preview" style={{ aspectRatio }}>
        {shown ? (
          <img src={shown} alt={alt} />
        ) : (
          <PictureOutlined className="image-field-placeholder" />
        )}
      </div>
      <Space orientation="vertical" size={8}>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          style={{ display: 'none' }}
          data-testid={testId}
          onChange={(e) => {
            pick(e.target.files?.[0]);
            // Cho chọn lại đúng tệp vừa bị từ chối sau khi người dùng sửa nó.
            e.target.value = '';
          }}
        />
        <Space wrap>
          <Button icon={<UploadOutlined />} onClick={() => inputRef.current?.click()}>
            {shown ? t('ui.productImageChange') : t('ui.productImageChoose')}
          </Button>
          {shown && (
            <Button
              danger
              icon={<DeleteOutlined />}
              onClick={() => {
                setError(null);
                onChange(currentUrl ? { kind: 'remove' } : { kind: 'keep' });
              }}
            >
              {t('ui.productImageRemove')}
            </Button>
          )}
        </Space>
        <Typography.Text type="secondary">{hint}</Typography.Text>
        {error && <Typography.Text type="danger">{error}</Typography.Text>}
      </Space>
    </div>
  );
}
