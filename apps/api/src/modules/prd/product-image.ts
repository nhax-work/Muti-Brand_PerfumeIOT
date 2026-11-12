/**
 * Chuẩn hóa ảnh sản phẩm trước khi lưu (ADR-0020 mục 2). Phần xử lý ảnh dùng chung nằm ở adapter kho
 * ảnh (ADR-0022); file này chỉ gắn ngưỡng và câu lỗi của sản phẩm.
 */

import { normalizeImage, type NormalizedImage } from '../../adapters/media/index.js';

export {
  detectImageKind,
  type ImageKind,
  type NormalizedImage,
} from '../../adapters/media/index.js';

export function normalizeProductImage(data: Buffer, maxEdgePx: number): Promise<NormalizedImage> {
  return normalizeImage(data, maxEdgePx, 'prd.imageUnsupported');
}
