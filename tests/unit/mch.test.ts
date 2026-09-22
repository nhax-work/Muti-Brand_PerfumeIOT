/**
 * Unit test cho module MCH — Quản lý Machine, Slot, Location.
 * Phục vụ nghiệp vụ CRUD và Soft Delete (FR-MCH-01..17).
 */

import 'reflect-metadata';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthenticatedUser } from '../../apps/api/src/modules/auth/principal.loader.js';
import type {
  MachineOperatingMode,
  SlotStatus,
} from '../../apps/api/src/shared/db/types.generated.js';
import {
  MchQueries,
  type LocationFilter,
  type LocationRecord,
  type MachineFilter,
  type MachineRecord,
  type MachineSlotRecord,
} from '../../apps/api/src/modules/mch/mch.queries.js';
import { MchService } from '../../apps/api/src/modules/mch/mch.service.js';
import { AppError } from '../../apps/api/src/shared/errors/index.js';

class FakeMchQueries {
  locations = new Map<string, LocationRecord>();
  machines = new Map<string, MachineRecord>();
  slots = new Map<string, MachineSlotRecord>();
  statusHistories: Array<{ machineId: string; mode: string; actorId?: string }> = [];

  private locSeq = 0;
  private mchSeq = 0;
  private slotSeq = 0;

  // Locations
  async listLocations(filter: LocationFilter) {
    let items = [...this.locations.values()];
    if (filter.status) items = items.filter((l) => l.status === filter.status);
    return { items, total: items.length };
  }

  async findLocationById(id: string) {
    return this.locations.get(id) ?? null;
  }

  async findLocationByCode(code: string) {
    return [...this.locations.values()].find((l) => l.code === code) ?? null;
  }

