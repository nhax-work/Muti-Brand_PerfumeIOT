import { Global, Logger, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { LocalMediaStorage } from './local-media-storage.js';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage.js';
import {
  LocalPrivateMediaStorage,
  PRIVATE_MEDIA_STORAGE,
  R2PrivateMediaStorage,
  type PrivateMediaStorage,
} from './private-media-storage.js';
import { createR2Client, R2MediaStorage } from './r2-media-storage.js';

/**
 * Một kho ảnh công khai cho cả tiến trình, chọn theo MEDIA_STORAGE_DRIVER (ADR-0020), và một kho
 * riêng tư cho bằng chứng camera (ADR-0032).
 */
@Global()
@Module({
  providers: [
    {
      provide: MEDIA_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): MediaStorage => {
        const { media } = config;
        if (media.driver === 'r2' && media.r2) {
          return new R2MediaStorage(createR2Client(media.r2), media.r2.bucket, media.publicBaseUrl);
        }
        return new LocalMediaStorage(media.localDir, media.publicBaseUrl);
      },
    },
    {
      provide: PRIVATE_MEDIA_STORAGE,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): PrivateMediaStorage => {
        const { media } = config;
        if (media.driver === 'r2' && media.r2?.privateBucket) {
          return new R2PrivateMediaStorage(createR2Client(media.r2), media.r2.privateBucket);
        }
        if (media.driver === 'r2') {
          new Logger('Media').warn(
            'Chưa khai R2_PRIVATE_BUCKET — bằng chứng camera lưu ở MEDIA_PRIVATE_DIR trên máy chủ (ADR-0032).',
          );
        }
        return new LocalPrivateMediaStorage(media.privateLocalDir);
      },
    },
  ],
  exports: [MEDIA_STORAGE, PRIVATE_MEDIA_STORAGE],
})
export class MediaModule {}
