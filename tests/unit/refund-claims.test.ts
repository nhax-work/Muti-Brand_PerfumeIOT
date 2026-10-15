/**
 * Logic thuần của phiếu khiếu nại hoàn tiền (ADR-0012): ai được khiếu nại, hoàn bao nhiêu, mã khiếu
 * nại, và mã hóa dữ liệu cá nhân.
 */

import { describe, expect, it } from 'vitest';
import {
  claimTokenFor,
  isValidClaimToken,
  refundablePartsOf,
} from '../../apps/api/src/modules/ord/refund-claims/claimability.js';
import { decryptJson, encryptJson } from '../../apps/api/src/shared/crypto/pii-cipher.js';

const PAID = new Date('2026-10-13T03:00:00Z');
const base = { paidAt: PAID, needsManualReview: false, amount: '42000.0000' };

describe('refundablePartsOf', () => {
  it('test_FR_ORD_28_unserved_paid_orders_are_claimable', () => {
    expect(refundablePartsOf({ ...base, status: 'FAILED' }, 0)).toEqual({
      refundOrder: true,
      extraTransfers: 0,
      amount: '42000.0000',
    });
    expect(
      refundablePartsOf({ ...base, status: 'REFUND_PENDING', paidAt: null }, 0)?.refundOrder,
    ).toBe(true);
    expect(
      refundablePartsOf({ ...base, status: 'DISPENSE_REQUESTED', needsManualReview: true }, 0)
        ?.refundOrder,
    ).toBe(true);
  });

  it('test_FR_ORD_28_served_or_unpaid_orders_are_not_claimable', () => {
    expect(refundablePartsOf({ ...base, status: 'DISPENSED' }, 0)).toBeNull();
    expect(refundablePartsOf({ ...base, status: 'FORFEITED' }, 0)).toBeNull();
    // FAILED trước khi thanh toán (ví dụ CREATED → FAILED): khách chưa mất tiền.
    expect(refundablePartsOf({ ...base, status: 'FAILED', paidAt: null }, 0)).toBeNull();
    // Đèn đang sáng, chưa có sự cố: chưa phải lúc khiếu nại.
    expect(refundablePartsOf({ ...base, status: 'DISPENSE_REQUESTED' }, 0)).toBeNull();
  });

  it('test_FR_ORD_29_amount_adds_extra_transfers_without_float_error', () => {
    // Đã nhận lượt xịt nhưng chuyển thừa hai lần: chỉ hoàn phần thừa.
    expect(refundablePartsOf({ ...base, status: 'DISPENSED', amount: '35000.5000' }, 2)).toEqual({
      refundOrder: false,
      extraTransfers: 2,
      amount: '70001.0000',
    });
    // Không nhận được lượt xịt và còn chuyển thừa một lần: hoàn cả hai.
    expect(refundablePartsOf({ ...base, status: 'FAILED', amount: '0.1000' }, 1)?.amount).toBe(
      '0.2000',
    );
  });
});

describe('mã khiếu nại', () => {
  it('test_FR_ORD_29_claim_token_bound_to_order_and_secret', () => {
    const orderId = '6f1c2b0a-0000-4000-8000-000000000001';
    const token = claimTokenFor('bi-mat', orderId);
    expect(isValidClaimToken('bi-mat', orderId, token)).toBe(true);
    expect(isValidClaimToken('bi-mat-khac', orderId, token)).toBe(false);
    expect(isValidClaimToken('bi-mat', '6f1c2b0a-0000-4000-8000-000000000002', token)).toBe(false);
    expect(isValidClaimToken('bi-mat', orderId, 'ngan')).toBe(false);
  });
});

describe('mã hóa dữ liệu cá nhân', () => {
  const key = Buffer.alloc(32, 7);

  it('test_FR_ORD_31_cipher_round_trip_hides_plaintext', () => {
    const account = { bankBin: '970422', accountNumber: '9704229988776655', accountName: 'A' };
    const blob = encryptJson(key, account);
    expect(blob.toString('utf8')).not.toContain('9704229988776655');
    expect(decryptJson(key, blob)).toEqual(account);
    // IV ngẫu nhiên: cùng dữ liệu cho hai bản mã khác nhau.
    expect(encryptJson(key, account).equals(blob)).toBe(false);
  });

  it('test_FR_ORD_31_cipher_rejects_tampering_and_wrong_key', () => {
    const blob = encryptJson(key, '0909123456');
    const tampered = Buffer.from(blob);
    const last = tampered.length - 1;
    tampered.writeUInt8(tampered.readUInt8(last) ^ 0xff, last);
    expect(() => decryptJson(key, tampered)).toThrow();
    expect(() => decryptJson(Buffer.alloc(32, 8), blob)).toThrow();
  });
});
