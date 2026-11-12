import { ImageField } from '@/shared/ImageField';
import { useI18n } from '@/shared/i18n';
import { MAX_IMAGE_MB, PRODUCT_IMAGE_MAX_BYTES, type ImageChange } from './product-image';

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
  return (
    <ImageField
      currentUrl={currentUrl}
      value={value}
      onChange={onChange}
      maxBytes={PRODUCT_IMAGE_MAX_BYTES}
      aspectRatio="4 / 5"
      alt={t('ui.productImage')}
      hint={t('ui.productImageHint', { maxMb: MAX_IMAGE_MB })}
      testId="product-image-input"
    />
  );
}
