/**
 * SQL của module INV: khai báo gửi hàng (FR-INV-22 ÷ 28), lô và giấy tờ chính hãng (FR-INV-01,
 * 33 ÷ 35), chai (FR-INV-02), phiếu nạp (FR-INV-29 ÷ 32). Chỉ module inv được import file này
 * (QT3, ADR-0003).
 *
 * Mọi hàm ghi nhận `executor` để service gom nhiều bước vào một transaction. Hàm `lock…` dùng
 * `FOR UPDATE` — chỉ gọi trong transaction.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { sql, type ExpressionBuilder, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type {
  BatchAuthenticityStatus,
  BottleStatus,
  RefillRequestReason,
  RefillRequestStatus,
  RefillStatus,
  RevenueOwnerType,
  ShipmentDeclarationStatus,
  ShipmentPhotoKind,
  SlotStatus,
} from '../../shared/db/types.generated.js';
import {
  brandScopedByColumn,
  HOLDING_RENTAL_STATUSES,
  type BrandScope,
} from '../../shared/scoping/index.js';

type Executor = Kysely<DB>;

export interface ShipmentRecord {
  readonly id: string;
  readonly brandId: string;
  readonly fragranceProductId: string;
  readonly productName: string;
  readonly declaredQuantity: number;
  readonly declaredBottleVolumeMl: string;
  /** `YYYY-MM-DD` — đọc bằng to_char để không lệch ngày theo múi giờ của tiến trình Node. */
  readonly expectedShipDate: string | null;
  readonly status: ShipmentDeclarationStatus;
  readonly receivedQuantity: number | null;
  readonly discrepancyNotes: string | null;
  readonly receivedBy: string | null;
  readonly receivedAt: Date | null;
  readonly resultingBatchId: string | null;
  readonly createdAt: Date;
  /** Ảnh thương hiệu gửi kèm khai báo, cũ trước mới sau (ADR-0024). */
  readonly photos: readonly ShipmentPhotoRecord[];
}

export interface ShipmentPhotoRecord {
  readonly id: string;
  readonly kind: ShipmentPhotoKind;
  readonly url: string;
  readonly createdAt: Date;
}

export interface BatchRecord {
  readonly id: string;
  readonly brandId: string;
  readonly fragranceProductId: string;
  readonly productName: string;
  readonly sourceDeclarationId: string | null;
  readonly batchNumber: string;
  readonly receivedAt: Date;
  readonly expiresAt: Date | null;
  readonly quantityReceived: number;
  readonly authenticityStatus: BatchAuthenticityStatus;
  readonly authenticityDocumentUrl: string | null;
  readonly authenticityDocumentType: string | null;
  readonly authenticitySubmittedAt: Date | null;
  readonly authenticityVerifiedAt: Date | null;
  readonly authenticityRejectionReason: string | null;
}

export interface BottleRecord {
  readonly id: string;
  readonly brandId: string;
  readonly owner: RevenueOwnerType;
  readonly batchId: string;
  readonly fragranceProductId: string;
  readonly identifier: string;
  readonly status: BottleStatus;
  readonly initialVolumeMl: string;
  readonly currentEstimatedMl: string;
  readonly installedSlotId: string | null;
  readonly expiresAt: Date | null;
  readonly sourceRentalId: string | null;
  readonly liquidatedAt: Date | null;
  readonly bottleReturnId: string | null;
  readonly damagedAt: Date | null;
  readonly damageReason: string | null;
}

export interface RefillSessionRecord {
  readonly id: string;
  readonly brandId: string;
  readonly machineId: string;
  readonly slotId: string;
  readonly oldBottleId: string | null;
  readonly newBottleId: string | null;
  readonly performedBy: string;
  readonly status: RefillStatus;
  readonly checklistCompleted: boolean;
  readonly notes: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

/** Phiếu nạp kèm thông tin hiển thị: số slot, thương hiệu, sản phẩm cần lắp (ADR-0026). */
export interface RefillSessionView extends RefillSessionRecord {
  readonly slotNumber: number;
  readonly brandName: string;
  readonly fragranceProductId: string | null;
  readonly productName: string | null;
}

/** Một dòng của `refillWorklist` — tên cột như CSDL; service xếp loại việc (ADR-0026). */
export interface RefillWorklistRow {
  readonly slot_id: string;
  readonly slot_number: number;
  readonly active_bottle_id: string | null;
  readonly estimated_remaining_sprays: number;
  readonly machine_id: string;
  readonly machine_name: string;
  readonly machine_serial: string;
  readonly location_name: string;
  readonly slot_rental_id: string;
  readonly rental_status: string;
  readonly brand_id: string;
  readonly brand_name: string;
  readonly fragrance_product_id: string | null;
  readonly product_name: string | null;
  readonly low_stock: boolean;
  readonly refill_request_id: string | null;
  readonly refill_request_reason: RefillRequestReason | null;
  readonly refill_request_status: RefillRequestStatus | null;
  readonly scheduled_at: Date | null;
  readonly open_refill_session_id: string | null;
  readonly suggested_bottle_id: string | null;
  readonly suggested_bottle_identifier: string | null;
  readonly suggested_bottle_ml: string | null;
  readonly suggested_bottle_expires_at: Date | null;
  readonly available_bottle_count: number;
  readonly unexpired_bottle_count: number;
  readonly pending_shipment: boolean;
}

/** Slot cùng máy và chai đang lắp — đọc khi mở/đóng phiếu nạp. */
export interface SlotForRefill {
  readonly id: string;
  readonly machineId: string;
  readonly slotStatus: SlotStatus;
  readonly activeBottleId: string | null;
  readonly calibratedDosageMl: string | null;
  readonly lowStockThresholdMl: string | null;
}

/** Bản ghi chai được khóa để điều chỉnh tồn kho (FR-INV-16). */
export interface BottleAdjustmentTarget {
  readonly id: string;
  readonly brandId: string;
  readonly owner: RevenueOwnerType;
  readonly status: BottleStatus;
  readonly currentEstimatedMl: string;
}

/** Bản ghi điều chỉnh tồn kho (FR-INV-16). */
export interface InventoryAdjustmentRecord {
  readonly id: string;
  readonly brandId: string;
  readonly bottleId: string;
  readonly slotId: string | null;
  readonly beforeQuantityMl: string;
  readonly afterQuantityMl: string;
  readonly differenceMl: string;
  readonly reason: string;
  readonly adjustedBy: string;
  readonly createdAt: Date;
}

/** Slot kèm chai đang lắp, đọc dưới khóa trước khi trừ một liều (FR-INV-10, ADR-0019). */
export interface SlotStock {
  readonly slotId: string;
  readonly slotNumber: number;
  readonly machineId: string;
  readonly slotStatus: SlotStatus;
  readonly calibratedDosageMl: string | null;
  readonly lowStockThresholdMl: string | null;
  readonly bottleId: string;
  readonly brandId: string;
  readonly bottleStatus: BottleStatus;
  readonly currentEstimatedMl: string;
}

/** Hóa đơn cho phép nạp hàng vào slot (ADR-0006): đang hiệu lực, hoặc đã thanh toán chờ nạp hàng. */
export interface StockableRental {
  readonly id: string;
  readonly brandId: string;
  readonly fragranceProductId: string | null;
  readonly status: string;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly previousRentalId: string | null;
}

export interface PageFilter {
  readonly page: number;
  readonly pageSize: number;
}

const SHIPMENT_COLUMNS = [
  'd.id',
  'd.brand_id',
  'd.fragrance_product_id',
  'fp.name as product_name',
  'd.declared_quantity',
  'd.declared_bottle_volume_ml',
  'd.status',
  'd.received_quantity',
  'd.discrepancy_notes',
  'd.received_by',
  'd.received_at',
  'd.created_at',
] as const;

const BATCH_COLUMNS = [
  'b.id',
  'b.brand_id',
  'b.fragrance_product_id',
  'fp.name as product_name',
  'b.source_declaration_id',
  'b.batch_number',
  'b.received_at',
  'b.expires_at',
  'b.quantity_received',
  'b.authenticity_status',
  'b.authenticity_document_url',
  'b.authenticity_document_type',
  'b.authenticity_submitted_at',
  'b.authenticity_verified_at',
  'b.authenticity_rejection_reason',
] as const;

@Injectable()
export class InvQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  transaction<T>(work: (tx: Transaction<DB>) => Promise<T>): Promise<T> {
    return this.db.transaction().execute(work);
  }

