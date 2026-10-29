/**
 * Cửa vào HTTP của IOT (tag IOT, FR-IOT-04 ÷ 06). Bản tin thiết bị đi vào qua MQTT
 * (`iot.mqtt.ts`, spec/contracts/mqtt.md), không qua REST; ở đây chỉ có đường đọc và đẩy lại cấu hình.
 *
 *   Telemetry, sự kiện thiết bị — `machine.view` (Super Admin, Operations Staff, Inventory Staff).
 *   Đẩy lại cấu hình — `machine.operate` + xác thực lại (nhóm "đổi cấu hình máy", FR-AUTH-09).
 */

import { Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AuditService } from '../../shared/audit/index.js';
import { invalidField, notFoundFor } from '../../shared/errors/index.js';
import { parseBody } from '../../shared/http/validation.js';
import {
  CurrentUser,
  RequirePermissions,
  RequireReauth,
  type AuthenticatedUser,
} from '../auth/index.js';
import { MchService } from '../mch/index.js';
import { IotMqttGateway } from './iot.mqtt.js';
import { IotQueries, type TelemetryFilter } from './iot.queries.js';

const MACHINE_VIEW = 'machine.view';
const MACHINE_OPERATE = 'machine.operate';

const IdParam = z.object({ id: z.string().uuid() });

const Page = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
};

const ReadingsQuery = z.object({
  ...Page,
  slotId: z.string().uuid().optional(),
  readingType: z.string().trim().min(1).max(100).optional(),
});

const EventsQuery = z.object(Page);

function assertPeriod(filter: TelemetryFilter): void {
  if (filter.from && filter.to && filter.from >= filter.to) {
    throw invalidField('to', 'validation.periodEndBeforeStart');
  }
}

@Controller('machines')
export class IotController {
  constructor(
    @Inject(IotQueries) private readonly queries: IotQueries,
    @Inject(IotMqttGateway) private readonly gateway: IotMqttGateway,
    @Inject(MchService) private readonly machines: MchService,
    @Inject(AuditService) private readonly audit: AuditService,
  ) {}

  /** FR-IOT-04, FR-IOT-14, FR-MNT-08 */
  @Get(':id/sensor-readings')
  @RequirePermissions(MACHINE_VIEW)
  async sensorReadings(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Query() rawQuery: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    const query = parseBody(ReadingsQuery, rawQuery);
    assertPeriod(query);
    if (!(await this.queries.machineExists(id))) throw notFoundFor(actor);
    const { items, total } = await this.queries.sensorReadings(id, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-IOT-05, FR-MNT-08 */
  @Get(':id/device-events')
  @RequirePermissions(MACHINE_VIEW)
  async deviceEvents(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Query() rawQuery: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    const query = parseBody(EventsQuery, rawQuery);
    assertPeriod(query);
    if (!(await this.queries.machineExists(id))) throw notFoundFor(actor);
    const { items, total } = await this.queries.deviceEvents(id, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  /** FR-IOT-06: tăng configurationVersion và publish ngay bản tin `config` (retain). */
  @Post(':id/config/push')
  @HttpCode(202)
  @RequirePermissions(MACHINE_OPERATE)
  @RequireReauth()
  async pushConfig(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    const { id } = parseBody(IdParam, params);
    const version = await this.gateway.pushConfig(id);
    if (version === null) throw notFoundFor(actor);
    await this.audit.log({
      actorType: 'USER',
      actorId: actor.userId,
      action: 'iot.config.pushed',
      targetType: 'machine',
      targetId: id,
      severity: 'WARNING',
      after: { configurationVersion: version },
    });
    return this.machines.getMachine(id);
  }
}
