import { useState } from 'react';
import styles from './ProductImage.module.css';

/**
 * Ảnh sản phẩm khung 4:5, cắt vừa khung. Thương hiệu chưa có ảnh hoặc ảnh tải lỗi thì hiện khối
 * trung tính — không bao giờ thay bằng ảnh chai khác, khách sẽ tưởng là sản phẩm này.
 */
export function ProductImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && failedSrc !== src;

  return (
    <div className={`${styles.frame} ${className ?? ''}`}>
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={alt}
          className={styles.image}
          loading="lazy"
          draggable={false}
          onError={() => setFailedSrc(src ?? null)}
        />
      ) : (
        <div className={styles.placeholder} role="img" aria-label={alt} />
      )}
    </div>
  );
}
