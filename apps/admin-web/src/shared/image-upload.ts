/**
 * Kiểm tra tệp ảnh ở trình duyệt trước khi upload (ảnh sản phẩm ADR-0020, logo thương hiệu ADR-0022).
 * Máy chủ vẫn kiểm lại theo nội dung tệp — đây chỉ để báo sớm.
 */

/** Loại ảnh máy chủ nhận. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/**
 * Thay đổi ảnh người dùng chọn trên biểu mẫu:
 *   - `keep`: giữ nguyên ảnh hiện có (hoặc không có ảnh)
 *   - `upload`: tải tệp mới lên sau khi lưu biểu mẫu
 *   - `remove`: xóa ảnh hiện có
 */
export type ImageChange = { kind: 'keep' } | { kind: 'upload'; file: File } | { kind: 'remove' };

/** Số MB (làm tròn xuống) để hiện trong câu gợi ý và câu lỗi. */
export function bytesToMb(bytes: number): number {
  return Math.floor(bytes / (1024 * 1024));
}

/** Lỗi kiểm tra phía trình duyệt; `null` khi tệp hợp lệ. */
export function validateImageFile(file: File, maxBytes: number): 'type' | 'size' | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) return 'type';
  if (file.size > maxBytes) return 'size';
  return null;
}
