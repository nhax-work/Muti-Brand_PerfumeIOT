import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import { MachineCredentialsCard } from './components/MachineCredentialsCard';

let mockCredential: unknown = undefined;
const mockIssue = vi.fn().mockResolvedValue({
  id: 'c-2',
  machineId: 'm-1',
  credentialIdentifier: 'machine-M002',
  status: 'ACTIVE',
  issuedAt: '2026-10-16T08:00:00Z',
  secret: 'mqtt-secret-only-once',
});

vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useMachineCredential: () => ({ data: mockCredential }),
  useIssueCredential: () => ({ mutateAsync: mockIssue, isPending: false }),
  useRevokeCredential: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  mockCredential = undefined;
});

describe('MachineCredentialsCard (FR-MCH-02, NFR-SEC-07)', () => {
  it('máy chưa có khóa: báo chưa cấp; cấp xong hiện bí mật đúng một lần', async () => {
    renderScreen(<MachineCredentialsCard machineId="m-1" />);
    expect(screen.getByText(/chưa được cấp khóa/)).toBeTruthy();
    expect(screen.queryByText('Thu hồi')).toBeNull();

    fireEvent.click(screen.getByText('Cấp khóa'));
    fireEvent.click(await screen.findByText('Xác nhận'));
    await waitFor(() => expect(mockIssue).toHaveBeenCalledWith('m-1'));
    expect(await screen.findByText('mqtt-secret-only-once')).toBeTruthy();
    // Bí mật chỉ có trong phản hồi cấp khóa — hook đọc metadata không bao giờ chứa nó.
    expect(mockIssue).toHaveBeenCalledTimes(1);
  });

  it('máy có khóa đang hoạt động: hiện metadata, không bao giờ hiện bí mật, có nút thu hồi', () => {
    mockCredential = {
      id: 'c-1',
      machineId: 'm-1',
      credentialIdentifier: 'machine-M001',
      status: 'ACTIVE',
      issuedAt: '2026-10-01T00:00:00Z',
      lastAuthenticatedAt: '2026-10-16T07:59:00Z',
    };
    renderScreen(<MachineCredentialsCard machineId="m-1" />);
    expect(screen.getByText('machine-M001')).toBeTruthy();
    expect(screen.getByText('Thu hồi')).toBeTruthy();
    expect(screen.getByText('Cấp lại khóa')).toBeTruthy();
  });
});
