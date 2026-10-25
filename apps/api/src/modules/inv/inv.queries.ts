/**
 * SQL của module INV: khai báo gửi hàng (FR-INV-22 ÷ 28), lô và giấy tờ chính hãng (FR-INV-01,
 * 33 ÷ 35), chai (FR-INV-02), phiếu nạp (FR-INV-29 ÷ 32). Chỉ module inv được import file này
 * (QT3, ADR-0003).
 *
 * Mọi hàm ghi nhận `executor` để service gom nhiều bước vào một transaction. Hàm `lock…` dùng
 * `FOR UPDATE` — chỉ gọi trong transaction.
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type {
  BatchAuthenticityStatus,
  BottleStatus,
  RefillStatus,
  RevenueOwnerType,
  ShipmentDeclarationStatus,
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
  readonly beforeWeightG: string | null;
  readonly afterWeightG: string | null;
  readonly notes: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

/** Slot cùng máy và chai đang lắp — đọc khi mở/đóng phiếu nạp. */
export interface SlotForRefill {
  readonly id: string;
  readonly machineId: string;
  readonly activeBottleId: string | null;
  readonly calibratedDosageMl: string | null;
}

/** Hóa đơn cho phép nạp hàng vào slot (ADR-0006): đang hiệu lực, hoặc đã thanh toán chờ nạp hàng. */
export interface StockableRental {
  readonly id: string;
  readonly brandId: string;
  readonly fragranceProductId: string | null;
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
    status: ShipmentDeclarationStatus;
  } | null> {
    const row = await tx
      .selectFrom('brand_shipment_declarations')
      .select(['id', 'brand_id', 'fragrance_product_id', 'declared_quantity', 'status'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst();
    return row
      ? {
          id: row.id,
          brandId: row.brand_id,
          fragranceProductId: row.fragrance_product_id,
          declaredQuantity: row.declared_quantity,
          status: row.status,
        }
      : null;
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

  async insertBatch(
    data: {
      readonly brandId: string;
      readonly fragranceProductId: string;
      readonly sourceDeclarationId: string;
      readonly batchNumber: string;
      readonly receivedAt: Date;
      readonly expiresAt: Date | null;
      readonly quantityReceived: number;
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
    },
  ): Promise<{ items: BottleRecord[]; total: number }> {
    const ownedByBrand = scope.kind === 'BRAND';
    let base = this.db.selectFrom('bottles as bt').where(brandScopedByColumn(scope, 'bt.brand_id'));
    if (ownedByBrand) base = base.where('bt.owner', '=', 'BRAND');
    if (filter.status) base = base.where('bt.status', '=', filter.status);
    if (filter.batchId) base = base.where('bt.batch_id', '=', filter.batchId);
    const { total } = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await this.bottleQuery(this.db)
      .where(brandScopedByColumn(scope, 'bt.brand_id'))
      .$if(ownedByBrand, (qb) => qb.where('bt.owner', '=', 'BRAND'))
      .$if(filter.status !== undefined, (qb) => qb.where('bt.status', '=', filter.status!))
      .$if(filter.batchId !== undefined, (qb) => qb.where('bt.batch_id', '=', filter.batchId!))
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

  async insertBottle(
    data: {
      readonly brandId: string;
      readonly batchId: string;
      readonly fragranceProductId: string;
      readonly identifier: string;
      readonly initialVolumeMl: number;
      readonly emptyWeightG: number | null;
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
        empty_weight_g: data.emptyWeightG === null ? null : String(data.emptyWeightG),
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
   * Chai mới vào slot: INSTALLED. Khối lượng đo được chỉ ghi khi người kho nhập — không có thì giữ
   * nguyên, không ghi 0 (FR-INV-05, FR-INV-13).
   */
  async installBottle(
    id: string,
    data: { readonly at: Date; readonly measuredWeightG: number | null },
    tx: Executor,
  ): Promise<void> {
    const weight = data.measuredWeightG === null ? null : String(data.measuredWeightG);
    await tx
      .updateTable('bottles')
      .set({
        status: 'INSTALLED',
        installed_at: data.at,
        opened_at: sql<Date>`coalesce(opened_at, ${data.at})`,
        removed_at: null,
        ...(weight !== null
          ? { initial_measured_weight_g: weight, current_measured_weight_g: weight }
          : {}),
      })
      .where('id', '=', id)
      .execute();
  }

  /** Chai cũ rời slot khi đóng phiếu nạp: còn nước hoa thì về kho, hết thì EMPTY (FR-INV-13, 15). */
  async removeBottle(id: string, at: Date, tx: Executor): Promise<void> {
    await tx
      .updateTable('bottles')
      .set({
        status: sql<BottleStatus>`CASE WHEN current_estimated_ml > 0 THEN 'IN_STOCK' ELSE 'EMPTY' END::bottle_status`,
        removed_at: at,
      })
      .where('id', '=', id)
      .where('status', 'in', ['INSTALLED', 'LOW', 'EMPTY'])
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
      .orderBy('rs.started_at', 'desc')
      .orderBy('rs.id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();
    return { items: rows.map(toRefillSession), total: Number(total) };
  }

  async findRefillSession(
    id: string,
    executor: Executor = this.db,
  ): Promise<RefillSessionRecord | null> {
    const row = await executor
      .selectFrom('refill_sessions')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toRefillSession(row) : null;
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
      .select(['id', 'machine_id', 'active_bottle_id', 'calibrated_dosage_ml'])
      .where('id', '=', slotId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    return {
      id: locked.id,
      machineId: locked.machine_id,
      activeBottleId: locked.active_bottle_id,
      calibratedDosageMl: locked.calibrated_dosage_ml,
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
      .select(['id', 'brand_id', 'fragrance_product_id'])
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
      ? { id: row.id, brandId: row.brand_id, fragranceProductId: row.fragrance_product_id }
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
      readonly beforeWeightG: number | null;
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
        before_weight_g: data.beforeWeightG === null ? null : String(data.beforeWeightG),
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
      readonly afterWeightG: number | null;
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
        after_weight_g: data.afterWeightG === null ? null : String(data.afterWeightG),
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

  async insertInAppNotifications(
    data: {
      readonly brandId: string;
      readonly recipients: readonly string[];
      readonly type: string;
      readonly subject: string;
      readonly content: string;
      readonly referenceId: string;
      readonly at: Date;
    },
    executor: Executor,
  ): Promise<void> {
    if (data.recipients.length === 0) return;
    await executor
      .insertInto('notifications')
      .values(
        data.recipients.map((recipient) => ({
          brand_id: data.brandId,
          recipient_user_id: recipient,
          type: data.type,
          channel: 'IN_APP',
          subject: data.subject,
          content: data.content,
          status: 'SENT' as const,
          sent_at: data.at,
          reference_id: data.referenceId,
          created_at: data.at,
        })),
      )
      .execute();
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
  };
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
  before_weight_g: string | null;
  after_weight_g: string | null;
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
    beforeWeightG: r.before_weight_g,
    afterWeightG: r.after_weight_g,
    notes: r.notes,
    startedAt: r.started_at,
    completedAt: r.completed_at,
  };
}
