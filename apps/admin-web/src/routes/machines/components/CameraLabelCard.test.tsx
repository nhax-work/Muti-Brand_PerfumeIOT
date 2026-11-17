import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '@/shared/i18n';
import { CameraLabelCard } from './CameraLabelCard';

const mockPut = vi.fn();

vi.mock('@/shared/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/api')>();
  return { ...actual, api: { PUT: (...args: unknown[]) => mockPut(...args) } };
});

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  mockPut.mockReset();
});

describe('Nhãn camera của máy (FR-MCH-20)', () => {
  it('test_FR_MCH_20_super_admin_saves_camera_label', async () => {
    mockPut.mockResolvedValue({
      data: { id: 'm-1', cameraLabel: 'Cam-03' },
      response: new Response(null, { status: 200 }),
    });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <I18nProvider>
          <CameraLabelCard machineId="m-1" cameraLabel={null} />
        </I18nProvider>
      </QueryClientProvider>,
    );
    const save = screen.getByRole('button', { name: 'Lưu thay đổi' });
    expect(save.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Nhãn camera an ninh'), {
      target: { value: ' Cam-03 ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith('/machines/{id}/camera-label', {
        params: { path: { id: 'm-1' } },
        body: { cameraLabel: 'Cam-03' },
      }),
    );
  });
});
