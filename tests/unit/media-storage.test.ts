/**
 * Kho ảnh sản phẩm (ADR-0020): driver R2 với S3 client giả, tách khóa từ URL, và cấu hình
 * MEDIA_STORAGE_DRIVER. Không gọi Cloudflare thật.
 */

import { DeleteObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { describe, expect, it } from 'vitest';
import {
  IMMUTABLE_CACHE_CONTROL,
  keyFromPublicUrl,
  R2MediaStorage,
  r2Endpoint,
  type S3Sender,
} from '../../apps/api/src/adapters/media/index.js';
import { loadConfig } from '../../apps/api/src/shared/config/index.js';

const BASE = 'https://pub-abc123.r2.dev';
const ACCOUNT = '0123456789abcdef0123456789abcdef';

function fakeClient() {
  const sent: (PutObjectCommand | DeleteObjectCommand)[] = [];
  const client: S3Sender = {
    async send(command) {
      sent.push(command);
      return {};
    },
  };
  return { client, sent };
}

describe('R2MediaStorage (ADR-0020)', () => {
  it('test_FR_PRD_01_r2_put_writes_object_with_type_and_immutable_cache', async () => {
    const { client, sent } = fakeClient();
    const storage = new R2MediaStorage(client, 'scentstation-media', BASE);
    const url = await storage.put({
      key: 'products/p1-abcdef0123456789.webp',
      body: Buffer.from('webp'),
      contentType: 'image/webp',
      cacheControl: IMMUTABLE_CACHE_CONTROL,
    });

    expect(url).toBe(`${BASE}/products/p1-abcdef0123456789.webp`);
    expect(sent).toHaveLength(1);
    const put = sent[0] as PutObjectCommand;
    expect(put).toBeInstanceOf(PutObjectCommand);
    expect(put.input).toMatchObject({
      Bucket: 'scentstation-media',
      Key: 'products/p1-abcdef0123456789.webp',
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    });
  });

  it('test_FR_PRD_01_r2_delete_targets_bucket_and_key', async () => {
    const { client, sent } = fakeClient();
    const storage = new R2MediaStorage(client, 'scentstation-media', BASE);
    await storage.delete('products/p1-old.webp');
    expect(sent[0]).toBeInstanceOf(DeleteObjectCommand);
    expect((sent[0] as DeleteObjectCommand).input).toEqual({
      Bucket: 'scentstation-media',
      Key: 'products/p1-old.webp',
    });
  });

  it('test_FR_PRD_01_r2_endpoint_uses_account_id', () => {
    expect(r2Endpoint('acc123')).toBe('https://acc123.r2.cloudflarestorage.com');
  });
});

describe('keyFromPublicUrl', () => {
  it('test_FR_PRD_01_key_only_for_urls_issued_by_the_store', () => {
    expect(keyFromPublicUrl(BASE, `${BASE}/products/a.webp`)).toBe('products/a.webp');
    // Ảnh nhập tay từ nơi khác không thuộc kho — không bao giờ bị xóa.
    expect(keyFromPublicUrl(BASE, 'https://cdn.example.com/products/a.webp')).toBeNull();
    expect(keyFromPublicUrl(BASE, `${BASE}/../secret`)).toBeNull();
    expect(keyFromPublicUrl(BASE, null)).toBeNull();
  });
});

describe('Cấu hình kho ảnh (MEDIA_STORAGE_DRIVER)', () => {
  const BASE_ENV = { DATABASE_URL: 'postgres://unused', JWT_SECRET: 'unit-test-secret' };

  it('test_FR_PRD_01_media_defaults_to_local_driver_served_by_api', () => {
    const { media } = loadConfig({ ...BASE_ENV });
    expect(media.driver).toBe('local');
    expect(media.publicBaseUrl).toBe('http://localhost:3000/api/v1/media');
    expect(media.r2).toBeNull();
  });

  it('test_FR_PRD_01_r2_driver_requires_all_credentials', () => {
    expect(() =>
      loadConfig({ ...BASE_ENV, MEDIA_STORAGE_DRIVER: 'r2', R2_ACCOUNT_ID: ACCOUNT }),
    ).toThrow(/R2_ACCESS_KEY_ID/);
  });

  it('test_FR_PRD_01_r2_public_url_must_be_https', () => {
    const env = {
      ...BASE_ENV,
      MEDIA_STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: ACCOUNT,
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket',
      MEDIA_PUBLIC_BASE_URL: 'http://pub-abc.r2.dev',
    };
    expect(() => loadConfig(env)).toThrow(/https/);
    const media = loadConfig({ ...env, MEDIA_PUBLIC_BASE_URL: `${BASE}/` }).media;
    expect(media).toMatchObject({ driver: 'r2', publicBaseUrl: BASE });
    expect(media.r2).toMatchObject({ accountId: ACCOUNT, bucket: 'bucket' });
  });

  it('test_FR_PRD_01_r2_account_id_accepts_pasted_endpoint_url', () => {
    // Trang tạo token của Cloudflare hiện nguyên endpoint; dán cả URL vẫn phải ra đúng Account ID —
    // trước đây S3 client dựng tên miền "<bucket>.https" và upload hỏng với ENOTFOUND.
    const media = loadConfig({
      ...BASE_ENV,
      MEDIA_STORAGE_DRIVER: 'r2',
      R2_ACCOUNT_ID: `https://${ACCOUNT.toUpperCase()}.r2.cloudflarestorage.com/`,
      R2_ACCESS_KEY_ID: 'key',
      R2_SECRET_ACCESS_KEY: 'secret',
      R2_BUCKET: 'bucket',
      MEDIA_PUBLIC_BASE_URL: BASE,
    }).media;
    expect(media.r2?.accountId).toBe(ACCOUNT);
  });

  it('test_FR_PRD_01_r2_account_id_rejects_malformed_value_at_startup', () => {
    expect(() =>
      loadConfig({
        ...BASE_ENV,
        MEDIA_STORAGE_DRIVER: 'r2',
        R2_ACCOUNT_ID: 'https://example.com',
        R2_ACCESS_KEY_ID: 'key',
        R2_SECRET_ACCESS_KEY: 'secret',
        R2_BUCKET: 'bucket',
        MEDIA_PUBLIC_BASE_URL: BASE,
      }),
    ).toThrow(/32 ký tự hex/);
  });

  it('test_FR_PRD_01_unknown_driver_rejected', () => {
    expect(() => loadConfig({ ...BASE_ENV, MEDIA_STORAGE_DRIVER: 's3' })).toThrow(/local hoặc r2/);
  });
});
