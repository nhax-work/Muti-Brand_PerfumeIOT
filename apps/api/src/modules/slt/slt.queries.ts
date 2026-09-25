/**
 * Truy vấn của module SLT (Hợp đồng thuê slot - FR-SLT-01..29).
 * Chỉ module slt được import file này (QT3, ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/db/index.js';
import { brandScopedByColumn, type BrandScope } from '../../shared/scoping/index.js';

export type SlotRentalStatus =
  | 'DRAFT'
  | 'ACTIVE'
  | 'EXPIRING'
  | 'GRACE'
  | 'RENEWED'
  | 'LIQUIDATED'
  | 'CLOSED'
  | 'TERMINATED';

export interface SlotRentalRecord {
  readonly id: string;
  readonly slotId: string;
  readonly machineId?: string;
  readonly brandId: string;
  readonly fragranceProductId: string | null;
  readonly productAssignedAt: Date | null;
  readonly requestId: string | null;
  readonly previousRentalId: string | null;
  readonly status: SlotRentalStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly graceEndsAt: Date | null;
  readonly pricePerSpray: string;
  readonly currency: string;
  readonly fixedFee: string;
  readonly revenueSharePercent: number;
  readonly terminatedReason: string | null;
  readonly createdBy: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SlotRentalFilter {
  readonly slotId?: string;
  readonly brandId?: string;
  readonly status?: SlotRentalStatus;
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateSlotRentalData {
  readonly slotId: string;
  readonly brandId: string;
  readonly fragranceProductId?: string | null;
  readonly requestId?: string | null;
  readonly previousRentalId?: string | null;
  readonly status?: SlotRentalStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly graceEndsAt?: Date | null;
  readonly pricePerSpray: string;
  readonly currency?: string;
  readonly fixedFee?: string;
  readonly revenueSharePercent?: number;
  readonly createdBy: string;
}

@Injectable()
export class SltQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async list(
    scope: BrandScope,
    filter: SlotRentalFilter,
  ): Promise<{ items: SlotRentalRecord[]; total: number }> {
    let base = this.db
      .selectFrom('slot_rentals')
      .innerJoin('machine_slots', 'machine_slots.id', 'slot_rentals.slot_id')
      .where(brandScopedByColumn(scope, 'slot_rentals.brand_id'));

    if (filter.slotId) {
      base = base.where('slot_rentals.slot_id', '=', filter.slotId);
    }
    if (filter.brandId) {
      base = base.where('slot_rentals.brand_id', '=', filter.brandId);
    }
    if (filter.status) {
      base = base.where('slot_rentals.status', '=', filter.status);
    }

    const countRow = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .select([
        'slot_rentals.id',
        'slot_rentals.slot_id',
        'machine_slots.machine_id',
        'slot_rentals.brand_id',
        'slot_rentals.fragrance_product_id',
        'slot_rentals.product_assigned_at',
        'slot_rentals.request_id',
        'slot_rentals.previous_rental_id',
        'slot_rentals.status',
        'slot_rentals.starts_at',
        'slot_rentals.ends_at',
        'slot_rentals.grace_ends_at',
        'slot_rentals.price_per_spray',
        'slot_rentals.currency',
        'slot_rentals.fixed_fee',
        'slot_rentals.revenue_share_percent',
        'slot_rentals.terminated_reason',
        'slot_rentals.created_by',
        'slot_rentals.created_at',
        'slot_rentals.updated_at',
      ])
      .orderBy('slot_rentals.created_at', 'desc')
      .orderBy('slot_rentals.id')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map(toRecord),
      total: Number(countRow.total),
    };
  }

  async findById(scope: BrandScope, id: string): Promise<SlotRentalRecord | undefined> {
    const row = await this.db
      .selectFrom('slot_rentals')
      .innerJoin('machine_slots', 'machine_slots.id', 'slot_rentals.slot_id')
      .select([
        'slot_rentals.id',
        'slot_rentals.slot_id',
        'machine_slots.machine_id',
        'slot_rentals.brand_id',
        'slot_rentals.fragrance_product_id',
        'slot_rentals.product_assigned_at',
        'slot_rentals.request_id',
        'slot_rentals.previous_rental_id',
        'slot_rentals.status',
        'slot_rentals.starts_at',
        'slot_rentals.ends_at',
        'slot_rentals.grace_ends_at',
        'slot_rentals.price_per_spray',
        'slot_rentals.currency',
        'slot_rentals.fixed_fee',
        'slot_rentals.revenue_share_percent',
        'slot_rentals.terminated_reason',
        'slot_rentals.created_by',
        'slot_rentals.created_at',
        'slot_rentals.updated_at',
      ])
      .where('slot_rentals.id', '=', id)
      .where(brandScopedByColumn(scope, 'slot_rentals.brand_id'))
      .executeTakeFirst();

    return row ? toRecord(row) : undefined;
  }

  async create(data: CreateSlotRentalData): Promise<string> {
    const row = await this.db
      .insertInto('slot_rentals')
      .values({
        slot_id: data.slotId,
        brand_id: data.brandId,
        fragrance_product_id: data.fragranceProductId ?? null,
        product_assigned_at: data.fragranceProductId ? new Date() : null,
        request_id: data.requestId ?? null,
        previous_rental_id: data.previousRentalId ?? null,
        status: data.status ?? 'DRAFT',
        starts_at: data.startsAt,
        ends_at: data.endsAt,
        grace_ends_at: data.graceEndsAt ?? null,
        price_per_spray: data.pricePerSpray,
        currency: data.currency ?? 'VND',
        fixed_fee: data.fixedFee ?? '0',
        revenue_share_percent: data.revenueSharePercent !== undefined ? String(data.revenueSharePercent) : '0',
        created_by: data.createdBy,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    return row.id;
  }

  async updateStatus(
    id: string,
    status: SlotRentalStatus,
    extra?: { terminatedReason?: string | null; graceEndsAt?: Date | null },
  ): Promise<void> {
    const values: Record<string, unknown> = {
      status,
      updated_at: new Date(),
    };
    if (extra?.terminatedReason !== undefined) {
      values['terminated_reason'] = extra.terminatedReason;
    }
    if (extra?.graceEndsAt !== undefined) {
      values['grace_ends_at'] = extra.graceEndsAt;
    }

    await this.db.updateTable('slot_rentals').set(values).where('id', '=', id).execute();
  }
}

function toRecord(row: {
  id: string;
  slot_id: string;
  machine_id?: string;
  brand_id: string;
  fragrance_product_id: string | null;
  product_assigned_at: Date | null;
  request_id: string | null;
  previous_rental_id: string | null;
  status: string;
  starts_at: Date;
  ends_at: Date;
  grace_ends_at: Date | null;
  price_per_spray: string | number;
  currency: string;
  fixed_fee: string | number;
  revenue_share_percent: string | number;
  terminated_reason: string | null;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}): SlotRentalRecord {
  return {
    id: row.id,
    slotId: row.slot_id,
    machineId: row.machine_id,
    brandId: row.brand_id,
    fragranceProductId: row.fragrance_product_id,
    productAssignedAt: row.product_assigned_at ? new Date(row.product_assigned_at) : null,
    requestId: row.request_id,
    previousRentalId: row.previous_rental_id,
    status: row.status as SlotRentalStatus,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    graceEndsAt: row.grace_ends_at ? new Date(row.grace_ends_at) : null,
    pricePerSpray: String(row.price_per_spray),
    currency: row.currency,
    fixedFee: String(row.fixed_fee),
    revenueSharePercent: Number(row.revenue_share_percent),
    terminatedReason: row.terminated_reason,
    createdBy: row.created_by,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}
