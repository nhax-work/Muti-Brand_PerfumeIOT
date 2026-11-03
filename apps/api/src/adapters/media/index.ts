/**
 * Mặt tiền của adapter kho ảnh (ADR-0020). Module khác CHỈ import từ file này (QT3, ADR-0003).
 */
export { MediaModule } from './media.module.js';
export {
  IMMUTABLE_CACHE_CONTROL,
  MEDIA_STORAGE,
  keyFromPublicUrl,
  type MediaObject,
  type MediaStorage,
} from './media-storage.js';
export { LocalMediaStorage } from './local-media-storage.js';
export { R2MediaStorage, r2Endpoint, type S3Sender } from './r2-media-storage.js';
export { LOCAL_MEDIA_ROUTE, registerMediaRoutes } from './register-media-routes.js';
