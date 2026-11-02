/**
 * Ảnh sản phẩm (FR-PRD-01, ADR-0020): nhận tệp, chuẩn hóa, lưu vào kho ảnh và cập nhật `imageUrl`.
 *
 * Tầng nghiệp vụ độc lập với HTTP (QT2, ADR-0003): nhận Buffer, không biết multipart.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import {
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_STORAGE,
  type MediaStorage,
} from '../../adapters/media/index.js';
import { AuditService } from '../../shared/audit/index.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { normalizeProductImage } from './product-image.js';
import { toDto } from './prd.service.js';
import { PrdQueries, type ProductRecord } from './prd.queries.js';

type Product = Schema<'Product'>;
type Queries = Pick<PrdQueries, 'findById' | 'update'>;
type Audit = Pick<AuditService, 'log'>;
type Config = Pick<AppConfig, 'constraint'>;

@Injectable()
export class ProductImageService {
  private readonly logger = new Logger('PrdImage');

  constructor(
    @Inject(PrdQueries) private readonly queries: Queries,
    @Inject(AuditService) private readonly audit: Audit,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(APP_CONFIG) private readonly config: Config,
  ) {}

  /**
   * Thay ảnh của sản phẩm. Ghi ảnh mới lên kho TRƯỚC, cập nhật CSDL sau, xóa ảnh cũ cuối cùng: lỗi ở
   * bước nào thì `imageUrl` vẫn trỏ tới một ảnh có thật.
   */
  async upload(
    actor: AuthenticatedUser,
    scope: BrandScope,
    id: string,
    data: Buffer,
  ): Promise<Product> {
    const before = await this.queries.findById(scope, id);
    if (!before) throw notFoundFor(actor);

    const image = await normalizeProductImage(
      data,
      this.config.constraint('PRODUCT_IMAGE_MAX_EDGE_PX'),
    );
    const key = `products/${id}-${image.hash}.webp`;
    const imageUrl = await this.storage.put({
      key,
      body: image.body,
      contentType: 'image/webp',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });

    const after = await this.save(actor, scope, before, imageUrl, 'prd.product.image_updated');
    await this.removeOld(before.imageUrl, key);
    return after;
  }

  /** Xóa ảnh: `imageUrl = null`, rồi xóa đối tượng nếu ảnh thuộc kho của nền tảng. */
  async remove(actor: AuthenticatedUser, scope: BrandScope, id: string): Promise<Product> {
    const before = await this.queries.findById(scope, id);
    if (!before) throw notFoundFor(actor);
    if (before.imageUrl === null) return toDto(before);

    const after = await this.save(actor, scope, before, null, 'prd.product.image_removed');
    await this.removeOld(before.imageUrl, null);
    return after;
  }

  private async save(
    actor: AuthenticatedUser,
    scope: BrandScope,
    before: ProductRecord,
    imageUrl: string | null,
    action: string,
  ): Promise<Product> {
    await this.queries.update(before.id, { imageUrl });
    const updated = await this.queries.findById(scope, before.id);
    if (!updated) throw notFoundFor(actor);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: before.brandId,
      action,
      targetType: 'product',
      targetId: before.id,
      before: { imageUrl: before.imageUrl },
      after: { imageUrl },
    });
    return toDto(updated);
  }

  /** Lỗi xóa ảnh cũ chỉ ghi log — thao tác của người dùng đã thành công (ADR-0020 mục 2). */
  private async removeOld(oldUrl: string | null, keepKey: string | null): Promise<void> {
    const oldKey = this.storage.keyFromUrl(oldUrl);
    if (!oldKey || oldKey === keepKey) return;
    try {
      await this.storage.delete(oldKey);
    } catch (err) {
      this.logger.warn(`Không xóa được ảnh cũ ${oldKey}: ${(err as Error).message}`);
    }
  }
}
