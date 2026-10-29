import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import AuditLogsPage from './AuditLogsPage';
import type { AuditLogEntry } from './api';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockLogs: AuditLogEntry[] = [
  {
    id: 'log-1',
    actorType: 'USER',
    actorId: 'admin-uuid-1',
    action: 'brand.create',
    targetType: 'Brand',
    targetId: 'brand-uuid-1',
    sourceIp: '192.168.1.100',
    severity: 'INFO',
    beforeData: null,
    afterData: { name: 'Maison Test', status: 'ACTIVE' },
    occurredAt: '2026-10-26T08:00:00Z',
  },
  {
    id: 'log-2',
    actorType: 'SYSTEM',
    actorId: null,
    action: 'machine.mode_change',
    targetType: 'Machine',
    targetId: 'mch-uuid-1',
    sourceIp: '127.0.0.1',
    severity: 'WARNING',
    beforeData: { mode: 'NORMAL' },
    afterData: { mode: 'MAINTENANCE' },
    occurredAt: '2026-10-26T08:30:00Z',
  },
];

vi.mock('./api', () => ({
  useAuditLogs: () => ({
    data: {
      items: mockLogs,
      meta: { total: 2, page: 1, pageSize: 20 },
    },
    isLoading: false,
    refetch: vi.fn(),
  }),
}));

beforeAll(installDomStubs);
afterEach(cleanup);

describe('AuditLogsPage (FR-AUD-08)', () => {
  it('hiển thị danh sách nhật ký kiểm toán với hành động và đối tượng', () => {
    renderScreen(<AuditLogsPage />);

    expect(screen.getByText('Nhật ký kiểm toán hệ thống')).toBeTruthy();
    expect(screen.getByText('brand.create')).toBeTruthy();
    expect(screen.getByText('machine.mode_change')).toBeTruthy();
    expect(screen.getByText('192.168.1.100')).toBeTruthy();
  });

  it('bấm nút Chi tiết mở Drawer xem Before / After Payload', () => {
    renderScreen(<AuditLogsPage />);

    const detailButtons = screen.getAllByText('Chi tiết');
    expect(detailButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(detailButtons[0]!);
    expect(screen.getByText('Dữ liệu trước / sau thao tác')).toBeTruthy();
    expect(screen.getByText('Before Data')).toBeTruthy();
    expect(screen.getByText('After Data')).toBeTruthy();
  });
});
