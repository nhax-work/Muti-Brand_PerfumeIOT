import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { bytesToMb } from '@/shared/image-upload';

export { ACCEPTED_IMAGE_TYPES, type ImageChange } from '@/shared/image-upload';

/** Ngưỡng ảnh sản phẩm (ADR-0020). Phần kiểm tra chung nằm ở `shared/image-upload`. */
export const PRODUCT_IMAGE_MAX_BYTES = SPEC_CONSTRAINTS.PRODUCT_IMAGE_MAX_BYTES;
export const MAX_IMAGE_MB = bytesToMb(PRODUCT_IMAGE_MAX_BYTES);
