import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';

/** Loại ảnh máy chủ nhận (ADR-0020). Máy chủ vẫn kiểm lại theo nội dung tệp — đây chỉ để báo sớm. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export const MAX_IMAGE_MB = Math.floor(SPEC_CONSTRAINTS.PRODUCT_IMAGE_MAX_BYTES / (1024 * 1024));

/**
 * Thay đổi ảnh người dùng chọn trong pop-up:
 *   - `keep`: giữ nguyên ảnh hiện có (hoặc không có ảnh)
 *   - `upload`: tải tệp mới lên sau khi lưu sản phẩm
 *   - `remove`: xóa ảnh hiện có
 */
export type ImageChange = { kind: 'keep' } | { kind: 'upload'; file: File } | { kind: 'remove' };

/** Lỗi kiểm tra phía trình duyệt; `null` khi tệp hợp lệ. */
export function validateImageFile(file: File): 'type' | 'size' | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > SPEC_CONSTRAINTS.PRODUCT_IMAGE_MAX_BYTES) return 'size';
  return null;
}
