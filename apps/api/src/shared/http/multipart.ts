/**
 * Đọc tệp ảnh từ multipart/form-data cho các endpoint upload (ADR-0020, ADR-0022).
 */

import type { MessageKey } from '@scentstation/i18n';
import type { FastifyRequest } from 'fastify';
import { AppError, invalidField } from '../errors/index.js';

export interface UploadMessages {
  /** Không phải multipart, hoặc không có đúng một trường `file`. */
  readonly required: MessageKey;
  /** Tệp vượt `maxBytes`; nhận tham số `{maxMb}`. */
  readonly tooLarge: MessageKey;
}

/**
 * Đọc đúng một tệp `file` vào bộ nhớ, dừng ngay khi vượt `maxBytes` — không bao giờ giữ một tệp quá
 * cỡ trong RAM.
 */
export async function readImageFile(
  request: FastifyRequest,
  maxBytes: number,
  messages: UploadMessages,
): Promise<Buffer> {
  if (!request.isMultipart()) throw invalidField('file', messages.required);
  let part;
  try {
    part = await request.file({ limits: { fileSize: maxBytes, files: 1 } });
  } catch {
    throw invalidField('file', messages.required);
  }
  if (!part || part.fieldname !== 'file') throw invalidField('file', messages.required);
  try {
    // toBuffer() ném lỗi FST_REQ_FILE_TOO_LARGE khi vượt giới hạn fileSize.
    return await part.toBuffer();
  } catch (err) {
    if ((err as { code?: string }).code === 'FST_REQ_FILE_TOO_LARGE') {
      throw new AppError('FILE_TOO_LARGE', messages.tooLarge, {
        maxMb: Math.floor(maxBytes / (1024 * 1024)),
      });
    }
    throw err;
  }
}
