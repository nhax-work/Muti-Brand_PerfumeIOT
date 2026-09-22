/**
 * Nghiệp vụ quản lý Máy, Slot và Địa điểm (module MCH).
 * Tuân thủ quy ước kiến trúc ADR-0003, ràng buộc BR-003, BR-012 và FR-MCH-01..17.
 */

import { Inject, Injectable } from '@nestjs/common';
import type { Schema } from '@scentstation/contracts';
import { AppError } from '../../shared/errors/index.js';
import type { AuthenticatedUser } from '../auth/index.js';
import {
  MchQueries,
  type LocationFilter,
  type LocationRecord,
  type MachineFilter,
  type MachineRecord,
  type MachineSlotRecord,
} from './mch.queries.js';

export type LocationDto = Schema<'Location'>;
export type LocationCreateInput = Schema<'LocationCreate'>;
export type MachineDto = Schema<'Machine'>;
export type MachineCreateInput = Schema<'MachineCreate'>;
export type MachineSlotDto = Schema<'MachineSlot'>;
export type SlotConfigUpdateInput = Schema<'SlotConfigUpdate'>;
export type MachineModeUpdateInput = Schema<'MachineModeUpdate'>;

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

@Injectable()
export class MchService {
  constructor(@Inject(MchQueries) private readonly queries: MchQueries) {}

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
      throw new AppError('NOT_FOUND', 'Không tìm thấy địa điểm');
    }
    return toLocationDto(record);
  }

  async createLocation(input: LocationCreateInput): Promise<LocationDto> {
    const existing = await this.queries.findLocationByCode(input.code);
    if (existing) {
      throw new AppError('VALIDATION_ERROR', `Mã địa điểm "${input.code}" đã được sử dụng`);
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
      throw new AppError('NOT_FOUND', 'Không tìm thấy địa điểm');
    }

    const updated = await this.queries.updateLocation(id, {
      name: input.name,
      address: input.address,
      timezone: input.timezone,
      status: input.status,
    });
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy địa điểm');
    }
    return toLocationDto(updated);
  }

  /**
   * Xóa mềm địa điểm: chuyển trạng thái sang INACTIVE.
   */
  async softDeleteLocation(id: string): Promise<LocationDto> {
    const existing = await this.queries.findLocationById(id);
    if (!existing) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy địa điểm');
    }

    const updated = await this.queries.updateLocation(id, { status: 'INACTIVE' });
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy địa điểm');
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
      throw new AppError('NOT_FOUND', 'Không tìm thấy máy');
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
      throw new AppError('VALIDATION_ERROR', 'Địa điểm không tồn tại hoặc không còn hoạt động');
    }

    const existingSerial = await this.queries.findMachineBySerialNumber(input.serialNumber);
    if (existingSerial) {
      throw new AppError('VALIDATION_ERROR', `Số sê-ri "${input.serialNumber}" đã tồn tại`);
    }

    if (input.slotCount <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Số lượng slot phải lớn hơn 0');
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
      throw new AppError('NOT_FOUND', 'Không tìm thấy máy');
    }

    if (input.locationId) {
      const location = await this.queries.findLocationById(input.locationId);
      if (!location || location.status !== 'ACTIVE') {
        throw new AppError(
          'VALIDATION_ERROR',
          'Địa điểm mới không tồn tại hoặc không còn hoạt động',
        );
      }
    }

    const updated = await this.queries.updateMachine(id, input);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy máy');
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
      throw new AppError('NOT_FOUND', 'Không tìm thấy máy');
    }

    const updated = await this.queries.updateMachineMode(
      id,
      input.operatingMode,
      input.reason,
      actor.userId,
    );
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy máy');
    }
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
  // MACHINE SLOTS
  // =========================================================================

  async listSlotsByMachine(machineId: string): Promise<MachineSlotDto[]> {
    const machine = await this.queries.findMachineById(machineId);
    if (!machine) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy máy');
    }
    const slots = await this.queries.listSlotsByMachineId(machineId);
    return slots.map(toSlotDto);
  }

  async getSlot(id: string): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy slot');
    }
    return toSlotDto(slot);
  }

  /**
   * Cấu hình liều lượng và ngưỡng cảnh báo sắp hết (FR-MCH-06).
   */
  async updateSlotConfig(
    actor: AuthenticatedUser,
    id: string,
    input: SlotConfigUpdateInput,
  ): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy slot');
    }

    if (input.calibratedDosageMl !== undefined && input.calibratedDosageMl <= 0) {
      throw new AppError('VALIDATION_ERROR', 'Định lượng xịt phải lớn hơn 0');
    }
    if (input.lowStockThresholdMl !== undefined && input.lowStockThresholdMl < 0) {
      throw new AppError('VALIDATION_ERROR', 'Ngưỡng cảnh báo không được âm');
    }

    const updated = await this.queries.updateSlotConfig(id, input);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy slot');
    }
    return toSlotDto(updated);
  }

  /**
   * Bật hoặc tắt slot từ xa (FR-MCH-12).
   */
  async setSlotEnabled(
    actor: AuthenticatedUser,
    id: string,
    enabled: boolean,
    _reason?: string,
  ): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy slot');
    }

    const newStatus = enabled ? 'AVAILABLE' : 'UNAVAILABLE';
    const updated = await this.queries.updateSlotStatus(id, newStatus);
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy slot');
    }
    return toSlotDto(updated);
  }

  /**
   * Xóa mềm slot: chuyển trạng thái sang DISABLED.
   */
  async softDeleteSlot(actor: AuthenticatedUser, id: string): Promise<MachineSlotDto> {
    const slot = await this.queries.findSlotById(id);
    if (!slot) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy slot');
    }

    const updated = await this.queries.updateSlotStatus(id, 'DISABLED');
    if (!updated) {
      throw new AppError('NOT_FOUND', 'Không tìm thấy slot');
    }
    return toSlotDto(updated);
  }

  /**
   * Danh sách các slot còn trống trên toàn hệ thống (FR-SLT-20).
   */
  async listAvailableSlots(): Promise<MachineSlotDto[]> {
    const slots = await this.queries.listAvailableSlots();
    return slots.map(toSlotDto);
  }
}
