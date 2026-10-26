import { Inject, Injectable } from '@nestjs/common';
import type { components } from '@scentstation/contracts';
import type { Transaction } from 'kysely';
import { DATABASE, type Database, type DB } from '../../shared/db/index.js';
import type { BottleReturnMethod, BottleStatus } from '../../shared/db/types.generated.js';

export type BottleReturnDto = components['schemas']['BottleReturn'];
export type BottleDto = components['schemas']['Bottle'];

export interface BottleReturnFilters {
  readonly brandId?: string;
  readonly open?: boolean;
  readonly page?: number;
  readonly pageSize?: number;
}

export interface RentalForReturnInfo {
  readonly id: string;
  readonly brandId: string;
  readonly slotId: string;
  readonly status: string;
  readonly nonRenewalRequestedAt: Date | null;
  readonly returnMethod: BottleReturnMethod | null;
  readonly brandAddress: string | null;
}

export interface BottleToReturnInput {
  readonly bottleId: string;
  readonly measuredWeightG: number;
}

export interface CreateBottleReturnData {
  readonly slotRentalId: string;
  readonly brandId: string;
  readonly returnMethod: BottleReturnMethod;
  readonly shippingAddress: string | null;
  readonly readyAt: Date;
  readonly pickupDeadline: Date;
  readonly createdBy: string;
  readonly bottles: readonly BottleToReturnInput[];
}

export interface HandoverBottleReturnData {
  readonly recipientName: string;
  readonly handedOverAt: Date;
  readonly handedOverBy: string;
  readonly trackingNumber: string | null;
}

function mapBottleRow(row: Record<string, unknown>): BottleDto {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    owner: (row.owner as BottleDto['owner']) ?? 'BRAND',
    batchId: String(row.batch_id),
    fragranceProductId: row.fragrance_product_id ? String(row.fragrance_product_id) : undefined,
    identifier: String(row.identifier),
    initialVolumeMl: Number(row.initial_volume_ml),
    currentEstimatedMl: Number(row.current_estimated_ml),
    status: row.status as BottleDto['status'],
    installedSlotId: row.installed_slot_id ? String(row.installed_slot_id) : null,
    expiresAt: row.expires_at ? new Date(row.expires_at as string | Date).toISOString() : null,
    sourceRentalId: row.source_rental_id ? String(row.source_rental_id) : null,
    liquidatedAt: row.liquidated_at ? new Date(row.liquidated_at as string | Date).toISOString() : null,
    bottleReturnId: row.bottle_return_id ? String(row.bottle_return_id) : null,
  };
}

function mapReturnRow(
  row: Record<string, unknown>,
  bottles: readonly BottleDto[],
): BottleReturnDto {
  return {
    id: String(row.id),
    slotRentalId: String(row.slot_rental_id),
    brandId: String(row.brand_id),
    returnMethod: row.return_method as BottleReturnMethod,
    shippingAddress: (row.shipping_address as string | null) ?? null,
    readyAt: new Date(row.ready_at as string | Date).toISOString(),
    pickupDeadline: new Date(row.pickup_deadline as string | Date).toISOString(),
    handedOverAt: row.handed_over_at
      ? new Date(row.handed_over_at as string | Date).toISOString()
      : null,
    recipientName: (row.recipient_name as string | null) ?? null,
    trackingNumber: (row.tracking_number as string | null) ?? null,
    forfeitedAt: row.forfeited_at
      ? new Date(row.forfeited_at as string | Date).toISOString()
      : null,
    bottles: [...bottles],
    createdAt: new Date(row.created_at as string | Date).toISOString(),
  };
}