  async createLocation(data: {
    code: string;
    name: string;
    address?: string | null;
    timezone?: string;
  }) {
    const id = `loc-${++this.locSeq}`;
    const record: LocationRecord = {
      id,
      code: data.code,
      name: data.name,
      address: data.address ?? null,
      timezone: data.timezone ?? 'Asia/Ho_Chi_Minh',
      status: 'ACTIVE',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.locations.set(id, record);
    return record;
  }

  async updateLocation(
    id: string,
    data: { name?: string; address?: string | null; timezone?: string; status?: string },
  ) {
    const loc = this.locations.get(id);
    if (!loc) return null;
    const updated: LocationRecord = {
      ...loc,
      name: data.name ?? loc.name,
      address: data.address !== undefined ? data.address : loc.address,
      timezone: data.timezone ?? loc.timezone,
      status: data.status ?? loc.status,
      updatedAt: new Date(),
    };
    this.locations.set(id, updated);
    return updated;
  }

  // Machines
  async listMachines(filter: MachineFilter) {
    let items = [...this.machines.values()];
    if (filter.locationId) items = items.filter((m) => m.locationId === filter.locationId);
    if (filter.status) items = items.filter((m) => m.status === filter.status);
    if (filter.operatingMode) items = items.filter((m) => m.operatingMode === filter.operatingMode);
    return { items, total: items.length };
  }

  async findMachineById(id: string) {
    return this.machines.get(id) ?? null;
  }

  async findMachineBySerialNumber(serialNumber: string) {
    return [...this.machines.values()].find((m) => m.serialNumber === serialNumber) ?? null;
  }

  async createMachineWithSlots(data: {
    locationId: string;
    serialNumber: string;
    displayName: string;
    slotCount: number;
  }) {
    const id = `mch-${++this.mchSeq}`;
    const machine: MachineRecord = {
      id,
      locationId: data.locationId,
      serialNumber: data.serialNumber,
      displayName: data.displayName,
      status: 'OFFLINE',
      operatingMode: 'NORMAL',
      lastSeenAt: null,
      firmwareVersion: '1.0.0',
      configurationVersion: 1,
      simulatorEnabled: false,
      slotCount: data.slotCount,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.machines.set(id, machine);

    for (let i = 1; i <= data.slotCount; i++) {
      const slotId = `slot-${++this.slotSeq}`;
      const slot: MachineSlotRecord = {
        id: slotId,
        machineId: id,
        slotNumber: i,
        activeBottleId: null,
        calibratedDosageMl: null,
        lowStockThresholdMl: null,
        estimatedRemainingMl: 0,
        estimatedRemainingSprays: 0,
        status: 'AVAILABLE',
        version: 1,
        currentRentalId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.slots.set(slotId, slot);
    }

    return machine;
  }

  async updateMachine(id: string, data: { displayName?: string; locationId?: string }) {
    const mch = this.machines.get(id);
    if (!mch) return null;
    const updated: MachineRecord = {
      ...mch,
      displayName: data.displayName ?? mch.displayName,
      locationId: data.locationId ?? mch.locationId,
      updatedAt: new Date(),
    };
    this.machines.set(id, updated);
    return updated;
  }

  async updateMachineMode(id: string, mode: MachineOperatingMode, reason?: string, actorId?: string) {
    const mch = this.machines.get(id);
    if (!mch) return null;
    const updated: MachineRecord = {
      ...mch,
      operatingMode: mode,
      updatedAt: new Date(),
    };
    this.machines.set(id, updated);
    this.statusHistories.push({ machineId: id, mode, actorId });
    return updated;
  }

  // Slots
  async listSlotsByMachineId(machineId: string) {
    return [...this.slots.values()].filter((s) => s.machineId === machineId);
  }

  async findSlotById(id: string) {
    return this.slots.get(id) ?? null;
  }

  async listAvailableSlots() {
    return [...this.slots.values()].filter((s) => s.status === 'AVAILABLE');
  }

  async updateSlotConfig(
    id: string,
    data: { calibratedDosageMl?: number | null; lowStockThresholdMl?: number | null },
  ) {
    const slot = this.slots.get(id);
    if (!slot) return null;
    const updated: MachineSlotRecord = {
      ...slot,
      calibratedDosageMl:
        data.calibratedDosageMl !== undefined ? data.calibratedDosageMl : slot.calibratedDosageMl,
      lowStockThresholdMl:
        data.lowStockThresholdMl !== undefined
          ? data.lowStockThresholdMl
          : slot.lowStockThresholdMl,
      updatedAt: new Date(),
    };
    this.slots.set(id, updated);
    return updated;
  }

  async updateSlotStatus(id: string, status: SlotStatus) {
    const slot = this.slots.get(id);
    if (!slot) return null;
    const updated: MachineSlotRecord = {
      ...slot,
      status,
      updatedAt: new Date(),
    };
    this.slots.set(id, updated);
    return updated;
  }
}

const SUPER_ADMIN: AuthenticatedUser = {
  userId: '33333333-3333-4333-8333-000000000001',
  brandId: null,
  email: 'admin@scentstation.local',
  fullName: 'Super Admin',
  roles: ['PLATFORM_SUPER_ADMIN'],
  permissions: new Set(['machine.manage', 'machine.operate']),
  permissionVersion: 1,
  sessionId: 'ses-1',
  mustChangePassword: false,
  scope: { type: 'PLATFORM' },
};

describe('MchService (Machine, Slot, Location)', () => {
  let queries: FakeMchQueries;
  let service: MchService;

  beforeEach(() => {
    queries = new FakeMchQueries();
    service = new MchService(queries as unknown as MchQueries);
  });

  describe('Location CRUD & Soft Delete', () => {
    it('tạo địa điểm mới thành công', async () => {
      const loc = await service.createLocation({
        code: 'HCM_VINCOM',
        name: 'Vincom Đồng Khởi',
        address: '72 Lê Thánh Tôn, Q1',
        timezone: 'Asia/Ho_Chi_Minh',
      });

      expect(loc.id).toBeDefined();
      expect(loc.code).toBe('HCM_VINCOM');
      expect(loc.status).toBe('ACTIVE');
    });

    it('chặn tạo địa điểm trùng mã code', async () => {
      await service.createLocation({
        code: 'HCM_VINCOM',
        name: 'Vincom Đồng Khởi',
      });

      await expect(
        service.createLocation({
          code: 'HCM_VINCOM',
          name: 'Vincom Chi Nhánh Khác',
        }),
      ).rejects.toThrowError(AppError);
    });

    it('lấy chi tiết địa điểm hoặc ném 404', async () => {
      const loc = await service.createLocation({ code: 'LOC_1', name: 'Địa Điểm 1' });
      const found = await service.getLocation(loc.id);
      expect(found.id).toBe(loc.id);

      await expect(service.getLocation('non-existent')).rejects.toThrowError(AppError);
    });

    it('xóa mềm địa điểm: chuyển trạng thái sang INACTIVE', async () => {
      const loc = await service.createLocation({ code: 'LOC_DEL', name: 'Xóa Mềm' });
      const deleted = await service.softDeleteLocation(loc.id);

      expect(deleted.status).toBe('INACTIVE');
      const reloaded = await service.getLocation(loc.id);
      expect(reloaded.status).toBe('INACTIVE');
    });
  });

  describe('Machine CRUD, Slot Generation & Soft Delete', () => {
    let activeLocationId: string;

    beforeEach(async () => {
      const loc = await service.createLocation({ code: 'LOC_MCH', name: 'Vị trí đặt máy' });
      activeLocationId = loc.id;
    });

    it('tạo máy mới và tự động sinh đủ 4 slots', async () => {
      const machine = await service.createMachine(SUPER_ADMIN, {
        locationId: activeLocationId,
        serialNumber: 'M001',
        displayName: 'Máy Thử Nghiệm #1',
        slotCount: 4,
      });

      expect(machine.id).toBeDefined();
      expect(machine.serialNumber).toBe('M001');
      expect(machine.slotCount).toBe(4);
      expect(machine.status).toBe('OFFLINE');
      expect(machine.operatingMode).toBe('NORMAL');

      // Kiểm tra slots tự động sinh
      const slots = await service.listSlotsByMachine(machine.id);
      expect(slots).toHaveLength(4);
      expect(slots.map((s) => s.slotNumber)).toEqual([1, 2, 3, 4]);
      expect(slots.every((s) => s.status === 'AVAILABLE')).toBe(true);
    });

    it('chặn đăng ký máy khi địa điểm không tồn tại hoặc bị INACTIVE', async () => {
      const inactiveLoc = await service.createLocation({ code: 'LOC_INACTIVE', name: 'Đã Đóng' });
      await service.softDeleteLocation(inactiveLoc.id);

      await expect(
        service.createMachine(SUPER_ADMIN, {
          locationId: inactiveLoc.id,
          serialNumber: 'M002',
          displayName: 'Máy Thử Nghiệm #2',
          slotCount: 4,
        }),
      ).rejects.toThrowError('Địa điểm không tồn tại hoặc không còn hoạt động');
    });

    it('chặn đăng ký máy khi trùng serialNumber', async () => {
      await service.createMachine(SUPER_ADMIN, {
        locationId: activeLocationId,
        serialNumber: 'M001',
        displayName: 'Máy 1',
        slotCount: 4,
      });

      await expect(
        service.createMachine(SUPER_ADMIN, {
          locationId: activeLocationId,
          serialNumber: 'M001',
          displayName: 'Máy 2',
          slotCount: 4,
        }),
      ).rejects.toThrowError('đã tồn tại');
    });

    it('đổi chế độ hoạt động máy và ghi nhận lịch sử', async () => {
      const machine = await service.createMachine(SUPER_ADMIN, {
        locationId: activeLocationId,
        serialNumber: 'M001',
        displayName: 'Máy 1',
        slotCount: 4,
      });

      const updated = await service.setMachineMode(SUPER_ADMIN, machine.id, {
        operatingMode: 'MAINTENANCE',
        reason: 'Bảo trì định kỳ máy',
      });

      expect(updated.operatingMode).toBe('MAINTENANCE');
      expect(queries.statusHistories).toHaveLength(1);
      expect(queries.statusHistories[0]!.mode).toBe('MAINTENANCE');
      expect(queries.statusHistories[0]!.actorId).toBe(SUPER_ADMIN.userId);
    });

    it('xóa mềm máy: chuyển operatingMode sang DISABLED', async () => {
      const machine = await service.createMachine(SUPER_ADMIN, {
        locationId: activeLocationId,
        serialNumber: 'M001',
        displayName: 'Máy 1',
        slotCount: 4,
      });

      const disabled = await service.softDeleteMachine(
        SUPER_ADMIN,
        machine.id,
        'Dừng hoạt động máy',
      );
      expect(disabled.operatingMode).toBe('DISABLED');

      const reloaded = await service.getMachine(machine.id);
      expect(reloaded.operatingMode).toBe('DISABLED');
    });
  });

  describe('Machine Slot Management & Config', () => {
    let machineId: string;
    let slotId: string;

    beforeEach(async () => {
      const loc = await service.createLocation({ code: 'LOC_SLOT', name: 'Địa điểm' });
      const machine = await service.createMachine(SUPER_ADMIN, {
        locationId: loc.id,
        serialNumber: 'M_SLOT_01',
        displayName: 'Máy Slot',
        slotCount: 4,
      });
      machineId = machine.id;
      const slots = await service.listSlotsByMachine(machineId);
      slotId = slots[0]!.id;
    });

    it('hiệu chuẩn liều lượng và ngưỡng báo cạn slot', async () => {
      const configured = await service.updateSlotConfig(SUPER_ADMIN, slotId, {
        calibratedDosageMl: 0.12,
        lowStockThresholdMl: 5.0,
      });

      expect(configured.calibratedDosageMl).toBe(0.12);
      expect(configured.lowStockThresholdMl).toBe(5.0);
    });

    it('chặn cấu hình liều lượng âm hoặc bằng 0', async () => {
      await expect(
        service.updateSlotConfig(SUPER_ADMIN, slotId, {
          calibratedDosageMl: -1,
        }),
      ).rejects.toThrowError('Định lượng xịt phải lớn hơn 0');
    });

    it('bật và tắt slot từ xa', async () => {
      // Tắt slot -> UNAVAILABLE
      const disabled = await service.setSlotEnabled(SUPER_ADMIN, slotId, false, 'Tạm ngưng slot');
      expect(disabled.status).toBe('UNAVAILABLE');

      // Bật lại -> AVAILABLE
      const enabled = await service.setSlotEnabled(SUPER_ADMIN, slotId, true);
      expect(enabled.status).toBe('AVAILABLE');
    });

    it('xóa mềm slot: chuyển trạng thái sang DISABLED', async () => {
      const softDeleted = await service.softDeleteSlot(SUPER_ADMIN, slotId);
      expect(softDeleted.status).toBe('DISABLED');

      const reloaded = await service.getSlot(slotId);
      expect(reloaded.status).toBe('DISABLED');
    });

    it('lấy danh sách slot khả dụng', async () => {
      const available = await service.listAvailableSlots();
      expect(available.length).toBeGreaterThanOrEqual(4);
    });
  });
});
