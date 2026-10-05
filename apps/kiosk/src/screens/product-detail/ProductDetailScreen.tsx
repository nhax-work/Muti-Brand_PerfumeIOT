import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useKioskCatalog } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import styles from './ProductDetailScreen.module.css';

const FALLBACK_BOTTLES: Record<number, string> = {
  1: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjHLKHQ-e9v8rbVauKmO7a4XdFgitH2PX04adOLTIDcdpPwTMgj-ABCxgZT3y1iVk4EkVCclPnFJrm2AP7heA3adEYnqsJsWfuHluEESKmnpcpMphfmLkxdj5oTKVTETo2E8JdzRMpvqTaHozpF27TbIsqMhy3BEIWgUjwP0FNUks_8sX00O_fphckeGjDYOqtj7WxsNLAxCBLfThMPkP3xN9K3q-NAOeoySXLnRZdVHO09viZHUTm',
  2: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCi8kgz8yWcTDwPznpLifDSV9mqx5f3T3sYLxfM6aJ_dbkYiY_UC6j3hY7txxWfnMG_isJJ_WxlMdGt86bRV0k5TcAN7LhxMhSljyTmn-S0JL3tHi7E5tKCO0o1rDcYx1bUoCUByKyl285EKIYD9FVctJyP40qzusM13xM7ejEW6CiqwAJQ0giQD8CVUL1YFtP4SrXTwDlazB_1IZIdSpdY4fOXGMnYaHb0jli_1Dxeu02TDqO-E1Ce',
  3: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDrwnlACE74MpP3ze5UCHx_2MWHdGE2a8EZ9tRcjojME_0ZFCpdnP8jrPGBhM6K1Mgy7p_XSRWJLkdJ_wej47ts_3-MrYMHDU42ZQVo25IJO2lIXI8_BCcJ5IMtnb3uL-ftOT32o5Bvy9EoQXsQvhVifruPsELMB_uIfnTopfCgYTTWWVGV1kCOGuW8ZvwdU1C3JUXQZcGEjkAzJriCenzlJFxWW23Nk5LJXIhwJ_DJu1i9vd1buJsL',
  4: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDhEcCtoyj-KiT2weL0jXt1iCyGCvxYPjrqSQ1hyqIdMsULOb2OpvFNcrpU-Oaz7Qd-fcogDGELsRPoK2ByYreFQ6wn7Z3PdFRLDz9DKjfQ9vllHdOZ-0K7e9Frpr_7mvKpGnpz1lQUl-NcssHIf8GV4tORcyBPSyLHP1uvMBw8U0nv4wa9oreMxMhsc28LTVNijTDmfP30P5J3ZboqBmEG9RPa935bwAEgRRe-XEJAGJVrtJg-_BwT',
};

const PRODUCT_INTROS: Record<string, string> = {
  '1': 'Hương thơm sớm mai thanh khiết kết hợp cam bergamote và hoa cỏ Grasse, mang lại nguồn năng lượng tươi mới.',
  '2': 'Hòa quyện tinh tế giữa hổ phách phương Đông và da thuộc đen sang trọng, gợi mở chiều sâu bí ẩn đầy lôi cuốn.',
  '3': 'Nốt hương hoa sen thanh tao thuần khiết buổi sớm, hòa quyện hương phù sa mộc mạc và sương mai dịu nhẹ, mang lại cảm giác an yên, thoát tục.',
  '4': 'Hương quế cay ấm nồng nàn đặc trưng của đại ngàn Trà Bồng, đan xen thảo mộc núi rừng tạo nên chiều sâu nồng ấm và lôi cuốn.',
  '5': 'Tuyệt tác trầm hương thượng hạng từ xứ Trầm Khánh Hòa, lắng đọng khói sương huyền ảo mang lại sự tĩnh tại, tôn quý.',
};

function formatPrice(amount: string | null | undefined, currency: string): string {
  if (!amount) return '';
  const num = Number(amount);
  if (Number.isNaN(num)) return `${amount} ${currency}`;
  return `${new Intl.NumberFormat('vi-VN').format(num)} ${currency}`;
}

function parseNoteValues(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) {
    return val.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof val === 'string') {
    return val
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(val)];
}

/**
 * Màn hình chi tiết sản phẩm Scentation Haute Parfumerie (Screen 2: Quick View & Checkout Modal).
 * Hiển thị hình ảnh flacon Grasse đổ bóng, thông số nồng độ Extrait de Parfum, bảng nốt hương 3 tầng,
 * nút phun xịt thử tại quầy với toast mô phỏng, và nút trải nghiệm xịt ngay.
 */
