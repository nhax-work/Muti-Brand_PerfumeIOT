/**
 * Bảng giá thuê slot do Platform Super Admin cấu hình (FR-SLT-30..32, ADR-0006).
 *
 * Giá trong bảng này KHÔNG được hóa đơn đọc lại: lúc tạo hóa đơn, giá được chụp vào `slot_rentals`
 * (FR-SLT-33). Sửa hay ngừng mở bán một gói vì thế không ảnh hưởng hóa đơn đã tạo.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AuditService } from '../../shared/audit/index.js';
import { invalidField, notFoundFor } from '../../shared/errors/index.js';
import { hasPermission } from '../../shared/scoping/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { MchService } from '../mch/index.js';
import {
  CatalogQueries,
  type RentalPackageChanges,
  type RentalPackageRow,
  type StoragePlanChanges,
  type StoragePlanRow,
  type StoragePlanValues,
} from './catalog.queries.js';

type RentalPackage = Schema<'RentalPackage'>;
type StoragePlan = Schema<'StoragePlan'>;
type MachineSlot = Schema<'MachineSlot'>;

/** Quyền quản lý bảng giá — chỉ Platform Super Admin có (scripts/seed.ts). */
export const CATALOG_MANAGE = 'rental.manage';

@Injectable()
export class CatalogService {
  constructor(
    @Inject(CatalogQueries) private readonly queries: CatalogQueries,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(MchService) private readonly machines: MchService,
  ) {}

  // -----------------------------------------------------------------------------------
  // Gói thuê (FR-SLT-30)
  // -----------------------------------------------------------------------------------

  /** Super Admin thấy mọi gói (lọc được theo `isActive`); người khác chỉ thấy gói đang mở bán. */
  async listPackages(actor: AuthenticatedUser, isActive?: boolean): Promise<RentalPackage[]> {
    const rows = await this.queries.listPackages(this.visibleFilter(actor, isActive));
    return this.canSeeInactive(actor, isActive) ? rows.map(toPackageDto) : [];
  }

  async createPackage(
    actor: AuthenticatedUser,
    input: { name: string; durationMonths: number; discountPercent: number },
  ): Promise<RentalPackage> {
    const row = await this.uniqueName(
      () => this.queries.insertPackage(input),
      'slt.packageNameTaken',
    );
    const dto = toPackageDto(row);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.rental_package.created',
      targetType: 'RentalPackage',
      targetId: dto.id,
      after: dto,
    });
    return dto;
  }

  async updatePackage(
    actor: AuthenticatedUser,
    id: string,
    changes: RentalPackageChanges,
  ): Promise<RentalPackage> {
    const before = await this.queries.findPackage(id);
    if (!before) throw notFoundFor(actor);
    const row = await this.uniqueName(
      () => this.queries.updatePackage(id, changes),
      'slt.packageNameTaken',
    );
    if (!row) throw notFoundFor(actor);
    const dto = toPackageDto(row);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.rental_package.updated',
      targetType: 'RentalPackage',
      targetId: id,
      before: toPackageDto(before),
      after: dto,
    });
    return dto;
  }

  // -----------------------------------------------------------------------------------
  // Gói bảo quản (FR-SLT-31)
  // -----------------------------------------------------------------------------------

  async listPlans(actor: AuthenticatedUser, isActive?: boolean): Promise<StoragePlan[]> {
    const rows = await this.queries.listPlans(this.visibleFilter(actor, isActive));
    return this.canSeeInactive(actor, isActive) ? rows.map(toPlanDto) : [];
  }

  async createPlan(actor: AuthenticatedUser, input: StoragePlanValues): Promise<StoragePlan> {
    const row = await this.uniqueName(
      () => this.queries.insertPlan(input),
      'slt.storagePlanNameTaken',
    );
    const dto = toPlanDto(row);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.storage_plan.created',
      targetType: 'StoragePlan',
      targetId: dto.id,
      after: dto,
    });
    return dto;
  }

  /** AC3: gói bảo quản là bắt buộc nên luôn phải còn ít nhất một gói đang mở bán. */
  async updatePlan(
    actor: AuthenticatedUser,
    id: string,
    changes: StoragePlanChanges,
  ): Promise<StoragePlan> {
    const { before, after } = await this.uniqueName(
      () =>
        this.queries.transaction(async (tx) => {
          const current = await this.queries.lockPlan(id, tx);
          if (!current) throw notFoundFor(actor);
          if (changes.isActive === false && current.is_active) {
            const activeIds = await this.queries.lockActivePlanIds(tx);
            if (activeIds.filter((other) => other !== id).length === 0) {
              throw invalidField('isActive', 'slt.lastActiveStoragePlan');
            }
          }
          return { before: current, after: await this.queries.updatePlan(id, changes, tx) };
        }),
      'slt.storagePlanNameTaken',
    );
    const dto = toPlanDto(after);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.storage_plan.updated',
      targetType: 'StoragePlan',
      targetId: id,
      before: toPlanDto(before),
      after: dto,
    });
    return dto;
  }

  // -----------------------------------------------------------------------------------
  // Giá niêm yết slot (FR-SLT-32)
  // -----------------------------------------------------------------------------------

  /** `null` đóng slot khỏi danh sách cho thuê (FR-SLT-19 AC3). Không đổi hóa đơn đã có (FR-SLT-33). */
  async setSlotRentPrice(
    actor: AuthenticatedUser,
    slotId: string,
    monthlyRentPrice: string | null,
  ): Promise<MachineSlot> {
    const changed = await this.queries.setSlotRentPrice(slotId, monthlyRentPrice);
    if (!changed) throw notFoundFor(actor);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'slt.slot.rent_price_set',
      targetType: 'MachineSlot',
      targetId: slotId,
      before: { monthlyRentPrice: changed.before },
      after: { monthlyRentPrice },
    });
    return this.machines.getSlot(slotId);
  }

  // -----------------------------------------------------------------------------------

  private canManage(actor: AuthenticatedUser): boolean {
    return hasPermission(actor, CATALOG_MANAGE);
  }

  /** Người không quản lý bảng giá luôn bị ép về `isActive = true`. */
  private visibleFilter(actor: AuthenticatedUser, isActive?: boolean): boolean | undefined {
    return this.canManage(actor) ? isActive : true;
  }

  /** Người không quản lý hỏi gói ĐÃ NGỪNG mở bán thì nhận danh sách rỗng, không lộ gì. */
  private canSeeInactive(actor: AuthenticatedUser, isActive?: boolean): boolean {
    return this.canManage(actor) || isActive !== false;
  }

  /** Tên gói là duy nhất (uq_rental_package_name, uq_storage_plan_name). */
  private async uniqueName<T>(
    work: () => Promise<T>,
    key: 'slt.packageNameTaken' | 'slt.storagePlanNameTaken',
  ): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw invalidField('name', key);
      throw error;
    }
  }
}

export function toPackageDto(row: RentalPackageRow): RentalPackage {
  return {
    id: row.id,
    name: row.name,
    durationMonths: row.duration_months,
    discountPercent: Number(row.discount_percent),
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}

export function toPlanDto(row: StoragePlanRow): StoragePlan {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    monthlyPrice: row.monthly_price,
    currency: row.currency,
    coveragePercent: Number(row.coverage_percent),
    coverageCap: row.coverage_cap,
    isActive: row.is_active,
    createdAt: row.created_at.toISOString(),
  };
}
