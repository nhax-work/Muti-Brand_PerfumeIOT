import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { keyFromPublicUrl, type MediaObject, type MediaStorage } from './media-storage.js';

/**
 * Lưu ảnh vào thư mục MEDIA_DIR; API phục vụ tĩnh tại /api/v1/media (registerMediaRoutes).
 * Dành cho máy dev chưa có khóa R2, test tích hợp và CI (ADR-0020 mục 3).
 */
export class LocalMediaStorage implements MediaStorage {
  private readonly root: string;

  constructor(
    rootDir: string,
    private readonly publicBaseUrl: string,
  ) {
    this.root = path.resolve(rootDir);
  }

  async put(object: MediaObject): Promise<string> {
    const target = this.resolve(object.key);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, object.body);
    return `${this.publicBaseUrl}/${object.key}`;
  }

  async delete(key: string): Promise<void> {
    await rm(this.resolve(key), { force: true });
  }

  keyFromUrl(url: string | null | undefined): string | null {
    return keyFromPublicUrl(this.publicBaseUrl, url);
  }

  /** Đường dẫn tuyệt đối của khóa, không cho thoát ra ngoài thư mục gốc. */
  private resolve(key: string): string {
    const target = path.resolve(this.root, key);
    if (!target.startsWith(this.root + path.sep)) {
      throw new Error(`Khóa ảnh không hợp lệ: ${key}`);
    }
    return target;
  }
}