@Injectable()
export class ExpQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async listBottleReturns(
    filters: BottleReturnFilters,
  ): Promise<{ items: BottleReturnDto[]; total: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
    const offset = (page - 1) * pageSize;

    let countQuery = this.db
      .selectFrom('bottle_returns')
      .select((eb) => eb.fn.countAll<string>().as('count'));

    let selectQuery = this.db
      .selectFrom('bottle_returns')
      .selectAll('bottle_returns')
      .orderBy('bottle_returns.created_at', 'desc')
      .limit(pageSize)
      .offset(offset);

    if (filters.brandId) {
      countQuery = countQuery.where('brand_id', '=', filters.brandId);
      selectQuery = selectQuery.where('brand_id', '=', filters.brandId);
    }

    if (filters.open) {
      countQuery = countQuery
        .where('handed_over_at', 'is', null)
        .where('forfeited_at', 'is', null);
      selectQuery = selectQuery
        .where('handed_over_at', 'is', null)
        .where('forfeited_at', 'is', null);
    }

    const [countRes, rows] = await Promise.all([
      countQuery.executeTakeFirst(),
      selectQuery.execute(),
    ]);

    const total = Number(countRes?.count ?? 0);
    if (rows.length === 0) {
      return { items: [], total };
    }

    const returnIds = rows.map((r: { id: string }) => r.id);
    const bottlesRows = await this.db
      .selectFrom('bottles')
      .selectAll('bottles')
      .where('bottle_return_id', 'in', returnIds)
      .execute();

    const bottlesByReturnId = new Map<string, BottleDto[]>();
    for (const b of bottlesRows) {
      const returnId = b.bottle_return_id!;
      const list = bottlesByReturnId.get(returnId) ?? [];
      list.push(mapBottleRow(b as Record<string, unknown>));
      bottlesByReturnId.set(returnId, list);
    }

    const items = rows.map((r: Record<string, unknown>) =>
      mapReturnRow(
        r,
        bottlesByReturnId.get(String(r.id)) ?? [],
      ),
    );

    return { items, total };
  }

  async findBottleReturnById(id: string): Promise<BottleReturnDto | null> {
    const row = await this.db
      .selectFrom('bottle_returns')
      .selectAll('bottle_returns')
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;

    const bottlesRows = await this.db
      .selectFrom('bottles')
      .selectAll('bottles')
      .where('bottle_return_id', '=', id)
      .execute();

    const bottles = bottlesRows.map((b: Record<string, unknown>) => mapBottleRow(b));
    return mapReturnRow(row as Record<string, unknown>, bottles);
  }

  async findRentalForReturn(slotRentalId: string): Promise<RentalForReturnInfo | null> {
    const row = await this.db
      .selectFrom('slot_rentals')
      .innerJoin('brands', 'brands.id', 'slot_rentals.brand_id')
      .select([
        'slot_rentals.id',
        'slot_rentals.brand_id',
        'slot_rentals.slot_id',
        'slot_rentals.status',
        'slot_rentals.non_renewal_requested_at',
        'slot_rentals.return_method',
        'brands.contact_info',
      ])
      .where('slot_rentals.id', '=', slotRentalId)
      .executeTakeFirst();

    if (!row) return null;

    let address: string | null = null;
    if (row.contact_info && typeof row.contact_info === 'object') {
      const ci = row.contact_info as { address?: string };
      if (typeof ci.address === 'string' && ci.address.trim()) {
        address = ci.address.trim();
      }
    }

    return {
      id: row.id,
      brandId: row.brand_id,
      slotId: row.slot_id,
      status: row.status,
      nonRenewalRequestedAt: row.non_renewal_requested_at ? new Date(row.non_renewal_requested_at) : null,
      returnMethod: row.return_method,
      brandAddress: address,
    };
  }

  async findBottlesByIds(bottleIds: readonly string[]) {
    if (bottleIds.length === 0) return [];
    return this.db
      .selectFrom('bottles')
      .selectAll('bottles')
      .where('id', 'in', [...bottleIds])
      .execute();
  }

  async createBottleReturn(data: CreateBottleReturnData): Promise<BottleReturnDto> {
    return this.db.transaction().execute(async (trx: Transaction<DB>) => {
      // 1. Tạo bản ghi bottle_returns
      const [insertedReturn] = await trx
        .insertInto('bottle_returns')
        .values({
          slot_rental_id: data.slotRentalId,
          brand_id: data.brandId,
          return_method: data.returnMethod,
          shipping_address: data.shippingAddress,
          ready_at: data.readyAt,
          pickup_deadline: data.pickupDeadline,
          created_by: data.createdBy,
        })
        .returningAll()
        .execute();

      if (!insertedReturn) {
        throw new Error('Failed to insert bottle return record');
      }

      const returnId = insertedReturn.id;

      // 2. Cập nhật các chai trong phiếu:
      // status = 'RETURNED_TO_BRAND', bottle_return_id = returnId, current_measured_weight_g, removed_at
      for (const item of data.bottles) {
        await trx
          .updateTable('bottles')
          .set({
            status: 'RETURNED_TO_BRAND' as BottleStatus,
            bottle_return_id: returnId,
            current_measured_weight_g: String(item.measuredWeightG),
            removed_at: data.readyAt,
            updated_at: new Date(),
          })
          .where('id', '=', item.bottleId)
          .where('brand_id', '=', data.brandId)
          .execute();
      }

      // 3. Cập nhật slot máy: chuyển status UNAVAILABLE (FR-MCH-17), tháo chai active_bottle_id = null
      // Lấy slotId từ rental
      const rental = await trx
        .selectFrom('slot_rentals')
        .select(['slot_id'])
        .where('id', '=', data.slotRentalId)
        .executeTakeFirst();

      if (rental?.slot_id) {
        await trx
          .updateTable('machine_slots')
          .set({
            status: 'UNAVAILABLE',
            active_bottle_id: null,
            updated_at: new Date(),
          })
          .where('id', '=', rental.slot_id)
          .execute();
      }

      // 4. Cập nhật hóa đơn slot_rentals sang CLOSED
      await trx
        .updateTable('slot_rentals')
        .set({
          status: 'CLOSED',
          updated_at: new Date(),
        })
        .where('id', '=', data.slotRentalId)
        .execute();

      // 5. Lấy danh sách chai đã cập nhật để trả về
      const updatedBottles = await trx
        .selectFrom('bottles')
        .selectAll('bottles')
        .where('bottle_return_id', '=', returnId)
        .execute();

      const bottlesDto = updatedBottles.map((b: Record<string, unknown>) => mapBottleRow(b));
      return mapReturnRow(insertedReturn as Record<string, unknown>, bottlesDto);
    });
  }

  async handOverBottleReturn(
    id: string,
    data: HandoverBottleReturnData,
  ): Promise<BottleReturnDto | null> {
    const updated = await this.db
      .updateTable('bottle_returns')
      .set({
        handed_over_at: data.handedOverAt,
        handed_over_by: data.handedOverBy,
        recipient_name: data.recipientName,
        tracking_number: data.trackingNumber,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .where('handed_over_at', 'is', null)
      .where('forfeited_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    if (!updated) return null;

    const bottles = await this.db
      .selectFrom('bottles')
      .selectAll('bottles')
      .where('bottle_return_id', '=', id)
      .execute();

    return mapReturnRow(
      updated as Record<string, unknown>,
      bottles.map((b: Record<string, unknown>) => mapBottleRow(b)),
    );
  }

  /**
   * Quét các phiếu đến mốc pickup_deadline - 3 ngày chưa gửi email nhắc Brand Admin (FR-EXP-28).
   */
  async findExpiringReturnsForReminder(now: Date) {
    const threshold = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    return this.db
      .selectFrom('bottle_returns')
      .selectAll('bottle_returns')
      .where('handed_over_at', 'is', null)
      .where('forfeited_at', 'is', null)
      .where('reminder_sent_at', 'is', null)
      .where('pickup_deadline', '<=', threshold)
      .execute();
  }

  async markReminderSent(id: string, sentAt: Date): Promise<void> {
    await this.db
      .updateTable('bottle_returns')
      .set({
        reminder_sent_at: sentAt,
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .execute();
  }

  /**
   * Quét các phiếu đã quá pickup_deadline mà chưa nhận (FR-EXP-28).
   */
  async findOverdueReturns(now: Date) {
    return this.db
      .selectFrom('bottle_returns')
      .selectAll('bottle_returns')
      .where('handed_over_at', 'is', null)
      .where('forfeited_at', 'is', null)
      .where('pickup_deadline', '<', now)
      .execute();
  }

  /**
   * Chuyển quyền sở hữu các chai của phiếu quá hạn sang PLATFORM và LIQUIDATED.
   */
  async forfeitBottleReturn(id: string, now: Date): Promise<void> {
    await this.db.transaction().execute(async (trx: Transaction<DB>) => {
      await trx
        .updateTable('bottle_returns')
        .set({
          forfeited_at: now,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .where('handed_over_at', 'is', null)
        .where('forfeited_at', 'is', null)
        .execute();

      await trx
        .updateTable('bottles')
        .set({
          status: 'LIQUIDATED' as BottleStatus,
          owner: 'PLATFORM',
          liquidated_at: now,
          updated_at: new Date(),
        })
        .where('bottle_return_id', '=', id)
        .execute();
    });
  }
}
