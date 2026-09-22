/**
 * Cửa vào HTTP của module MCH (Machine, Slot, Location).
 * Tuân thủ đường dẫn và schemas trong spec/contracts/openapi.yaml.
 */

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { parseBody } from '../../shared/http/validation.js';
import { CurrentUser, RequirePermissions, type AuthenticatedUser } from '../auth/index.js';
import { MchService } from './mch.service.js';

const MACHINE_MANAGE = 'machine.manage';
const MACHINE_OPERATE = 'machine.operate';

const IdParam = z.string().uuid();

const PageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
});

// =============================================================================
// 1. LOCATIONS CONTROLLER
// =============================================================================

const LocationCreateBody = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  address: z.string().optional(),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
});

const LocationUpdateBody = z.object({
  name: z.string().min(1).max(200).optional(),
  address: z.string().optional(),
  timezone: z.string().optional(),
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const LocationListQuery = PageQuery.extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

@Controller('locations')
@RequirePermissions(MACHINE_MANAGE)
export class LocationsController {
  constructor(@Inject(MchService) private readonly mch: MchService) {}

  /** FR-MCH-03: Danh sách địa điểm */
  @Get()
  async list(@Query() query: unknown) {
    const filter = parseBody(LocationListQuery, query);
    const { items, total } = await this.mch.listLocations(filter);
    return { items, meta: { page: filter.page, pageSize: filter.pageSize, total } };
  }

  /** FR-MCH-03: Tạo địa điểm mới */
  @Post()
  @HttpCode(201)
  create(@Body() body: unknown) {
    const input = parseBody(LocationCreateBody, body);
    return this.mch.createLocation(input);
  }

  /** Chi tiết địa điểm */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.mch.getLocation(parseBody(IdParam, id));
  }

  /** Cập nhật địa điểm */
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(LocationUpdateBody, body);
    return this.mch.updateLocation(validatedId, input);
  }

  /** Xóa mềm địa điểm */
  @Delete(':id')
  softDelete(@Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.mch.softDeleteLocation(validatedId);
  }
}

// =============================================================================
// 2. MACHINES CONTROLLER
// =============================================================================

const MachineCreateBody = z.object({
  locationId: z.string().uuid(),
  serialNumber: z.string().min(1).max(100),
  displayName: z.string().min(1).max(200),
  slotCount: z.coerce.number().int().min(1).default(4),
});

const MachineUpdateBody = z.object({
  displayName: z.string().min(1).max(200).optional(),
  locationId: z.string().uuid().optional(),
});

const MachineModeBody = z.object({
  operatingMode: z.enum(['NORMAL', 'MAINTENANCE', 'DISABLED']),
  reason: z.string().optional(),
});

const MachineListQuery = PageQuery.extend({
  locationId: z.string().uuid().optional(),
  status: z.enum(['ONLINE', 'UNSTABLE', 'OFFLINE']).optional(),
  operatingMode: z.enum(['NORMAL', 'MAINTENANCE', 'DISABLED']).optional(),
});

@Controller('machines')
@RequirePermissions(MACHINE_MANAGE)
export class MachinesController {
  constructor(@Inject(MchService) private readonly mch: MchService) {}

  /** FR-MCH-08..10: Danh sách máy */
  @Get()
  async list(@Query() query: unknown) {
    const filter = parseBody(MachineListQuery, query);
    const { items, total } = await this.mch.listMachines(filter);
    return { items, meta: { page: filter.page, pageSize: filter.pageSize, total } };
  }

  /** FR-MCH-01, FR-MCH-04, FR-MCH-05: Đăng ký máy mới kèm slots */
  @Post()
  @HttpCode(201)
  create(@CurrentUser() actor: AuthenticatedUser, @Body() body: unknown) {
    const input = parseBody(MachineCreateBody, body);
    return this.mch.createMachine(actor, input);
  }

  /** FR-MCH-08..10: Chi tiết máy */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.mch.getMachine(parseBody(IdParam, id));
  }

  /** Cập nhật thông tin máy */
  @Put(':id')
  update(@Param('id') id: string, @Body() body: unknown) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(MachineUpdateBody, body);
    return this.mch.updateMachine(validatedId, input);
  }

  /** FR-MCH-11, FR-MNT-05: Đổi chế độ hoạt động máy */
  @Put(':id/mode')
  @RequirePermissions(MACHINE_OPERATE)
  setMode(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() body: unknown) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(MachineModeBody, body);
    return this.mch.setMachineMode(actor, validatedId, input);
  }

  /** Xóa mềm máy (chuyển sang DISABLED) */
  @Delete(':id')
  softDelete(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.mch.softDeleteMachine(actor, validatedId);
  }

  /** FR-MCH-15..17: Danh sách slots của máy */
  @Get(':id/slots')
  listSlots(@Param('id') id: string) {
    return this.mch.listSlotsByMachine(parseBody(IdParam, id));
  }
}

// =============================================================================
// 3. SLOTS CONTROLLER
// =============================================================================

const SlotConfigBody = z.object({
  calibratedDosageMl: z.number().positive().optional(),
  lowStockThresholdMl: z.number().nonnegative().optional(),
});

const SlotEnabledBody = z.object({
  enabled: z.boolean(),
  reason: z.string().optional(),
});

@Controller('slots')
@RequirePermissions(MACHINE_MANAGE)
export class SlotsController {
  constructor(@Inject(MchService) private readonly mch: MchService) {}

  /** FR-SLT-20: Danh sách slot khả dụng sẵn sàng cho thuê */
  @Get('available')
  listAvailable() {
    return this.mch.listAvailableSlots();
  }

  /** Chi tiết một slot */
  @Get(':id')
  get(@Param('id') id: string) {
    return this.mch.getSlot(parseBody(IdParam, id));
  }

  /** FR-MCH-06: Hiệu chuẩn liều lượng và ngưỡng cảnh báo slot */
  @Put(':id/config')
  updateConfig(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const validatedId = parseBody(IdParam, id);
    const input = parseBody(SlotConfigBody, body);
    return this.mch.updateSlotConfig(actor, validatedId, input);
  }

  /** FR-MCH-12: Bật / tắt slot từ xa */
  @Put(':id/enabled')
  @RequirePermissions(MACHINE_OPERATE)
  setEnabled(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    const validatedId = parseBody(IdParam, id);
    const { enabled, reason } = parseBody(SlotEnabledBody, body);
    return this.mch.setSlotEnabled(actor, validatedId, enabled, reason);
  }

  /** Xóa mềm slot (chuyển sang DISABLED) */
  @Delete(':id')
  softDelete(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) {
    const validatedId = parseBody(IdParam, id);
    return this.mch.softDeleteSlot(actor, validatedId);
  }
}
