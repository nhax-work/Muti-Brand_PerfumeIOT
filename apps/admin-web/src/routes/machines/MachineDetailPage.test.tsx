import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { installDomStubs, renderScreen } from '@/test-utils';
import MachineDetailPage from './MachineDetailPage';
import type { Brand, MachineSlot, Product, SlotRental } from './api';

const MACHINE_ID = '55555555-5555-4555-8555-000000000001';

const slots: MachineSlot[] = [
  {
    id: 'slot-1',
    machineId: MACHINE_ID,
    slotNumber: 1,
    status: 'AVAILABLE',
    calibratedDosageMl: 0.12,
    lowStockThresholdMl: 5,
    estimatedRemainingMl: 40,
    estimatedRemainingSprays: 333,
    activeBottleId: 'bottle-1',
    currentRentalId: 'rental-1',
  },
  {
    id: 'slot-2',
    machineId: MACHINE_ID,
    slotNumber: 2,
    status: 'AVAILABLE',
    calibratedDosageMl: 0.12,
    lowStockThresholdMl: 5,
    estimatedRemainingMl: 0,
    estimatedRemainingSprays: 0,
    activeBottleId: null,
    currentRentalId: null,
  },
];

const rentals = [
  {
    id: 'rental-1',
    slotId: 'slot-1',
    machineId: MACHINE_ID,
    brandId: 'brand-1',
    fragranceProductId: 'product-1',
    status: 'ACTIVE',
    pricePerSpray: '35000.0000',
    currency: 'VND',
  },
] as unknown as SlotRental[];

const brands = [{ id: 'brand-1', code: 'MAISON_AURORE', name: 'Maison Aurore' }] as Brand[];
const products = [{ id: 'product-1', name: 'Aurore Nocturne', sku: 'MA-002' }] as Product[];

let brandItems: Brand[] = brands;
let productItems: Product[] = products;

vi.mock('react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react-router')>()),
  useParams: () => ({ id: MACHINE_ID }),
}));

vi.mock('@/shared/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/auth')>()),
  useAuth: () => ({
    user: {
      id: 'ops-1',
      fullName: 'Ops',
      roles: ['OPERATIONS_STAFF'],
      permissions: ['machine.view', 'machine.operate', 'dispense.diagnostic'],
    },
  }),
  useReauth: () => async () => 'reauth-token',
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./api')>()),
  useMachine: () => ({
    data: {
      id: MACHINE_ID,
      serialNumber: 'M001',
      displayName: 'Máy test',
      locationId: 'loc-1',
      status: 'ONLINE',
      operatingMode: 'NORMAL',
      firmwareVersion: '1.0.0',
      configVersion: 1,
      lastSeenAt: null,
    },
    isLoading: false,
    error: null,
  }),
  useMachineSlots: () => ({ data: slots, isLoading: false }),
  useLocations: () => ({ data: { items: [] } }),
  useMachineRentals: () => ({ data: { items: rentals } }),
  useBrands: () => ({ data: { items: brandItems } }),
  useProducts: () => ({ data: { items: productItems } }),
  usePushMachineConfig: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('./components/StatusHistoryCard', () => ({ StatusHistoryCard: () => null }));
vi.mock('./components/TelemetryCard', () => ({ TelemetryCard: () => null }));
vi.mock('./components/MachineCredentialsCard', () => ({ MachineCredentialsCard: () => null }));

beforeAll(installDomStubs);
afterEach(() => {
  cleanup();
  brandItems = brands;
  productItems = products;
});

describe('MachineDetailPage (FR-MCH-09)', () => {
  it('test_FR_MCH_09_rented_slot_shows_real_brand_and_product', () => {
    renderScreen(<MachineDetailPage />);

    expect(screen.getByText('Maison Aurore')).toBeTruthy();
    expect(screen.getAllByText(/Aurore Nocturne/).length).toBeGreaterThan(0);
  });

  it('test_FR_MCH_09_vacant_slot_never_shows_guessed_product', () => {
    renderScreen(<MachineDetailPage />);

    // Trước đây slot trống mang tên sản phẩm cứng theo số slot (slot 2 → "Aurore Nocturne",
    // slot 1 → "Aurore Matinale"), dù không có hóa đơn nào.
    // Chỉ slot 1 (có hóa đơn) mang tên sản phẩm; slot 2 trống thì không.
    expect(screen.getAllByText(/Aurore Nocturne/)).toHaveLength(1);
    expect(screen.queryByText(/Aurore Matinale/)).toBeNull();
  });

  it('test_FR_MCH_09_missing_brand_list_does_not_invent_a_brand', () => {
    brandItems = [];
    productItems = [];
    renderScreen(<MachineDetailPage />);

    expect(screen.queryByText('Maison Aurore')).toBeNull();
    expect(screen.queryByText(/Aurore Nocturne/)).toBeNull();
  });
});
