import type { components } from '@scentstation/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrap } from '@/shared/api';
import { config } from '@/shared/config';

export type CameraEvidence = components['schemas']['CameraEvidence'];
export type PublicCameraEvidence = components['schemas']['PublicCameraEvidence'];
export type EvidenceWindow = components['schemas']['EvidenceWindow'];
export type FootageRequest = components['schemas']['FootageRequest'];
export type FootageRequestStatus = components['schemas']['FootageRequestStatus'];

/** Màu thẻ trạng thái yêu cầu trích hình — theo nhóm nghĩa ở QUY_TAC_GIAO_DIEN.md mục 2.4. */
export const FOOTAGE_STATUS_COLOR: Record<FootageRequestStatus, string> = {
  OPEN: 'gold',
  FULFILLED: 'green',
  UNAVAILABLE: 'default',
};

/** Hồ sơ gắn bằng chứng (ADR-0032): phiếu khiếu nại hoặc phiếu nạp. */
export type EvidenceTarget = { readonly kind: 'claim' | 'refill'; readonly id: string };

export interface EvidenceUploadInput {
  readonly file: File;
  readonly cameraLabel: string;
  readonly recordedFrom: string;
  readonly recordedTo: string;
  readonly clockOffsetSec: number;
  readonly note?: string;
}

/**
 * Đường dẫn ký máy chủ trả là tương đối với gốc API (/evidence-files/…) — ghép với `apiBaseUrl`
 * như mọi lời gọi API. Thẻ <video>/<img> tự tải, không cần token: quyền nằm ở chữ ký.
 */
export function evidenceSrc(url: string): string {
  return `${config.apiBaseUrl}${url}`;
}

const listKey = (target: EvidenceTarget) => ['evidence', target.kind, target.id];

export function useEvidenceWindow(target: EvidenceTarget, enabled: boolean) {
  return useQuery({
    queryKey: ['evidence-window', target.kind, target.id],
    enabled,
    queryFn: () =>
      target.kind === 'claim'
        ? unwrap(
            api.GET('/refund-claims/{id}/evidence-window', { params: { path: { id: target.id } } }),
          )
        : unwrap(
            api.GET('/refill-sessions/{id}/evidence-window', {
              params: { path: { id: target.id } },
            }),
          ),
  });
}

/**
 * Danh sách bằng chứng kèm đường dẫn có hạn CAMERA_EVIDENCE_URL_TTL_SEC — làm mới trước khi hết hạn
 * để video đang mở không bị cắt ngang.
 */
export function useEvidenceList(target: EvidenceTarget) {
  return useQuery({
    queryKey: listKey(target),
    queryFn: () =>
      target.kind === 'claim'
        ? unwrap(api.GET('/refund-claims/{id}/evidence', { params: { path: { id: target.id } } }))
        : unwrap(
            api.GET('/refill-sessions/{id}/evidence', { params: { path: { id: target.id } } }),
          ),
    staleTime: 60_000,
    refetchInterval: 4 * 60_000,
  });
}

export function useUploadEvidence(target: EvidenceTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EvidenceUploadInput) => {
      const form = new FormData();
      form.append('file', input.file);
      const query = {
        cameraLabel: input.cameraLabel,
        recordedFrom: input.recordedFrom,
        recordedTo: input.recordedTo,
        clockOffsetSec: input.clockOffsetSec,
        ...(input.note ? { note: input.note } : {}),
      };
      const body = form as unknown as { file: string };
      return target.kind === 'claim'
        ? unwrap(
            api.POST('/refund-claims/{id}/evidence', {
              params: { path: { id: target.id }, query },
              body,
            }),
          )
        : unwrap(
            api.POST('/refill-sessions/{id}/evidence', {
              params: { path: { id: target.id }, query },
              body,
            }),
          );
    },
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: listKey(target) }),
  });
}

export function useRemoveEvidence(target: EvidenceTarget) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      unwrap(api.POST('/evidence/{id}/remove', { params: { path: { id } }, body: { reason } })),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: listKey(target) }),
  });
}

/** Bằng chứng cho khách — chỉ khi có `key` trong liên kết email (FR-ORD-39). */
export function usePublicClaimEvidence(code: string, key: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['public-claim-evidence', code, key],
    enabled: enabled && key !== null,
    retry: false,
    queryFn: () =>
      unwrap(
        api.GET('/public/refund-claims/{code}/evidence', {
          params: { path: { code }, query: { key: key ?? '' } },
        }),
      ),
  });
}

export function useFootageRequests(
  params: { refillSessionId?: string; status?: FootageRequestStatus; page?: number },
  enabled = true,
) {
  const { refillSessionId, status, page = 1 } = params;
  return useQuery({
    queryKey: ['footage-requests', { refillSessionId, status, page }],
    enabled,
    queryFn: () =>
      unwrap(
        api.GET('/footage-requests', {
          params: { query: { refillSessionId, status, page, pageSize: 20 } },
        }),
      ),
  });
}

export function useCreateFootageRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ sessionId, reason }: { sessionId: string; reason: string }) =>
      unwrap(
        api.POST('/refill-sessions/{id}/footage-requests', {
          params: { path: { id: sessionId } },
          body: { reason },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['footage-requests'] }),
  });
}

export function useResolveFootageRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      outcome,
      note,
    }: {
      id: string;
      outcome: 'FULFILLED' | 'UNAVAILABLE';
      note?: string;
    }) =>
      unwrap(
        api.POST('/footage-requests/{id}/resolve', {
          params: { path: { id } },
          body: { outcome, ...(note ? { note } : {}) },
        }),
      ),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['footage-requests'] }),
  });
}
