/**
 * Tiện ích tải bằng chứng camera qua HTTP thật (ADR-0032): multipart trường `file`, khoảng ghi trên
 * query — đúng như web quản trị gửi.
 */

import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import sharp from 'sharp';

/** Đủ để qua kiểm tra `ftyp` (ISO BMFF); không cần phát được. */
export function fakeMp4(extraBytes = 256): Buffer {
  const header = Buffer.alloc(24);
  header.writeUInt32BE(24, 0);
  header.write('ftyp', 4, 'ascii');
  header.write('isom', 8, 'ascii');
  header.writeUInt32BE(0x200, 12);
  header.write('isomiso2', 16, 'ascii');
  return Buffer.concat([header, Buffer.alloc(extraBytes, 7)]);
}

/** Ảnh JPEG thật nhỏ — để kiểm bước mã hóa lại sang WebP. */
export function tinyJpeg(): Promise<Buffer> {
  return sharp({
    create: { width: 40, height: 30, channels: 3, background: { r: 200, g: 120, b: 40 } },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: 'camera-test' } } })
    .toBuffer();
}

export interface UploadQuery {
  cameraLabel?: string;
  recordedFrom: string;
  recordedTo: string;
  clockOffsetSec?: number;
  note?: string;
}

export function uploadEvidence(
  app: NestFastifyApplication,
  token: string,
  path: string,
  file: Buffer,
  query: UploadQuery,
) {
  const boundary = '----scentstation-evidence-boundary';
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.bin"\r\n` +
        'Content-Type: application/octet-stream\r\n\r\n',
    ),
    file,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const params = new URLSearchParams({
    cameraLabel: query.cameraLabel ?? 'Cam-test',
    recordedFrom: query.recordedFrom,
    recordedTo: query.recordedTo,
    ...(query.clockOffsetSec !== undefined ? { clockOffsetSec: String(query.clockOffsetSec) } : {}),
    ...(query.note !== undefined ? { note: query.note } : {}),
  });
  return app.inject({
    method: 'POST',
    url: `/api/v1${path}?${params.toString()}`,
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      authorization: `Bearer ${token}`,
    },
    payload,
  });
}
