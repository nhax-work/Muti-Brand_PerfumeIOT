/**
 * Bảng chuyển trạng thái yêu cầu bổ sung (FR-RFQ-04, spec/glossary.md mục RefillRequest).
 */

import { describe, expect, it } from 'vitest';
import { canTransitionRefillRequest } from '../../apps/api/src/modules/rfq/index.js';

describe('canTransitionRefillRequest (FR-RFQ-04)', () => {
  it('test_FR_RFQ_04_status_transitions — SUBMITTED chỉ sang ACCEPTED hoặc REJECTED (AC1)', () => {
    expect(canTransitionRefillRequest('SUBMITTED', 'ACCEPTED')).toBe(true);
    expect(canTransitionRefillRequest('SUBMITTED', 'REJECTED')).toBe(true);
    for (const to of ['SCHEDULED', 'COMPLETED', 'CANCELLED'] as const) {
      expect(canTransitionRefillRequest('SUBMITTED', to)).toBe(false);
    }
  });

  it('test_FR_RFQ_04_status_transitions — ACCEPTED/SCHEDULED lên lịch, hủy hoặc hoàn tất (AC2, AC3)', () => {
    for (const from of ['ACCEPTED', 'SCHEDULED'] as const) {
      for (const to of ['SCHEDULED', 'CANCELLED', 'COMPLETED'] as const) {
        expect(canTransitionRefillRequest(from, to)).toBe(true);
      }
      expect(canTransitionRefillRequest(from, 'REJECTED')).toBe(false);
      expect(canTransitionRefillRequest(from, 'ACCEPTED')).toBe(false);
    }
  });

  it('test_FR_RFQ_04_status_transitions — trạng thái kết thúc không đi đâu được nữa (AC4)', () => {
    const all = [
      'SUBMITTED',
      'ACCEPTED',
      'REJECTED',
      'SCHEDULED',
      'COMPLETED',
      'CANCELLED',
    ] as const;
    for (const from of ['COMPLETED', 'REJECTED', 'CANCELLED'] as const) {
      for (const to of all) expect(canTransitionRefillRequest(from, to)).toBe(false);
    }
  });
});
