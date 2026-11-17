/**
 * Cửa vào HTTP của bằng chứng camera (ADR-0032). Đường dẫn và dữ liệu theo
 * spec/contracts/openapi.yaml, tag EVD.
 *
 *   /refund-claims/{id}/evidence*      — quyền order.refund; tải lên chỉ người được phân công.
 *   /refill-sessions/{id}/evidence*    — tải lên: machine.operate; xem: thêm Brand Admin của phiếu.
 *   /refill-sessions/{id}/footage-requests, /footage-requests* — FR-INV-39.
 *   /evidence/{id}/remove              — người đã tải, khi hồ sơ còn mở.
 *   /public/refund-claims/{code}/evidence, /evidence-files/{id} — @Public, khách và thẻ <video>.
 *
 * Tệp gửi bằng multipart (trường `file`), thông tin khoảng ghi đi trên query — như ảnh khai báo gửi
 * hàng (ADR-0024).
 */

import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { originOf } from '../../shared/http/request-origin.js';
import { readImageFile } from '../../shared/http/multipart.js';
import { parseBody } from '../../shared/http/validation.js';
import type { BrandScope } from '../../shared/scoping/index.js';
import {
  CurrentBrandScope,
  CurrentUser,
  Public,
  RequirePermissions,
  type AuthenticatedUser,
} from '../auth/index.js';
import { EvdService, MACHINE_OPERATE, type EvidenceUpload } from './evd.service.js';

const IdParam = z.object({ id: z.string().uuid() });
const CodeParam = z.object({ code: z.string().min(1).max(20) });

/** openapi parameters `evidence*`. */
const UploadQuery = z.object({
  cameraLabel: z.string().trim().min(1).max(100),
  recordedFrom: z.string().datetime({ offset: true }),
  recordedTo: z.string().datetime({ offset: true }),
  clockOffsetSec: z.coerce.number().int().min(-86400).max(86400).default(0),
  note: z.string().max(1000).optional(),
});

const RemoveBody = z.object({ reason: z.string().trim().min(1).max(1000) });
const FootageCreateBody = z.object({ reason: z.string().trim().min(1).max(1000) });
const FootageResolveBody = z.object({
  outcome: z.enum(['FULFILLED', 'UNAVAILABLE']),
  note: z.string().max(1000).optional(),
});
const FootageListQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  status: z.enum(['OPEN', 'FULFILLED', 'UNAVAILABLE']).optional(),
  refillSessionId: z.string().uuid().optional(),
});
const PublicEvidenceQuery = z.object({ key: z.string().min(1).max(100) });
const FileQuery = z.object({ exp: z.coerce.number().int(), sig: z.string().min(1).max(200) });

function toUpload(raw: unknown): EvidenceUpload {
  const q = parseBody(UploadQuery, raw);
  return {
    cameraLabel: q.cameraLabel,
    recordedFrom: new Date(q.recordedFrom),
    recordedTo: new Date(q.recordedTo),
    clockOffsetSec: q.clockOffsetSec,
    note: q.note,
  };
}

/** Đọc tệp với trần lớn nhất (video); ảnh bị kiểm lại ngưỡng riêng trong service. */
function readEvidenceFile(request: FastifyRequest, config: AppConfig): Promise<Buffer> {
  return readImageFile(request, config.constraint('CAMERA_CLIP_MAX_BYTES'), {
    required: 'evd.fileRequired',
    tooLarge: 'evd.fileTooLarge',
  });
}

