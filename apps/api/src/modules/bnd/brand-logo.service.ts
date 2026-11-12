/**
 * Logo thương hiệu (FR-BND-06, ADR-0022): nhận tệp, chuẩn hóa, lưu vào kho ảnh và cập nhật `logoUrl`.
 * Cùng cách làm với ảnh sản phẩm (ADR-0020).
 *
 * Tầng nghiệp vụ độc lập với HTTP (QT2, ADR-0003): nhận Buffer, không biết multipart.
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import {
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_STORAGE,
  normalizeImage,
  type MediaStorage,
} from '../../adapters/media/index.js';
import { AuditService } from '../../shared/audit/index.js';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { AppError, notFoundFor } from '../../shared/errors/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { BndQueries, type BrandRecord } from './bnd.queries.js';
import { BndService } from './bnd.service.js';

type Brand = Schema<'Brand'>;
type Queries = Pick<BndQueries, 'findById' | 'update'>;
type Brands = Pick<BndService, 'getMyBrand'>;
type Audit = Pick<AuditService, 'log'>;
type Config = Pick<AppConfig, 'constraint'>;

@Injectable()
export class BrandLogoService {
  private readonly logger = new Logger('BndLogo');

  constructor(
    @Inject(BndQueries) private readonly queries: Queries,
    @Inject(BndService) private readonly brands: Brands,
    @Inject(AuditService) private readonly audit: Audit,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(APP_CONFIG) private readonly config: Config,
  ) {}

  /**
   * Thay logo thương hiệu của người gọi. Ghi ảnh mới lên kho TRƯỚC, cập nhật CSDL sau, xóa ảnh cũ cuối
   * cùng: lỗi ở bước nào thì `logoUrl` vẫn trỏ tới một ảnh có thật.
   */
  async upload(actor: AuthenticatedUser, data: Buffer): Promise<Brand> {
    const before = await this.ownBrand(actor);
    const image = await normalizeImage(
      data,
      this.config.constraint('BRAND_LOGO_MAX_EDGE_PX'),
      'bnd.logoUnsupported',
    );
    const key = `brands/${before.id}-${image.hash}.webp`;
    const logoUrl = await this.storage.put({
      key,
      body: image.body,
      contentType: 'image/webp',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });

    await this.save(actor, before, logoUrl, 'bnd.brand.logo_updated');
    await this.removeOld(before.logoUrl, key);
    return this.brands.getMyBrand(actor);
  }

  /** Xóa logo: `logoUrl = null`, rồi xóa đối tượng nếu ảnh thuộc kho của nền tảng. */
  async remove(actor: AuthenticatedUser): Promise<Brand> {
    const before = await this.ownBrand(actor);
    if (before.logoUrl !== null) {
      await this.save(actor, before, null, 'bnd.brand.logo_removed');
      await this.removeOld(before.logoUrl, null);
    }
    return this.brands.getMyBrand(actor);
  }

  private async ownBrand(actor: AuthenticatedUser): Promise<BrandRecord> {
    if (!actor.brandId) throw new AppError('FORBIDDEN_SCOPE', 'bnd.brandAccountOnly');
    const brand = await this.queries.findById(actor.brandId);
    if (!brand) throw notFoundFor(actor);
    return brand;
  }

  private async save(
    actor: AuthenticatedUser,
    before: BrandRecord,
    logoUrl: string | null,
    action: string,
  ): Promise<void> {
    await this.queries.update(before.id, { logoUrl });
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: before.id,
      action,
      targetType: 'brand',
      targetId: before.id,
      before: { logoUrl: before.logoUrl },
      after: { logoUrl },
    });
  }

  /** Lỗi xóa ảnh cũ chỉ ghi log — thao tác của người dùng đã thành công (ADR-0020 mục 2). */
  private async removeOld(oldUrl: string | null, keepKey: string | null): Promise<void> {
    const oldKey = this.storage.keyFromUrl(oldUrl);
    if (!oldKey || oldKey === keepKey) return;
    try {
      await this.storage.delete(oldKey);
    } catch (err) {
      this.logger.warn(`Không xóa được logo cũ ${oldKey}: ${(err as Error).message}`);
    }
  }
}
