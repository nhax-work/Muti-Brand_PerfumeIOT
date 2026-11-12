import { SPEC_CONSTRAINTS } from '@/shared/constraints.generated';
import { useI18n } from '@/shared/i18n';
import { bytesToMb } from '@/shared/image-upload';
import type { ShipmentDeclaration, ShipmentPhotoKind } from './api';

/** Ngưỡng ảnh khai báo gửi hàng (ADR-0024). */
export const PHOTO_MAX_PER_KIND = SPEC_CONSTRAINTS.SHIPMENT_PHOTO_MAX_PER_KIND;
export const PHOTO_MAX_BYTES = SPEC_CONSTRAINTS.SHIPMENT_PHOTO_MAX_BYTES;
export const PHOTO_KINDS: readonly ShipmentPhotoKind[] = ['BEFORE_PACKING', 'PACKED'];

/** Khai báo đã có đủ hai loại ảnh chưa — chỉ đếm ảnh máy chủ trả về. */
export function hasAllPhotoKinds(declaration: ShipmentDeclaration): boolean {
  const kinds = new Set((declaration.photos ?? []).map((p) => p.kind));
  return PHOTO_KINDS.every((k) => kinds.has(k));
}

/** Nhãn và gợi ý của từng loại ảnh. */
export function usePhotoKindText() {
  const { t } = useI18n();
  const params = { max: PHOTO_MAX_PER_KIND, maxMb: bytesToMb(PHOTO_MAX_BYTES) };
  return {
    label: (kind: ShipmentPhotoKind) =>
      kind === 'BEFORE_PACKING' ? t('ui.shipmentPhotoBeforePacking') : t('ui.shipmentPhotoPacked'),
    hint: (kind: ShipmentPhotoKind) =>
      kind === 'BEFORE_PACKING'
        ? t('ui.shipmentPhotoBeforePackingHint', params)
        : t('ui.shipmentPhotoPackedHint', params),
  };
}
