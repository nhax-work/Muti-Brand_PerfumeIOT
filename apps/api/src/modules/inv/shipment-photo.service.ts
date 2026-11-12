/**
 * Ảnh khai báo gửi hàng (FR-INV-22, ADR-0024): Brand Admin gửi ảnh lô hàng trước khi đóng gói và kiện
 * hàng đã đóng gói, để kho có bằng chứng đối chiếu khi nhận hàng. Xử lý ảnh giống ảnh sản phẩm
 * (ADR-0020): kiểm theo nội dung tệp, mã hóa lại WebP, bỏ metadata.
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
import type { ShipmentPhotoKind } from '../../shared/db/types.generated.js';
import { AppError, invalidField, notFoundFor } from '../../shared/errors/index.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { InvQueries, type ShipmentRecord } from './inv.queries.js';
import { toShipmentDto } from './inv.service.js';

type ShipmentDeclaration = Schema<'ShipmentDeclaration'>;
type Queries = Pick<
  InvQueries,
  | 'transaction'
  | 'findShipment'
  | 'lockShipment'
  | 'countShipmentPhotos'
  | 'insertShipmentPhoto'
  | 'findShipmentPhoto'
  | 'deleteShipmentPhoto'
>;
type Audit = Pick<AuditService, 'log'>;
type Config = Pick<AppConfig, 'constraint'>;

@Injectable()
export class ShipmentPhotoService {
  private readonly logger = new Logger('InvShipmentPhoto');

  constructor(
    @Inject(InvQueries) private readonly queries: Queries,
    @Inject(AuditService) private readonly audit: Audit,
    @Inject(MEDIA_STORAGE) private readonly storage: MediaStorage,
    @Inject(APP_CONFIG) private readonly config: Config,
  ) {}

  /**
   * Thêm một ảnh. Kiểm điều kiện trước để không tốn công xử lý ảnh vô ích, ghi ảnh lên kho, rồi kiểm
   * lại trong transaction có khóa khai báo — hai lần upload cùng lúc không vượt được số ảnh tối đa,
   * và kho vừa nhận hàng thì ảnh không lọt vào. Thất bại sau khi đã ghi kho thì xóa đối tượng vừa ghi.
   */
  async add(
    actor: AuthenticatedUser,
    scope: BrandScope,
    declarationId: string,
    kind: ShipmentPhotoKind,
    data: Buffer,
  ): Promise<ShipmentDeclaration> {
    const shipment = await this.ownShipment(actor, scope, declarationId);
    await this.assertCanAdd(shipment.id, shipment.status, kind);

    const image = await normalizeImage(
      data,
      this.config.constraint('SHIPMENT_PHOTO_MAX_EDGE_PX'),
      'inv.shipmentPhotoUnsupported',
    );
    const key = `shipments/${shipment.id}-${image.hash}.webp`;
    const url = await this.storage.put({
      key,
      body: image.body,
      contentType: 'image/webp',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });
    // Khóa theo nội dung: gửi lại đúng ảnh đã có thì không thêm dòng trùng URL — nếu không, xóa một
    // dòng sẽ xóa luôn đối tượng mà dòng kia còn trỏ tới.
    if (shipment.photos.some((p) => p.url === url)) return toShipmentDto(shipment);

    let photoId: string;
    try {
      photoId = await this.queries.transaction(async (tx) => {
        const locked = await this.queries.lockShipment(shipment.id, tx);
        await this.assertCanAdd(shipment.id, locked!.status, kind, tx);
        return this.queries.insertShipmentPhoto(
          { declarationId: shipment.id, kind, url, uploadedBy: actor.userId },
          tx,
        );
      });
    } catch (err) {
      await this.removeObject(url);
      throw err;
    }

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: shipment.brandId,
      action: 'inv.shipment.photo_added',
      targetType: 'ShipmentDeclaration',
      targetId: shipment.id,
      after: { photoId, kind, url },
    });
    return toShipmentDto((await this.queries.findShipment(shipment.id))!);
  }

  /** Xóa một ảnh khi khai báo còn DECLARED: xóa dòng trước, đối tượng trên kho sau. */
  async remove(
    actor: AuthenticatedUser,
    scope: BrandScope,
    declarationId: string,
    photoId: string,
  ): Promise<ShipmentDeclaration> {
    const shipment = await this.ownShipment(actor, scope, declarationId);
    if (shipment.status !== 'DECLARED') {
      throw new AppError('SHIPMENT_ALREADY_PROCESSED', 'inv.shipmentAlreadyProcessed');
    }
    const photo = await this.queries.findShipmentPhoto(shipment.id, photoId);
    if (!photo) throw new AppError('NOT_FOUND', 'inv.shipmentPhotoNotFound');

    await this.queries.deleteShipmentPhoto(photo.id);
    await this.removeObject(photo.url);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      brandId: shipment.brandId,
      action: 'inv.shipment.photo_removed',
      targetType: 'ShipmentDeclaration',
      targetId: shipment.id,
      before: { photoId: photo.id, kind: photo.kind, url: photo.url },
    });
    return toShipmentDto((await this.queries.findShipment(shipment.id))!);
  }

  /** Khai báo của thương hiệu khác trả như không tồn tại (FR-AUTH-08 AC2). */
  private async ownShipment(
    actor: AuthenticatedUser,
    scope: BrandScope,
    declarationId: string,
  ): Promise<ShipmentRecord> {
    const shipment = await this.queries.findShipment(declarationId);
    if (!shipment || (scope.kind === 'BRAND' && shipment.brandId !== scope.brandId)) {
      throw notFoundFor(actor);
    }
    return shipment;
  }

  private async assertCanAdd(
    declarationId: string,
    status: ShipmentRecord['status'],
    kind: ShipmentPhotoKind,
    executor?: Parameters<Queries['countShipmentPhotos']>[2],
  ): Promise<void> {
    if (status !== 'DECLARED') {
      throw new AppError('SHIPMENT_ALREADY_PROCESSED', 'inv.shipmentAlreadyProcessed');
    }
    const max = this.config.constraint('SHIPMENT_PHOTO_MAX_PER_KIND');
    if ((await this.queries.countShipmentPhotos(declarationId, kind, executor)) >= max) {
      throw invalidField('kind', 'inv.shipmentPhotoLimit', { max });
    }
  }

  /** Lỗi xóa đối tượng chỉ ghi log — thao tác của người dùng đã có kết quả (ADR-0020 mục 2). */
  private async removeObject(url: string): Promise<void> {
    const key = this.storage.keyFromUrl(url);
    if (!key) return;
    try {
      await this.storage.delete(key);
    } catch (err) {
      this.logger.warn(`Không xóa được ảnh ${key}: ${(err as Error).message}`);
    }
  }
}
