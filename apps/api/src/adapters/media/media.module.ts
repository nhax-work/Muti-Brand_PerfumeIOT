import { Global, Module } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../../shared/config/index.js';
import { LocalMediaStorage } from './local-media-storage.js';
import { MEDIA_STORAGE, type MediaStorage } from './media-storage.js';
import { createR2Client, R2MediaStorage } from './r2-media-storage.js';

/** Một kho ảnh cho cả tiến trình, chọn theo MEDIA_STORAGE_DRIVER (ADR-0020). */
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
  ],
  exports: [MEDIA_STORAGE],
})
export class MediaModule {}
