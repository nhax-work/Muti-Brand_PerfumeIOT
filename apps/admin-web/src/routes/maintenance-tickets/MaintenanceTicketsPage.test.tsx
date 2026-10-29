import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import MaintenanceTicketsPage from './MaintenanceTicketsPage';
import type { MaintenanceTicket } from './api';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockTickets: MaintenanceTicket[] = [
  {
    id: 'ticket-1',
    machineId: 'mch-1',
    ticketNumber: 'MNT-20261026-0001',
    category: 'Vòi xịt nghẹt',
    severity: 'WARNING',
    priority: 'HIGH',
    status: 'OPEN',
    assignedTo: null,
    dueAt: '2026-10-27T10:00:00Z',
    diagnosis: null,
    correctiveAction: null,
    replacementParts: null,
    postTestResult: null,
    postTestedAt: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-10-26T08:00:00Z',
  },
  {
    id: 'ticket-2',
    machineId: 'mch-1',
    ticketNumber: 'MNT-20261026-0002',
    category: 'Cảm biến nắp máy',
    severity: 'CRITICAL',
    priority: 'CRITICAL',
    status: 'RESOLVED',
    assignedTo: 'user-tech-1',
    dueAt: '2026-10-26T18:00:00Z',
    diagnosis: 'Hỏng công tắc hành trình',
    correctiveAction: 'Thay mới công tắc',
    replacementParts: ['Công tắc hành trình Omron'],
    postTestResult: null,
    postTestedAt: null,
    resolvedAt: '2026-10-26T09:30:00Z',
    closedAt: null,
    createdAt: '2026-10-26T07:00:00Z',
  },
];

const mockMutation = () => ({
  mutateAsync: vi.fn().mockResolvedValue({}),
  isPending: false,
});

vi.mock('./api', () => ({
  useMaintenanceTickets: () => ({
    data: { items: mockTickets, meta: { total: 2, page: 1, pageSize: 15 } },
    isLoading: false,
    refetch: vi.fn(),
  }),
  useMaintenanceTicket: () => ({
    data: mockTickets[0],
    isLoading: false,
  }),
  useMaintenanceActivities: () => ({
    data: [
      {
        id: 'act-1',
        ticketId: 'ticket-1',
        actorId: 'admin-1',
        activityType: 'TICKET_CREATED',
        notes: 'Khởi tạo từ cảnh báo',
        metadata: null,
        createdAt: '2026-10-26T08:00:00Z',
      },
    ],
    isLoading: false,
  }),
  useCreateMaintenanceTicket: () => mockMutation(),
  useAssignMaintenanceTicket: () => mockMutation(),
  useResolveMaintenanceTicket: () => mockMutation(),
  useSubmitPostTest: () => mockMutation(),
}));

vi.mock('@/routes/machines/api', () => ({
  useMachines: () => ({
    data: {
      items: [{ id: 'mch-1', displayName: 'Kiosk Vincom', serialNumber: 'SN-001' }],
      meta: { total: 1, page: 1, pageSize: 200 },
    },
    isLoading: false,
  }),
}));

beforeAll(installDomStubs);
afterEach(cleanup);

describe('MaintenanceTicketsPage (FR-MNT-01 ÷ 03, 10, 11, 14)', () => {
  it('hiển thị danh sách phiếu bảo trì kèm mã phiếu, máy và trạng thái', () => {
    renderScreen(<MaintenanceTicketsPage />);

    expect(screen.getByText('MNT-20261026-0001')).toBeTruthy();
    expect(screen.getByText('MNT-20261026-0002')).toBeTruthy();
    expect(screen.getAllByText('Kiosk Vincom (SN-001)').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Vòi xịt nghẹt')).toBeTruthy();
    expect(screen.getByText('Cảm biến nắp máy')).toBeTruthy();
  });

  it('phiếu RESOLVED chưa PASS có nút Checklist sau bảo trì', () => {
    renderScreen(<MaintenanceTicketsPage />);

    expect(screen.getByText('Checklist sau bảo trì')).toBeTruthy();
  });

  it('mở modal tạo phiếu mới khi bấm nút Tạo phiếu bảo trì', () => {
    renderScreen(<MaintenanceTicketsPage />);

    const createBtn = screen.getByText('Tạo phiếu bảo trì');
    fireEvent.click(createBtn);

    expect(screen.getAllByText('Tạo phiếu bảo trì').length).toBeGreaterThanOrEqual(1);
  });
});
