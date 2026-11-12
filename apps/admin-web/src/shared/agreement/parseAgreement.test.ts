import { describe, expect, it } from 'vitest';
import { parseAgreement } from './parseAgreement';

describe('parseAgreement — trình bày hợp đồng khung như văn bản', () => {
  it('nhận tiêu đề viết hoa, thông tin chung, điều, mục đánh số và đoạn văn', () => {
    const content = [
      'HỢP ĐỒNG KHUNG CUNG CẤP DỊCH VỤ',
      '',
      'Phiên bản: v1.0',
      'Áp dụng cho: Mọi thương hiệu đối tác.',
      '',
      'ĐIỀU 1: ĐỐI TƯỢNG VÀ PHẠM VI DỊCH VỤ',
      'Nền tảng cung cấp máy kiosk.',
      '',
      'Điều 2. Quyền và nghĩa vụ',
      '1. Thương hiệu chịu trách nhiệm về chất lượng.',
      '2) Thương hiệu thanh toán đủ phí: thuê slot và bảo quản.',
    ].join('\n');

    expect(parseAgreement(content)).toEqual([
      { kind: 'title', text: 'HỢP ĐỒNG KHUNG CUNG CẤP DỊCH VỤ' },
      { kind: 'meta', label: 'Phiên bản', value: 'v1.0' },
      { kind: 'meta', label: 'Áp dụng cho', value: 'Mọi thương hiệu đối tác.' },
      { kind: 'article', label: 'ĐIỀU 1', text: 'ĐỐI TƯỢNG VÀ PHẠM VI DỊCH VỤ' },
      { kind: 'paragraph', text: 'Nền tảng cung cấp máy kiosk.' },
      { kind: 'article', label: 'Điều 2', text: 'Quyền và nghĩa vụ' },
      { kind: 'ordered', marker: '1.', text: 'Thương hiệu chịu trách nhiệm về chất lượng.' },
      {
        kind: 'ordered',
        marker: '2)',
        text: 'Thương hiệu thanh toán đủ phí: thuê slot và bảo quản.',
      },
    ]);
  });

  it('đọc được Markdown của phụ lục: #, ##, ### và gạch đầu dòng', () => {
    const content = [
      '# PHỤ LỤC HỢP ĐỒNG',
      'Tổng tiền: 3150000 VND',
      '## Danh sách slot thuê',
      '### Slot 1 - Máy SN-01',
      '- Thời hạn thuê: 3 tháng',
    ].join('\n');

    expect(parseAgreement(content)).toEqual([
      { kind: 'title', text: 'PHỤ LỤC HỢP ĐỒNG' },
      { kind: 'meta', label: 'Tổng tiền', value: '3150000 VND' },
      { kind: 'article', label: null, text: 'Danh sách slot thuê' },
      { kind: 'subheading', text: 'Slot 1 - Máy SN-01' },
      { kind: 'bullet', text: 'Thời hạn thuê: 3 tháng' },
    ]);
  });

  it('dòng "Nhãn: giá trị" sau điều đầu tiên vẫn là đoạn văn, dòng đầu không viết hoa không thành tiêu đề', () => {
    expect(parseAgreement('Nội dung hợp đồng khung mẫu\nĐIỀU 1: A\nLưu ý: điều khoản này')).toEqual(
      [
        { kind: 'paragraph', text: 'Nội dung hợp đồng khung mẫu' },
        { kind: 'article', label: 'ĐIỀU 1', text: 'A' },
        { kind: 'paragraph', text: 'Lưu ý: điều khoản này' },
      ],
    );
  });
});
