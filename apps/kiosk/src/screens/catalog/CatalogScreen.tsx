import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import type { components } from '@scentstation/contracts';
import { isMachineInMaintenance, recordKioskInteraction, useKioskCatalog } from '@/shared/api';
import OutOfServiceScreen from '@/screens/out-of-service/OutOfServiceScreen';
import { useI18n } from '@/shared/i18n';
import { useKioskSession } from '@/shared/session';
import DispenseFlow from '../checkout/DispenseFlow';
import { PaymentPage } from '../checkout/PaymentPage';
import { useKioskOrderFlow } from '../checkout/useKioskOrderFlow';
import { CatalogRail } from './CatalogRail';
import { ProductDetailPage } from './ProductDetailPage';
import styles from './CatalogScreen.module.css';

type KioskCatalogItem = components['schemas']['KioskCatalogItem'];

/**
 * Màn hình Kiosk duy nhất (Single-Screen Architecture): danh mục, chi tiết, mã QR và nhận lượt
 * xịt là các trang toàn màn của cùng một component — đổi URL /products/:slot → /checkout/:slot không
 * dựng lại màn nên đơn đang thanh toán được giữ nguyên. Hiện chỉ có thanh toán QR (ADR-0016) nên
 * không có bước chọn phương thức.
 */
export default function CatalogScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const params = useParams<{ slotNumber?: string }>();
  const catalog = useKioskCatalog();
  const { kioskSessionId, startNewSession } = useKioskSession();

  const reportedImpressionsRef = useRef<Set<string>>(new Set());

  const [selectedDetailItem, setSelectedDetailItem] = useState<KioskCatalogItem | null>(null);

  const items = useMemo(() => catalog.data?.items ?? [], [catalog.data?.items]);

  // Đồng bộ mở modal theo URL (nếu có slotNumber từ route)
  const routeMatchedItem = useMemo(() => {
    if (!params.slotNumber || items.length === 0) return null;
    return items.find((i) => String(i.slotNumber) === params.slotNumber) ?? null;
  }, [params.slotNumber, items]);

  const detailItem = selectedDetailItem ?? routeMatchedItem;

  // Khách rời luồng: đóng trang đang mở, mở phiên mới; đổi ý thì về danh mục, xong lượt thì về màn
  // chờ (đơn đang hiện đã được bỏ trong hook).
  const flow = useKioskOrderFlow(detailItem, (to) => {
    setSelectedDetailItem(null);
    startNewSession();
    void navigate(to === 'home' ? '/' : '/catalog');
  });
  const { created, phase, paymentOpen, isPostPayment, confirmingCancel } = flow;
  // Rời trang chi tiết (nút quay lại, phím ESC): về danh mục.
  const handleCloseDetailModal = () => flow.exit('catalog');

  // Đóng modal khi nhấn ESC — đi qua cùng đường đóng để bỏ đơn đang hiện, không mang sang sản phẩm khác.
  const escCloseRef = useRef<() => void>(() => {});
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') escCloseRef.current();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Ghi nhận lượt xem sản phẩm (FR-RPT-06, BR-007)
  useEffect(() => {
    if (items.length === 0) return;
    for (const item of items) {
      if (item.available && !reportedImpressionsRef.current.has(item.slotId)) {
        reportedImpressionsRef.current.add(item.slotId);
        recordKioskInteraction({
          eventType: 'PRODUCT_IMPRESSION',
          slotId: item.slotId,
          kioskSessionId,
        });
      }
    }
  }, [items, kioskSessionId]);

  // Chọn sản phẩm -> Mở modal chi tiết ngay trên HomeScreen; bỏ đơn của sản phẩm trước (nếu có).
  const handleSelectItem = (item: KioskCatalogItem) => {
    if (!item.available) return;
    recordKioskInteraction({
      eventType: 'PRODUCT_SELECTED',
      slotId: item.slotId,
      kioskSessionId,
    });
    flow.discard();
    setSelectedDetailItem(item);
    void navigate(`/products/${item.slotNumber}`);
  };

  // Luôn trỏ tới bản đóng mới nhất để phím ESC không gọi closure cũ.
  useEffect(() => {
    // Màn hướng dẫn sau thanh toán không đóng bằng phím ESC — khách đang chờ lượt xịt đã trả tiền.
    escCloseRef.current = isPostPayment
      ? () => {}
      : paymentOpen
        ? confirmingCancel
          ? flow.dismissCancel
          : flow.requestCancel
        : handleCloseDetailModal;
  });

  // Khách bấm "Thanh toán" ở trang chi tiết (đã đọc chỉ dẫn nút bấm, FR-ORD-25) → vào thẳng mã QR.
  const handleOpenPayment = () => {
    if (!detailItem) return;
    flow.startPayment();
    void navigate(`/checkout/${detailItem.slotNumber}`);
  };

  if (isMachineInMaintenance(flow.createError)) {
    return <OutOfServiceScreen />;
  }

  // Mỗi lúc một trang toàn màn: sau thanh toán → mã QR → chi tiết → danh mục.
  let page;
  if (isPostPayment && created) {
    page = (
      <DispenseFlow
        slot={detailItem?.slotNumber ?? 1}
        productName={detailItem?.product?.name}
        order={created.order}
        view={flow.view}
        phase={phase}
        now={flow.now}
        goHome={() => flow.exit('home')}
      />
    );
  } else if (paymentOpen && detailItem) {
    page = <PaymentPage item={detailItem} flow={flow} />;
  } else if (detailItem) {
    page = (
      <ProductDetailPage
        item={detailItem}
        onPay={handleOpenPayment}
        onBack={handleCloseDetailModal}
      />
    );
  } else if (items.length === 0) {
    page = (
      <div className={styles.emptyState}>
        <p>{t('kiosk.emptyCatalog')}</p>
      </div>
    );
  } else {
    page = <CatalogRail items={items} onSelect={handleSelectItem} />;
  }

  return (
    <section className={styles.catalogContainer} aria-label={t('kiosk.catalogTitle')}>
      {page}
    </section>
  );
}
