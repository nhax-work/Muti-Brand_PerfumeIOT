/**
 * Logic thuần của bằng chứng camera (ADR-0032): nhận diện MP4, khung giờ và độ lệch đồng hồ camera,
 * đường dẫn ký có hạn, header Range.
 */

import { describe, expect, it } from 'vitest';
import {
  fileUrlKey,
  isMp4,
  overlaps,
  padWindow,
  parseRange,
  signFileUrl,
  toRealTime,
  verifyFileUrl,
} from '../../apps/api/src/modules/evd/evidence-rules.js';

const at = (iso: string) => new Date(iso);

describe('tệp bằng chứng', () => {
  it('test_FR_ORD_38_mp4_detected_by_content_not_name', () => {
    const mp4 = Buffer.concat([
      Buffer.from([0, 0, 0, 0x18]),
      Buffer.from('ftypisom'),
      Buffer.alloc(8),
    ]);
    expect(isMp4(mp4)).toBe(true);
    expect(isMp4(Buffer.from('xxxxftyp'))).toBe(false); // quá ngắn
    expect(isMp4(Buffer.from('\xff\xd8\xff\xe0 anh jpeg'))).toBe(false);
    expect(isMp4(Buffer.from('RIFF....WEBPVP8 '))).toBe(false);
  });
});

describe('khung giờ', () => {
  it('test_FR_ORD_38_window_padding_and_camera_clock_offset', () => {
    const window = padWindow(at('2026-11-17T03:00:00Z'), at('2026-11-17T03:02:00Z'), 60);
    expect(window).toEqual({ from: at('2026-11-17T02:59:00Z'), to: at('2026-11-17T03:03:00Z') });

    // Camera chạy nhanh 1 giờ: hình ghi 04:00 trên màn hình là 03:00 giờ thật.
    const onScreen = { from: at('2026-11-17T04:00:30Z'), to: at('2026-11-17T04:01:30Z') };
    expect(overlaps(onScreen, window)).toBe(false);
    expect(overlaps(toRealTime(onScreen, 3600), window)).toBe(true);

    // Chạm mép vẫn tính là giao; lệch một mili giây thì không.
    expect(overlaps({ from: window.to, to: at('2026-11-17T03:10:00Z') }, window)).toBe(true);
    expect(
      overlaps({ from: new Date(window.to.getTime() + 1), to: at('2026-11-17T03:10:00Z') }, window),
    ).toBe(false);
  });
});

describe('đường dẫn ký có hạn', () => {
  const key = fileUrlKey('bi-mat-goc');
  const now = at('2026-11-17T03:00:00Z');
  const id = '6f1c2b0a-0000-4000-8000-000000000001';

  it('test_FR_ORD_39_signed_url_bound_to_file_and_expiry', () => {
    const { url, expiresAt } = signFileUrl(key, id, now, 300);
    expect(expiresAt).toEqual(at('2026-11-17T03:05:00Z'));
    const params = new URL(`http://x${url}`).searchParams;
    const exp = Number(params.get('exp'));
    const sig = params.get('sig')!;

    expect(verifyFileUrl(key, id, exp, sig, now)).toBe(true);
    // Hết hạn.
    expect(verifyFileUrl(key, id, exp, sig, at('2026-11-17T03:05:01Z'))).toBe(false);
    // Đổi tệp, đổi hạn, đổi khóa gốc.
    expect(verifyFileUrl(key, '6f1c2b0a-0000-4000-8000-000000000002', exp, sig, now)).toBe(false);
    expect(verifyFileUrl(key, id, exp + 3600, sig, now)).toBe(false);
    expect(verifyFileUrl(fileUrlKey('bi-mat-khac'), id, exp, sig, now)).toBe(false);
    // Khóa ký đường dẫn không trùng bí mật gốc (không dùng chung với JWT).
    expect(key.toString('utf8')).not.toContain('bi-mat-goc');
  });
});

describe('Range', () => {
  it('test_FR_ORD_39_range_header_for_video_seeking', () => {
    expect(parseRange(undefined, 100)).toBeNull();
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=90-', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=-10', 100)).toEqual({ start: 90, end: 99 });
    expect(parseRange('bytes=50-500', 100)).toEqual({ start: 50, end: 99 });
    expect(parseRange('bytes=100-', 100)).toBe('unsatisfiable');
    expect(parseRange('bytes=9-1', 100)).toBe('unsatisfiable');
    expect(parseRange('items=0-1', 100)).toBe('unsatisfiable');
  });
});
