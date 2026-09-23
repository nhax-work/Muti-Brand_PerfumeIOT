/**
 * Truy vấn cơ sở dữ liệu của module MCH (Machine, Slot, Location).
 * Sử dụng Kysely với schema kiểu tĩnh (ADR-0003).
 */

import { Inject, Injectable } from '@nestjs/common';
import { DATABASE, type Database } from '../../shared/db/index.js';
import type {
  CredentialStatus,
  MachineConnectionStatus,
  MachineOperatingMode,
  SlotStatus,
} from '../../shared/db/types.generated.js';

export interface LocationRecord {
  readonly id: string;
  readonly code: string;
  readonly name: string;
  readonly address: string | null;
  readonly timezone: string;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface LocationFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly status?: string | undefined;
}

export interface MachineRecord {
  readonly id: string;
  readonly locationId: string;
  readonly serialNumber: string;
  readonly displayName: string;
  readonly status: MachineConnectionStatus;
  readonly operatingMode: MachineOperatingMode;
  readonly lastSeenAt: Date | null;
  readonly firmwareVersion: string | null;
  readonly configurationVersion: number;
  readonly simulatorEnabled: boolean;
  readonly slotCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface MachineFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly locationId?: string | undefined;
  readonly status?: MachineConnectionStatus | undefined;
  readonly operatingMode?: MachineOperatingMode | undefined;
}

export interface MachineSlotRecord {
  readonly id: string;
  readonly machineId: string;
  readonly slotNumber: number;
  readonly activeBottleId: string | null;
  readonly calibratedDosageMl: number | null;
  readonly lowStockThresholdMl: number | null;
  readonly estimatedRemainingMl: number;
  readonly estimatedRemainingSprays: number;
  readonly status: SlotStatus;
  readonly version: number;
  readonly currentRentalId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AvailableSlotFilter {
  readonly page: number;
  readonly pageSize: number;
  readonly machineId?: string | undefined;
  readonly locationId?: string | undefined;
}

export interface AvailableSlotRecord {
  readonly slotId: string;
  readonly slotNumber: number;
  readonly machineId: string;
  readonly machineDisplayName: string;
  readonly locationId: string;
  readonly locationName: string;
}

export interface MachineStatusHistoryFilter {
  readonly page: number;
  readonly pageSize: number;
}

export interface MachineStatusHistoryRecord {
  readonly id: string;
  readonly fromConnectionStatus: MachineConnectionStatus | null;
  readonly toConnectionStatus: MachineConnectionStatus | null;
  readonly fromOperatingMode: MachineOperatingMode | null;
  readonly toOperatingMode: MachineOperatingMode | null;
  readonly reason: string | null;
  readonly source: string;
  readonly changedBy: string | null;
  readonly occurredAt: Date;
}

/**
 * Metadata credential của máy. KHÔNG có trường bí mật: `public_key_or_secret_hash` không bao giờ
 * rời khỏi lớp truy vấn (NFR-SEC-05).
 */
export interface DeviceCredentialRecord {
  readonly id: string;
  readonly machineId: string;
  readonly credentialIdentifier: string;
  readonly status: CredentialStatus;
  readonly issuedAt: Date;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly lastAuthenticatedAt: Date | null;
}

/** Hợp đồng đang giữ slot (spec/errors.md: SLOT_OCCUPIED). */
const ACTIVE_RENTAL_STATUSES = ['ACTIVE', 'EXPIRING', 'GRACE', 'LIQUIDATED'] as const;

@Injectable()
export class MchQueries {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  // =========================================================================
  // 1. LOCATIONS
  // =========================================================================

  async listLocations(filter: LocationFilter): Promise<{ items: LocationRecord[]; total: number }> {
    let query = this.db.selectFrom('locations');
    if (filter.status) {
      query = query.where('status', '=', filter.status);
    }

    const countRow = await query
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await query
      .selectAll()
      .orderBy('created_at', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        address: r.address,
        timezone: r.timezone,
        status: r.status,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: Number(countRow.total),
    };
  }

