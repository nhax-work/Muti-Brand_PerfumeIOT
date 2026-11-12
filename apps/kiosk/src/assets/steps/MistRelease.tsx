import styles from './steps.module.css';

const DROPS: readonly [number, number, number][] = [
  [80, 42, 2.5],
  [70, 50, 2],
  [90, 50, 2],
  [62, 60, 1.8],
  [80, 58, 2.2],
  [98, 60, 1.8],
  [56, 72, 1.5],
  [72, 70, 1.8],
  [88, 70, 1.8],
  [104, 72, 1.5],
];

/** HÌNH TẠM bước 03: làn sương tỏa ra từ vòi, vòng nhỏ đếm thời gian giữ yên 2–3 giây. */
export function MistRelease() {
  return (
    <svg className={styles.art} viewBox="0 0 160 120" aria-hidden="true">
      <rect x="62" y="6" width="36" height="16" rx="3" />
      <path d="M75 22v8h10v-8" />
      <g className={styles.mist}>
        {DROPS.map(([cx, cy, r]) => (
          <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
        ))}
      </g>
      {/* Vòng giữ yên */}
      <circle className={styles.holdTrack} cx="136" cy="96" r="14" />
      <circle
        className={styles.hold}
        cx="136"
        cy="96"
        r="14"
        pathLength={100}
        transform="rotate(-90 136 96)"
      />
    </svg>
  );
}
