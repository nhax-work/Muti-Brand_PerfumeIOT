import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { R2Config } from '../../shared/config/index.js';
import { keyFromPublicUrl, type MediaObject, type MediaStorage } from './media-storage.js';

/** Phần của S3Client mà kho dùng — test thay bằng bản giả. */
export interface S3Sender {
  send(command: PutObjectCommand | DeleteObjectCommand): Promise<unknown>;
}

/** Endpoint S3 API của Cloudflare R2 cho một tài khoản. */
export function r2Endpoint(accountId: string): string {
  return `https://${accountId}.r2.cloudflarestorage.com`;
}

export function createR2Client(config: R2Config): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint: r2Endpoint(config.accountId),
    credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  });
}

/**
 * Lưu ảnh lên Cloudflare R2 qua S3 API (ADR-0020). Khách đọc ảnh qua tên miền công khai của bucket
 * (`r2.dev` hoặc custom domain), nên bucket không cần mở CORS và API không phải phục vụ ảnh.
 */
export class R2MediaStorage implements MediaStorage {
  constructor(
    private readonly client: S3Sender,
    private readonly bucket: string,
    private readonly publicBaseUrl: string,
  ) {}

  async put(object: MediaObject): Promise<string> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: object.key,
        Body: object.body,
        ContentType: object.contentType,
        CacheControl: object.cacheControl,
      }),
    );
    return `${this.publicBaseUrl}/${object.key}`;
  }

  async delete(key: string): Promise<void> {
    // S3 API trả thành công cả khi đối tượng không tồn tại.
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  keyFromUrl(url: string | null | undefined): string | null {
    return keyFromPublicUrl(this.publicBaseUrl, url);
  }
}