export default function ProductDetailScreen() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { slotNumber } = useParams<{ slotNumber: string }>();
  const catalog = useKioskCatalog();

  const [isSpraying, setIsSpraying] = useState(false);

  const item = useMemo(() => {
    const items = catalog.data?.items ?? [];
    return items.find((i) => String(i.slotNumber) === slotNumber);
  }, [catalog.data?.items, slotNumber]);

  const product = item?.product;
  const isAvailable = Boolean(item?.available);

  // Phân tích các tầng hương (top, heart/middle, base)
  const notes = useMemo(() => {
    if (!product?.fragranceNotes || typeof product.fragranceNotes !== 'object') {
      return null;
    }
    const raw = product.fragranceNotes as Record<string, unknown>;

    const top = parseNoteValues(raw.top ?? raw.Top ?? raw.huongDau);
    const heart = parseNoteValues(
      raw.heart ?? raw.Heart ?? raw.middle ?? raw.Middle ?? raw.huongGiua,
    );
    const base = parseNoteValues(raw.base ?? raw.Base ?? raw.huongCuoi);

    const standardKeys = new Set([
      'top',
      'Top',
      'huongDau',
      'heart',
      'Heart',
      'middle',
      'Middle',
      'huongGiua',
      'base',
      'Base',
      'huongCuoi',
    ]);
    const others = Object.entries(raw)
      .filter(([key]) => !standardKeys.has(key))
      .map(([key, val]) => ({
        label: key,
        values: parseNoteValues(val),
      }))
      .filter((entry) => entry.values.length > 0);

    const hasAny = top.length > 0 || heart.length > 0 || base.length > 0 || others.length > 0;
    if (!hasAny) return null;

    return { top, heart, base, others };
  }, [product?.fragranceNotes]);

  const handleSprayTest = () => {
    setIsSpraying(true);
    setTimeout(() => {
      setIsSpraying(false);
    }, 3200);
  };

  // Hiển thị thông báo không tìm thấy khi slot không tồn tại hoặc không khả dụng
  if (!item || !product) {
    return (
      <section className={styles.detailContainer}>
        <div className={styles.emptyState}>
          <h1 className={styles.emptyTitle}>{t('kiosk.productNotFound')}</h1>
          <p className={styles.emptySubtitle}>{t('kiosk.productUnavailable')}</p>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => void navigate('/catalog')}
          >
            {t('kiosk.backToCatalog')}
          </button>
        </div>
      </section>
    );
  }

  const priceText = formatPrice(item.pricePerSpray, item.currency);
  const bottleImg =
    product.imageUrl ||
    FALLBACK_BOTTLES[item.slotNumber] ||
    FALLBACK_BOTTLES[1];

  return (
    <section className={styles.detailContainer} aria-label={product.name}>
      <div className={styles.modalBox}>
        {/* Cột trái: Chai nước hoa & chứng nhận nguồn gốc */}
        <div className={styles.bottleColumn}>
          <div className={styles.batchBadge}>
            N° 0{item.slotNumber} • HAUTE SILLAGE
          </div>

          <div className={styles.imageFrame}>
            <div className={styles.pedestalShadow} />
            <img src={bottleImg} alt={product.name} className={styles.productImage} />
          </div>
        </div>

        {/* Cột phải: Thông tin hương liệu & nút hành động */}
        <div className={styles.infoColumn}>
          <div>
            <div className={styles.headerMeta}>
              <span className={styles.familyTag}>ORIENTAL SILLAGE</span>
              {item.brandName && (
                <span className={styles.brandLabel}>{item.brandName}</span>
              )}
            </div>

            <h1 className={styles.productName}>{product.name}</h1>

            <div className={styles.priceRow}>
              <span className={styles.priceTag}>
                {priceText ? `${priceText} / lượt xịt` : ''}
              </span>
            </div>

            {(product.description || (slotNumber ? PRODUCT_INTROS[slotNumber] : '')) && (
              <p className={styles.desc}>
                {product.description || (slotNumber ? PRODUCT_INTROS[slotNumber] : '')}
              </p>
            )}

            <div className={styles.detailsTable}>
              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    science
                  </span>
                  Nhà Chế Tác (Master Perfumer)
                </span>
                <span className={styles.detailValue}>
                  {item.brandName || 'Jean-Claude Ellena'} • Grasse, France
                </span>
              </div>

              {notes && (
                <div className={styles.detailRow}>
                  <span className={styles.detailLabel}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                      spa
                    </span>
                    {t('kiosk.fragranceNotes')}
                  </span>
                  <div className={styles.detailValue}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                      {notes.top.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                            {t('kiosk.topNotes')}:
                          </span>
                          <div className={styles.notesChips}>
                            {notes.top.map((n) => (
                              <span key={n} className={styles.noteChip}>
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {notes.heart.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                            {t('kiosk.heartNotes')}:
                          </span>
                          <div className={styles.notesChips}>
                            {notes.heart.map((n) => (
                              <span key={n} className={styles.noteChip}>
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      {notes.base.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>
                            {t('kiosk.baseNotes')}:
                          </span>
                          <div className={styles.notesChips}>
                            {notes.base.map((n) => (
                              <span key={n} className={styles.noteChip}>
                                {n}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              <div className={styles.detailRow}>
                <span className={styles.detailLabel}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    verified_user
                  </span>
                  Tiêu Chuẩn &amp; Độ Tinh Khiết
                </span>
                <span className={styles.detailValue}>IFRA Certified 100% Pure Origin</span>
              </div>
            </div>
          </div>

          {/* Hàng nút CTA */}
          <div className={styles.actionsRow}>
            <button
              id="kiosk-spray-button"
              type="button"
              className={`${styles.checkoutButton} ${!isAvailable ? styles.checkoutButtonDisabled : ''}`}
              onClick={() => {
                if (isAvailable) {
                  void navigate(`/checkout/${item.slotNumber}`);
                }
              }}
              disabled={!isAvailable}
              aria-label={isAvailable ? t('kiosk.sprayExperience') : t('kiosk.outOfStock')}
            >
              <span>{isAvailable ? t('kiosk.sprayExperience') : t('kiosk.outOfStock')}</span>
              {isAvailable && <span aria-hidden="true">→</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Scent Spray Toast Notification */}
      {isSpraying && (
        <div className={styles.sprayToast} role="alert">
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            air
          </span>
          <span>Đang phun làn sương thử hương tại vòi salon... Xin mời thưởng thức!</span>
        </div>
      )}
    </section>
  );
}
