/**
 * Danh sách ngân hàng phổ biến theo mã BIN chuẩn NAPAS / VietQR.
 */
export interface BankInfo {
  readonly bin: string;
  readonly name: string;
}

export const VIETQR_BANKS: readonly BankInfo[] = [
  { bin: '970436', name: 'Vietcombank' },
  { bin: '970415', name: 'VietinBank' },
  { bin: '970418', name: 'BIDV' },
  { bin: '970405', name: 'Agribank' },
  { bin: '970422', name: 'MB Bank' },
  { bin: '970407', name: 'Techcombank' },
  { bin: '970416', name: 'ACB' },
  { bin: '970432', name: 'VPBank' },
  { bin: '970423', name: 'TPBank' },
  { bin: '970403', name: 'Sacombank' },
  { bin: '970441', name: 'VIB' },
  { bin: '970443', name: 'SHB' },
  { bin: '970437', name: 'HDBank' },
  { bin: '970448', name: 'OCB' },
  { bin: '970426', name: 'MSB' },
];

/** Hiển thị tên ngân hàng kèm mã BIN (ví dụ: "Vietcombank (970436)"). */
export function formatBankName(bin: string): string {
  const found = VIETQR_BANKS.find((b) => b.bin === bin);
  return found ? `${found.name} (${bin})` : bin;
}