  // -----------------------------------------------------------------------------------
  // Khai báo gửi hàng
  // -----------------------------------------------------------------------------------

  private shipmentQuery(executor: Executor) {
    return executor
      .selectFrom('brand_shipment_declarations as d')
      .innerJoin('fragrance_products as fp', 'fp.id', 'd.fragrance_product_id')
      .select(SHIPMENT_COLUMNS)
      .select(sql<string | null>`to_char(d.expected_ship_date, 'YYYY-MM-DD')`.as('ship_date'))
      .select((eb) =>
        eb
          .selectFrom('inventory_batches as rb')
          .whereRef('rb.source_declaration_id', '=', 'd.id')
          .select('rb.id')
          .limit(1)
          .as('resulting_batch_id'),
      )
      .select(
        sql<PhotoJson[]>`coalesce((
          SELECT json_agg(json_build_object('id', p.id, 'kind', p.kind, 'url', p.url,
                                            'created_at', p.created_at)
                          ORDER BY p.created_at, p.id)
            FROM shipment_declaration_photos p
           WHERE p.declaration_id = d.id), '[]'::json)`.as('photos'),
      );
  }

  async listShipments(
    scope: BrandScope,
    filter: PageFilter & { readonly status?: ShipmentDeclarationStatus | undefined },
  ): Promise<{ items: ShipmentRecord[]; total: number }> {
    let base = this.db
      .selectFrom('brand_shipment_declarations as d')
      .where(brandScopedByColumn(scope, 'd.brand_id'));
    if (filter.status) base = base.where('d.status', '=', filter.status);

    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();
    const rows = await this.shipmentQuery(this.db)
      .where(brandScopedByColumn(scope, 'd.brand_id'))
      .$if(filter.status !== undefined, (qb) => qb.where('d.status', '=', filter.status!))
      .orderBy('d.created_at', 'desc')
      .orderBy('d.id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();
    return { items: rows.map(toShipment), total: Number(total) };
  }

  async findShipment(id: string, executor: Executor = this.db): Promise<ShipmentRecord | null> {
    const row = await this.shipmentQuery(executor).where('d.id', '=', id).executeTakeFirst();
    return row ? toShipment(row) : null;
  }

  /** Khóa khai báo trước khi tiếp nhận — hai lần bấm "tiếp nhận" cùng lúc chỉ một lần qua. */
  async lockShipment(
    id: string,
    tx: Executor,
  ): Promise<{
    id: string;
    brandId: string;
    fragranceProductId: string;
    declaredQuantity: number;
    declaredBottleVolumeMl: string;
    productSku: string;
    status: ShipmentDeclarationStatus;
  } | null> {
    const row = await tx
      .selectFrom('brand_shipment_declarations as d')
      .innerJoin('fragrance_products as p', 'p.id', 'd.fragrance_product_id')
      .select([
        'd.id',
        'd.brand_id',
        'd.fragrance_product_id',
        'd.declared_quantity',
        'd.declared_bottle_volume_ml',
        'd.status',
        'p.sku',
      ])
      .where('d.id', '=', id)
      // Chỉ khóa khai báo; không khóa sản phẩm để không chặn việc sửa sản phẩm song song.
      .forUpdate('d')
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          fragranceProductId: row.fragrance_product_id,
          declaredQuantity: row.declared_quantity,
          declaredBottleVolumeMl: row.declared_bottle_volume_ml,
          productSku: row.sku,
          status: row.status,
        }
      : null;
  }

  // -----------------------------------------------------------------------------------
  // Ảnh khai báo gửi hàng (ADR-0024)
  // -----------------------------------------------------------------------------------

  async countShipmentPhotos(
    declarationId: string,
    kind: ShipmentPhotoKind,
    executor: Executor = this.db,
  ): Promise<number> {
    const row = await executor
      .selectFrom('shipment_declaration_photos')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('declaration_id', '=', declarationId)
      .where('kind', '=', kind)
      .executeTakeFirstOrThrow();
    return Number(row.n);
  }