@Controller('refund-claims')
@RequirePermissions('order.refund')
export class ClaimEvidenceController {
  constructor(
    @Inject(EvdService) private readonly evd: EvdService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get(':id/evidence-window')
  window(@Param() params: unknown) {
    return this.evd.claimWindow(parseBody(IdParam, params).id);
  }

  @Get(':id/evidence')
  list(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown) {
    return this.evd.listClaimEvidence(actor, parseBody(IdParam, params).id);
  }

  /** FR-ORD-38. */
  @Post(':id/evidence')
  async add(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ) {
    const { id } = parseBody(IdParam, params);
    const upload = toUpload(rawQuery);
    const data = await readEvidenceFile(request, this.config);
    return this.evd.addClaimEvidence(actor, id, upload, data);
  }
}

@Controller('refill-sessions')
export class RefillEvidenceController {
  constructor(
    @Inject(EvdService) private readonly evd: EvdService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get(':id/evidence-window')
  @RequirePermissions(MACHINE_OPERATE)
  window(@Param() params: unknown) {
    return this.evd.refillWindow(parseBody(IdParam, params).id);
  }

  /** FR-INV-38: nhân sự nền tảng có machine.operate, hoặc Brand Admin của phiếu. */
  @Get(':id/evidence')
  list(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
  ) {
    return this.evd.listRefillEvidence(actor, scope, parseBody(IdParam, params).id);
  }

  /** FR-INV-38. */
  @Post(':id/evidence')
  @RequirePermissions(MACHINE_OPERATE)
  async add(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
  ) {
    const { id } = parseBody(IdParam, params);
    const upload = toUpload(rawQuery);
    const data = await readEvidenceFile(request, this.config);
    return this.evd.addRefillEvidence(actor, id, upload, data);
  }

  /** FR-INV-39. */
  @Post(':id/footage-requests')
  @RequirePermissions('refill.request')
  createFootageRequest(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.evd.createFootageRequest(
      actor,
      scope,
      id,
      parseBody(FootageCreateBody, body).reason,
    );
  }
}

@Controller('footage-requests')
export class FootageRequestsController {
  constructor(@Inject(EvdService) private readonly evd: EvdService) {}

  @Get()
  async list(
    @CurrentUser() actor: AuthenticatedUser,
    @CurrentBrandScope() scope: BrandScope,
    @Query() rawQuery: unknown,
  ) {
    const query = parseBody(FootageListQuery, rawQuery);
    const { items, total } = await this.evd.listFootageRequests(actor, scope, query);
    return { items, meta: { page: query.page, pageSize: query.pageSize, total } };
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @RequirePermissions(MACHINE_OPERATE)
  resolve(
    @CurrentUser() actor: AuthenticatedUser,
    @Param() params: unknown,
    @Body() body: unknown,
  ) {
    const { id } = parseBody(IdParam, params);
    return this.evd.resolveFootageRequest(actor, id, parseBody(FootageResolveBody, body));
  }
}

@Controller('evidence')
export class EvidenceController {
  constructor(@Inject(EvdService) private readonly evd: EvdService) {}

  /** ADR-0032 mục 8 — quyền kiểm trong service: chỉ người đã tải. */
  @Post(':id/remove')
  @HttpCode(200)
  remove(@CurrentUser() actor: AuthenticatedUser, @Param() params: unknown, @Body() body: unknown) {
    const { id } = parseBody(IdParam, params);
    return this.evd.remove(actor, id, parseBody(RemoveBody, body).reason);
  }
}

@Controller('public/refund-claims')
@Public()
export class PublicClaimEvidenceController {
  constructor(@Inject(EvdService) private readonly evd: EvdService) {}

  /** FR-ORD-39. */
  @Get(':code/evidence')
  list(@Param() params: unknown, @Query() rawQuery: unknown, @Req() request: FastifyRequest) {
    const { code } = parseBody(CodeParam, params);
    const { key } = parseBody(PublicEvidenceQuery, rawQuery);
    return this.evd.publicClaimEvidence(code, key, originOf(request));
  }
}

@Controller('evidence-files')
@Public()
export class EvidenceFilesController {
  constructor(@Inject(EvdService) private readonly evd: EvdService) {}

  /** Thẻ <video>/<img> không gửi được Bearer token — quyền nằm ở chữ ký trên đường dẫn. */
  @Get(':id')
  async file(
    @Param() params: unknown,
    @Query() rawQuery: unknown,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const { id } = parseBody(IdParam, params);
    const { exp, sig } = parseBody(FileQuery, rawQuery);
    const range = request.headers.range;
    const result = await this.evd.openFile(id, exp, sig, Array.isArray(range) ? range[0] : range);

    void reply
      .header('Cache-Control', 'private, no-store')
      .header('X-Content-Type-Options', 'nosniff')
      .header('Accept-Ranges', 'bytes');
    if (result.status === 416) {
      return reply.code(416).header('Content-Range', `bytes */${result.size}`).send();
    }
    void reply
      .header('Content-Type', result.contentType)
      .header('Content-Length', result.body.length);
    if (result.status === 206 && result.range) {
      void reply.header(
        'Content-Range',
        `bytes ${result.range.start}-${result.range.end}/${result.size}`,
      );
    }
    return reply.code(result.status).send(result.body);
  }
}
