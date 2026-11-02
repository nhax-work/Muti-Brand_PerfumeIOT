import { DeleteOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { Button, Space, Typography } from 'antd';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useI18n } from '@/shared/i18n';
import {
  ACCEPTED_IMAGE_TYPES,
  MAX_IMAGE_MB,
  validateImageFile,
  type ImageChange,
} from './product-image';

/**
 * Ô chọn ảnh sản phẩm có xem trước theo khung 4:5 — đúng khung kiosk hiển thị (ProductImage), nên
 * Brand Admin thấy trước ảnh sẽ bị cắt thế nào trên máy.
 */
export function ProductImageField({
  currentUrl,
  value,
  onChange,
}: {
  currentUrl: string | null | undefined;
  value: ImageChange;
  onChange: (change: ImageChange) => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  // Ảnh xem trước của tệp vừa chọn; giải phóng URL tạm khi đổi tệp hoặc đóng pop-up.
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
    const problem = validateImageFile(file);
    if (problem === 'type') {
      setError(t('ui.productImageInvalidType'));
      return;
    }
    if (problem === 'size') {
      setError(t('ui.productImageTooLarge', { maxMb: MAX_IMAGE_MB }));
      return;
    }
    setError(null);
    onChange({ kind: 'upload', file });
  };

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
      <div
        style={{
          width: 120,
          aspectRatio: '4 / 5',
          borderRadius: 8,
          overflow: 'hidden',
          background: '#f1f5f9',
          border: '1px solid #e2e8f0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {shown ? (
          <img
            src={shown}
            alt={t('ui.productImage')}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <PictureOutlined style={{ fontSize: 32, color: '#94a3b8' }} />
        )}
      </div>
      <Space direction="vertical" size={8}>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(',')}
          style={{ display: 'none' }}
          data-testid="product-image-input"
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
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          {t('ui.productImageHint', { maxMb: MAX_IMAGE_MB })}
        </Typography.Text>
        {error && (
          <Typography.Text type="danger" style={{ fontSize: 12 }}>
            {error}
          </Typography.Text>
        )}
      </Space>
    </div>
  );
}
