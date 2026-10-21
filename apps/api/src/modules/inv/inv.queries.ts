/**
 * Truy vấn CSDL cho Module Tồn kho và nạp nước hoa (FR-INV-01..35).
 */

import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import { DATABASE, type DB } from '../../shared/db/index.js';
import type {
  BottleStatus,
  RefillStatus,
  RevenueOwnerType,
  ShipmentDeclarationStatus,
} from '../../shared/db/types.generated.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';

export type Executor = Kysely<DB> | Transaction<DB>;

export interface ShipmentDeclarationRecord {
  readonly id: string;
  readonly brandId: string;
  readonly brandName?: string | null;
  readonly fragranceProductId: string;
  readonly productName?: string | null;
  readonly declaredQuantity: number;
  readonly declaredBottleVolumeMl: string;
  readonly expectedShipDate: Date | null;
  readonly status: ShipmentDeclarationStatus;
  readonly receivedQuantity: number | null;
  readonly discrepancyNotes: string | null;
  readonly receivedBy: string | null;
  readonly receivedAt: Date | null;
  readonly declaredBy: string;
  readonly declaredByName?: string | null;
  readonly createdAt: Date;
}

export interface InventoryBatchRecord {
  readonly id: string;
  readonly brandId: string;
  readonly brandName?: string | null;
  readonly fragranceProductId: string;
  readonly productName?: string | null;
  readonly sourceDeclarationId: string | null;
  readonly batchNumber: string;
  readonly receivedAt: Date;
  readonly expiresAt: Date | null;
  readonly quantityReceived: number;
  readonly supplierInfo: Record<string, unknown> | null;
  readonly createdBy: string;
  readonly createdAt: Date;
}

export interface BottleRecord {
  readonly id: string;
  readonly batchId: string;
  readonly brandId: string;
  readonly fragranceProductId: string;
  readonly productName?: string | null;
  readonly identifier: string;
  readonly status: BottleStatus;
  readonly owner: RevenueOwnerType;
  readonly initialVolumeMl: string;
  readonly currentEstimatedMl: string;
  readonly initialMeasuredWeightG: string | null;
  readonly currentMeasuredWeightG: string | null;
  readonly installedAt: Date | null;
  readonly removedAt: Date | null;
  readonly createdAt: Date;
}

export interface RefillSessionRecord {
  readonly id: string;
  readonly machineId: string;
  readonly machineDisplayName?: string | null;
  readonly slotId: string;
  readonly slotNumber?: number | null;
  readonly brandId: string;
  readonly brandName?: string | null;
  readonly oldBottleId: string | null;
  readonly newBottleId: string | null;
  readonly checklistCompleted: boolean;
  readonly status: RefillStatus;
  readonly notes: string | null;
  readonly beforeWeightG: string | null;
  readonly afterWeightG: string | null;
  readonly performedBy: string;
  readonly performedByName?: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date | null;
}

@Injectable()
export class InvQueries {
  constructor(@Inject(DATABASE) private readonly db: Kysely<DB>) {}

  // ==========================================
  // KHAI BÁO GỬI HÀNG (FR-INV-22 ÷ 28)
  // ==========================================

