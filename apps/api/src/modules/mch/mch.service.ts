/**
 * Nghiệp vụ quản lý Máy, Slot và Địa điểm (module MCH).
 * Tuân thủ quy ước kiến trúc ADR-0003, ràng buộc BR-003, BR-012 và FR-MCH-01..17.
 */

import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { DEFAULT_LOCALE, translate } from '@scentstation/i18n';
import { AuditService } from '../../shared/audit/index.js';
import { AppError, invalidField } from '../../shared/errors/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  MchQueries,
  type AvailableSlotFilter,
  type AvailableSlotRecord,
  type DeviceCredentialRecord,
  type MachineStatusHistoryFilter,
  type MachineStatusHistoryRecord,
  type LocationFilter,
  type LocationRecord,
  type MachineFilter,
  type MachineRecord,
  type MachineSlotRecord,
} from './mch.queries.js';

export type LocationDto = Schema<'Location'>;
// openapi có `default` cho timezone nên kiểu sinh ra đánh dấu bắt buộc; service tự điền mặc định.
export type LocationCreateInput = Omit<Schema<'LocationCreate'>, 'timezone'> & {
  timezone?: string | undefined;
};
export type MachineDto = Schema<'Machine'>;
export type MachineCreateInput = Schema<'MachineCreate'>;
export type MachineSlotDto = Schema<'MachineSlot'>;
export type AvailableSlotDto = Schema<'AvailableSlot'>;
export type SlotConfigUpdateInput = Schema<'SlotConfigUpdate'>;
export type MachineModeUpdateInput = Schema<'MachineModeUpdate'>;
export type MachineStatusHistoryEntryDto = Schema<'MachineStatusHistoryEntry'>;
export type DeviceCredentialDto = Schema<'DeviceCredential'>;
export type DeviceCredentialIssuedDto = Schema<'DeviceCredentialIssued'>;

type Audit = Pick<AuditService, 'log'>;

function toLocationDto(r: LocationRecord): LocationDto {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    address: r.address,
    timezone: r.timezone,
    status: r.status as 'ACTIVE' | 'INACTIVE',
  };
}

function toMachineDto(r: MachineRecord): MachineDto {
  return {
    id: r.id,
    locationId: r.locationId,
    serialNumber: r.serialNumber,
    displayName: r.displayName,
    status: r.status,
    operatingMode: r.operatingMode,
    lastSeenAt: r.lastSeenAt ? r.lastSeenAt.toISOString() : null,
    firmwareVersion: r.firmwareVersion,
    configurationVersion: r.configurationVersion,
    slotCount: r.slotCount,
  };
}

function toSlotDto(r: MachineSlotRecord): MachineSlotDto {
  return {
    id: r.id,
    machineId: r.machineId,
    slotNumber: r.slotNumber,
    status: r.status,
    calibratedDosageMl: r.calibratedDosageMl,
    lowStockThresholdMl: r.lowStockThresholdMl,
    estimatedRemainingMl: r.estimatedRemainingMl,
    estimatedRemainingSprays: r.estimatedRemainingSprays,
    activeBottleId: r.activeBottleId,
    currentRentalId: r.currentRentalId,
  };
}

function toAvailableSlotDto(r: AvailableSlotRecord): AvailableSlotDto {
  return {
    slotId: r.slotId,
    machineId: r.machineId,
    machineDisplayName: r.machineDisplayName,
    slotNumber: r.slotNumber,
    locationId: r.locationId,
    locationName: r.locationName,
  };
}

/** Giá trị `source` hợp lệ theo openapi.yaml (MachineStatusHistoryEntry.source). */
const HISTORY_SOURCES = ['HEARTBEAT', 'OPERATOR', 'SYSTEM'] as const;
type HistorySource = (typeof HISTORY_SOURCES)[number];

/**
 * `machine_status_histories.source` là `varchar(30)` nên CSDL không chặn giá trị lạ, trong khi
 * contract chỉ nhận ba giá trị. Bản ghi cũ từng được ghi bằng `'API'` (sai contract, đã sửa ở
 * `mch.queries.ts`); quy về `SYSTEM` để endpoint không trả ra giá trị ngoài enum.
 */
