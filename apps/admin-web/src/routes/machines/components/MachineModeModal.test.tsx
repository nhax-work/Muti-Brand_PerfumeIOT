import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import { MachineModeModal } from './MachineModeModal';
import type { Machine } from '../api';

const mockMutateAsync = vi.fn().mockResolvedValue({});

vi.mock('../api', async () => ({
  ...(await vi.importActual<typeof import('../api')>('../api')),
  useSetMachineMode: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  mockMutateAsync.mockClear();
});

const mockMachineNormal: Machine = {
  id: 'm-1',
  locationId: 'loc-1',
  serialNumber: 'M001',
  displayName: 'Máy Thử Nghiệm 1',
  status: 'ONLINE',
  operatingMode: 'NORMAL',
  slotCount: 4,
  lastSeenAt: '2026-10-21T08:00:00Z',
  firmwareVersion: '1.0.0',
  configurationVersion: 1,
};

const mockMachineDraining: Machine = {
  ...mockMachineNormal,
  id: 'm-2',
  operatingMode: 'DRAINING',
  drainingOrdersCount: 3,
};

describe('MachineModeModal (FR-MNT-05, FR-MNT-17, FR-MCH-09)', () => {
  it('máy đang DRAINING: hiển thị thông báo còn đơn dở dang', () => {
    renderScreen(
      <MachineModeModal
        machine={mockMachineDraining}
        open={true}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/DRAINING/).length).toBeGreaterThan(0);
    expect(screen.getByText(/còn 3 đơn dở dang/)).toBeTruthy();
  });

  it('chọn Bảo trì: hiển thị hướng dẫn dừng bán an toàn và checkbox ép bảo trì khẩn cấp', async () => {
    renderScreen(
      <MachineModeModal
        machine={mockMachineNormal}
        open={true}
        onClose={vi.fn()}
      />,
    );

    // Click chọn Bảo trì
    fireEvent.click(screen.getByText('Bảo trì'));

    expect(await screen.findByText(/Ép bảo trì ngay lập tức/)).toBeTruthy();
    expect(screen.getAllByText(/Kiosk dừng nhận đơn mới/).length).toBeGreaterThan(0);
  });

  it('bật ép bảo trì khẩn cấp: cảnh báo hủy đơn xuất hiện và nút đổi sang màu đỏ', async () => {
    renderScreen(
      <MachineModeModal
        machine={mockMachineNormal}
        open={true}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Bảo trì'));
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);

    expect(await screen.findByText(/CẢNH BÁO: Ép bảo trì khẩn cấp sẽ dừng máy ngay lập tức/)).toBeTruthy();
    expect(screen.getByText('Ép sang Bảo trì ngay')).toBeTruthy();
  });

  it('gửi yêu cầu ép bảo trì kèm lý do gọi useSetMachineMode với force: true', async () => {
    renderScreen(
      <MachineModeModal
        machine={mockMachineNormal}
        open={true}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText('Bảo trì'));
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);

    // Điền lý do bắt buộc
    const reasonInput = screen.getByPlaceholderText(/Bắt buộc nhập lý do/);
    fireEvent.change(reasonInput, { target: { value: 'Sự cố rò rỉ buồng chứa' } });

    fireEvent.click(screen.getByText('Ép sang Bảo trì ngay'));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 'm-1',
        operatingMode: 'MAINTENANCE',
        reason: 'Sự cố rò rỉ buồng chứa',
        force: true,
      });
    });
  });
});
