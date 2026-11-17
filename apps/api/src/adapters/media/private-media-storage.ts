/**
 * Kho tệp RIÊNG TƯ — bằng chứng camera an ninh (ADR-0032 mục 8).
 *
 * Khác kho ảnh công khai (`MediaStorage`): không có URL công khai nào trỏ vào đây. Người xem chỉ đọc
 * được qua API, bằng đường dẫn ký có hạn do module nghiệp vụ cấp. Vì vậy không cần presigned URL của
 * S3, và bucket R2 riêng tư không cần tên miền công khai.
 *
 *   local: thư mục MEDIA_PRIVATE_DIR (không nằm dưới /api/v1/media).
 *   r2:    bucket R2_PRIVATE_BUCKET; chưa khai thì lùi về thư mục local.
 */

import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  NoSuchKey,
  PutObjectCommand,
} from '@aws-sdk/client-s3';

export interface PrivateMediaStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  /** `null` nếu không có đối tượng. */
  get(key: string): Promise<Buffer | null>;
  /** Không có cũng không lỗi. */
  delete(key: string): Promise<void>;
}

export const PRIVATE_MEDIA_STORAGE = Symbol('PRIVATE_MEDIA_STORAGE');

/** Khóa đối tượng hợp lệ: đường dẫn tương đối, không `..`, không bắt đầu bằng `/`. */
function assertKey(key: string): void {
  if (!key || key.startsWith('/') || key.split('/').includes('..')) {
    throw new Error(`Khóa tệp riêng tư không hợp lệ: ${key}`);
  }
}

export class LocalPrivateMediaStorage implements PrivateMediaStorage {
  private readonly root: string;

  constructor(rootDir: string) {
    this.root = path.resolve(rootDir);
  }

  async put(key: string, body: Buffer): Promise<void> {
    const target = this.resolve(key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, body);
  }

  async get(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.resolve(key));
    } catch (err) {
      if ((err as { code?: string }).code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  private resolve(key: string): string {
    assertKey(key);
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) {
      throw new Error(`Khóa tệp riêng tư không hợp lệ: ${key}`);
    }
    return target;
  }
}

/** Phần của S3Client mà kho riêng tư dùng — test thay bằng bản giả. */
export interface PrivateS3Sender {
  send(command: PutObjectCommand | GetObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

export class R2PrivateMediaStorage implements PrivateMediaStorage {
  constructor(
    private readonly client: PrivateS3Sender,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: 'private, no-store',
      }),
    );
  }

  async get(key: string): Promise<Buffer | null> {
    assertKey(key);
    try {
      const out = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      )) as { Body?: { transformToByteArray(): Promise<Uint8Array> } };
      if (!out.Body) return null;
      return Buffer.from(await out.Body.transformToByteArray());
    } catch (err) {
      if (err instanceof NoSuchKey || (err as { name?: string }).name === 'NoSuchKey') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    assertKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}