function toHistorySource(raw: string): HistorySource {
  return (HISTORY_SOURCES as readonly string[]).includes(raw) ? (raw as HistorySource) : 'SYSTEM';
}

function toStatusHistoryDto(r: MachineStatusHistoryRecord): MachineStatusHistoryEntryDto {
  return {
    id: r.id,
    fromConnectionStatus: r.fromConnectionStatus,
    toConnectionStatus: r.toConnectionStatus,
    fromOperatingMode: r.fromOperatingMode,
    toOperatingMode: r.toOperatingMode,
    reason: r.reason,
    source: toHistorySource(r.source),
    changedBy: r.changedBy,
    occurredAt: r.occurredAt.toISOString(),
  };
}

function toCredentialDto(r: DeviceCredentialRecord): DeviceCredentialDto {
  return {
    id: r.id,
    machineId: r.machineId,
    credentialIdentifier: r.credentialIdentifier,
    status: r.status,
    issuedAt: r.issuedAt.toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    lastAuthenticatedAt: r.lastAuthenticatedAt ? r.lastAuthenticatedAt.toISOString() : null,
  };
}

@Injectable()
export class MchService {
  constructor(
    @Inject(MchQueries) private readonly queries: MchQueries,
    @Inject(AuditService) private readonly audit: Audit,
  ) {}

  // =========================================================================
  // LOCATIONS
  // =========================================================================

  async listLocations(filter: LocationFilter): Promise<{ items: LocationDto[]; total: number }> {
    const { items, total } = await this.queries.listLocations(filter);
    return { items: items.map(toLocationDto), total };
  }

  async getLocation(id: string): Promise<LocationDto> {
    const record = await this.queries.findLocationById(id);
    if (!record) {
      throw new AppError('NOT_FOUND', 'mch.locationNotFound');
    }
    return toLocationDto(record);
  }

  async createLocation(input: LocationCreateInput): Promise<LocationDto> {
    const existing = await this.queries.findLocationByCode(input.code);
    if (existing) {
      throw new AppError('VALIDATION_ERROR', 'mch.locationCodeTaken', { code: input.code });
    }

    const created = await this.queries.createLocation({
      code: input.code,
      name: input.name,
      address: input.address ?? null,
      timezone: input.timezone ?? 'Asia/Ho_Chi_Minh',
    });
    return toLocationDto(created);
  }

  async updateLocation(
    id: string,
    input: Partial<LocationCreateInput> & { status?: string },
  ): Promise<LocationDto> {
    const existing = await this.queries.findLocationById(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'mch.locationNotFound');
    }

