import { useId, type CSSProperties } from 'react';
import styles from './GuideIllustrations.module.css';

/**
 * Hình minh họa động cho ba bước nhận lượt xịt (ADR-0007). Vẽ bằng SVG + CSS animation để không phụ
 * thuộc file ảnh; muốn thay bằng ảnh/GIF thật thì đổi phần tử trả về của từng component thành `<img>`.
 * Không chứa chữ — chú thích nằm ở `DispenseSuccessGuide` để đi qua i18n (NFR-USA-07).
 */

/** Thân máy nhìn nghiêng, vòi phun hướng sang phải. */
function MachineSide() {
  return (
    <g>
      <rect x="-12" y="14" width="76" height="132" rx="10" className={styles.machine} />
      <rect x="62" y="52" width="18" height="20" rx="4" className={styles.machine} />
      <circle cx="81" cy="62" r="3.5" className={styles.nozzleTip} />
    </g>
  );
}

/** Cổ tay đưa ngang vào từ mép phải, đầu ngón tay hướng về vòi. */
function Hand() {
  return (
    <g>
      <path
        className={styles.hand}
        d="M250 76 L178 73 C168 72 160 69 150 69 L120 71 C112 71 110 80 117 81 L144 83 C138 87 137 92 145 94 L162 97 C168 99 172 101 180 101 L250 104 Z"
      />
      {/* Mép dưới ngón trỏ kéo vào lòng bàn tay — tách ngón trỏ khỏi các ngón đang gập. */}
      <path d="M142 82 C152 81.5 164 82 174 86" className={styles.crease} />
      <circle cx="170" cy="97" r="2.6" className={styles.pulsePoint} />
    </g>
  );
}

/**
 * Đầu nhìn nghiêng, tóc búi, mặt hướng về vòi; chỉ vẽ cổ và một đoạn vai ngắn rồi mờ dần vào nền
 * (không vẽ thân). Vùng cổ dưới cằm ngang tầm vòi phun.
 */
function Neck() {
  const fadeId = `neck-fade-${useId().replace(/[^\w-]/g, '')}`;
  return (
    <g transform="translate(2 -1) scale(0.85)">
      <defs>
        <linearGradient id={fadeId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" className={styles.fadeStop} stopOpacity="0" />
          <stop offset="0.75" className={styles.fadeStop} stopOpacity="1" />
        </linearGradient>
      </defs>
      <path
        className={styles.hand}
        d="M142 6 C132 7 126 14 125 22 C124 26 122 28 121 30 C118 34 115 37 114 39 C113 41 115 42 118 42 C118 44 116 45 117 46 C116 47 117 48 118 48.5 C117 50 117 51 118 52 C118 54 117 56 119 58 C121 61 126 62 132 63 C131 74 132 86 134 96 C135 104 131 112 126 120 C124 124 123 128 123 134 L262 134 C248 120 228 107 210 103 C192 99 178 96 170 88 C165 80 165 72 170 64 C186 50 190 30 180 16 C172 6 156 2 142 6 Z"
      />
      <path
        className={styles.hair}
        d="M126 20 C128 8 142 0 158 1 C176 2 190 14 190 30 C190 44 184 56 176 63 C174 54 171 46 166 40 C160 33 152 26 140 23 C134 21 129 21 126 20 Z"
      />
      <circle cx="192" cy="22" r="11" className={styles.hair} />
      <path d="M159 34 C165 32 167 44 161 46" className={styles.ear} />
      <circle cx="138" cy="74" r="2.8" className={styles.pulsePoint} />
      <rect x="100" y="94" width="180" height="46" fill={`url(#${fadeId})`} />
    </g>
  );
}

/** Luân phiên cổ tay và cổ tiến lại gần vòi — khách xịt lên chỗ nào cũng được. */
export function ApproachIllustration() {
  return (
    <svg viewBox="0 0 240 160" className={styles.svg} aria-hidden="true">
      <MachineSide />
      <g className={styles.approachHand}>
        <Hand />
      </g>
      <g className={styles.approachNeck}>
        <Neck />
      </g>
      <g className={styles.approachRuler}>
        <path d="M84 88 H114" className={styles.ruler} />
        <path d="M84 83 V93 M114 83 V93" className={styles.ruler} />
      </g>
    </svg>
  );
}

const PANEL_BUTTONS = 4;

/** Mặt trước máy: hàng nút có đèn, nút của ô khách mua sáng lên và được ngón tay nhấn. */
export function PressIllustration({ slot }: { slot: number }) {
  const target = (((slot - 1) % PANEL_BUTTONS) + PANEL_BUTTONS) % PANEL_BUTTONS;
  const xs = [60, 100, 140, 180];
  const tx = xs[target] ?? xs[0]!;
  return (
    <svg viewBox="0 0 240 160" className={styles.svg} aria-hidden="true">
      <rect x="22" y="12" width="196" height="150" rx="14" className={styles.machine} />
      {xs.map((x) => (
        <circle key={`n${x}`} cx={x} cy="44" r="4" className={styles.nozzleIdle} />
      ))}
      {xs.map((x, i) =>
        i === target ? null : (
          <circle key={`b${x}`} cx={x} cy="92" r="12" className={styles.buttonIdle} />
        ),
      )}
      <circle cx={tx} cy="92" r="12" className={styles.glowRing} />
      <g className={styles.targetButton} style={{ transformOrigin: `${tx}px 92px` }}>
        <circle cx={tx} cy="92" r="12" className={styles.buttonLit} />
        <text x={tx} y="92" className={styles.buttonNumber}>
          {slot}
        </text>
      </g>
      <g className={styles.finger}>
        <rect x={tx - 10} y="100" width="20" height="70" rx="10" className={styles.hand} />
        <path d={`M${tx - 5} 108 H${tx + 5}`} className={styles.nail} />
      </g>
    </svg>
  );
}

const MIST = [
  { dx: 30, dy: 6, delay: 0 },
  { dx: 36, dy: 12, delay: 0.15 },
  { dx: 33, dy: 18, delay: 0.3 },
  { dx: 40, dy: 9, delay: 0.45 },
  { dx: 34, dy: 15, delay: 0.6 },
  { dx: 38, dy: 3, delay: 0.75 },
];

export function MistIllustration() {
  return (
    <svg viewBox="0 0 240 160" className={styles.svg} aria-hidden="true">
      <MachineSide />
      <Hand />
      {MIST.map((m) => (
        <circle
          key={m.delay}
          cx="84"
          cy="62"
          r="2.2"
          className={styles.mistDrop}
          style={
            {
              '--dx': `${m.dx}px`,
              '--dy': `${m.dy}px`,
              animationDelay: `${m.delay}s`,
            } as CSSProperties
          }
        />
      ))}
      <circle cx="206" cy="36" r="13" className={styles.timerTrack} />
      <circle cx="206" cy="36" r="13" className={styles.timerArc} />
    </svg>
  );
}
