/**
 * Kiểm tra và chuẩn hóa ảnh sản phẩm trước khi lưu (ADR-0020 mục 2).
 *
 * Không tin `Content-Type` hay đuôi tên tệp: loại ảnh xác định bằng byte đầu tệp, rồi ảnh được giải
 * mã và MÃ HÓA LẠI sang WebP. Thứ được lưu luôn là ảnh do máy chủ tạo — tệp người dùng gửi (có thể
 * là tệp đa định dạng, mang EXIF/GPS) không bao giờ được phục vụ nguyên trạng.
 */

import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { AppError } from '../../shared/errors/index.js';

export type ImageKind = 'jpeg' | 'png' | 'webp';

/** Loại ảnh theo chữ ký đầu tệp; `null` nếu không phải JPEG, PNG hay WebP. */
export function detectImageKind(data: Buffer): ImageKind | null {
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpeg';
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (data.length >= png.length && png.every((b, i) => data[i] === b)) return 'png';
  if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  return null;
}

export interface NormalizedImage {
  readonly body: Buffer;
  /** 16 ký tự hex đầu của SHA-256 nội dung WebP — gắn vào khóa để cache vĩnh viễn được. */
  readonly hash: string;
  readonly width: number;
  readonly height: number;
}

/** Chặn "bom giải nén": ảnh nén nhỏ nhưng kích thước điểm ảnh khổng lồ. */
const MAX_INPUT_PIXELS = 50_000_000;
const WEBP_QUALITY = 82;

/**
 * Giải mã, xoay theo EXIF, thu nhỏ để cạnh dài nhất ≤ `maxEdgePx` (không phóng to), mã hóa WebP và
 * bỏ toàn bộ metadata. Tệp không phải ảnh hợp lệ → UNSUPPORTED_MEDIA_TYPE.
 */
export async function normalizeProductImage(
  data: Buffer,
  maxEdgePx: number,
): Promise<NormalizedImage> {
  if (!detectImageKind(data)) {
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'prd.imageUnsupported');
  }
  try {
    const { data: body, info } = await sharp(data, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({ width: maxEdgePx, height: maxEdgePx, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: WEBP_QUALITY })
      .toBuffer({ resolveWithObject: true });
    const hash = createHash('sha256').update(body).digest('hex').slice(0, 16);
    return { body, hash, width: info.width, height: info.height };
  } catch {
    // Chữ ký đúng nhưng nội dung hỏng, hoặc vượt giới hạn điểm ảnh.
    throw new AppError('UNSUPPORTED_MEDIA_TYPE', 'prd.imageUnsupported');
  }
}
