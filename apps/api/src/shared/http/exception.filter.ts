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

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const reply = host.switchToHttp().getResponse<ReplyLike>();

    if (exception instanceof AppError) {
      reply.status(exception.httpStatus).send({
        code: exception.code,
        message: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      });
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code = STATUS_TO_CODE[status];
      if (code) {
        reply.status(status).send({ code, message: exception.message });
        return;
      }
    }

    this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    reply.status(HttpStatus.INTERNAL_SERVER_ERROR).send({
      code: 'INTERNAL_ERROR',
      message: 'Lỗi hệ thống. Vui lòng thử lại sau.',
    });
  }
}
