import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useKioskCatalog } from '@/shared/api';
import styles from './CheckoutScreen.module.css';

const FALLBACK_BOTTLES: Record<number, string> = {
  1: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjHLKHQ-e9v8rbVauKmO7a4XdFgitH2PX04adOLTIDcdpPwTMgj-ABCxgZT3y1iVk4EkVCclPnFJrm2AP7heA3adEYnqsJsWfuHluEESKmnpcpMphfmLkxdj5oTKVTETo2E8JdzRMpvqTaHozpF27TbIsqMhy3BEIWgUjwP0FNUks_8sX00O_fphckeGjDYOqtj7WxsNLAxCBLfThMPkP3xN9K3q-NAOeoySXLnRZdVHO09viZHUTm',
  2: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCi8kgz8yWcTDwPznpLifDSV9mqx5f3T3sYLxfM6aJ_dbkYiY_UC6j3hY7txxWfnMG_isJJ_WxlMdGt86bRV0k5TcAN7LhxMhSljyTmn-S0JL3tHi7E5tKCO0o1rDcYx1bUoCUByKyl285EKIYD9FVctJyP40qzusM13xM7ejEW6CiqwAJQ0giQD8CVUL1YFtP4SrXTwDlazB_1IZIdSpdY4fOXGMnYaHb0jli_1Dxeu02TDqO-E1Ce',
  3: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDrwnlACE74MpP3ze5UCHx_2MWHdGE2a8EZ9tRcjojME_0ZFCpdnP8jrPGBhM6K1Mgy7p_XSRWJLkdJ_wej47ts_3-MrYMHDU42ZQVo25IJO2lIXI8_BCcJ5IMtnb3uL-ftOT32o5Bvy9EoQXsQvhVifruPsELMB_uIfnTopfCgYTTWWVGV1kCOGuW8ZvwdU1C3JUXQZcGEjkAzJriCenzlJFxWW23Nk5LJXIhwJ_DJu1i9vd1buJsL',
  4: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDhEcCtoyj-KiT2weL0jXt1iCyGCvxYPjrqSQ1hyqIdMsULOb2OpvFNcrpU-Oaz7Qd-fcogDGELsRPoK2ByYreFQ6wn7Z3PdFRLDz9DKjfQ9vllHdOZ-0K7e9Frpr_7mvKpGnpz1lQUl-NcssHIf8GV4tORcyBPSyLHP1uvMBw8U0nv4wa9oreMxMhsc28LTVNijTDmfP30P5J3ZboqBmEG9RPa935bwAEgRRe-XEJAGJVrtJg-_BwT',
};

function formatPrice(amount: string | null | undefined, currency: string): string {
  if (!amount) return '';
  const num = Number(amount);
  if (Number.isNaN(num)) return `${amount} ${currency}`;
  return `${new Intl.NumberFormat('vi-VN').format(num)} ${currency}`;
}

type PaymentStep = 'select_method' | 'qr_instructions' | 'pos_instructions';

