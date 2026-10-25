/**
 * Đổi chế độ hoạt động của máy (FR-MCH-11, FR-MNT-05, FR-MNT-17; ADR-0015, ADR-0017 mục 6).
 *
 * Tách khỏi `MchService` vì phải điều phối ba module khác: DSP (máy DRAINING hết việc thì sang
 * MAINTENANCE), ORD (đơn bị ảnh hưởng khi ép bảo trì) và ALR (thông báo thương hiệu). MCH không tự
 * ghi bảng `orders` — mọi đổi trạng thái đơn đi qua state machine của ORD.
 *
 *   yêu cầu MAINTENANCE ─tx─▶ DRAINING ──▶ DSP.completeDraining: máy rảnh thì sang MAINTENANCE ngay
 *   ép MAINTENANCE      ─tx─▶ MAINTENANCE + đơn PAID chờ lượt FAILED + cảnh báo + thông báo
 *                       ────▶ hủy link các đơn chờ thanh toán (ngoài tx, gọi cổng)
 */

import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import { AuditService } from '../../shared/audit/index.js';
import { CLOCK, type Clock } from '../../shared/clock.js';
import { AppError } from '../../shared/errors/index.js';
import { AlrService } from '../alr/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import { DspService } from '../dsp/index.js';
import { OrdService } from '../ord/index.js';
import { MchQueries } from './mch.queries.js';
import { MchService, type MachineDto } from './mch.service.js';

export type MachineModeUpdateInput = Schema<'MachineModeUpdate'>;

@Injectable()
export class MachineModeService {
  private readonly logger = new Logger(MachineModeService.name);

  constructor(
    @Inject(MchQueries) private readonly queries: MchQueries,
    @Inject(MchService) private readonly machines: MchService,
    @Inject(OrdService) private readonly orders: OrdService,
    @Inject(DspService) private readonly dsp: DspService,
    @Inject(AlrService) private readonly alr: AlrService,
    @Inject(AuditService) private readonly audit: AuditService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async setMode(
    actor: AuthenticatedUser,
    id: string,
    input: MachineModeUpdateInput,
  ): Promise<MachineDto> {
    // DRAINING chỉ là bước trung gian của yêu cầu MAINTENANCE (openapi `MachineModeUpdate`).
    if (input.operatingMode === 'DRAINING') {
      throw new AppError('VALIDATION_ERROR', 'mch.drainingDirectSetForbidden');
    }
    const reason = input.reason?.trim() || null;
    const force = input.operatingMode === 'MAINTENANCE' && input.force === true;
    if (force && !reason) throw new AppError('REASON_REQUIRED', 'mch.reasonRequired');

    if (force) return this.forceMaintenance(actor, id, reason!);

    const requested = input.operatingMode;
    const change = await this.queries.transaction(async (tx) => {
      // Yêu cầu MAINTENANCE đi qua DRAINING; máy đã MAINTENANCE (hoặc đang DRAINING) thì giữ nguyên.
      const changed = await this.queries.changeMode(
        id,
        (current) =>
          requested !== 'MAINTENANCE'
            ? requested
            : current === 'MAINTENANCE' || current === 'DRAINING'
              ? current
              : 'DRAINING',
        reason,
        actor.userId,
        tx,
      );
      if (changed === null) throw new AppError('NOT_FOUND', 'mch.machineNotFound');
      if (changed.before === changed.after) return changed;
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          action: 'mch.machine.mode_changed',
          targetType: 'machine',
          targetId: id,
          // Tắt máy hoặc đưa vào bảo trì ảnh hưởng mọi thương hiệu có slot trên máy.
          severity: changed.after === 'NORMAL' ? 'INFO' : 'WARNING',
          before: { operatingMode: changed.before },
          after: { operatingMode: changed.after },
          metadata: { reason, force: false },
        },
        tx,
      );
      return changed;
    });

    // FR-MNT-05 AC3: máy đã rảnh thì sang MAINTENANCE ngay — DSP xét đúng một điều kiện "cạn việc"
    // (lệnh CUSTOMER, đơn chờ thanh toán, đơn chờ lượt) và gửi thông báo FR-MNT-07.
    if (change.after === 'DRAINING' && change.before !== 'DRAINING')
      await this.dsp.completeDraining();
    return this.machines.getMachine(id);
  }

  /** Xóa mềm máy (FR-MCH-11): chuyển DISABLED. */
  softDelete(actor: AuthenticatedUser, id: string, reason?: string): Promise<MachineDto> {
    return this.setMode(actor, id, { operatingMode: 'DISABLED', reason: reason ?? 'Xóa mềm máy' });
  }

  /** FR-MNT-17: chuyển MAINTENANCE ngay, không chờ phục vụ nốt. */
  private async forceMaintenance(
    actor: AuthenticatedUser,
    id: string,
    reason: string,
  ): Promise<MachineDto> {
    const failedOrders = await this.queries.transaction(async (tx) => {
      const changed = await this.queries.changeMode(
        id,
        () => 'MAINTENANCE',
        reason,
        actor.userId,
        tx,
      );
      if (changed === null) throw new AppError('NOT_FOUND', 'mch.machineNotFound');

      const failed = await this.orders.failQueuedOrdersOnMachine(tx, id);
      const machine = await this.machines.getMachine(id);
      const now = this.clock.now();
      await this.queries.insertForcedMaintenanceAlert(
        id,
        {
          title: translate(DEFAULT_LOCALE, 'mch.forcedMaintenanceAlertTitle', {
            machine: machine.displayName,
          }),
          description: reason,
          at: now,
        },
        tx,
      );
      const params = { machine: machine.displayName };
      for (const brandId of await this.queries.listBrandsOnMachine(id, tx)) {
        await this.alr.notifyBrandAdmins(
          tx,
          {
            brandId,
            type: 'MACHINE_MAINTENANCE',
            subject: translate(DEFAULT_LOCALE, 'dsp.maintenanceSubject', params),
            content: translate(DEFAULT_LOCALE, 'dsp.maintenanceContent', params),
            referenceId: id,
            at: now,
          },
          ['IN_APP'],
        );
      }
      await this.audit.log(
        {
          actorType: 'USER',
          actorId: actor.userId,
          action: 'mch.machine.mode_changed',
          targetType: 'machine',
          targetId: id,
          severity: 'HIGH',
          before: { operatingMode: changed.before },
          after: { operatingMode: 'MAINTENANCE' },
          metadata: { reason, force: true, failedQueuedOrders: failed },
        },
        tx,
      );
      return failed;
    });

    // Máy đã MAINTENANCE và ORD khóa dòng máy khi tạo đơn, nên không còn đơn mới chen vào.
    const cancelled = await this.orders.cancelUnpaidOrdersOnMachine(id, actor.userId);
    this.logger.warn(
      `Máy ${id} bị ép bảo trì: ${failedOrders} đơn chờ lượt FAILED, ${cancelled} đơn chờ thanh toán đã hủy`,
    );
    return this.machines.getMachine(id);
  }
}
