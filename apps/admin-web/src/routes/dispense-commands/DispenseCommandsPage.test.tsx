import { cleanup, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import type { CommandSearch } from './api';
import DispenseCommandsPage from './DispenseCommandsPage';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const searches: CommandSearch[] = [];
vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useDispenseCommands: (search: CommandSearch) => {
    searches.push(search);
    return {
      isLoading: false,
      data: {
        meta: { page: 1, pageSize: 20, total: 2 },
        items: [
          {
            id: 'c-1',
            orderId: null,
            brandId: null,
            machineId: 'm-1',
            slotId: 's-1',
            commandType: 'DIAGNOSTIC',
            commandToken: 'cmd_diag',
            status: 'SUCCEEDED',
            expiresAt: '2026-10-27T08:01:00Z',
            sentAt: '2026-10-27T08:00:01Z',
            acknowledgedAt: '2026-10-27T08:00:02Z',
            completedAt: '2026-10-27T08:00:03Z',
            retryCount: 0,
            createdAt: '2026-10-27T08:00:00Z',
            result: {
              commandId: 'c-1',
              success: true,
              receivedAt: '2026-10-27T08:00:03Z',
            },
          },
          {
            id: 'c-2',
            orderId: 'o-2',
            brandId: 'b-1',
            machineId: 'm-1',
            slotId: 's-2',
            commandType: 'CUSTOMER',
            commandToken: 'cmd_customer',
            status: 'UNKNOWN',
            expiresAt: '2026-10-27T07:01:00Z',
            sentAt: '2026-10-27T07:00:01Z',
            acknowledgedAt: null,
            completedAt: null,
            retryCount: 0,
            createdAt: '2026-10-27T07:00:00Z',
            result: null,
          },
        ],
      },
    };
  },
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  searches.length = 0;
});

describe('DispenseCommandsPage (FR-DSP-20)', () => {
  it('lệnh chẩn đoán và lệnh khách hiện tách loại, kèm trạng thái và kết quả', () => {
    renderScreen(<DispenseCommandsPage />);
    expect(screen.getByText('Lệnh xịt')).toBeTruthy();
    expect(screen.getByText('cmd_diag')).toBeTruthy();
    expect(screen.getAllByText('Chẩn đoán').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Khách hàng').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Thành công').length).toBeGreaterThan(0);
    expect(screen.getByText('Không rõ kết quả')).toBeTruthy();
    // Mở thẳng (không qua chi tiết máy) thì không lọc theo máy.
    expect(searches[0]).toMatchObject({ page: 1, pageSize: 20, machineId: undefined });
    expect(screen.queryByText('Đang lọc theo một máy')).toBeNull();
  });
});