  async findLocationById(id: string): Promise<LocationRecord | null> {
    const row = await this.db
      .selectFrom('locations')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address,
      timezone: row.timezone,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findLocationByCode(code: string): Promise<LocationRecord | null> {
    const row = await this.db
      .selectFrom('locations')
      .selectAll()
      .where('code', '=', code)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address,
      timezone: row.timezone,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async createLocation(data: {
    code: string;
    name: string;
    address?: string | null;
    timezone?: string;
  }): Promise<LocationRecord> {
    const row = await this.db
      .insertInto('locations')
      .values({
        code: data.code,
        name: data.name,
        address: data.address ?? null,
        timezone: data.timezone ?? 'Asia/Ho_Chi_Minh',
        status: 'ACTIVE',
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return {
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address,
      timezone: row.timezone,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async updateLocation(
    id: string,
    data: {
      name?: string;
      address?: string | null;
      timezone?: string;
      status?: string;
    },
  ): Promise<LocationRecord | null> {
    const row = await this.db
      .updateTable('locations')
      .set({
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.timezone !== undefined ? { timezone: data.timezone } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      address: row.address,
      timezone: row.timezone,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  // =========================================================================
  // 2. MACHINES
  // =========================================================================

  async listMachines(filter: MachineFilter): Promise<{ items: MachineRecord[]; total: number }> {
    let query = this.db.selectFrom('machines as m');
    if (filter.locationId) {
      query = query.where('m.location_id', '=', filter.locationId);
    }
    if (filter.status) {
      query = query.where('m.status', '=', filter.status);
    }
    if (filter.operatingMode) {
      query = query.where('m.operating_mode', '=', filter.operatingMode);
    }

    const countRow = await query
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await query
      .selectAll('m')
      .select((eb) =>
        eb
          .selectFrom('machine_slots as s')
          .whereRef('s.machine_id', '=', 'm.id')
          .select((subEb) => subEb.fn.countAll<string>().as('slot_count'))
          .as('slot_count'),
      )
      .orderBy('m.created_at', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map((r) => ({
        id: r.id,
        locationId: r.location_id,
        serialNumber: r.serial_number,
        displayName: r.display_name,
        status: r.status,
        operatingMode: r.operating_mode,
        lastSeenAt: r.last_seen_at,
        firmwareVersion: r.firmware_version,
        configurationVersion: r.configuration_version,
        simulatorEnabled: r.simulator_enabled,
        slotCount: Number(r.slot_count ?? 0),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      total: Number(countRow.total),
    };
  }

  async findMachineById(id: string): Promise<MachineRecord | null> {
    const row = await this.db
      .selectFrom('machines as m')
      .selectAll('m')
      .select((eb) =>
        eb
          .selectFrom('machine_slots as s')
          .whereRef('s.machine_id', '=', 'm.id')
          .select((subEb) => subEb.fn.countAll<string>().as('slot_count'))
          .as('slot_count'),
      )
      .where('m.id', '=', id)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      locationId: row.location_id,
      serialNumber: row.serial_number,
      displayName: row.display_name,
      status: row.status,
      operatingMode: row.operating_mode,
      lastSeenAt: row.last_seen_at,
      firmwareVersion: row.firmware_version,
      configurationVersion: row.configuration_version,
      simulatorEnabled: row.simulator_enabled,
      slotCount: Number(row.slot_count ?? 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async findMachineBySerialNumber(serialNumber: string): Promise<MachineRecord | null> {
    const row = await this.db
      .selectFrom('machines')
      .selectAll()
      .where('serial_number', '=', serialNumber)
      .executeTakeFirst();

    if (!row) return null;
    return {
      id: row.id,
      locationId: row.location_id,
      serialNumber: row.serial_number,
      displayName: row.display_name,
      status: row.status,
      operatingMode: row.operating_mode,
      lastSeenAt: row.last_seen_at,
      firmwareVersion: row.firmware_version,
      configurationVersion: row.configuration_version,
      simulatorEnabled: row.simulator_enabled,
      slotCount: 0,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  /**
   * Tạo máy và tự động tạo N slot ban đầu trong một transaction.
   */
  async createMachineWithSlots(data: {
    locationId: string;
    serialNumber: string;
    displayName: string;
    slotCount: number;
  }): Promise<MachineRecord> {
    return this.db.transaction().execute(async (trx) => {
      const machine = await trx
        .insertInto('machines')
        .values({
          location_id: data.locationId,
          serial_number: data.serialNumber,
          display_name: data.displayName,
          status: 'OFFLINE',
          operating_mode: 'NORMAL',
          simulator_enabled: false,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      // Sinh slotCount slots
      for (let i = 1; i <= data.slotCount; i++) {
        await trx
          .insertInto('machine_slots')
          .values({
            machine_id: machine.id,
            slot_number: i,
            status: 'AVAILABLE',
            estimated_remaining_ml: '0',
            estimated_remaining_sprays: 0,
          })
          .execute();
      }

      return {
        id: machine.id,
        locationId: machine.location_id,
        serialNumber: machine.serial_number,
        displayName: machine.display_name,
        status: machine.status,
        operatingMode: machine.operating_mode,
        lastSeenAt: machine.last_seen_at,
        firmwareVersion: machine.firmware_version,
        configurationVersion: machine.configuration_version,
        simulatorEnabled: machine.simulator_enabled,
        slotCount: data.slotCount,
        createdAt: machine.created_at,
        updatedAt: machine.updated_at,
      };
    });
  }

  async updateMachine(
    id: string,
    data: {
      displayName?: string;
      locationId?: string;
    },
  ): Promise<MachineRecord | null> {
    const row = await this.db
      .updateTable('machines')
      .set({
        ...(data.displayName !== undefined ? { display_name: data.displayName } : {}),
        ...(data.locationId !== undefined ? { location_id: data.locationId } : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (!row) return null;
    return this.findMachineById(id);
  }

  async updateMachineMode(
    id: string,
    mode: MachineOperatingMode,
    reason?: string,
    actorId?: string,
  ): Promise<MachineRecord | null> {
    const changed = await this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('machines')
        .select('operating_mode')
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();

      if (!current) return false;

      await trx
        .updateTable('machines')
        .set({
          operating_mode: mode,
          updated_at: new Date(),
        })
        .where('id', '=', id)
        .execute();

      // Ghi lịch sử trạng thái (FR-MCH-13)
      await trx
        .insertInto('machine_status_histories')
        .values({
          machine_id: id,
          from_operating_mode: current.operating_mode,
          to_operating_mode: mode,
          reason: reason ?? null,
          source: 'OPERATOR',
          changed_by: actorId ?? null,
        })
        .execute();

      return true;
    });

    // Đọc lại sau transaction để có slotCount thật thay vì tự dựng record.
    return changed ? this.findMachineById(id) : null;
  }

  // =========================================================================
  // 3. MACHINE SLOTS
  // =========================================================================

  async listSlotsByMachineId(machineId: string): Promise<MachineSlotRecord[]> {
    const rows = await this.db
      .selectFrom('machine_slots as s')
      .selectAll('s')
      .select((eb) =>
        eb
          .selectFrom('slot_rentals as r')
          .whereRef('r.slot_id', '=', 's.id')
          .where('r.status', 'in', ACTIVE_RENTAL_STATUSES)
          .select('r.id')
          .limit(1)
          .as('current_rental_id'),
      )
      .where('s.machine_id', '=', machineId)
      .orderBy('s.slot_number', 'asc')
      .execute();

    return rows.map((r) => this.mapSlotRecord(r));
  }

  async findSlotById(id: string): Promise<MachineSlotRecord | null> {
    const row = await this.db
      .selectFrom('machine_slots as s')
      .selectAll('s')
      .select((eb) =>
        eb
          .selectFrom('slot_rentals as r')
          .whereRef('r.slot_id', '=', 's.id')
          .where('r.status', 'in', ACTIVE_RENTAL_STATUSES)
          .select('r.id')
          .limit(1)
          .as('current_rental_id'),
      )
      .where('s.id', '=', id)
      .executeTakeFirst();

    if (!row) return null;
    return this.mapSlotRecord(row);
  }

  /**
   * Slot thuê được (FR-SLT-19): slot AVAILABLE, không có hợp đồng đang chạy, trên máy chưa bị
   * DISABLED và ở địa điểm còn ACTIVE. Chỉ trả thông tin vị trí — KHÔNG kèm dữ liệu thương hiệu
   * từng thuê (BR-012).
   */
  async listAvailableSlots(
    filter: AvailableSlotFilter,
  ): Promise<{ items: AvailableSlotRecord[]; total: number }> {
    let base = this.db
      .selectFrom('machine_slots as s')
      .innerJoin('machines as m', 'm.id', 's.machine_id')
      .innerJoin('locations as l', 'l.id', 'm.location_id')
      .where('s.status', '=', 'AVAILABLE')
      .where('m.operating_mode', '<>', 'DISABLED')
      .where('l.status', '=', 'ACTIVE')
      .where((eb) =>
        eb.not(
          eb.exists(
            eb
              .selectFrom('slot_rentals as r')
              .select('r.id')
              .whereRef('r.slot_id', '=', 's.id')
              .where('r.status', 'in', ACTIVE_RENTAL_STATUSES),
          ),
        ),
      );
    if (filter.machineId) base = base.where('m.id', '=', filter.machineId);
    if (filter.locationId) base = base.where('l.id', '=', filter.locationId);

    const countRow = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    const rows = await base
      .select([
        's.id as slot_id',
        's.slot_number',
        'm.id as machine_id',
        'm.display_name as machine_display_name',
        'l.id as location_id',
        'l.name as location_name',
      ])
      .orderBy('l.name', 'asc')
      .orderBy('m.display_name', 'asc')
      .orderBy('s.slot_number', 'asc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map((r) => ({
        slotId: r.slot_id,
        slotNumber: r.slot_number,
        machineId: r.machine_id,
        machineDisplayName: r.machine_display_name,
        locationId: r.location_id,
        locationName: r.location_name,
      })),
      total: Number(countRow.total),
    };
  }

  async updateSlotConfig(
    id: string,
    data: {
      calibratedDosageMl?: number | null;
      lowStockThresholdMl?: number | null;
    },
  ): Promise<MachineSlotRecord | null> {
    const row = await this.db
      .updateTable('machine_slots')
      .set({
        ...(data.calibratedDosageMl !== undefined
          ? {
              calibrated_dosage_ml:
                data.calibratedDosageMl !== null ? String(data.calibratedDosageMl) : null,
            }
          : {}),
        ...(data.lowStockThresholdMl !== undefined
          ? {
              low_stock_threshold_ml:
                data.lowStockThresholdMl !== null ? String(data.lowStockThresholdMl) : null,
            }
          : {}),
        updated_at: new Date(),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();

    if (!row) return null;
    return this.findSlotById(id);
  }

  /**
   * Đổi trạng thái slot với khóa lạc quan: chỉ ghi khi `version` còn đúng giá trị đã đọc, để hai
   * thao tác đồng thời không ghi đè nhau. Trả null khi slot không còn hoặc đã bị đổi trước đó.
   */
  async updateSlotStatus(
    id: string,
    status: SlotStatus,
    expectedVersion: number,
  ): Promise<MachineSlotRecord | null> {
    const row = await this.db
      .updateTable('machine_slots')
      .set((eb) => ({
        status,
        version: eb('version', '+', 1),
        updated_at: new Date(),
      }))
      .where('id', '=', id)
      .where('version', '=', expectedVersion)
      .returningAll()
      .executeTakeFirst();

    if (!row) return null;
    return this.findSlotById(id);
  }

  // =========================================================================
  // 4. LỊCH SỬ TRẠNG THÁI MÁY (FR-MCH-13)
  // =========================================================================

  async listStatusHistory(
    machineId: string,
    filter: MachineStatusHistoryFilter,
  ): Promise<{ items: MachineStatusHistoryRecord[]; total: number }> {
    const base = this.db.selectFrom('machine_status_histories').where('machine_id', '=', machineId);

    const countRow = await base
      .select((eb) => eb.fn.countAll<string>().as('total'))
      .executeTakeFirstOrThrow();

    // Thứ tự phụ theo id để phân trang ổn định khi nhiều hàng trùng occurred_at.
    const rows = await base
      .selectAll()
      .orderBy('occurred_at', 'desc')
      .orderBy('id', 'desc')
      .limit(filter.pageSize)
      .offset((filter.page - 1) * filter.pageSize)
      .execute();

    return {
      items: rows.map((r) => ({
        id: r.id,
        fromConnectionStatus: r.from_connection_status,
        toConnectionStatus: r.to_connection_status,
        fromOperatingMode: r.from_operating_mode,
        toOperatingMode: r.to_operating_mode,
        reason: r.reason,
        source: r.source,
        changedBy: r.changed_by,
        occurredAt: r.occurred_at,
      })),
      total: Number(countRow.total),
    };
  }

  // =========================================================================
  // 5. CREDENTIAL THIẾT BỊ (FR-MCH-02, NFR-SEC-05, NFR-SEC-07)
  // =========================================================================

  async findCredentialByMachineId(machineId: string): Promise<DeviceCredentialRecord | null> {
    const row = await this.db
      .selectFrom('device_credentials')
      .select([
        'id',
        'machine_id',
        'credential_identifier',
        'status',
        'issued_at',
        'expires_at',
        'revoked_at',
        'last_authenticated_at',
      ])
      .where('machine_id', '=', machineId)
      .executeTakeFirst();

    if (!row) return null;
    return toCredentialRecord(row);
  }

  /**
   * Cấp hoặc cấp lại credential.
   *
   * `device_credentials.machine_id` là UNIQUE (schema.sql §9), nên cấp lại KHÔNG chèn hàng thứ hai:
   * bộ cũ bị ghi đè tại chỗ, tức thu hồi và cấp mới là một thao tác nguyên tử (FR-MCH-02).
   * Chỉ nhận vào bản băm — bí mật gốc không đi qua lớp này.
   */
  async upsertCredential(data: {
    machineId: string;
    credentialIdentifier: string;
    secretHash: string;
  }): Promise<DeviceCredentialRecord> {
    const row = await this.db
      .insertInto('device_credentials')
      .values({
        machine_id: data.machineId,
        credential_identifier: data.credentialIdentifier,
        public_key_or_secret_hash: data.secretHash,
        status: 'ACTIVE',
        issued_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('machine_id').doUpdateSet({
          credential_identifier: data.credentialIdentifier,
          public_key_or_secret_hash: data.secretHash,
          status: 'ACTIVE',
          issued_at: new Date(),
          revoked_at: null,
          last_authenticated_at: null,
        }),
      )
      .returning([
        'id',
        'machine_id',
        'credential_identifier',
        'status',
        'issued_at',
        'expires_at',
        'revoked_at',
        'last_authenticated_at',
      ])
      .executeTakeFirstOrThrow();

    return toCredentialRecord(row);
  }

  async revokeCredential(machineId: string): Promise<DeviceCredentialRecord | null> {
    const row = await this.db
      .updateTable('device_credentials')
      .set({ status: 'REVOKED', revoked_at: new Date() })
      .where('machine_id', '=', machineId)
      .returning([
        'id',
        'machine_id',
        'credential_identifier',
        'status',
        'issued_at',
        'expires_at',
        'revoked_at',
        'last_authenticated_at',
      ])
      .executeTakeFirst();

    if (!row) return null;
    return toCredentialRecord(row);
  }

  private mapSlotRecord(r: {
    id: string;
    machine_id: string;
    slot_number: number;
    active_bottle_id: string | null;
    calibrated_dosage_ml: string | number | null;
    low_stock_threshold_ml: string | number | null;
    estimated_remaining_ml: string | number;
    estimated_remaining_sprays: number;
    status: SlotStatus;
    version: number;
    current_rental_id?: string | null;
    created_at: Date;
    updated_at: Date;
  }): MachineSlotRecord {
    return {
      id: r.id,
      machineId: r.machine_id,
      slotNumber: r.slot_number,
      activeBottleId: r.active_bottle_id,
      calibratedDosageMl: r.calibrated_dosage_ml !== null ? Number(r.calibrated_dosage_ml) : null,
      lowStockThresholdMl:
        r.low_stock_threshold_ml !== null ? Number(r.low_stock_threshold_ml) : null,
      estimatedRemainingMl: Number(r.estimated_remaining_ml),
      estimatedRemainingSprays: r.estimated_remaining_sprays,
      status: r.status,
      version: r.version,
      currentRentalId: r.current_rental_id ?? null,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  }
}

function toCredentialRecord(row: {
  id: string;
  machine_id: string;
  credential_identifier: string;
  status: CredentialStatus;
  issued_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_authenticated_at: Date | null;
}): DeviceCredentialRecord {
  return {
    id: row.id,
    machineId: row.machine_id,
    credentialIdentifier: row.credential_identifier,
    status: row.status,
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    lastAuthenticatedAt: row.last_authenticated_at,
  };
}
