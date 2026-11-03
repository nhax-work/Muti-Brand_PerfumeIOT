/**
 * Tra tên hiển thị cho các mã định danh (máy, slot, thương hiệu, người dùng) mà nhiều màn hình cần
 * nhưng contract chỉ trả về UUID — Alert, InventoryReportItem, MaintenanceTicket…
 *
 * Nguồn dữ liệu chọn theo QUYỀN của người đang đăng nhập, đúng với cái máy chủ cho phép:
 *   - Nhân sự nền tảng có machine.view: /machines và /machines/{id}/slots, /brands.
 *   - Brand Admin: hóa đơn thuê của chính mình (/slot-rentals → /slot-rentals/{id}/invoice) — không
 *     bao giờ gọi danh sách máy hay thương hiệu toàn nền tảng (BR-012).
 *   - Người dùng: Super Admin (user.manage) tra được mọi tài khoản; vai trò khác chỉ biết chính mình.
 *
 * Không tra được thì trả về mã rút gọn chứ không đoán tên.
 */

import { useQueries, useQuery } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';
import { useAuth } from '@/shared/auth';

const short = (id: string) => `${id.slice(0, 8)}…`;

function useCan() {
  const { user } = useAuth();
  return (code: string) => user?.permissions?.includes(code) ?? false;
}

export interface NameLookups {
  machineName(machineId: string | null | undefined): string;
  slotLabel(slotId: string | null | undefined): string;
  brandName(brandId: string | null | undefined): string;
  userName(userId: string | null | undefined): string;
}

export function useNameLookups(): NameLookups {
  const { user } = useAuth();
  const can = useCan();
  const isPlatform = can('machine.view');
  const isBrand = Boolean(user?.brandId) && !isPlatform;

  const machines = useQuery({
    queryKey: ['lookup', 'machines'],
    queryFn: () => unwrap(api.GET('/machines', { params: { query: { page: 1, pageSize: 100 } } })),
    enabled: isPlatform,
    staleTime: 5 * 60 * 1000,
  });
  const machineSlots = useQueries({
    queries: (machines.data?.items ?? []).map((m) => ({
      queryKey: ['lookup', 'machine-slots', m.id],
      queryFn: () => unwrap(api.GET('/machines/{id}/slots', { params: { path: { id: m.id } } })),
      enabled: isPlatform,
      staleTime: 5 * 60 * 1000,
    })),
  });
  const brands = useQuery({
    queryKey: ['lookup', 'brands'],
    queryFn: () => unwrap(api.GET('/brands', { params: { query: { page: 1, pageSize: 100 } } })),
    enabled: isPlatform || can('brand.manage'),
    staleTime: 5 * 60 * 1000,
  });

  const rentals = useQuery({
    queryKey: ['lookup', 'own-rentals'],
    queryFn: () =>
      unwrap(api.GET('/slot-rentals', { params: { query: { page: 1, pageSize: 100 } } })),
    enabled: isBrand,
    staleTime: 5 * 60 * 1000,
  });
  const invoices = useQueries({
    queries: (rentals.data?.items ?? []).map((r) => ({
      queryKey: ['lookup', 'rental-invoice', r.id],
      queryFn: () =>
        unwrap(api.GET('/slot-rentals/{id}/invoice', { params: { path: { id: r.id } } })),
      enabled: isBrand,
      staleTime: 5 * 60 * 1000,
    })),
  });

  const users = useQuery({
    queryKey: ['lookup', 'users'],
    queryFn: () => unwrap(api.GET('/users', { params: { query: { page: 1, pageSize: 200 } } })),
    enabled: can('user.manage'),
    staleTime: 5 * 60 * 1000,
  });

  const machineNames = new Map<string, string>();
  const slotLabels = new Map<string, string>();
  for (const m of machines.data?.items ?? []) machineNames.set(m.id, m.displayName);
  for (const q of machineSlots) {
    for (const s of q.data ?? []) {
      slotLabels.set(s.id, `${machineNames.get(s.machineId) ?? ''} · Slot #${s.slotNumber}`);
    }
  }
  for (const q of invoices) {
    const inv = q.data;
    if (!inv) continue;
    if (inv.machineDisplayName) machineNames.set(inv.machineId, inv.machineDisplayName);
    slotLabels.set(inv.slotId, `${inv.machineDisplayName ?? ''} · Slot #${inv.slotNumber}`);
  }
  const brandNames = new Map((brands.data?.items ?? []).map((b) => [b.id, b.name] as const));
  const userNames = new Map((users.data?.items ?? []).map((u) => [u.id, u.fullName] as const));
  if (user) userNames.set(user.id, user.fullName);

  return {
    machineName: (id) => (id ? (machineNames.get(id) ?? short(id)) : '—'),
    slotLabel: (id) => (id ? (slotLabels.get(id) ?? short(id)) : '—'),
    brandName: (id) => (id ? (brandNames.get(id) ?? short(id)) : '—'),
    userName: (id) => (id ? (userNames.get(id) ?? short(id)) : '—'),
  };
}

/**
 * Người có thể nhận phân công cảnh báo/phiếu bảo trì: Super Admin chọn trong danh sách Operations
 * Staff; Operations Staff (không có user.manage) chỉ tự nhận về mình.
 */
export function useAssignableStaff(): {
  options: { value: string; label: string }[];
  loading: boolean;
} {
  const { user } = useAuth();
  const can = useCan();
  const staff = useQuery({
    queryKey: ['users', 'OPERATIONS_STAFF'],
    queryFn: () =>
      unwrap(api.GET('/users', { params: { query: { role: 'OPERATIONS_STAFF', pageSize: 200 } } })),
    enabled: can('user.manage'),
  });
  if (can('user.manage')) {
    return {
      options: (staff.data?.items ?? []).map((u) => ({ value: u.id, label: u.fullName })),
      loading: staff.isLoading,
    };
  }
  return { options: user ? [{ value: user.id, label: user.fullName }] : [], loading: false };
}
