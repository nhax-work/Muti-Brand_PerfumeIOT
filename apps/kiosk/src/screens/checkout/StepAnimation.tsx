import { useEffect, useRef, type ComponentType } from 'react';
import styles from './StepAnimation.module.css';

/**
 * Nguồn hình của một bước. Hiện dùng SVG inline có CSS animation (hình tạm trong `assets/steps`);
 * khi nhóm phần cứng gửi hoạt ảnh thật thì đổi sang `video` (WebM/MP4). Lottie: thêm một `kind` mới
 * khi dự án có thư viện phát Lottie — bố cục màn hình không phải sửa.
 */
export type StepSource =
  { kind: 'svg'; Art: ComponentType<{ slot: number }> } | { kind: 'video'; src: string };

/**
 * Khung hình 4:3 của một bước. Hoạt ảnh chỉ chạy khi `active` — thẻ mờ thì dừng để mắt khách dồn vào
 * bước đang sáng.
 */
export function StepAnimation({
  source,
  slot,
  active,
}: {
  source: StepSource;
  slot: number;
  active: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (active) void video.play().catch(() => {});
    else video.pause();
  }, [active]);

  return (
    <div className={styles.frame} data-active={active}>
      {source.kind === 'svg' ? (
        <source.Art slot={slot} />
      ) : (
        <video ref={videoRef} src={source.src} muted loop playsInline className={styles.video} />
      )}
    </div>
  );
}