  async insertShipmentPhoto(
    input: { declarationId: string; kind: ShipmentPhotoKind; url: string; uploadedBy: string },
    executor: Executor = this.db,
  ): Promise<string> {
    const row = await executor
      .insertInto('shipment_declaration_photos')
      .values({
        declaration_id: input.declarationId,
        kind: input.kind,
        url: input.url,
        uploaded_by: input.uploadedBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async findShipmentPhoto(
    declarationId: string,
    photoId: string,
    executor: Executor = this.db,
  ): Promise<ShipmentPhotoRecord | null> {
    const row = await executor
      .selectFrom('shipment_declaration_photos')
      .select(['id', 'kind', 'url', 'created_at'])
      .where('id', '=', photoId)
      .where('declaration_id', '=', declarationId)
      .executeTakeFirst();
    return row ? { id: row.id, kind: row.kind, url: row.url, createdAt: row.created_at } : null;
  }

  async deleteShipmentPhoto(photoId: string, executor: Executor = this.db): Promise<void> {
    await executor.deleteFrom('shipment_declaration_photos').where('id', '=', photoId).execute();
  }

  async findProductBrand(productId: string, executor: Executor = this.db): Promise<string | null> {
    const row = await executor
      .selectFrom('fragrance_products')
      .select('brand_id')
      .where('id', '=', productId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return row?.brand_id ?? null;
  }

  async insertShipment(
    data: {
      readonly brandId: string;
      readonly fragranceProductId: string;
      readonly declaredQuantity: number;
      readonly declaredBottleVolumeMl: number;
      readonly expectedShipDate: string | null;
      readonly declaredBy: string;
    },
    executor: Executor,
  ): Promise<string> {
    const row = await executor
      .insertInto('brand_shipment_declarations')
      .values({
        brand_id: data.brandId,
        fragrance_product_id: data.fragranceProductId,
        declared_quantity: data.declaredQuantity,
        declared_bottle_volume_ml: String(data.declaredBottleVolumeMl),
        expected_ship_date: data.expectedShipDate,
        declared_by: data.declaredBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async markShipmentReceived(
    id: string,
    data: {
      readonly status: 'RECEIVED' | 'DISCREPANCY';
      readonly receivedQuantity: number;
      readonly discrepancyNotes: string | null;
      readonly receivedBy: string;
      readonly receivedAt: Date;
    },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('brand_shipment_declarations')
      .set({
        status: data.status,
        received_quantity: data.receivedQuantity,
        discrepancy_notes: data.discrepancyNotes,
        received_by: data.receivedBy,
        received_at: data.receivedAt,
      })
      .where('id', '=', id)
      .execute();
  }

  // -----------------------------------------------------------------------------------
  // Lô và giấy tờ chính hãng
  // -----------------------------------------------------------------------------------

  private batchQuery(executor: Executor) {
    return executor
      .selectFrom('inventory_batches as b')
      .innerJoin('fragrance_products as fp', 'fp.id', 'b.fragrance_product_id')
      .select(BATCH_COLUMNS);
  }

  async listBatches(
    scope: BrandScope,
    filter: PageFilter & {
      readonly fragranceProductId?: string | undefined;
      readonly authenticityStatus?: BatchAuthenticityStatus | undefined;
    },
  ): Promise<{ items: BatchRecord[]; total: number }> {
    let base = this.db
      .selectFrom('inventory_batches as b')
      .where(brandScopedByColumn(scope, 'b.brand_id'));
    if (filter.fragranceProductId) {
      base = base.where('b.fragrance_product_id', '=', filter.fragranceProductId);
    }
    if (filter.authenticityStatus) {
      base = base.where('b.authenticity_status', '=', filter.authenticityStatus);
    }
    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await this.batchQuery(this.db)
      .where(brandScopedByColumn(scope, 'b.brand_id'))
      .$if(filter.fragranceProductId !== undefined, (qb) =>
        qb.where('b.fragrance_product_id', '=', filter.fragranceProductId!),
      )
      .$if(filter.authenticityStatus !== undefined, (qb) =>
        qb.where('b.authenticity_status', '=', filter.authenticityStatus!),
      )
      .orderBy('b.received_at', 'desc')
      .orderBy('b.id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();
    return { items: rows.map(toBatch), total: Number(total) };
  }

  async findBatch(
    id: string,
    scope: BrandScope,
    executor: Executor = this.db,
  ): Promise<BatchRecord | null> {
    const row = await this.batchQuery(executor)
      .where('b.id', '=', id)
      .where(brandScopedByColumn(scope, 'b.brand_id'))
      .executeTakeFirst();
    return row ? toBatch(row) : null;
  }

  /** Khóa lô trước khi đổi trạng thái giấy tờ. Lọc phạm vi ở đây để Brand B không khóa lô của A. */
  async lockBatch(
    id: string,
    scope: BrandScope,
    tx: Executor,
  ): Promise<{ id: string; brandId: string; status: BatchAuthenticityStatus } | null> {
    const row = await tx
      .selectFrom('inventory_batches as b')
      .select(['b.id', 'b.brand_id', 'b.authenticity_status'])
      .where('b.id', '=', id)
      .where(brandScopedByColumn(scope, 'b.brand_id'))
      .forUpdate()
      .executeTakeFirst();
    return row ? { id: row.id, brandId: row.brand_id, status: row.authenticity_status } : null;
  }

  async brandExists(brandId: string, executor: Executor = this.db): Promise<boolean> {
    const row = await executor
      .selectFrom('brands')
      .select('id')
      .where('id', '=', brandId)
      .executeTakeFirst();
    return row !== undefined;
  }

  async insertBatch(
    data: {
      readonly brandId: string;
      readonly fragranceProductId: string;
      readonly sourceDeclarationId: string | null;
      readonly batchNumber: string;
      readonly receivedAt: Date;
      readonly expiresAt: Date | null;
      readonly quantityReceived: number;
      readonly supplierInfo?: Record<string, unknown> | null;
      readonly createdBy: string;
    },
    tx: Executor,
  ): Promise<string> {
    const row = await tx
      .insertInto('inventory_batches')
      .values({
        brand_id: data.brandId,
        fragrance_product_id: data.fragranceProductId,
        source_declaration_id: data.sourceDeclarationId,
        batch_number: data.batchNumber,
        received_at: data.receivedAt,
        expires_at: data.expiresAt,
        quantity_received: data.quantityReceived,
        ...(data.supplierInfo !== undefined
          ? { supplier_info: data.supplierInfo ? JSON.stringify(data.supplierInfo) : null }
          : {}),
        created_by: data.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async submitAuthenticity(
    id: string,
    data: {
      readonly documentUrl: string;
      readonly documentType: string;
      readonly submittedBy: string;
      readonly submittedAt: Date;
    },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('inventory_batches')
      .set({
        authenticity_status: 'PENDING',
        authenticity_document_url: data.documentUrl,
        authenticity_document_type: data.documentType,
        authenticity_submitted_by: data.submittedBy,
        authenticity_submitted_at: data.submittedAt,
        authenticity_verified_by: null,
        authenticity_verified_at: null,
        authenticity_rejection_reason: null,
      })
      .where('id', '=', id)
      .execute();
  }

  async reviewAuthenticity(
    id: string,
    data: {
      readonly status: 'APPROVED' | 'REJECTED';
      readonly verifiedBy: string;
      readonly verifiedAt: Date;
      readonly rejectionReason: string | null;
    },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('inventory_batches')
      .set({
        authenticity_status: data.status,
        authenticity_verified_by: data.verifiedBy,
        authenticity_verified_at: data.verifiedAt,
        authenticity_rejection_reason: data.rejectionReason,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * FR-INV-33 AC3 (ADR-0017 mục 1): thương hiệu còn được nộp giấy tờ khi còn hóa đơn đang hiệu lực,
   * hoặc có hóa đơn đã thanh toán chờ nạp hàng mà chưa quá `stockingDays` ngày kể từ lúc thanh toán.
   */
  async brandCanStillStock(
    brandId: string,
    now: Date,
    stockingDays: number,
    executor: Executor = this.db,
  ): Promise<boolean> {
    const row = await executor
      .selectFrom('slot_rentals')
      .select('id')
      .where('brand_id', '=', brandId)
      .where((eb) =>
        eb.or([
          eb('status', 'in', [...HOLDING_RENTAL_STATUSES]),
          eb.and([
            eb('status', '=', 'DRAFT'),
            eb('paid_at', 'is not', null),
            eb('cancelled_at', 'is', null),
            eb(sql<Date>`paid_at + make_interval(days => ${stockingDays})`, '>', now),
          ]),
        ]),
      )
      .limit(1)
      .executeTakeFirst();
    return Boolean(row);
  }

  // -----------------------------------------------------------------------------------
  // Chai
  // -----------------------------------------------------------------------------------

  private bottleQuery(executor: Executor) {
    return executor
      .selectFrom('bottles as bt')
      .leftJoin('machine_slots as ms', 'ms.active_bottle_id', 'bt.id')
      .select([
        'bt.id',
        'bt.brand_id',
        'bt.owner',
        'bt.batch_id',
        'bt.fragrance_product_id',
        'bt.identifier',
        'bt.status',
        'bt.initial_volume_ml',
        'bt.current_estimated_ml',
        'ms.id as installed_slot_id',
        'bt.expires_at',
        'bt.source_rental_id',
        'bt.liquidated_at',
        'bt.bottle_return_id',
        'bt.damaged_at',
        'bt.damage_reason',
      ]);
  }

  /**
   * FR-INV-04, FR-EXP-20: thương hiệu chỉ thấy chai mình còn sở hữu — chai đã thanh lý
   * (owner = PLATFORM) giữ brand_id cũ nhưng không còn thuộc phạm vi thương hiệu.
   */
  async listBottles(
    scope: BrandScope,
    filter: PageFilter & {
      readonly status?: BottleStatus | undefined;
      readonly batchId?: string | undefined;
      readonly fragranceProductId?: string | undefined;
    },
  ): Promise<{ items: BottleRecord[]; total: number }> {
    const ownedByBrand = scope.kind === 'BRAND';
    let base = this.db.selectFrom('bottles as bt').where(brandScopedByColumn(scope, 'bt.brand_id'));
    if (ownedByBrand) base = base.where('bt.owner', '=', 'BRAND');
    if (filter.status) base = base.where('bt.status', '=', filter.status);
    if (filter.batchId) base = base.where('bt.batch_id', '=', filter.batchId);
    if (filter.fragranceProductId) {
      base = base.where('bt.fragrance_product_id', '=', filter.fragranceProductId);
    }
    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await this.bottleQuery(this.db)
      .where(brandScopedByColumn(scope, 'bt.brand_id'))
      .$if(ownedByBrand, (qb) => qb.where('bt.owner', '=', 'BRAND'))
      .$if(filter.status !== undefined, (qb) => qb.where('bt.status', '=', filter.status!))
      .$if(filter.batchId !== undefined, (qb) => qb.where('bt.batch_id', '=', filter.batchId!))
      .$if(filter.fragranceProductId !== undefined, (qb) =>
        qb.where('bt.fragrance_product_id', '=', filter.fragranceProductId!),
      )
      .orderBy('bt.created_at', 'desc')
      .orderBy('bt.id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();
    return { items: rows.map(toBottle), total: Number(total) };
  }

  async findBottle(id: string, executor: Executor = this.db): Promise<BottleRecord | null> {
    const row = await this.bottleQuery(executor).where('bt.id', '=', id).executeTakeFirst();
    return row ? toBottle(row) : null;
  }

  async findBatchForBottle(
    batchId: string,
    executor: Executor = this.db,
  ): Promise<{ brandId: string; fragranceProductId: string; expiresAt: Date | null } | null> {
    const row = await executor
      .selectFrom('inventory_batches')
      .select(['brand_id', 'fragrance_product_id', 'expires_at'])
      .where('id', '=', batchId)
      .executeTakeFirst();
    return row
      ? {
          brandId: row.brand_id,
          fragranceProductId: row.fragrance_product_id,
          expiresAt: row.expires_at,
        }
      : null;
  }

  /**
   * ADR-0025: tạo đủ `quantity_received` chai cho lô vừa nhận, mã `{prefix}{số thứ tự}` đệm 0 tới
   * `width` chữ số. Một câu INSERT … SELECT generate_series — không vòng lặp, không giới hạn tham số.
   */
  async insertBottlesForBatch(
    data: {
      readonly batchId: string;
      readonly identifierPrefix: string;
      readonly width: number;
      readonly initialVolumeMl: string;
    },
    tx: Executor,
  ): Promise<number> {
    const result = await sql`
      INSERT INTO bottles (brand_id, batch_id, fragrance_product_id, identifier,
                           initial_volume_ml, current_estimated_ml, expires_at)
      SELECT b.brand_id, b.id, b.fragrance_product_id,
             ${data.identifierPrefix} || lpad(g::text, ${data.width}, '0'),
             ${data.initialVolumeMl}::numeric, ${data.initialVolumeMl}::numeric, b.expires_at
        FROM inventory_batches b
       CROSS JOIN generate_series(1, b.quantity_received) AS g
       WHERE b.id = ${data.batchId}`.execute(tx);
    return Number(result.numAffectedRows ?? 0n);
  }

  async insertBottle(
    data: {
      readonly brandId: string;
      readonly batchId: string;
      readonly fragranceProductId: string;
      readonly identifier: string;
      readonly initialVolumeMl: number;
      readonly expiresAt: Date | null;
    },
    executor: Executor,
  ): Promise<string> {
    const row = await executor
      .insertInto('bottles')
      .values({
        brand_id: data.brandId,
        batch_id: data.batchId,
        fragrance_product_id: data.fragranceProductId,
        identifier: data.identifier,
        initial_volume_ml: String(data.initialVolumeMl),
        current_estimated_ml: String(data.initialVolumeMl),
        expires_at: data.expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  /** Khóa chai chọn để lắp, kèm trạng thái giấy tờ của lô (FR-INV-35). */
  async lockBottleForInstall(
    id: string,
    tx: Executor,
  ): Promise<{
    id: string;
    brandId: string;
    owner: RevenueOwnerType;
    fragranceProductId: string;
    status: BottleStatus;
    expiresAt: Date | null;
    currentEstimatedMl: string;
    batchAuthenticity: BatchAuthenticityStatus;
  } | null> {
    const row = await tx
      .selectFrom('bottles as bt')
      .innerJoin('inventory_batches as b', 'b.id', 'bt.batch_id')
      .select([
        'bt.id',
        'bt.brand_id',
        'bt.owner',
        'bt.fragrance_product_id',
        'bt.status',
        'bt.expires_at',
        'bt.current_estimated_ml',
        'b.authenticity_status',
      ])
      .where('bt.id', '=', id)
      .forUpdate('bt')
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          owner: row.owner,
          fragranceProductId: row.fragrance_product_id,
          status: row.status,
          expiresAt: row.expires_at,
          currentEstimatedMl: row.current_estimated_ml,
          batchAuthenticity: row.authenticity_status,
        }
      : null;
  }

  /**
   * Chai mới vào slot: INSTALLED. Lượng còn lại giữ theo `current_estimated_ml` của chai (ADR-0019).
   */
  async installBottle(id: string, at: Date, tx: Executor): Promise<void> {
    await tx
      .updateTable('bottles')
      .set({
        status: 'INSTALLED',
        installed_at: at,
        opened_at: sql<Date>`coalesce(opened_at, ${at})`,
        removed_at: null,
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Khóa chai sắp ghi nhận hư hỏng (ADR-0018), kèm slot đang lắp và mốc bàn giao của phiếu trả hàng.
   * Khóa đúng hàng `bottles` — slot được khóa riêng qua `lockSlotAndMachine` theo thứ tự máy → slot như
   * phiếu nạp, để hai luồng không khóa chéo nhau.
   */
  async lockBottleForDamage(
    id: string,
    tx: Executor,
  ): Promise<{
    id: string;
    brandId: string;
    owner: RevenueOwnerType;
    fragranceProductId: string;
    status: BottleStatus;
    expiresAt: Date | null;
    bottleReturnId: string | null;
    returnHandedOver: boolean;
  } | null> {
    const row = await tx
      .selectFrom('bottles as bt')
      .leftJoin('bottle_returns as br', 'br.id', 'bt.bottle_return_id')
      .select([
        'bt.id',
        'bt.brand_id',
        'bt.owner',
        'bt.fragrance_product_id',
        'bt.status',
        'bt.expires_at',
        'bt.bottle_return_id',
        'br.handed_over_at',
      ])
      .where('bt.id', '=', id)
      .forUpdate('bt')
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          owner: row.owner,
          fragranceProductId: row.fragrance_product_id,
          status: row.status,
          expiresAt: row.expires_at,
          bottleReturnId: row.bottle_return_id,
          returnHandedOver: row.handed_over_at !== null,
        }
      : null;
  }

  /** Slot đang lắp chai này, nếu có (`uq_slot_active_bottle` bảo đảm tối đa một). */
  async slotHoldingBottle(bottleId: string, executor: Executor): Promise<string | null> {
    const row = await executor
      .selectFrom('machine_slots')
      .select('id')
      .where('active_bottle_id', '=', bottleId)
      .executeTakeFirst();
    return row?.id ?? null;
  }

  /** Gỡ chai khỏi slot: xóa chai đang lắp và chuyển AVAILABLE sang UNAVAILABLE khi tháo về kho. */
  async clearSlotBottle(
    slotId: string,
    tx: Executor,
    options?: { readonly markUnavailableIfAvailable?: boolean },
  ): Promise<void> {
    await tx
      .updateTable('machine_slots')
      .set({
        active_bottle_id: null,
        estimated_remaining_ml: '0',
        estimated_remaining_sprays: 0,
        ...(options?.markUnavailableIfAvailable
          ? {
              status: sql<SlotStatus>`CASE WHEN status = 'AVAILABLE'::slot_status THEN 'UNAVAILABLE'::slot_status ELSE status END`,
              version: sql<number>`version + 1`,
              updated_at: new Date(),
            }
          : {}),
      })
      .where('id', '=', slotId)
      .execute();
  }

  async markBottleDamaged(
    id: string,
    data: { readonly at: Date; readonly reason: string; readonly wasInstalled: boolean },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('bottles')
      .set({
        status: 'DAMAGED',
        damaged_at: data.at,
        damage_reason: data.reason,
        ...(data.wasInstalled ? { removed_at: data.at } : {}),
      })
      .where('id', '=', id)
      .execute();
  }

  /** Chai cũ rời slot khi đóng phiếu nạp: còn nước hoa thì về kho, hết thì EMPTY (FR-INV-13, 15). */
  async removeBottle(id: string, at: Date, tx: Executor): Promise<void> {
    await tx
      .updateTable('bottles')
      .set({
        status: sql<BottleStatus>`CASE
          WHEN status IN ('LIQUIDATED'::bottle_status, 'EXPIRED'::bottle_status, 'DAMAGED'::bottle_status) THEN status
          WHEN current_estimated_ml > 0 THEN 'IN_STOCK'::bottle_status
          ELSE 'EMPTY'::bottle_status
        END`,
        removed_at: at,
      })
      .where('id', '=', id)
      .where('status', 'in', ['INSTALLED', 'LOW', 'EMPTY', 'LIQUIDATED', 'EXPIRED'])
      .execute();
  }

  // -----------------------------------------------------------------------------------
  // Trừ lượng sau lượt xịt (FR-INV-09 ÷ 12, ADR-0019)
  // -----------------------------------------------------------------------------------

  /** Khóa slot và chai đang lắp; `null` khi slot không có chai. */
  async lockSlotStock(slotId: string, tx: Executor): Promise<SlotStock | null> {
    const row = await tx
      .selectFrom('machine_slots as ms')
      .innerJoin('bottles as b', 'b.id', 'ms.active_bottle_id')
      .select([
        'ms.id',
        'ms.slot_number',
        'ms.machine_id',
        'ms.status',
        'ms.calibrated_dosage_ml',
        'ms.low_stock_threshold_ml',
        'b.id as bottle_id',
        'b.brand_id',
        'b.status as bottle_status',
        'b.current_estimated_ml',
      ])
      .where('ms.id', '=', slotId)
      .forUpdate()
      .executeTakeFirst();
    return row
      ? {
          slotId: row.id,
          slotNumber: row.slot_number,
          machineId: row.machine_id,
          slotStatus: row.status,
          calibratedDosageMl: row.calibrated_dosage_ml,
          lowStockThresholdMl: row.low_stock_threshold_ml,
          bottleId: row.bottle_id,
          brandId: row.brand_id,
          bottleStatus: row.bottle_status,
          currentEstimatedMl: row.current_estimated_ml,
        }
      : null;
  }

  async setBottleStock(
    id: string,
    data: { readonly remainingMl: string; readonly status: BottleStatus },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('bottles')
      .set({ current_estimated_ml: data.remainingMl, status: data.status, updated_at: new Date() })
      .where('id', '=', id)
      .execute();
  }

  async setSlotStock(
    id: string,
    data: { readonly remainingMl: string; readonly sprays: number; readonly status: SlotStatus },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('machine_slots')
      .set((eb) => ({
        estimated_remaining_ml: data.remainingMl,
        estimated_remaining_sprays: data.sprays,
        status: data.status,
        version: eb('version', '+', 1),
        updated_at: new Date(),
      }))
      .where('id', '=', id)
      .execute();
  }

  // -----------------------------------------------------------------------------------
  // Phiếu nạp
  // -----------------------------------------------------------------------------------

  async listRefillSessions(
    scope: BrandScope,
    filter: PageFilter & {
      readonly machineId?: string | undefined;
      readonly status?: RefillStatus | undefined;
    },
  ): Promise<{ items: RefillSessionRecord[]; total: number }> {
    let base = this.db
      .selectFrom('refill_sessions as rs')
      .where(brandScopedByColumn(scope, 'rs.brand_id'));
    if (filter.machineId) base = base.where('rs.machine_id', '=', filter.machineId);
    if (filter.status) base = base.where('rs.status', '=', filter.status);
    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .selectAll('rs')
      .select(refillDisplayColumns)
      .orderBy('rs.started_at', 'desc')
      .orderBy('rs.id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();
    return { items: rows.map(toRefillSessionView), total: Number(total) };
  }

  async findRefillSession(
    id: string,
    executor: Executor = this.db,
  ): Promise<RefillSessionView | null> {
    const row = await executor
      .selectFrom('refill_sessions as rs')
      .selectAll('rs')
      .select(refillDisplayColumns)
      .where('rs.id', '=', id)
      .executeTakeFirst();
    return row ? toRefillSessionView(row) : null;
  }

  /**
   * ADR-0026: mỗi slot có hóa đơn đã thanh toán (đang hiệu lực, hoặc `DRAFT` đã trả tiền chờ lắp chai
   * đầu tiên) cùng các dữ kiện để service xếp loại việc. Mỗi slot một dòng; slot đang bán bình thường
   * cũng trả về — service lọc bỏ. Chai gợi ý dùng đúng điều kiện của `assertInstallable` (đúng thương
   * hiệu, đúng sản phẩm, lô đã duyệt giấy tờ, còn hạn), hết hạn sớm nhất trước — gợi ý không bao giờ
   * bị máy chủ từ chối khi lắp.
   */
  async refillWorklist(scope: BrandScope, now: Date): Promise<RefillWorklistRow[]> {
    const result = await sql<RefillWorklistRow>`
      WITH r AS (
        SELECT DISTINCT ON (sr.slot_id)
               sr.id, sr.slot_id, sr.brand_id, sr.fragrance_product_id, sr.status
          FROM slot_rentals sr
         WHERE (sr.status::text = ANY(${sql.val([...HOLDING_RENTAL_STATUSES])})
                OR (sr.status = 'DRAFT' AND sr.paid_at IS NOT NULL AND sr.cancelled_at IS NULL))
           AND ${brandScopedByColumn(scope, 'sr.brand_id')}
         ORDER BY sr.slot_id, sr.created_at DESC
      )
      SELECT s.id                          AS slot_id,
             s.slot_number,
             s.active_bottle_id,
             s.estimated_remaining_sprays,
             m.id                          AS machine_id,
             m.display_name                AS machine_name,
             m.serial_number               AS machine_serial,
             l.name                        AS location_name,
             r.id                          AS slot_rental_id,
             r.status::text                AS rental_status,
             r.brand_id,
             b.name                        AS brand_name,
             r.fragrance_product_id,
             p.name                        AS product_name,
             (coalesce((SELECT ab.status IN ('LOW', 'EMPTY') FROM bottles ab
                         WHERE ab.id = s.active_bottle_id), false)
              OR (s.low_stock_threshold_ml IS NOT NULL
                  AND s.estimated_remaining_ml <= s.low_stock_threshold_ml)) AS low_stock,
             rq.id                         AS refill_request_id,
             rq.reason::text               AS refill_request_reason,
             rq.status::text               AS refill_request_status,
             rq.scheduled_at,
             rs.id                         AS open_refill_session_id,
             sb.id                         AS suggested_bottle_id,
             sb.identifier                 AS suggested_bottle_identifier,
             sb.current_estimated_ml       AS suggested_bottle_ml,
             sb.expires_at                 AS suggested_bottle_expires_at,
             coalesce(stock.installable, 0)::int AS available_bottle_count,
             coalesce(stock.unexpired, 0)::int   AS unexpired_bottle_count,
             EXISTS (SELECT 1 FROM brand_shipment_declarations d
                      WHERE d.brand_id = r.brand_id
                        AND d.fragrance_product_id = r.fragrance_product_id
                        AND d.status = 'DECLARED') AS pending_shipment
        FROM r
        JOIN machine_slots s ON s.id = r.slot_id
        JOIN machines m      ON m.id = s.machine_id
        JOIN locations l     ON l.id = m.location_id
        JOIN brands b        ON b.id = r.brand_id
        LEFT JOIN fragrance_products p ON p.id = r.fragrance_product_id
        LEFT JOIN LATERAL (
          SELECT q.id, q.reason, q.status, q.scheduled_at
            FROM refill_requests q
           WHERE q.slot_id = s.id AND q.status IN ('SUBMITTED', 'ACCEPTED', 'SCHEDULED')
           ORDER BY q.created_at DESC
           LIMIT 1
        ) rq ON true
        LEFT JOIN LATERAL (
          SELECT o.id FROM refill_sessions o
           WHERE o.slot_id = s.id AND o.status = 'STARTED'
           LIMIT 1
        ) rs ON true
        LEFT JOIN LATERAL (
          SELECT count(*) FILTER (WHERE ib.authenticity_status = 'APPROVED') AS installable,
                 count(*)                                                    AS unexpired
            FROM bottles bt
            JOIN inventory_batches ib ON ib.id = bt.batch_id
           WHERE bt.brand_id = r.brand_id
             AND bt.owner = 'BRAND'
             AND bt.fragrance_product_id = r.fragrance_product_id
             AND bt.status = 'IN_STOCK'
             AND (bt.expires_at IS NULL OR bt.expires_at > ${now})
        ) stock ON true
        LEFT JOIN LATERAL (
          SELECT bt.id, bt.identifier, bt.current_estimated_ml, bt.expires_at
            FROM bottles bt
            JOIN inventory_batches ib ON ib.id = bt.batch_id
           WHERE bt.brand_id = r.brand_id
             AND bt.owner = 'BRAND'
             AND bt.fragrance_product_id = r.fragrance_product_id
             AND bt.status = 'IN_STOCK'
             AND ib.authenticity_status = 'APPROVED'
             AND (bt.expires_at IS NULL OR bt.expires_at > ${now})
           ORDER BY bt.expires_at ASC NULLS LAST, bt.identifier
           LIMIT 1
        ) sb ON true
       ORDER BY m.display_name, s.slot_number`.execute(this.db);
    return result.rows;
  }

  /** ADR-0028: lý do hủy ghi vào `notes` — bảng không có cột riêng, không đổi lược đồ. */
  async cancelRefillSession(
    id: string,
    data: { readonly notes: string; readonly at: Date },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('refill_sessions')
      .set({ status: 'CANCELLED', notes: data.notes, completed_at: data.at })
      .where('id', '=', id)
      .execute();
  }

  async lockRefillSession(id: string, tx: Executor): Promise<RefillSessionRecord | null> {
    const row = await tx
      .selectFrom('refill_sessions')
      .selectAll()
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    return row ? toRefillSession(row) : null;
  }

  /**
   * Khóa máy rồi slot. Khóa dòng `machines` để kiosk không tạo đơn chen vào giữa bước kiểm "máy
   * bận" và bước ghi phiếu — ORD khóa cùng dòng khi tạo đơn (FR-INV-32, ADR-0015, ADR-0017).
   */
  async lockSlotAndMachine(slotId: string, tx: Executor): Promise<SlotForRefill | null> {
    const slot = await tx
      .selectFrom('machine_slots')
      .select('machine_id')
      .where('id', '=', slotId)
      .executeTakeFirst();
    if (!slot) return null;
    await tx
      .selectFrom('machines')
      .select('id')
      .where('id', '=', slot.machine_id)
      .forUpdate()
      .execute();
    const locked = await tx
      .selectFrom('machine_slots')
      .select([
        'id',
        'machine_id',
        'status',
        'active_bottle_id',
        'calibrated_dosage_ml',
        'low_stock_threshold_ml',
      ])
      .where('id', '=', slotId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    return {
      id: locked.id,
      machineId: locked.machine_id,
      slotStatus: locked.status,
      activeBottleId: locked.active_bottle_id,
      calibratedDosageMl: locked.calibrated_dosage_ml,
      lowStockThresholdMl: locked.low_stock_threshold_ml,
    };
  }

  /**
   * FR-INV-32: máy còn đơn chờ thanh toán hoặc lệnh xịt khách hàng hiệu lực (`CREATED`, `SENT`,
   * `ACKNOWLEDGED` — cùng tập với `uq_machine_active_customer_command`).
   */
  async machineIsBusy(machineId: string, executor: Executor): Promise<boolean> {
    const row = await executor
      .selectFrom('machines as m')
      .select((eb) => [
        eb
          .exists(
            eb
              .selectFrom('orders as o')
              .select('o.id')
              .whereRef('o.machine_id', '=', 'm.id')
              .where('o.status', 'in', ['CREATED', 'PENDING_PAYMENT']),
          )
          .as('open_order'),
        eb
          .exists(
            eb
              .selectFrom('dispense_commands as dc')
              .select('dc.id')
              .whereRef('dc.machine_id', '=', 'm.id')
              .where('dc.command_type', '=', 'CUSTOMER')
              .where('dc.status', 'in', ['CREATED', 'SENT', 'ACKNOWLEDGED']),
          )
          .as('active_command'),
      ])
      .where('m.id', '=', machineId)
      .executeTakeFirstOrThrow();
    return Boolean(row.open_order) || Boolean(row.active_command);
  }

  /**
   * ADR-0006: slot chỉ nhận chai khi có hóa đơn đã thanh toán — đang hiệu lực, hoặc `DRAFT` đã có
   * `paid_at` (chờ nạp hàng). `DRAFT` chưa thanh toán là đang giữ chỗ trong lúc mua, KHÔNG nhận chai.
   */
  async findStockableRental(slotId: string, executor: Executor): Promise<StockableRental | null> {
    const row = await executor
      .selectFrom('slot_rentals')
      .select([
        'id',
        'brand_id',
        'fragrance_product_id',
        'status',
        'starts_at',
        'ends_at',
        'previous_rental_id',
      ])
      .where('slot_id', '=', slotId)
      .where((eb) =>
        eb.or([
          eb('status', 'in', [...HOLDING_RENTAL_STATUSES]),
          eb.and([
            eb('status', '=', 'DRAFT'),
            eb('paid_at', 'is not', null),
            eb('cancelled_at', 'is', null),
          ]),
        ]),
      )
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          fragranceProductId: row.fragrance_product_id,
          status: row.status,
          startsAt: row.starts_at,
          endsAt: row.ends_at,
          previousRentalId: row.previous_rental_id,
        }
      : null;
  }

  async slotHasOpenRefillSession(slotId: string, executor: Executor): Promise<boolean> {
    const row = await executor
      .selectFrom('refill_sessions')
      .select('id')
      .where('slot_id', '=', slotId)
      .where('status', '=', 'STARTED')
      .executeTakeFirst();
    return Boolean(row);
  }

  async insertRefillSession(
    data: {
      readonly brandId: string;
      readonly machineId: string;
      readonly slotId: string;
      readonly oldBottleId: string | null;
      readonly performedBy: string;
      readonly startedAt: Date;
    },
    tx: Executor,
  ): Promise<string> {
    const row = await tx
      .insertInto('refill_sessions')
      .values({
        brand_id: data.brandId,
        machine_id: data.machineId,
        slot_id: data.slotId,
        old_bottle_id: data.oldBottleId,
        performed_by: data.performedBy,
        started_at: data.startedAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async completeRefillSession(
    id: string,
    data: {
      readonly oldBottleId: string | null;
      readonly newBottleId: string;
      readonly notes: string | null;
      readonly completedAt: Date;
    },
    tx: Executor,
  ): Promise<void> {
    await tx
      .updateTable('refill_sessions')
      .set({
        status: 'COMPLETED',
        old_bottle_id: data.oldBottleId,
        new_bottle_id: data.newBottleId,
        checklist_completed: true,
        notes: data.notes,
        completed_at: data.completedAt,
      })
      .where('id', '=', id)
      .execute();
  }

  /** Slot nhận chai mới; lượng còn lại ước tính lấy theo chai (FR-INV-09). */
  async setSlotBottle(
    slot: SlotForRefill,
    bottle: { readonly id: string; readonly currentEstimatedMl: string },
    tx: Executor,
  ): Promise<void> {
    const ml = Number(bottle.currentEstimatedMl);
    const dosage = slot.calibratedDosageMl === null ? null : Number(slot.calibratedDosageMl);
    await tx
      .updateTable('machine_slots')
      .set({
        active_bottle_id: bottle.id,
        estimated_remaining_ml: bottle.currentEstimatedMl,
        // Slot chưa hiệu chuẩn thì chưa quy được ra số lượt — giữ nguyên tới lúc hiệu chuẩn (FR-MCH-06).
        ...(dosage && dosage > 0 ? { estimated_remaining_sprays: Math.floor(ml / dosage) } : {}),
      })
      .where('id', '=', slot.id)
      .execute();
  }

  // -----------------------------------------------------------------------------------
  // Người nhận thông báo
  // -----------------------------------------------------------------------------------

  /** Tài khoản ACTIVE mang vai trò Inventory Staff — nhận thông báo khai báo mới (FR-INV-28). */
  async findActiveInventoryStaff(executor: Executor): Promise<string[]> {
    const rows = await executor
      .selectFrom('users as u')
      .select('u.id')
      .where('u.status', '=', 'ACTIVE')
      .where((eb) =>
        eb.exists(
          eb
            .selectFrom('user_roles as ur')
            .innerJoin('roles as r', 'r.id', 'ur.role_id')
            .select('ur.id')
            .whereRef('ur.user_id', '=', 'u.id')
            .where('r.code', '=', 'INVENTORY_STAFF'),
        ),
      )
      .execute();
    return rows.map((r) => r.id);
  }

  // -----------------------------------------------------------------------------------
  // Tháo chai về kho, điều chỉnh tồn kho & lịch sử chai (FR-INV-15, 16, 17)
  // -----------------------------------------------------------------------------------

  async findBottleScoped(
    id: string,
    scope: BrandScope,
    executor: Executor = this.db,
  ): Promise<BottleRecord | null> {
    const row = await this.bottleQuery(executor)
      .where('bt.id', '=', id)
      .where(brandScopedByColumn(scope, 'bt.brand_id'))
      .executeTakeFirst();
    return row ? toBottle(row) : null;
  }

  /** Hóa đơn đang chiếm slot đã báo không gia hạn thì tháo qua luồng trả hàng (FR-EXP-26). */
  async slotHasNonRenewalRental(slotId: string, tx: Executor): Promise<boolean> {
    const row = await tx
      .selectFrom('slot_rentals')
      .select('id')
      .where('slot_id', '=', slotId)
      .where('status', 'in', [...HOLDING_RENTAL_STATUSES])
      .where('non_renewal_requested_at', 'is not', null)
      .executeTakeFirst();
    return row !== undefined;
  }

  async lockBottleForAdjustment(id: string, tx: Executor): Promise<BottleAdjustmentTarget | null> {
    const row = await tx
      .selectFrom('bottles')
      .select(['id', 'brand_id', 'owner', 'status', 'current_estimated_ml'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          owner: row.owner,
          status: row.status,
          currentEstimatedMl: row.current_estimated_ml,
        }
      : null;
  }

  async insertAdjustment(
    data: {
      readonly brandId: string;
      readonly bottleId: string;
      readonly slotId: string | null;
      readonly beforeQuantityMl: string;
      readonly afterQuantityMl: string;
      readonly differenceMl: string;
      readonly reason: string;
      readonly adjustedBy: string;
    },
    tx: Executor,
  ): Promise<InventoryAdjustmentRecord> {
    const row = await tx
      .insertInto('inventory_adjustments')
      .values({
        brand_id: data.brandId,
        bottle_id: data.bottleId,
        slot_id: data.slotId,
        before_quantity_ml: data.beforeQuantityMl,
        after_quantity_ml: data.afterQuantityMl,
        difference_ml: data.differenceMl,
        reason: data.reason,
        adjusted_by: data.adjustedBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      id: row.id,
      brandId: row.brand_id,
      bottleId: row.bottle_id,
      slotId: row.slot_id,
      beforeQuantityMl: row.before_quantity_ml,
      afterQuantityMl: row.after_quantity_ml,
      differenceMl: row.difference_ml,
      reason: row.reason,
      adjustedBy: row.adjusted_by,
      createdAt: row.created_at,
    };
  }

  async listBottleHistory(
    bottleId: string,
    filter: PageFilter,
    executor: Executor = this.db,
  ): Promise<{ items: Schema<'AuditLogEntry'>[]; total: number }> {
    const base = executor
      .selectFrom('audit_logs')
      .where('target_type', '=', 'Bottle')
      .where('target_id', '=', bottleId);

    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .select([
        'id',
        'brand_id',
        'actor_type',
        'actor_id',
        'action',
        'target_type',
        'target_id',
        'source_ip',
        'severity',
        'before_data',
        'after_data',
        'occurred_at',
      ])
      .orderBy('occurred_at', 'desc')
      .orderBy('id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map((r) => ({
        id: r.id,
        brandId: r.brand_id,
        actorType: r.actor_type as Schema<'AuditLogEntry'>['actorType'],
        actorId: r.actor_id,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        sourceIp: r.source_ip,
        severity: r.severity as Schema<'AuditLogEntry'>['severity'],
        beforeData: (r.before_data as Record<string, unknown> | null) ?? null,
        afterData: (r.after_data as Record<string, unknown> | null) ?? null,
        occurredAt: r.occurred_at.toISOString(),
      })),
      total: Number(total),
    };
  }
}

// -------------------------------------------------------------------------------------
// Ánh xạ dòng → bản ghi
// -------------------------------------------------------------------------------------

function toShipment(r: {
  id: string;
  brand_id: string;
  fragrance_product_id: string;
  product_name: string;
  declared_quantity: number;
  declared_bottle_volume_ml: string;
  ship_date: string | null;
  status: ShipmentDeclarationStatus;
  received_quantity: number | null;
  discrepancy_notes: string | null;
  received_by: string | null;
  received_at: Date | null;
  resulting_batch_id: string | null;
  created_at: Date;
  photos: PhotoJson[];
}): ShipmentRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    fragranceProductId: r.fragrance_product_id,
    productName: r.product_name,
    declaredQuantity: r.declared_quantity,
    declaredBottleVolumeMl: r.declared_bottle_volume_ml,
    expectedShipDate: r.ship_date,
    status: r.status,
    receivedQuantity: r.received_quantity,
    discrepancyNotes: r.discrepancy_notes,
    receivedBy: r.received_by,
    receivedAt: r.received_at,
    resultingBatchId: r.resulting_batch_id,
    createdAt: r.created_at,
    photos: r.photos.map((p) => ({
      id: p.id,
      kind: p.kind,
      url: p.url,
      createdAt: new Date(p.created_at),
    })),
  };
}

/** Một ảnh trong cột `photos` dựng bằng json_agg — thời điểm về dạng chuỗi ISO. */
interface PhotoJson {
  id: string;
  kind: ShipmentPhotoKind;
  url: string;
  created_at: string;
}

function toBatch(r: {
  id: string;
  brand_id: string;
  fragrance_product_id: string;
  product_name: string;
  source_declaration_id: string | null;
  batch_number: string;
  received_at: Date;
  expires_at: Date | null;
  quantity_received: number;
  authenticity_status: BatchAuthenticityStatus;
  authenticity_document_url: string | null;
  authenticity_document_type: string | null;
  authenticity_submitted_at: Date | null;
  authenticity_verified_at: Date | null;
  authenticity_rejection_reason: string | null;
}): BatchRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    fragranceProductId: r.fragrance_product_id,
    productName: r.product_name,
    sourceDeclarationId: r.source_declaration_id,
    batchNumber: r.batch_number,
    receivedAt: r.received_at,
    expiresAt: r.expires_at,
    quantityReceived: r.quantity_received,
    authenticityStatus: r.authenticity_status,
    authenticityDocumentUrl: r.authenticity_document_url,
    authenticityDocumentType: r.authenticity_document_type,
    authenticitySubmittedAt: r.authenticity_submitted_at,
    authenticityVerifiedAt: r.authenticity_verified_at,
    authenticityRejectionReason: r.authenticity_rejection_reason,
  };
}

function toBottle(r: {
  id: string;
  brand_id: string;
  owner: RevenueOwnerType;
  batch_id: string;
  fragrance_product_id: string;
  identifier: string;
  status: BottleStatus;
  initial_volume_ml: string;
  current_estimated_ml: string;
  installed_slot_id: string | null;
  expires_at: Date | null;
  source_rental_id: string | null;
  liquidated_at: Date | null;
  bottle_return_id: string | null;
  damaged_at: Date | null;
  damage_reason: string | null;
}): BottleRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    owner: r.owner,
    batchId: r.batch_id,
    fragranceProductId: r.fragrance_product_id,
    identifier: r.identifier,
    status: r.status,
    initialVolumeMl: r.initial_volume_ml,
    currentEstimatedMl: r.current_estimated_ml,
    installedSlotId: r.installed_slot_id,
    expiresAt: r.expires_at,
    sourceRentalId: r.source_rental_id,
    liquidatedAt: r.liquidated_at,
    bottleReturnId: r.bottle_return_id,
    damagedAt: r.damaged_at,
    damageReason: r.damage_reason,
  };
}

/**
 * Số slot, tên thương hiệu và sản phẩm của hóa đơn mới nhất cùng thương hiệu trên slot — sản phẩm
 * chai cần lắp (ADR-0026). Truy vấn con chứ không JOIN để không nhân dòng phiếu.
 */
function refillDisplayColumns(eb: ExpressionBuilder<DB & { rs: DB['refill_sessions'] }, 'rs'>) {
  const latestRental = () =>
    eb
      .selectFrom('slot_rentals as sr')
      .whereRef('sr.slot_id', '=', 'rs.slot_id')
      .whereRef('sr.brand_id', '=', 'rs.brand_id')
      .orderBy('sr.created_at', 'desc')
      .limit(1);
  return [
    eb
      .selectFrom('machine_slots as ms')
      .select('ms.slot_number')
      .whereRef('ms.id', '=', 'rs.slot_id')
      .as('slot_number'),
    eb
      .selectFrom('brands as br')
      .select('br.name')
      .whereRef('br.id', '=', 'rs.brand_id')
      .as('brand_name'),
    latestRental().select('sr.fragrance_product_id').as('rental_product_id'),
    latestRental()
      .innerJoin('fragrance_products as fp', 'fp.id', 'sr.fragrance_product_id')
      .select('fp.name')
      .as('rental_product_name'),
  ];
}

function toRefillSessionView(
  r: Parameters<typeof toRefillSession>[0] & {
    slot_number: number | null;
    brand_name: string | null;
    rental_product_id: string | null;
    rental_product_name: string | null;
  },
): RefillSessionView {
  return {
    ...toRefillSession(r),
    slotNumber: r.slot_number ?? 0,
    brandName: r.brand_name ?? '',
    fragranceProductId: r.rental_product_id,
    productName: r.rental_product_name,
  };
}

function toRefillSession(r: {
  id: string;
  brand_id: string;
  machine_id: string;
  slot_id: string;
  old_bottle_id: string | null;
  new_bottle_id: string | null;
  performed_by: string;
  status: RefillStatus;
  checklist_completed: boolean;
  notes: string | null;
  started_at: Date;
  completed_at: Date | null;
}): RefillSessionRecord {
  return {
    id: r.id,
    brandId: r.brand_id,
    machineId: r.machine_id,
    slotId: r.slot_id,
    oldBottleId: r.old_bottle_id,
    newBottleId: r.new_bottle_id,
    performedBy: r.performed_by,
    status: r.status,
    checklistCompleted: r.checklist_completed,
    notes: r.notes,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}