    const updated = await this.queries.updateLocation(id, {
      name: input.name,
      address: input.address,
      timezone: input.timezone,
      status: input.status,
    });
    if (!updated) {
      throw new AppError('NOT_FOUND', 'mch.locationNotFound');
    }
    return toLocationDto(updated);
  }

  /**
   * Xóa mềm địa điểm: chuyển trạng thái sang INACTIVE.
   */
  async softDeleteLocation(id: string): Promise<LocationDto> {
    const existing = await this.queries.findLocationById(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'mch.locationNotFound');
    }

    const updated = await this.queries.updateLocation(id, { status: 'INACTIVE' });
    if (!updated) {
      throw new AppError('NOT_FOUND', 'mch.locationNotFound');
    }
    return toLocationDto(updated);
  }

  // =========================================================================
  // MACHINES
  // =========================================================================

  async listMachines(filter: MachineFilter): Promise<{ items: MachineDto[]; total: number }> {
    const { items, total } = await this.queries.listMachines(filter);
    return { items: items.map(toMachineDto), total };
  }

  async getMachine(id: string): Promise<MachineDto> {
    const record = await this.queries.findMachineById(id);
    if (!record) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }
    return toMachineDto(record);
  }

  /**
   * Đăng ký máy mới (FR-MCH-01, FR-MCH-04, FR-MCH-05):
   * Gán địa điểm hợp lệ và tự động sinh số slot theo slotCount.
   */
  async createMachine(actor: AuthenticatedUser, input: MachineCreateInput): Promise<MachineDto> {
    const location = await this.queries.findLocationById(input.locationId);
    if (!location || location.status !== 'ACTIVE') {
      throw new AppError('VALIDATION_ERROR', 'mch.locationInactive');
    }

    const existingSerial = await this.queries.findMachineBySerialNumber(input.serialNumber);
    if (existingSerial) {
      throw new AppError('VALIDATION_ERROR', 'mch.serialTaken', {
        serialNumber: input.serialNumber,
      });
    }

    if (input.slotCount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'mch.slotCountPositive');
    }

    const created = await this.queries.createMachineWithSlots({
      locationId: input.locationId,
      serialNumber: input.serialNumber,
      displayName: input.displayName,
      slotCount: input.slotCount,
    });

    return toMachineDto(created);
  }

  async updateMachine(
    id: string,
    input: { displayName?: string; locationId?: string },
  ): Promise<MachineDto> {
    const machine = await this.queries.findMachineById(id);
    if (!machine) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }

    if (input.locationId) {
      const location = await this.queries.findLocationById(input.locationId);
      if (!location || location.status !== 'ACTIVE') {
        throw new AppError('VALIDATION_ERROR', 'mch.newLocationInactive');
      }
    }

    const updated = await this.queries.updateMachine(id, input);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }
    return toMachineDto(updated);
  }

  /**
   * Đổi chế độ hoạt động của máy (FR-MCH-11, FR-MNT-05, FR-MNT-12).
   */
  async setMachineMode(
    actor: AuthenticatedUser,
    id: string,
    input: MachineModeUpdateInput,
  ): Promise<MachineDto> {
    const machine = await this.queries.findMachineById(id);
    if (!machine) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }

    const updated = await this.queries.updateMachineMode(
      id,
      input.operatingMode,
      input.reason,
      actor.userId,
    );
    if (!updated) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mch.machine.mode_changed',
      targetType: 'machine',
      targetId: id,
      // Tắt máy hoặc đưa vào bảo trì ảnh hưởng mọi thương hiệu có slot trên máy.
      severity: input.operatingMode === 'NORMAL' ? 'INFO' : 'WARNING',
      before: { operatingMode: machine.operatingMode },
      after: { operatingMode: updated.operatingMode },
      metadata: { reason: input.reason ?? null },
    });
    return toMachineDto(updated);
  }

  /**
   * Xóa mềm máy: chuyển operating_mode sang DISABLED.
   */
  async softDeleteMachine(
    actor: AuthenticatedUser,
    id: string,
    reason?: string,
  ): Promise<MachineDto> {
    return this.setMachineMode(actor, id, {
      operatingMode: 'DISABLED',
      reason: reason ?? 'Xóa mềm máy',
    });
  }

  // =========================================================================
  // LỊCH SỬ TRẠNG THÁI MÁY (FR-MCH-13)
  // =========================================================================

  async listStatusHistory(
    machineId: string,
    filter: MachineStatusHistoryFilter,
  ): Promise<{ items: MachineStatusHistoryEntryDto[]; total: number }> {
    const machine = await this.queries.findMachineById(machineId);
    if (!machine) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }

    const { items, total } = await this.queries.listStatusHistory(machineId, filter);
    return { items: items.map(toStatusHistoryDto), total };
  }

  // =========================================================================
  // CREDENTIAL THIẾT BỊ (FR-MCH-02, FR-AUTH-11, FR-IOT-08)
  // =========================================================================

  /** Chỉ metadata. Bí mật gốc không tồn tại ở đây để mà lộ (NFR-SEC-05). */
  async getDeviceCredential(machineId: string): Promise<DeviceCredentialDto> {
    await this.requireMachine(machineId);

    const credential = await this.queries.findCredentialByMachineId(machineId);
    if (!credential) {
      throw new AppError('NOT_FOUND', 'mch.credentialNotIssued');
    }
    return toCredentialDto(credential);
  }

  /**
   * Cấp hoặc cấp lại credential MQTT của máy (FR-MCH-02, NFR-SEC-07).
   *
   * Bí mật gốc chỉ tồn tại trong phản hồi này — CSDL chỉ giữ bản băm, nên không có đường lấy lại.
   * Cấp lại ghi đè bộ cũ, tức thu hồi và cấp mới diễn ra trong một thao tác.
   *
   * Định danh giữ nguyên theo số sê-ri: broker dùng nó làm client id, đổi mỗi lần xoay khóa sẽ làm
   * hỏng ACL đang cấu hình. Thứ xoay là bí mật, không phải định danh.
   */
  async issueDeviceCredential(
    actor: AuthenticatedUser,
    machineId: string,
  ): Promise<DeviceCredentialIssuedDto> {
    const machine = await this.requireMachine(machineId);
    const previous = await this.queries.findCredentialByMachineId(machineId);

    const secret = randomBytes(32).toString('base64url');
    const issued = await this.queries.upsertCredential({
      machineId,
      credentialIdentifier: `machine-${machine.serialNumber}`,
      secretHash: createHash('sha256').update(secret).digest('hex'),
    });

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mch.machine.credential_issued',
      targetType: 'machine',
      targetId: machineId,
      // Xoay khóa làm thiết bị đang chạy mất kết nối cho tới khi nạp bí mật mới.
      severity: 'WARNING',
      before: previous
        ? { status: previous.status, issuedAt: previous.issuedAt.toISOString() }
        : null,
      after: { status: issued.status, issuedAt: issued.issuedAt.toISOString() },
    });

    return { ...toCredentialDto(issued), secret };
  }

  /** Thu hồi credential: broker từ chối kết nối từ thiết bị này ngay sau đó (FR-IOT-08). */
  async revokeDeviceCredential(actor: AuthenticatedUser, machineId: string): Promise<void> {
    await this.requireMachine(machineId);

    const previous = await this.queries.findCredentialByMachineId(machineId);
    const revoked = await this.queries.revokeCredential(machineId);
    if (!revoked) {
      throw new AppError('NOT_FOUND', 'mch.credentialNotIssued');
    }

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mch.machine.credential_revoked',
      targetType: 'machine',
      targetId: machineId,
      severity: 'HIGH',
      before: previous ? { status: previous.status } : null,
      after: { status: revoked.status },
    });
  }

  private async requireMachine(machineId: string): Promise<MachineRecord> {
    const machine = await this.queries.findMachineById(machineId);
    if (!machine) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }
    return machine;
  }

  // =========================================================================
  // MACHINE SLOTS
  // =========================================================================

  async listSlotsByMachine(machineId: string): Promise<MachineSlotDto[]> {
    const machine = await this.queries.findMachineById(machineId);
    if (!machine) {
      throw new AppError('NOT_FOUND', 'mch.machineNotFound');
    }
    const slots = await this.queries.listSlotsByMachineId(machineId);
    return slots.map(toSlotDto);
  }

  async getSlot(id: string): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'mch.slotNotFound');
    }
    return toSlotDto(slot);
  }

  /**
   * Cấu hình liều lượng và ngưỡng cảnh báo sắp hết (FR-MCH-06).
   * TODO: đẩy cấu hình xuống thiết bị qua topic config khi có cửa vào MQTT (spec/contracts/mqtt.md).
   */
  async updateSlotConfig(
    actor: AuthenticatedUser,
    id: string,
    input: SlotConfigUpdateInput,
  ): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'mch.slotNotFound');
    }

    if (input.calibratedDosageMl !== undefined && input.calibratedDosageMl <= 0) {
      throw new AppError('VALIDATION_ERROR', 'mch.dosagePositive');
    }
    if (input.lowStockThresholdMl !== undefined && input.lowStockThresholdMl < 0) {
      throw new AppError('VALIDATION_ERROR', 'mch.thresholdNonNegative');
    }

    const updated = await this.queries.updateSlotConfig(id, input);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'mch.slotNotFound');
    }

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mch.slot.config_updated',
      targetType: 'machine_slot',
      targetId: id,
      before: {
        calibratedDosageMl: slot.calibratedDosageMl,
        lowStockThresholdMl: slot.lowStockThresholdMl,
      },
      after: {
        calibratedDosageMl: updated.calibratedDosageMl,
        lowStockThresholdMl: updated.lowStockThresholdMl,
      },
    });
    return toSlotDto(updated);
  }

  /**
   * Bật hoặc tắt slot từ xa (FR-MCH-12, FR-MCH-17).
   *
   * Chỉ chuyển giữa AVAILABLE ↔ UNAVAILABLE. Slot đang MAINTENANCE/DISABLED không bật được bằng
   * endpoint này — bật lại sẽ âm thầm bỏ qua quy trình bảo trì. Gọi lặp lại cùng trạng thái thì trả
   * về như cũ. Tắt slot đang có hợp đồng vẫn cho phép (ops cần xử lý sự cố) nhưng ghi WARNING.
   */
  async setSlotEnabled(
    actor: AuthenticatedUser,
    id: string,
    enabled: boolean,
    reason?: string,
  ): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'mch.slotNotFound');
    }

    if (enabled) {
      if (slot.status === 'AVAILABLE') return toSlotDto(slot);
      if (slot.status !== 'UNAVAILABLE') {
        throw invalidField('enabled', 'mch.slotNotDirectlyEnableable', {
          status: translate(DEFAULT_LOCALE, `slotStatus.${slot.status}`),
        });
      }
      const machine = await this.queries.findMachineById(slot.machineId);
      if (!machine || machine.operatingMode === 'DISABLED') {
        throw invalidField('enabled', 'mch.machineDisabledCannotEnableSlot');
      }
    } else if (slot.status !== 'AVAILABLE') {
      return toSlotDto(slot);
    }

    const newStatus = enabled ? 'AVAILABLE' : 'UNAVAILABLE';
    const updated = await this.changeSlotStatus(slot, newStatus);

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: enabled ? 'mch.slot.enabled' : 'mch.slot.disabled',
      targetType: 'machine_slot',
      targetId: id,
      severity: !enabled && slot.currentRentalId ? 'WARNING' : 'INFO',
      before: { status: slot.status },
      after: { status: updated.status },
      metadata: { reason: reason ?? null, currentRentalId: slot.currentRentalId },
    });
    return toSlotDto(updated);
  }

  /**
   * Xóa mềm slot: chuyển trạng thái sang DISABLED.
   * Không cho xóa slot đang có hợp đồng thuê (SLOT_OCCUPIED).
   */
  async softDeleteSlot(actor: AuthenticatedUser, id: string): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'mch.slotNotFound');
    }
    if (slot.currentRentalId) {
      throw new AppError('SLOT_OCCUPIED', 'mch.slotOccupied');
    }
    if (slot.status === 'DISABLED') return toSlotDto(slot);

    const updated = await this.changeSlotStatus(slot, 'DISABLED');

    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'mch.slot.deleted',
      targetType: 'machine_slot',
      targetId: id,
      severity: 'WARNING',
      before: { status: slot.status },
      after: { status: updated.status },
    });
    return toSlotDto(updated);
  }

  /**
   * Danh sách slot thuê được trên toàn hệ thống, lọc theo máy/địa điểm (FR-SLT-19).
   */
  async listAvailableSlots(
    filter: AvailableSlotFilter,
  ): Promise<{ items: AvailableSlotDto[]; total: number }> {
    const { items, total } = await this.queries.listAvailableSlots(filter);
    return { items: items.map(toAvailableSlotDto), total };
  }

  private async changeSlotStatus(
    slot: MachineSlotRecord,
    status: 'AVAILABLE' | 'UNAVAILABLE' | 'DISABLED',
  ): Promise<MachineSlotRecord> {
    const updated = await this.queries.updateSlotStatus(slot.id, status, slot.version);
    if (!updated) {
      // Slot đã bị một thao tác khác đổi giữa lúc đọc và lúc ghi (khóa lạc quan theo version).
      throw invalidField('id', 'mch.slotChangedConcurrently');
    }
    return updated;
  }
}
