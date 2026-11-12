import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import type { MachineSlot } from './api';
import { DiagnosticDispenseModal } from './components/DiagnosticDispenseModal';

const mockDiagnose = vi.fn().mockResolvedValue({ commandToken: 'cmd_diag_1' });
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useDiagnosticDispense: () => ({ mutateAsync: mockDiagnose, isPending: false }),
}));

const SLOT: MachineSlot = {
  id: 's-2',
  machineId: 'm-1',
  slotNumber: 2,
  status: 'MAINTENANCE',
  calibratedDosageMl: 0.12,
  lowStockThresholdMl: 5,
  estimatedRemainingMl: 40,
  estimatedRemainingSprays: 333,
  activeBottleId: null,
  currentRentalId: null,
};

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  mockDiagnose.mockClear();
});

describe('DiagnosticDispenseModal (FR-MNT-09, FR-DSP-20)', () => {
  it('xác nhận thì gửi lệnh chẩn đoán cho đúng máy, đúng slot, kèm ghi chú', async () => {
    const onClose = vi.fn();
    renderScreen(<DiagnosticDispenseModal machineId="m-1" slot={SLOT} onClose={onClose} />);
    expect(screen.getByText('Xịt chẩn đoán slot 2')).toBeTruthy();
    expect(screen.getByText(/không tạo đơn và không tính doanh thu/)).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText('Ghi chú (không bắt buộc)'), {
      target: { value: 'Kiểm tra sau thay bơm' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xịt chẩn đoán' }));
    await waitFor(() =>
      expect(mockDiagnose).toHaveBeenCalledWith({
        machineId: 'm-1',
        slotId: 's-2',
        note: 'Kiểm tra sau thay bơm',
      }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('không có slot được chọn thì không mở hộp thoại', () => {
    renderScreen(<DiagnosticDispenseModal machineId="m-1" slot={null} onClose={vi.fn()} />);
    expect(screen.queryByText(/Xịt chẩn đoán slot/)).toBeNull();
  });
});
