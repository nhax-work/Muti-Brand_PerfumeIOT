/**
 * Kho ảnh sản phẩm (ADR-0020). Module nghiệp vụ chỉ biết interface này; nơi lưu thật — thư mục cục bộ
 * hay Cloudflare R2 — chọn bằng MEDIA_STORAGE_DRIVER.
 *
 * Khóa đối tượng là đường dẫn tương đối không có `/` đầu, ví dụ `products/{id}-{hash}.webp`. URL công
 * khai luôn là `{MEDIA_PUBLIC_BASE_URL}/{key}`.
 */

export interface MediaObject {
  readonly key: string;
  readonly body: Buffer;
  readonly contentType: string;
  /** Giá trị header Cache-Control khi phục vụ đối tượng. */
  readonly cacheControl: string;
}

export interface MediaStorage {
  /** Ghi đối tượng (ghi đè nếu trùng khóa), trả URL công khai. */
  put(object: MediaObject): Promise<string>;
  /** Xóa đối tượng; không có cũng không lỗi. */
  delete(key: string): Promise<void>;
  /**
   * Khóa của một URL do chính kho này cấp; `null` với URL ngoài (ảnh nhập tay) — những ảnh đó không
   * thuộc kho nên không bao giờ bị xóa.
   */
  keyFromUrl(url: string | null | undefined): string | null;
}

export const MEDIA_STORAGE = Symbol('MEDIA_STORAGE');

/** Cache vĩnh viễn: khóa đổi theo nội dung nên không bao giờ phục vụ ảnh cũ dưới khóa mới. */
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

/** Tách khóa khỏi URL theo tiền tố công khai; chặn `..` để không thoát ra ngoài kho. */
export function keyFromPublicUrl(
  publicBaseUrl: string,
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  const prefix = `${publicBaseUrl}/`;
  if (!url.startsWith(prefix)) return null;
  const key = url.slice(prefix.length);
  if (!key || key.includes('..') || key.startsWith('/')) return null;
  return key;
}
