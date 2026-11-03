import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { AppConfig } from '../../shared/config/index.js';
import { IMMUTABLE_CACHE_CONTROL } from './media-storage.js';

/** Đường phục vụ ảnh của driver `local`, nằm dưới tiền tố toàn cục `api/v1`. */
export const LOCAL_MEDIA_ROUTE = '/api/v1/media/';

/**
 * Đăng ký plugin Fastify cho ảnh sản phẩm (ADR-0020). Gọi TRƯỚC `listen()`/`init()` ở cả
 * entrypoints/http.ts lẫn app dựng cho test tích hợp, để hai nơi chạy cùng một cấu hình.
 *
 *   - `@fastify/multipart`: nhận `multipart/form-data`. Giới hạn kích thước đặt ở từng request
 *     (`PRODUCT_IMAGE_MAX_BYTES`), ở đây chỉ chặn nhiều tệp và trường văn bản thừa.
 *   - `@fastify/static`: chỉ với driver `local` — phục vụ thư mục MEDIA_DIR, cache vĩnh viễn vì khóa
 *     đổi theo nội dung. Driver `r2` không cần: khách đọc ảnh thẳng từ tên miền công khai của bucket.
 */
export async function registerMediaRoutes(
  app: NestFastifyApplication,
  config: AppConfig,
): Promise<void> {
  await app.register(multipart, {
    limits: { files: 1, fields: 0, parts: 1 },
  });

  if (config.media.driver === 'local') {
    const root = path.resolve(config.media.localDir);
    await mkdir(root, { recursive: true });
    await app.register(fastifyStatic, {
      root,
      prefix: LOCAL_MEDIA_ROUTE,
      decorateReply: false,
      index: false,
      list: false,
      dotfiles: 'deny',
      setHeaders: (res) => {
        res.setHeader('Cache-Control', IMMUTABLE_CACHE_CONTROL);
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    });
  }
}
