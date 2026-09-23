/**
 * Mọi lỗi ra khỏi API đều có dạng `{ code, message, details? }`, với `code` nằm trong
 * spec/errors.md (contract openapi.yaml, schema `Error`).
 *
 *   AppError           -> đúng mã và HTTP status trong đặc tả
 *   HttpException Nest -> ánh xạ sang mã chung (404 route lạ, 400 body không đọc được, ...)
 *   mọi thứ khác       -> INTERNAL_ERROR 500, KHÔNG kèm chi tiết nội bộ; chi tiết chỉ vào log
 */

import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import {
  DEFAULT_LOCALE,
  translate,
  type MessageKey,
} from '@scentstation/i18n';
import { AppError, type ErrorCode } from '../errors/index.js';

interface ReplyLike {
  status(code: number): ReplyLike;
  send(body: unknown): void;
}

const STATUS_TO_CODE: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHENTICATED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN_SCOPE',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
};

/**
 * Nest tự sinh message tiếng Anh cho lỗi hạ tầng ("Cannot GET /xyz"), nên không dùng lại được.
 * Thay bằng khóa của mình để phản hồi giữ đúng một ngôn ngữ.
 */
const STATUS_TO_KEY: Partial<Record<number, MessageKey>> = {
  [HttpStatus.BAD_REQUEST]: 'validation.invalidPayload',
  [HttpStatus.UNAUTHORIZED]: 'common.unauthenticated',
  [HttpStatus.FORBIDDEN]: 'common.forbidden',
  [HttpStatus.NOT_FOUND]: 'common.routeNotFound',
};

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();

    if (exception instanceof AppError) {
      // `messageKey` đi kèm để kiosk và web quản trị dịch sang ngôn ngữ đang chọn. Đặt trong
      // `details` chứ không ở mức trên cùng: `Error.details` được contract khai báo
      // `additionalProperties: true`, nên thêm khóa ở đây KHÔNG phải là sửa contract đóng băng.
      reply.status(exception.httpStatus).send({
        code: exception.code,
        message: exception.message,
        details: {
          ...(exception.details ?? {}),
          messageKey: exception.messageKey,
          ...(exception.messageParams ? { messageParams: exception.messageParams } : {}),
        },
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_CODE[status];
      const messageKey = STATUS_TO_KEY[status];
      if (code && messageKey) {
        reply.status(status).send({
          code,
          message: translate(DEFAULT_LOCALE, messageKey),
          details: { messageKey },
        });
        return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      code: 'INTERNAL_ERROR',
      message: translate(DEFAULT_LOCALE, 'common.internalError'),
      details: { messageKey: 'common.internalError' },
    });
  }
}