  async createShipmentDeclaration(
    data: {
      brandId: string;
      fragranceProductId: string;
      declaredQuantity: number;
      declaredBottleVolumeMl: string;
      expectedShipDate?: Date | null;
      declaredBy: string;
    },
    executor: Executor = this.db,
  ): Promise<ShipmentDeclarationRecord> {
    const row = await executor
      .insertInto('brand_shipment_declarations')
      .values({
        brand_id: data.brandId,
        fragrance_product_id: data.fragranceProductId,
        declared_quantity: data.declaredQuantity,
        declared_bottle_volume_ml: data.declaredBottleVolumeMl,
        expected_ship_date: data.expectedShipDate ?? null,
        declared_by: data.declaredBy,
        status: 'DECLARED',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      brandId: row.brand_id,
      fragranceProductId: row.fragrance_product_id,
      declaredQuantity: row.declared_quantity,
      declaredBottleVolumeMl: String(row.declared_bottle_volume_ml),
      expectedShipDate: row.expected_ship_date ? new Date(row.expected_ship_date) : null,
      status: row.status,
      receivedQuantity: row.received_quantity,
      discrepancyNotes: row.discrepancy_notes,
      receivedBy: row.received_by,
      receivedAt: row.received_at ? new Date(row.received_at) : null,
      declaredBy: row.declared_by,
      createdAt: new Date(row.created_at),
    };
  }

  async listShipmentDeclarations(
    filter: { page: number; pageSize: number; brandId?: string; status?: ShipmentDeclarationStatus },
    scope: BrandScope = { kind: 'UNRESTRICTED' },
    executor: Executor = this.db,
  ): Promise<{ items: ShipmentDeclarationRecord[]; total: number }> {
    let baseQuery = executor
      .selectFrom('brand_shipment_declarations as d')
      .innerJoin('brands as b', 'b.id', 'd.brand_id')
      .innerJoin('fragrance_products as fp', 'fp.id', 'd.fragrance_product_id')
      .innerJoin('users as u', 'u.id', 'd.declared_by')
      .where(brandScopedByColumn(scope, 'd.brand_id'));

    if (scope.kind === 'UNRESTRICTED' && filter.brandId) {
      baseQuery = baseQuery.where('d.brand_id', '=', filter.brandId);
    }
    if (filter.status) {
      baseQuery = baseQuery.where('d.status', '=', filter.status);
    }

    const countRes = await baseQuery
      .select(sql<string>`count(*)`.as('total'))
      .executeTakeFirstOrThrow();
    const total = Number(countRes.total);

    const rows = await baseQuery
      .select([
        'd.id',
        'd.brand_id as brandId',
        'b.name as brandName',
        'd.fragrance_product_id as fragranceProductId',
        'fp.name as productName',
        'd.declared_quantity as declaredQuantity',
        'd.declared_bottle_volume_ml as declaredBottleVolumeMl',
        'd.expected_ship_date as expectedShipDate',
        'd.status',
        'd.received_quantity as receivedQuantity',
        'd.discrepancy_notes as discrepancyNotes',
        'd.received_by as receivedBy',
        'd.received_at as receivedAt',
        'd.declared_by as declaredBy',
        'u.full_name as declaredByName',
        'd.created_at as createdAt',
      ])
      .orderBy('d.created_at', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    const items = rows.map((r) => ({
      id: r.id,
      brandId: r.brandId,
      brandName: r.brandName,
      fragranceProductId: r.fragranceProductId,
      productName: r.productName,
      declaredQuantity: r.declaredQuantity,
      declaredBottleVolumeMl: String(r.declaredBottleVolumeMl),
      expectedShipDate: r.expectedShipDate ? new Date(r.expectedShipDate) : null,
      status: r.status,
      receivedQuantity: r.receivedQuantity,
      discrepancyNotes: r.discrepancyNotes,
      receivedBy: r.receivedBy,
      receivedAt: r.receivedAt ? new Date(r.receivedAt) : null,
      declaredBy: r.declaredBy,
      declaredByName: r.declaredByName,
      createdAt: new Date(r.createdAt),
    }));

    return { items, total };
  }

  async findShipmentDeclarationById(
    id: string,
    scope: BrandScope = { kind: 'UNRESTRICTED' },
    executor: Executor = this.db,
  ): Promise<ShipmentDeclarationRecord | null> {
    const row = await executor
      .selectFrom('brand_shipment_declarations as d')
      .innerJoin('brands as b', 'b.id', 'd.brand_id')
      .innerJoin('fragrance_products as fp', 'fp.id', 'd.fragrance_product_id')
      .innerJoin('users as u', 'u.id', 'd.declared_by')
      .select([
        'd.id',
        'd.brand_id as brandId',
        'b.name as brandName',
        'd.fragrance_product_id as fragranceProductId',
        'fp.name as productName',
        'd.declared_quantity as declaredQuantity',
        'd.declared_bottle_volume_ml as declaredBottleVolumeMl',
        'd.expected_ship_date as expectedShipDate',
        'd.status',
        'd.received_quantity as receivedQuantity',
        'd.discrepancy_notes as discrepancyNotes',
        'd.received_by as receivedBy',
        'd.received_at as receivedAt',
        'd.declared_by as declaredBy',
        'u.full_name as declaredByName',
        'd.created_at as createdAt',
      ])
      .where('d.id', '=', id)
      .where(brandScopedByColumn(scope, 'd.brand_id'))
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      brandId: row.brandId,
      brandName: row.brandName,
      fragranceProductId: row.fragranceProductId,
      productName: row.productName,
      declaredQuantity: row.declaredQuantity,
      declaredBottleVolumeMl: String(row.declaredBottleVolumeMl),
      expectedShipDate: row.expectedShipDate ? new Date(row.expectedShipDate) : null,
      status: row.status,
      receivedQuantity: row.receivedQuantity,
      discrepancyNotes: row.discrepancyNotes,
      receivedBy: row.receivedBy,
      receivedAt: row.receivedAt ? new Date(row.receivedAt) : null,
      declaredBy: row.declaredBy,
      declaredByName: row.declaredByName,
      createdAt: new Date(row.createdAt),
    };
  }

  async updateShipmentDeclarationReceive(
    id: string,
    data: {
      status: ShipmentDeclarationStatus;
      receivedQuantity: number;
      discrepancyNotes?: string | null;
      receivedBy: string;
      receivedAt: Date;
    },
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('brand_shipment_declarations')
      .set({
        status: data.status,
        received_quantity: data.receivedQuantity,
        discrepancy_notes: data.discrepancyNotes ?? null,
        received_by: data.receivedBy,
        received_at: data.receivedAt,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  // ==========================================
  // LÔ HÀNG (FR-INV-01, 26, 33, 34)
  // ==========================================

  async createBatch(
    data: {
      brandId: string;
      fragranceProductId: string;
      sourceDeclarationId?: string | null;
      batchNumber: string;
      quantityReceived: number;
      receivedAt: Date;
      expiresAt?: Date | null;
      supplierInfo?: Record<string, unknown> | null;
      createdBy: string;
    },
    executor: Executor = this.db,
  ): Promise<InventoryBatchRecord> {
    const row = await executor
      .insertInto('inventory_batches')
      .values({
        brand_id: data.brandId,
        fragrance_product_id: data.fragranceProductId,
        source_declaration_id: data.sourceDeclarationId ?? null,
        batch_number: data.batchNumber,
        quantity_received: data.quantityReceived,
        received_at: data.receivedAt,
        expires_at: data.expiresAt ?? null,
        supplier_info: data.supplierInfo ? JSON.stringify(data.supplierInfo) : null,
        created_by: data.createdBy,
        created_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      brandId: row.brand_id,
      fragranceProductId: row.fragrance_product_id,
      sourceDeclarationId: row.source_declaration_id,
      batchNumber: row.batch_number,
      receivedAt: new Date(row.received_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : null,
      quantityReceived: row.quantity_received,
      supplierInfo: row.supplier_info ? (row.supplier_info as Record<string, unknown>) : null,
      createdBy: row.created_by,
      createdAt: new Date(row.created_at),
    };
  }

  async listBatches(
    filter: { page: number; pageSize: number; brandId?: string; fragranceProductId?: string },
    scope: BrandScope = { kind: 'UNRESTRICTED' },
    executor: Executor = this.db,
  ): Promise<{ items: InventoryBatchRecord[]; total: number }> {
    let baseQuery = executor
      .selectFrom('inventory_batches as b')
      .innerJoin('brands as br', 'br.id', 'b.brand_id')
      .innerJoin('fragrance_products as fp', 'fp.id', 'b.fragrance_product_id')
      .where(brandScopedByColumn(scope, 'b.brand_id'));

    if (scope.kind === 'UNRESTRICTED' && filter.brandId) {
      baseQuery = baseQuery.where('b.brand_id', '=', filter.brandId);
    }
    if (filter.fragranceProductId) {
      baseQuery = baseQuery.where('b.fragrance_product_id', '=', filter.fragranceProductId);
    }

    const countRes = await baseQuery
      .select(sql<string>`count(*)`.as('total'))
      .executeTakeFirstOrThrow();
    const total = Number(countRes.total);

    const rows = await baseQuery
      .select([
        'b.id',
        'b.brand_id as brandId',
        'br.name as brandName',
        'b.fragrance_product_id as fragranceProductId',
        'fp.name as productName',
        'b.source_declaration_id as sourceDeclarationId',
        'b.batch_number as batchNumber',
        'b.received_at as receivedAt',
        'b.expires_at as expiresAt',
        'b.quantity_received as quantityReceived',
        'b.supplier_info as supplierInfo',
        'b.created_by as createdBy',
        'b.created_at as createdAt',
      ])
      .orderBy('b.created_at', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    const items = rows.map((r) => ({
      id: r.id,
      brandId: r.brandId,
      brandName: r.brandName,
      fragranceProductId: r.fragranceProductId,
      productName: r.productName,
      sourceDeclarationId: r.sourceDeclarationId,
      batchNumber: r.batchNumber,
      receivedAt: new Date(r.receivedAt),
      expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
      quantityReceived: r.quantityReceived,
      supplierInfo: r.supplierInfo ? (r.supplierInfo as Record<string, unknown>) : null,
      createdBy: r.createdBy,
      createdAt: new Date(r.createdAt),
    }));

    return { items, total };
  }

  async findBatchById(
    id: string,
    scope: BrandScope = { kind: 'UNRESTRICTED' },
    executor: Executor = this.db,
  ): Promise<InventoryBatchRecord | null> {
    const row = await executor
      .selectFrom('inventory_batches as b')
      .innerJoin('brands as br', 'br.id', 'b.brand_id')
      .innerJoin('fragrance_products as fp', 'fp.id', 'b.fragrance_product_id')
      .select([
        'b.id',
        'b.brand_id as brandId',
        'br.name as brandName',
        'b.fragrance_product_id as fragranceProductId',
        'fp.name as productName',
        'b.source_declaration_id as sourceDeclarationId',
        'b.batch_number as batchNumber',
        'b.received_at as receivedAt',
        'b.expires_at as expiresAt',
        'b.quantity_received as quantityReceived',
        'b.supplier_info as supplierInfo',
        'b.created_by as createdBy',
        'b.created_at as createdAt',
      ])
      .where('b.id', '=', id)
      .where(brandScopedByColumn(scope, 'b.brand_id'))
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      brandId: row.brandId,
      brandName: row.brandName,
      fragranceProductId: row.fragranceProductId,
      productName: row.productName,
      sourceDeclarationId: row.sourceDeclarationId,
      batchNumber: row.batchNumber,
      receivedAt: new Date(row.receivedAt),
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
      quantityReceived: row.quantityReceived,
      supplierInfo: row.supplierInfo ? (row.supplierInfo as Record<string, unknown>) : null,
      createdBy: row.createdBy,
      createdAt: new Date(row.createdAt),
    };
  }

  async updateBatchSupplierInfo(
    id: string,
    supplierInfo: Record<string, unknown>,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('inventory_batches')
      .set({
        supplier_info: JSON.stringify(supplierInfo),
      })
      .where('id', '=', id)
      .execute();
  }

  // ==========================================
  // CHAI NƯỚC HOA (FR-INV-02 ÷ 07, 35)
  // ==========================================

  async createBottle(
    data: {
      batchId: string;
      brandId: string;
      fragranceProductId: string;
      identifier: string;
      initialVolumeMl: string;
      emptyWeightG?: string | null;
      status?: BottleStatus;
    },
    executor: Executor = this.db,
  ): Promise<BottleRecord> {
    const row = await executor
      .insertInto('bottles')
      .values({
        batch_id: data.batchId,
        brand_id: data.brandId,
        fragrance_product_id: data.fragranceProductId,
        identifier: data.identifier,
        initial_volume_ml: data.initialVolumeMl,
        current_estimated_ml: data.initialVolumeMl,
        empty_weight_g: data.emptyWeightG ?? null,
        status: data.status ?? 'IN_STOCK',
        owner: 'BRAND',
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      batchId: row.batch_id,
      brandId: row.brand_id,
      fragranceProductId: row.fragrance_product_id,
      identifier: row.identifier,
      status: row.status,
      owner: row.owner,
      initialVolumeMl: String(row.initial_volume_ml),
      currentEstimatedMl: String(row.current_estimated_ml),
      initialMeasuredWeightG: row.initial_measured_weight_g ? String(row.initial_measured_weight_g) : null,
      currentMeasuredWeightG: row.current_measured_weight_g ? String(row.current_measured_weight_g) : null,
      installedAt: row.installed_at ? new Date(row.installed_at) : null,
      removedAt: row.removed_at ? new Date(row.removed_at) : null,
      createdAt: new Date(row.created_at),
    };
  }

  async findBottleById(
    id: string,
    executor: Executor = this.db,
  ): Promise<BottleRecord | null> {
    const row = await executor
      .selectFrom('bottles as b')
      .innerJoin('fragrance_products as fp', 'fp.id', 'b.fragrance_product_id')
      .select([
        'b.id',
        'b.batch_id as batchId',
        'b.brand_id as brandId',
        'b.fragrance_product_id as fragranceProductId',
        'fp.name as productName',
        'b.identifier',
        'b.status',
        'b.owner',
        'b.initial_volume_ml as initialVolumeMl',
        'b.current_estimated_ml as currentEstimatedMl',
        'b.initial_measured_weight_g as initialMeasuredWeightG',
        'b.current_measured_weight_g as currentMeasuredWeightG',
        'b.installed_at as installedAt',
        'b.removed_at as removedAt',
        'b.created_at as createdAt',
      ])
      .where('b.id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      batchId: row.batchId,
      brandId: row.brandId,
      fragranceProductId: row.fragranceProductId,
      productName: row.productName,
      identifier: row.identifier,
      status: row.status,
      owner: row.owner,
      initialVolumeMl: String(row.initialVolumeMl),
      currentEstimatedMl: String(row.currentEstimatedMl),
      initialMeasuredWeightG: row.initialMeasuredWeightG ? String(row.initialMeasuredWeightG) : null,
      currentMeasuredWeightG: row.currentMeasuredWeightG ? String(row.currentMeasuredWeightG) : null,
      installedAt: row.installedAt ? new Date(row.installedAt) : null,
      removedAt: row.removedAt ? new Date(row.removedAt) : null,
      createdAt: new Date(row.createdAt),
    };
  }

  async findBottleByIdentifier(
    identifier: string,
    executor: Executor = this.db,
  ): Promise<BottleRecord | null> {
    const row = await executor
      .selectFrom('bottles as b')
      .select(['b.id', 'b.identifier'])
      .where('b.identifier', '=', identifier)
      .executeTakeFirst();

    if (!row) return null;
    return this.findBottleById(row.id, executor);
  }

  async listBottles(
    filter: { page: number; pageSize: number; brandId?: string; batchId?: string; status?: BottleStatus },
    scope: BrandScope = { kind: 'UNRESTRICTED' },
    executor: Executor = this.db,
  ): Promise<{ items: BottleRecord[]; total: number }> {
    let baseQuery = executor
      .selectFrom('bottles as b')
      .innerJoin('fragrance_products as fp', 'fp.id', 'b.fragrance_product_id')
      .where(brandScopedByColumn(scope, 'b.brand_id'));

    if (scope.kind === 'UNRESTRICTED' && filter.brandId) {
      baseQuery = baseQuery.where('b.brand_id', '=', filter.brandId);
    }
    if (filter.batchId) {
      baseQuery = baseQuery.where('b.batch_id', '=', filter.batchId);
    }
    if (filter.status) {
      baseQuery = baseQuery.where('b.status', '=', filter.status);
    }

    const countRes = await baseQuery
      .select(sql<string>`count(*)`.as('total'))
      .executeTakeFirstOrThrow();
    const total = Number(countRes.total);

    const rows = await baseQuery
      .select([
        'b.id',
        'b.batch_id as batchId',
        'b.brand_id as brandId',
        'b.fragrance_product_id as fragranceProductId',
        'fp.name as productName',
        'b.identifier',
        'b.status',
        'b.owner',
        'b.initial_volume_ml as initialVolumeMl',
        'b.current_estimated_ml as currentEstimatedMl',
        'b.initial_measured_weight_g as initialMeasuredWeightG',
        'b.current_measured_weight_g as currentMeasuredWeightG',
        'b.installed_at as installedAt',
        'b.removed_at as removedAt',
        'b.created_at as createdAt',
      ])
      .orderBy('b.created_at', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    const items = rows.map((r) => ({
      id: r.id,
      batchId: r.batchId,
      brandId: r.brandId,
      fragranceProductId: r.fragranceProductId,
      productName: r.productName,
      identifier: r.identifier,
      status: r.status,
      owner: r.owner,
      initialVolumeMl: String(r.initialVolumeMl),
      currentEstimatedMl: String(r.currentEstimatedMl),
      initialMeasuredWeightG: r.initialMeasuredWeightG ? String(r.initialMeasuredWeightG) : null,
      currentMeasuredWeightG: r.currentMeasuredWeightG ? String(r.currentMeasuredWeightG) : null,
      installedAt: r.installedAt ? new Date(r.installedAt) : null,
      removedAt: r.removedAt ? new Date(r.removedAt) : null,
      createdAt: new Date(r.createdAt),
    }));

    return { items, total };
  }

  // ==========================================
  // PHIẾU NẠP NƯỚC HOA (FR-INV-29 ÷ 32)
  // ==========================================

  async createRefillSession(
    data: {
      machineId: string;
      slotId: string;
      brandId: string;
      oldBottleId?: string | null;
      performedBy: string;
      notes?: string | null;
    },
    executor: Executor = this.db,
  ): Promise<RefillSessionRecord> {
    const row = await executor
      .insertInto('refill_sessions')
      .values({
        machine_id: data.machineId,
        slot_id: data.slotId,
        brand_id: data.brandId,
        old_bottle_id: data.oldBottleId ?? null,
        performed_by: data.performedBy,
        notes: data.notes ?? null,
        status: 'STARTED',
        checklist_completed: false,
        started_at: new Date(),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      machineId: row.machine_id,
      slotId: row.slot_id,
      brandId: row.brand_id,
      oldBottleId: row.old_bottle_id,
      newBottleId: row.new_bottle_id,
      checklistCompleted: row.checklist_completed,
      status: row.status,
      notes: row.notes,
      beforeWeightG: row.before_weight_g ? String(row.before_weight_g) : null,
      afterWeightG: row.after_weight_g ? String(row.after_weight_g) : null,
      performedBy: row.performed_by,
      startedAt: new Date(row.started_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
    };
  }

  async findRefillSessionById(
    id: string,
    executor: Executor = this.db,
  ): Promise<RefillSessionRecord | null> {
    const row = await executor
      .selectFrom('refill_sessions as rs')
      .innerJoin('machines as m', 'm.id', 'rs.machine_id')
      .innerJoin('machine_slots as ms', 'ms.id', 'rs.slot_id')
      .innerJoin('brands as b', 'b.id', 'rs.brand_id')
      .innerJoin('users as u', 'u.id', 'rs.performed_by')
      .select([
        'rs.id',
        'rs.machine_id as machineId',
        'm.display_name as machineDisplayName',
        'rs.slot_id as slotId',
        'ms.slot_number as slotNumber',
        'rs.brand_id as brandId',
        'b.name as brandName',
        'rs.old_bottle_id as oldBottleId',
        'rs.new_bottle_id as newBottleId',
        'rs.checklist_completed as checklistCompleted',
        'rs.status',
        'rs.notes',
        'rs.before_weight_g as beforeWeightG',
        'rs.after_weight_g as afterWeightG',
        'rs.performed_by as performedBy',
        'u.full_name as performedByName',
        'rs.started_at as startedAt',
        'rs.completed_at as completedAt',
      ])
      .where('rs.id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    return {
      id: row.id,
      machineId: row.machineId,
      machineDisplayName: row.machineDisplayName,
      slotId: row.slotId,
      slotNumber: row.slotNumber,
      brandId: row.brandId,
      brandName: row.brandName,
      oldBottleId: row.oldBottleId,
      newBottleId: row.newBottleId,
      checklistCompleted: row.checklistCompleted,
      status: row.status,
      notes: row.notes,
      beforeWeightG: row.beforeWeightG ? String(row.beforeWeightG) : null,
      afterWeightG: row.afterWeightG ? String(row.afterWeightG) : null,
      performedBy: row.performedBy,
      performedByName: row.performedByName,
      startedAt: new Date(row.startedAt),
      completedAt: row.completedAt ? new Date(row.completedAt) : null,
    };
  }

  async findActiveRefillSessionOnMachine(
    machineId: string,
    executor: Executor = this.db,
  ): Promise<RefillSessionRecord | null> {
    const row = await executor
      .selectFrom('refill_sessions as rs')
      .select(['rs.id'])
      .where('rs.machine_id', '=', machineId)
      .where('rs.status', '=', 'STARTED')
      .executeTakeFirst();

    if (!row) return null;
    return this.findRefillSessionById(row.id, executor);
  }

  async listRefillSessions(
    filter: { page: number; pageSize: number; machineId?: string; status?: RefillStatus },
    executor: Executor = this.db,
  ): Promise<{ items: RefillSessionRecord[]; total: number }> {
    let baseQuery = executor
      .selectFrom('refill_sessions as rs')
      .innerJoin('machines as m', 'm.id', 'rs.machine_id')
      .innerJoin('machine_slots as ms', 'ms.id', 'rs.slot_id')
      .innerJoin('brands as b', 'b.id', 'rs.brand_id')
      .innerJoin('users as u', 'u.id', 'rs.performed_by');

    if (filter.machineId) {
      baseQuery = baseQuery.where('rs.machine_id', '=', filter.machineId);
    }
    if (filter.status) {
      baseQuery = baseQuery.where('rs.status', '=', filter.status);
    }

    const countRes = await baseQuery
      .select(sql<string>`count(*)`.as('total'))
      .executeTakeFirstOrThrow();
    const total = Number(countRes.total);

    const rows = await baseQuery
      .select([
        'rs.id',
        'rs.machine_id as machineId',
        'm.display_name as machineDisplayName',
        'rs.slot_id as slotId',
        'ms.slot_number as slotNumber',
        'rs.brand_id as brandId',
        'b.name as brandName',
        'rs.old_bottle_id as oldBottleId',
        'rs.new_bottle_id as newBottleId',
        'rs.checklist_completed as checklistCompleted',
        'rs.status',
        'rs.notes',
        'rs.before_weight_g as beforeWeightG',
        'rs.after_weight_g as afterWeightG',
        'rs.performed_by as performedBy',
        'u.full_name as performedByName',
        'rs.started_at as startedAt',
        'rs.completed_at as completedAt',
      ])
      .orderBy('rs.started_at', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    const items = rows.map((r) => ({
      id: r.id,
      machineId: r.machineId,
      machineDisplayName: r.machineDisplayName,
      slotId: r.slotId,
      slotNumber: r.slotNumber,
      brandId: r.brandId,
      brandName: r.brandName,
      oldBottleId: r.oldBottleId,
      newBottleId: r.newBottleId,
      checklistCompleted: r.checklistCompleted,
      status: r.status,
      notes: r.notes,
      beforeWeightG: r.beforeWeightG ? String(r.beforeWeightG) : null,
      afterWeightG: r.afterWeightG ? String(r.afterWeightG) : null,
      performedBy: r.performedBy,
      performedByName: r.performedByName,
      startedAt: new Date(r.startedAt),
      completedAt: r.completedAt ? new Date(r.completedAt) : null,
    }));

    return { items, total };
  }

  async closeRefillSession(
    id: string,
    data: {
      newBottleId: string;
      afterWeightG: string;
      checklistCompleted: boolean;
      notes?: string | null;
      completedAt: Date;
    },
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('refill_sessions')
      .set({
        new_bottle_id: data.newBottleId,
        after_weight_g: data.afterWeightG,
        checklist_completed: data.checklistCompleted,
        notes: data.notes ?? null,
        status: 'COMPLETED',
        completed_at: data.completedAt,
      })
      .where('id', '=', id)
      .execute();
  }

  // ==========================================
  // CHỐT CHẶN AN TOÀN (FR-INV-30, 32, ADR-0015)
  // ==========================================

  /**
   * FR-INV-32: Kiểm tra máy có lệnh xịt đang hiệu lực hoặc đơn chờ thanh toán.
   */
  async hasPendingOrdersOrDispenseOnMachine(
    machineId: string,
    executor: Executor = this.db,
  ): Promise<boolean> {
    // 1. Kiểm tra đơn hàng đang CREATED hoặc PENDING_PAYMENT
    const openOrder = await executor
      .selectFrom('orders')
      .select('id')
      .where('machine_id', '=', machineId)
      .where('status', 'in', ['CREATED', 'PENDING_PAYMENT'])
      .executeTakeFirst();

    if (openOrder) return true;

    // 2. Kiểm tra lệnh xịt CUSTOMER đang SENT hoặc ACKNOWLEDGED
    const pendingCommand = await executor
      .selectFrom('dispense_commands as dc')
      .innerJoin('orders as o', 'o.id', 'dc.order_id')
      .select('dc.id')
      .where('o.machine_id', '=', machineId)
      .where('dc.status', 'in', ['SENT', 'ACKNOWLEDGED'])
      .executeTakeFirst();

    return Boolean(pendingCommand);
  }

  /**
   * Lấy slot kèm hợp đồng thuê slot hiện tại (đã thanh toán) để kiểm tra thương hiệu sở hữu.
   */
  async findActiveSlotRental(
    slotId: string,
    executor: Executor = this.db,
  ): Promise<{ rentalId: string; brandId: string; fragranceProductId: string | null } | null> {
    const row = await executor
      .selectFrom('slot_rentals')
      .select(['id', 'brand_id as brandId', 'fragrance_product_id as fragranceProductId'])
      .where('slot_id', '=', slotId)
      .where('status', 'in', ['ACTIVE', 'EXPIRING', 'GRACE', 'DRAFT'])
      .orderBy('starts_at', 'desc')
      .executeTakeFirst();

    if (!row) return null;
    return {
      rentalId: row.id,
      brandId: row.brandId,
      fragranceProductId: row.fragranceProductId,
    };
  }

  /**
   * Cập nhật slot gắn chai mới.
   */
  async updateSlotBottle(
    slotId: string,
    bottleId: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('machine_slots')
      .set({
        active_bottle_id: bottleId,
      })
      .where('id', '=', slotId)
      .execute();
  }

  /**
   * Cập nhật chai sang trạng thái INSTALLED.
   */
  async updateBottleInstalled(
    bottleId: string,
    initialMeasuredWeightG: string,
    executor: Executor = this.db,
  ): Promise<void> {
    await executor
      .updateTable('bottles')
      .set({
        status: 'INSTALLED',
        installed_at: new Date(),
        initial_measured_weight_g: initialMeasuredWeightG,
        current_measured_weight_g: initialMeasuredWeightG,
        updated_at: new Date(),
      })
      .where('id', '=', bottleId)
      .execute();
  }
}
