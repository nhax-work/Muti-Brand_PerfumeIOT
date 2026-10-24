/**
 * Âm báo "đèn nút đã sáng" tổng hợp bằng Web Audio — không dùng file âm thanh có bản quyền.
 *
 * Trình duyệt chặn phát âm thanh khi người dùng chưa chạm trang (autoplay policy). Kiosk gọi
 * `unlockAudio()` ở mỗi lần chạm; lần đầu tạo AudioContext ngay trong thao tác chạm nên được phép,
 * các lần sau chỉ đánh thức nếu trình duyệt lỡ tạm dừng nó. Không có Web Audio (máy cũ, môi trường
 * test) thì mọi hàm đều im lặng.
 */
let ctx: AudioContext | null = null;

export function unlockAudio(): void {
  if (!ctx) {
    const Ctor = typeof window !== 'undefined' ? window.AudioContext : undefined;
    if (!Ctor) return;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

/** Hai nốt sine ngắn đi lên, vào ra êm — đủ để khách ngẩng lên nhìn máy, không giật mình. */
export function playChime(): void {
  if (!ctx || ctx.state !== 'running') return;
  const start = ctx.currentTime;
  const notes: [frequency: number, offset: number][] = [
    [880, 0],
    [1318.5, 0.18],
  ];
  for (const [frequency, offset] of notes) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frequency;
    const t = start + offset;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.18, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.65);
  }
}
