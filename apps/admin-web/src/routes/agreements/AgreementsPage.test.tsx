import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { message } from 'antd';
import type { ReactNode } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import AgreementsPage from './AgreementsPage';

vi.mock('@/app/guards/RequireRole', () => ({
  RequireRole: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const mockRequestReauth = vi.fn().mockResolvedValue('reauth-token-123');
vi.mock('@/shared/auth', async () => ({
  ...(await vi.importActual<typeof import('@/shared/auth')>('@/shared/auth')),
  useReauth: () => mockRequestReauth,
}));

const mockCreate = vi.fn().mockResolvedValue({});
const mockPublish = vi.fn().mockResolvedValue({});

vi.mock('./api', async () => ({
  ...(await vi.importActual<typeof import('./api')>('./api')),
  useAgreementVersions: () => ({
    data: [
      {
        id: 'ag-draft-2',
        version: '2026.2',
        title: 'Hợp đồng khung 2026.2 (Nháp)',
        content: 'Điều khoản mới 2026.2',
        contentHash: 'b'.repeat(64),
        isCurrent: false,
        publishedAt: null,
        createdAt: '2026-11-01T00:00:00Z',
        acceptedBrandCount: 0,
      },
      {
        id: 'ag-current-1',
        version: '2026.1',
        title: 'Hợp đồng khung 2026.1',
        content: 'Điều khoản hiện hành 2026.1',
        contentHash: 'a'.repeat(64),
        isCurrent: true,
        publishedAt: '2026-10-01T00:00:00Z',
        createdAt: '2026-10-01T00:00:00Z',
        acceptedBrandCount: 3,
      },
    ],
    isLoading: false,
  }),
  useCreateAgreementVersion: () => ({ mutateAsync: mockCreate, isPending: false }),
  usePublishAgreementVersion: () => ({ mutateAsync: mockPublish, isPending: false }),
}));

beforeAll(() => {
  installDomStubs();
  const dummyMessage = Object.assign(Promise.resolve(true), () => {}) as unknown as ReturnType<
    typeof message.success
  >;
  vi.spyOn(message, 'success').mockReturnValue(dummyMessage);
  vi.spyOn(message, 'error').mockReturnValue(dummyMessage);
});

afterEach(() => {
  cleanup();
  mockCreate.mockClear();
  mockPublish.mockClear();
  mockRequestReauth.mockClear();
});

describe('AgreementsPage (FR-SLT-48)', () => {
  it('hiển thị danh sách phiên bản, trạng thái và nút Công bố ở bản nháp', () => {
    renderScreen(<AgreementsPage />);

    const draftRow = screen.getByText('2026.2').closest('tr')!;
    expect(within(draftRow).getByText('Bản nháp')).toBeTruthy();
    expect(within(draftRow).getByText('0 thương hiệu')).toBeTruthy();
    expect(within(draftRow).getByRole('button', { name: /Công bố/i })).toBeTruthy();

    const currentRow = screen.getByText('2026.1').closest('tr')!;
    expect(within(currentRow).getByText('Đang hiện hành')).toBeTruthy();
    expect(within(currentRow).getByText('3 thương hiệu')).toBeTruthy();
    expect(within(currentRow).queryByRole('button', { name: /Công bố/i })).toBeNull();
  });

  it('mở modal soạn phiên bản mới và gửi dữ liệu tạo bản nháp', async () => {
    renderScreen(<AgreementsPage />);

    fireEvent.click(screen.getByText('Soạn phiên bản mới'));
    const dialog = await screen.findByRole('dialog');
    const [versionInput, titleInput, contentInput] = within(dialog).getAllByRole('textbox');

    fireEvent.change(versionInput!, { target: { value: '2026.3' } });
    fireEvent.change(titleInput!, { target: { value: 'Hợp đồng khung 2026.3' } });
    fireEvent.change(contentInput!, { target: { value: 'Toàn văn hợp đồng khung 2026.3' } });

    fireEvent.click(within(dialog).getByText('Lưu'));

    await waitFor(() =>
      expect(mockCreate).toHaveBeenCalledWith({
        version: '2026.3',
        title: 'Hợp đồng khung 2026.3',
        content: 'Toàn văn hợp đồng khung 2026.3',
      }),
    );
  });

  it('xác nhận công bố bản nháp yêu cầu reauth và gọi publish', async () => {
    renderScreen(<AgreementsPage />);

    const draftRow = screen.getByText('2026.2').closest('tr')!;
    fireEvent.click(within(draftRow).getByRole('button', { name: /Công bố/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Xác nhận công bố phiên bản 2026\.2/i)).toBeTruthy();

    fireEvent.click(within(dialog).getByRole('button', { name: /Công bố/i }));

    await waitFor(() => {
      expect(mockRequestReauth).toHaveBeenCalledTimes(1);
      expect(mockPublish).toHaveBeenCalledWith({
        version: '2026.2',
        reauthToken: 'reauth-token-123',
      });
    });
  });
});