export default function CheckoutScreen() {
  const navigate = useNavigate();
  const { slotNumber } = useParams<{ slotNumber: string }>();
  const catalog = useKioskCatalog();

  const [selectedMethod, setSelectedMethod] = useState<'card' | 'qr'>('card');
  const [currentStep, setCurrentStep] = useState<PaymentStep>('select_method');
  const [countdown, setCountdown] = useState(299); // 04:59

  const item = useMemo(() => {
    const items = catalog.data?.items ?? [];
    return items.find((i) => String(i.slotNumber) === slotNumber);
  }, [catalog.data?.items, slotNumber]);

  const product = item?.product;
  const priceFormatted = formatPrice(item?.pricePerSpray, item?.currency ?? 'VND');
  const bottleImg =
    product?.imageUrl ||
    (slotNumber ? FALLBACK_BOTTLES[Number(slotNumber)] : undefined) ||
    FALLBACK_BOTTLES[1];

  // Đếm ngược thời gian thanh toán khi mở popup VietQR
  useEffect(() => {
    if (currentStep !== 'qr_instructions') return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [currentStep]);

  const formatCountdown = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const handleProceed = () => {
    if (selectedMethod === 'qr') {
      setCurrentStep('qr_instructions');
    } else {
      setCurrentStep('pos_instructions');
    }
  };

  const handleCancel = () => {
    void navigate('/catalog');
  };

  return (
    <section className={styles.checkoutContainer}>
      <div className={styles.modalCard}>
        {/* Nút đóng */}
        <button
          type="button"
          className={styles.closeButton}
          onClick={handleCancel}
          aria-label="Đóng popup"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            close
          </span>
        </button>

        {/* ================= BƯỚC 1: CHỌN PHƯƠNG THỨC THANH TOÁN (Screen 4) ================= */}
        {currentStep === 'select_method' && (
          <>
            <div className={styles.headerArea}>
              <h2 className={styles.modalTitle}>CHỌN PHƯƠNG THỨC THANH TOÁN</h2>

              {/* Banner tóm tắt đơn hàng */}
              <div className={styles.summaryBanner}>
                <div className={styles.summaryLeft}>
                  <img
                    src={bottleImg}
                    alt={product?.name ?? 'Nước hoa'}
                    className={styles.summaryThumb}
                  />
                  <div className={styles.summaryInfo}>
                    <span className={styles.summaryLabel}>
                      Thanh toán lượt xịt • Ngăn 0{slotNumber}
                    </span>
                    <span className={styles.summaryName}>
                      {product?.name ?? "Nuit d'Or"}
                    </span>
                  </div>
                </div>
                <div className={styles.summaryRight}>
                  <div className={styles.summaryPrice}>{priceFormatted || '35.000 VND'}</div>
                </div>
              </div>
            </div>

            {/* Danh sách phương thức thanh toán */}
            <div className={styles.methodsList}>
              {/* Lựa chọn 1: Thẻ POS / NFC */}
              <label
                className={`${styles.methodItem} ${selectedMethod === 'card' ? styles.methodItemSelected : ''}`}
              >
                <input
                  type="radio"
                  name="kiosk_payment_method"
                  value="card"
                  checked={selectedMethod === 'card'}
                  onChange={() => setSelectedMethod('card')}
                  className={styles.radioInput}
                />
                <div className={styles.methodContent}>
                  <div className={styles.methodHeader}>
                    <div className={styles.methodTitleRow}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                        credit_card
                      </span>
                      <span className={styles.methodTitle}>
                        Thẻ Visa / Mastercard / Thẻ Quốc Tế
                      </span>
                    </div>
                  </div>
                  <p className={styles.methodDesc}>
                    Chạm NFC hoặc cắm thẻ chip vào khe đọc POS tích hợp ngay bên dưới màn hình.
                  </p>
                  <div className={styles.tagsRow}>
                    <span className={styles.badgeTag}>VISA</span>
                    <span className={styles.badgeTag}>MASTERCARD</span>
                    <span className={styles.badgeTag}>JCB</span>
                    <span className={styles.badgeTag}>Apple Pay</span>
                    <span className={styles.badgeTag}>Google Pay</span>
                    <span
                      style={{
                        fontSize: 11,
                        color: 'var(--color-text-secondary)',
                        marginLeft: 'auto',
                      }}
                    >
                      Miễn phí quẹt thẻ
                    </span>
                  </div>
                </div>
              </label>

              {/* Lựa chọn 2: VietQR / Ví điện tử */}
              <label
                className={`${styles.methodItem} ${selectedMethod === 'qr' ? styles.methodItemSelected : ''}`}
              >
                <input
                  type="radio"
                  name="kiosk_payment_method"
                  value="qr"
                  checked={selectedMethod === 'qr'}
                  onChange={() => setSelectedMethod('qr')}
                  className={styles.radioInput}
                />
                <div className={styles.methodContent}>
                  <div className={styles.methodHeader}>
                    <div className={styles.methodTitleRow}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                        qr_code_scanner
                      </span>
                      <span className={styles.methodTitle}>
                        Quét Mã QR (VietQR / Ngân Hàng / Ví Điện Tử)
                      </span>
                    </div>
                  </div>
                  <p className={styles.methodDesc}>
                    Quét mã qua app Mobile Banking hoặc ví MoMo, ZaloPay, VNPay.
                  </p>
                  <div className={styles.tagsRow}>
                    <span className={styles.badgeTag}>VIETQR</span>
                    <span className={styles.badgeTag}>MOMO</span>
                    <span className={styles.badgeTag}>ZALOPAY</span>
                    <span className={styles.badgeTag}>VNPAY</span>
                    <span className={styles.badgeTag}>NAPAS 247</span>
                  </div>
                </div>
              </label>
            </div>

            <div className={styles.footerButtons}>
              <button
                type="button"
                className={styles.actionButtonSecondary}
                onClick={handleCancel}
              >
                ← Quay lại danh mục
              </button>
              <button
                type="button"
                className={styles.actionButtonPrimary}
                onClick={handleProceed}
              >
                Tiếp tục thanh toán →
              </button>
            </div>
          </>
        )}

        {/* ================= BƯỚC 2A: POPUP HƯỚNG DẪN VIETQR (Screen 5) ================= */}
        {currentStep === 'qr_instructions' && (
          <>
            <div className={styles.headerArea}>
              <h2 className={styles.modalTitle}>QUÉT MÃ QR ĐỂ THANH TOÁN</h2>

              {/* Tóm tắt */}
              <div className={styles.summaryBanner}>
                <div className={styles.summaryLeft}>
                  <img
                    src={bottleImg}
                    alt={product?.name ?? 'Nước hoa'}
                    className={styles.summaryThumb}
                  />
                  <div className={styles.summaryInfo}>
                    <span className={styles.summaryLabel}>
                      Mã đơn: <strong style={{ color: '#000000' }}>#SCT-8842</strong>
                    </span>
                    <span className={styles.summaryName}>
                      {product?.name ?? "Nuit d'Or"}
                    </span>
                  </div>
                </div>
                <div className={styles.summaryRight}>
                  <div className={styles.summaryPrice}>{priceFormatted || '35.000 VND'}</div>
                  <div className={styles.summaryNote}>1 lượt xịt cao cấp</div>
                </div>
              </div>
            </div>

            {/* Hộp hiển thị mã QR */}
            <div className={styles.qrDisplayBox}>
              <div className={styles.qrWrapper}>
                <svg
                  className={styles.qrSvg}
                  fill="none"
                  viewBox="0 0 160 160"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <rect fill="#000000" height="40" rx="6" width="40" x="10" y="10" />
                  <rect fill="white" height="24" rx="3" width="24" x="18" y="18" />
                  <rect fill="#000000" height="14" rx="2" width="14" x="23" y="23" />
                  <rect fill="#000000" height="40" rx="6" width="40" x="110" y="10" />
                  <rect fill="white" height="24" rx="3" width="24" x="118" y="18" />
                  <rect fill="#000000" height="14" rx="2" width="14" x="123" y="23" />
                  <rect fill="#000000" height="40" rx="6" width="40" x="10" y="110" />
                  <rect fill="white" height="24" rx="3" width="24" x="18" y="118" />
                  <rect fill="#000000" height="14" rx="2" width="14" x="23" y="123" />
                  <rect fill="#000000" height="8" width="8" x="60" y="15" />
                  <rect fill="#000000" height="8" width="12" x="75" y="15" />
                  <rect fill="#000000" height="8" width="8" x="92" y="15" />
                  <rect fill="#000000" height="8" width="14" x="60" y="30" />
                  <rect fill="#000000" height="8" width="18" x="82" y="28" />
                  <rect fill="#000000" height="15" width="8" x="60" y="45" />
                  <rect fill="#000000" height="12" width="12" x="75" y="42" />
                  <rect fill="#000000" height="10" width="10" x="95" y="45" />
                  <rect fill="#000000" height="8" width="10" x="15" y="60" />
                  <rect fill="#000000" height="8" width="12" x="32" y="60" />
                  <rect fill="#000000" height="8" width="18" x="15" y="75" />
                  <rect fill="#000000" height="12" width="14" x="38" y="75" />
                  <rect fill="#000000" height="8" width="12" x="15" y="92" />
                  <rect fill="#000000" height="10" width="10" x="35" y="92" />
                  <rect fill="#000000" height="10" width="10" x="60" y="65" />
                  <rect fill="#000000" height="10" width="10" x="78" y="65" />
                  <rect fill="#000000" height="8" width="15" x="95" y="65" />
                  <rect fill="#000000" height="10" width="12" x="115" y="60" />
                  <rect fill="#000000" height="8" width="15" x="135" y="60" />
                  <rect fill="#000000" height="15" width="8" x="115" y="75" />
                  <rect fill="#000000" height="8" width="18" x="130" y="78" />
                  <rect fill="#000000" height="8" width="14" x="115" y="95" />
                  <rect fill="#000000" height="12" width="12" x="135" y="92" />
                  <rect fill="#000000" height="8" width="12" x="60" y="85" />
                  <rect fill="#000000" height="14" width="10" x="80" y="82" />
                  <rect fill="#000000" height="10" width="8" x="98" y="85" />
                  <rect fill="#000000" height="8" width="18" x="60" y="105" />
                  <rect fill="#000000" height="14" width="8" x="85" y="102" />
                  <rect fill="#000000" height="8" width="12" x="100" y="105" />
                  <rect fill="#000000" height="12" width="10" x="60" y="120" />
                  <rect fill="#000000" height="8" width="14" x="78" y="122" />
                  <rect fill="#000000" height="10" width="12" x="98" y="120" />
                  <rect fill="#000000" height="8" width="15" x="60" y="138" />
                  <rect fill="#000000" height="12" width="10" x="82" y="135" />
                  <rect fill="#000000" height="8" width="14" x="98" y="138" />
                  <rect fill="#000000" height="10" width="12" x="118" y="115" />
                  <rect fill="#000000" height="8" width="14" x="135" y="115" />
                  <rect fill="#000000" height="14" width="10" x="118" y="132" />
                  <rect fill="#000000" height="8" width="15" x="135" y="130" />
                  <rect fill="#000000" height="24" rx="6" width="24" x="68" y="68" />
                  <path d="M74 80L78 74H86L82 86H74L78 80Z" fill="#ffffff" />
                </svg>
              </div>

              <div className={styles.timerRow}>
                <div className={styles.timerPill}>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    schedule
                  </span>
                  <span>Thời gian hiệu lực: {formatCountdown(countdown)}</span>
                </div>
                <div className={styles.waitingPill}>
                  <span className={styles.waitingPulse} />
                  <span>Đang chờ nhận diện giao dịch tự động...</span>
                </div>
              </div>

              <div className={styles.tagsRow}>
                <span className={styles.badgeTag}>VIETQR</span>
                <span className={styles.badgeTag}>MOMO</span>
                <span className={styles.badgeTag}>ZALOPAY</span>
                <span className={styles.badgeTag}>VNPAY</span>
                <span className={styles.badgeTag}>NAPAS 247</span>
              </div>
            </div>

            <div className={styles.footerButtons}>
              <button
                type="button"
                className={styles.actionButtonSecondary}
                onClick={() => setCurrentStep('select_method')}
              >
                ← Đổi phương thức thanh toán
              </button>
              <button
                type="button"
                className={styles.actionButtonPrimary}
                onClick={handleCancel}
              >
                Hủy giao dịch
              </button>
            </div>
          </>
        )}

        {/* ================= BƯỚC 2B: POPUP HƯỚNG DẪN POS / NFC (Screen 6) ================= */}
        {currentStep === 'pos_instructions' && (
          <>
            <div className={styles.headerArea}>
              <h2 className={styles.modalTitle}>THANH TOÁN THẺ QUỐC TẾ / NFC</h2>

              <div className={styles.summaryBanner}>
                <div className={styles.summaryLeft}>
                  <img
                    src={bottleImg}
                    alt={product?.name ?? 'Nước hoa'}
                    className={styles.summaryThumb}
                  />
                  <div className={styles.summaryInfo}>
                    <span className={styles.summaryLabel}>Mã đơn: #SCT-8842</span>
                    <span className={styles.summaryName}>
                      {product?.name ?? "Nuit d'Or"}
                    </span>
                  </div>
                </div>
                <div className={styles.summaryRight}>
                  <div className={styles.summaryPrice}>{priceFormatted || '35.000 VND'}</div>
                  <div className={styles.summaryNote}>Chạm thẻ hoặc cắm chip</div>
                </div>
              </div>
            </div>

            {/* Radar animation chạm thẻ NFC */}
            <div className={styles.nfcDisplayBox}>
              <div className={styles.nfcRadar}>
                <div className={styles.radarRing} />
                <div className={styles.nfcIconCore}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32 }}>
                    contactless
                  </span>
                </div>
              </div>

              <div className={styles.nfcStatusPill}>
                <span className={styles.waitingPulse} style={{ background: '#ffffff' }} />
                <span>ĐANG CHỜ CHẠM THẺ HOẶC CẮM CHIP...</span>
              </div>

              <div className={styles.tagsRow} style={{ justifyContent: 'center' }}>
                <span className={styles.badgeTag}>VISA</span>
                <span className={styles.badgeTag}>MASTERCARD</span>
                <span className={styles.badgeTag}>JCB</span>
                <span className={styles.badgeTag}>Apple Pay</span>
                <span className={styles.badgeTag}>Google Pay</span>
              </div>
            </div>

            {/* 3 Bước hướng dẫn trực quan */}
            <div className={styles.stepsGrid}>
              <div className={styles.stepCard}>
                <span className={styles.stepBadge}>1</span>
                <span className={`material-symbols-outlined ${styles.stepIcon}`}>
                  contactless
                </span>
                <span className={styles.stepTitle}>Chạm thẻ</span>
              </div>

              <div className={styles.stepCard}>
                <span className={styles.stepBadge}>2</span>
                <span className={`material-symbols-outlined ${styles.stepIcon}`}>
                  pin
                </span>
                <span className={styles.stepTitle}>Nhập mã PIN (nếu có)</span>
              </div>

              <div className={styles.stepCard}>
                <span className={styles.stepBadge}>3</span>
                <span className={`material-symbols-outlined ${styles.stepIcon}`}>
                  receipt_long
                </span>
                <span className={styles.stepTitle}>Nhận lượt xịt tại vòi</span>
              </div>
            </div>

            <div className={styles.footerButtons}>
              <button
                type="button"
                className={styles.actionButtonSecondary}
                onClick={() => setCurrentStep('select_method')}
              >
                ← Đổi phương thức thanh toán
              </button>
              <button
                type="button"
                className={styles.actionButtonPrimary}
                onClick={handleCancel}
              >
                Hủy giao dịch
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
