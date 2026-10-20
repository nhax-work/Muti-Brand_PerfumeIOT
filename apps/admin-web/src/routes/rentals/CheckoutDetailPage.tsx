import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  Divider,
  List,
  Modal,
  QRCode,
  Result,
  Row,
  Spin,
  Statistic,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined,
  CreditCardOutlined,
  ExportOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  QrcodeOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { RequireRole } from '@/app/guards/RequireRole';
import { ApiRequestError, errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import {
  useAcceptCheckoutAnnex,
  useCancelCheckout,
  useCheckout,
  useCheckoutAnnex,
  usePayCheckout,
  type RentalPaymentIntent,
} from './api';

const { Title, Text, Paragraph } = Typography;
const { Countdown } = Statistic;

function isValidHttpsUrl(url?: string | null): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export default function CheckoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const navigate = useNavigate();

  const [paymentIntent, setPaymentIntent] = useState<RentalPaymentIntent | null>(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [annexAgreed, setAnnexAgreed] = useState(false);

  // Poll mỗi 2s khi phiên chưa PAID, chưa CANCELLED, chưa hết hạn hold và unmount tự hủy
  const {
    data: checkout,
    isLoading,
    error,
    refetch,
  } = useCheckout(id, (query) => {
    if (!paymentIntent) return false;
    const data = query?.state?.data as { stage?: string; holdExpiresAt?: string } | undefined;
    if (!data) return 2000;
    if (data.stage === 'PAID' || data.stage === 'CANCELLED') return false;
    if (Date.now() >= new Date(data.holdExpiresAt || '').getTime()) return false;
    return 2000;
  });

  const isPaid = checkout?.stage === 'PAID';
  const isCancelled = checkout?.stage === 'CANCELLED';

  // Hết hạn giữ chỗ (holdExpiresAt) so với đồng hồ client: đóng modal, báo rõ và dừng polling
  useEffect(() => {
    if (!checkout?.holdExpiresAt || isPaid || isCancelled) return;

    const msUntilExpiry = new Date(checkout.holdExpiresAt).getTime() - Date.now();
    const timer = setTimeout(
      () => {
        if (showPaymentModal) {
          setShowPaymentModal(false);
          message.warning(t('ui.checkoutExpiredNotice'));
        }
        void refetch();
      },
      Math.max(0, msUntilExpiry),
    );

    return () => clearTimeout(timer);
  }, [checkout?.holdExpiresAt, isPaid, isCancelled, showPaymentModal, refetch, t]);

  const {
    data: annex,
    isLoading: isAnnexLoading,
    error: annexError,
    refetch: refetchAnnex,
  } = useCheckoutAnnex(id);

  const payCheckout = usePayCheckout();
  const cancelCheckout = useCancelCheckout();
  const acceptAnnex = useAcceptCheckoutAnnex();

  const isLegacyCheckout = annexError instanceof ApiRequestError && annexError.status === 404;
  const isAnnexAccepted = Boolean(annex?.acceptance) || isLegacyCheckout;

  const handleAcceptAnnex = async () => {
    if (!id || !annex) return;
    try {
      await acceptAnnex.mutateAsync({
        checkoutId: id,
        contentHash: annex.contentHash,
      });
      message.success(t('ui.checkoutAnnexAcceptedSuccess'));
      void refetchAnnex();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handlePay = async () => {
    if (!id) return;
    if (!isAnnexAccepted) {
      message.warning(t('slt.annexNotAccepted'));
      return;
    }
    try {
      const intent = await payCheckout.mutateAsync(id);
      setPaymentIntent(intent);
      setShowPaymentModal(true);
      void refetch();
    } catch (err: unknown) {
      message.error(errorMessage(err, t));
    }
  };

  const handleCancelCheckout = () => {
    Modal.confirm({
      title: t('ui.cancelCheckout'),
      content: t('ui.cancelCheckoutConfirm'),
      okText: t('ui.confirm'),
      cancelText: t('ui.cancel'),
      okButtonProps: { danger: true },
      onOk: async () => {
        if (id) {
          try {
            await cancelCheckout.mutateAsync(id);
          } catch {
            // Bỏ qua nếu phiên đã bị hủy trước đó
          }
        }
        setShowPaymentModal(false);
        message.info(t('ui.checkoutCancelledNotice'));
        void navigate('/rentals/available');
      },
    });
  };

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin size="large" />
      </div>
    );
  }

  if (error || !checkout) {
    return (
      <div style={{ padding: 24, maxWidth: 800, margin: '0 auto' }}>
        <Alert
          type="error"
          message={error ? errorMessage(error, t) : t('common.notFound')}
          showIcon
        />
        <Button
          icon={<ArrowLeftOutlined />}
          style={{ marginTop: 16 }}
          onClick={() => void navigate('/rentals')}
        >
          {t('ui.back')}
        </Button>
      </div>
    );
  }

  const holdDeadline = new Date(checkout.holdExpiresAt).getTime();

  return (
    <RequireRole allow={['BRAND_ADMIN']}>
      <div style={{ padding: '24px', maxWidth: 1000, margin: '0 auto' }}>
        <Button
          icon={<ArrowLeftOutlined />}
          style={{ marginBottom: 16 }}
          onClick={() => void navigate('/rentals')}
        >
          {t('ui.rentalsList')}
        </Button>

        {isPaid ? (
          <Card style={{ marginBottom: 24 }}>
            <Result
              status="success"
              title={t('ui.paymentSuccess')}
              subTitle={t('ui.paymentSuccessDesc')}
              extra={[
                <Button
                  type="primary"
                  key="rentals"
                  icon={<FileTextOutlined />}
                  onClick={() => void navigate('/rentals')}
                >
                  {t('ui.rentalsList')}
                </Button>,
              ]}
            >
              <div style={{ textAlign: 'left', maxWidth: 650, margin: '0 auto' }}>
                <Title level={4}>{t('ui.invoicesInCheckout')}</Title>
                <List
                  bordered
                  dataSource={checkout.invoices}
                  renderItem={(item) => (
                    <List.Item
                      actions={[
                        <Button
                          type="primary"
                          key="config"
                          icon={<SettingOutlined />}
                          onClick={() => void navigate(`/rentals/${item.id}`)}
                        >
                          {t('ui.configSlot')}
                        </Button>,
                        <Button
                          type="link"
                          key="view"
                          onClick={() => void navigate(`/rentals/${item.id}`)}
                        >
                          {t('ui.viewDetail')}
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Text strong style={{ color: '#52c41a' }}>
                            {item.invoiceNumber || t('ui.unpaid')}
                          </Text>
                        }
                        description={`Slot #${item.slotId} • Tổng tiền: ${Number(
                          item.totalAmount || 0,
                        ).toLocaleString('vi-VN')} ${item.currency}`}
                      />
                    </List.Item>
                  )}
                />
              </div>
            </Result>
          </Card>
        ) : isCancelled ? (
          <Card style={{ marginBottom: 24, textAlign: 'center', padding: '24px 0' }}>
            <Result
              status="warning"
              title={t('ui.checkoutCancelled')}
              subTitle="Phiên thanh toán đã hết hạn hoặc bị hủy. Toàn bộ slot đã được giải phóng."
              extra={[
                <Button
                  type="primary"
                  key="available"
                  icon={<ArrowLeftOutlined />}
                  onClick={() => void navigate('/rentals/available')}
                >
                  {t('ui.availableRentals')}
                </Button>,
              ]}
            />
          </Card>
        ) : (
          <Row gutter={[24, 24]}>
            <Col xs={24} lg={16}>
              <Card title={t('ui.invoicesInCheckout')}>
                <List
                  itemLayout="horizontal"
                  dataSource={checkout.invoices}
                  renderItem={(item, index) => (
                    <List.Item>
                      <List.Item.Meta
                        title={
                          <Text strong>
                            Mục #{index + 1} — {item.durationMonths} tháng
                          </Text>
                        }
                        description={
                          <div>
                            <div>
                              Phí thuê: {Number(item.rentAmount || 0).toLocaleString('vi-VN')}{' '}
                              {item.currency}
                            </div>
                            <div>
                              Phí bảo quản:{' '}
                              {Number(item.storageAmount || 0).toLocaleString('vi-VN')}{' '}
                              {item.currency}
                            </div>
                          </div>
                        }
                      />
                      <Tag color="blue" style={{ fontSize: 14, padding: '4px 8px' }}>
                        {Number(item.totalAmount || 0).toLocaleString('vi-VN')} {item.currency}
                      </Tag>
                    </List.Item>
                  )}
                />
              </Card>

              {/* Phụ lục hợp đồng thuê slot (FR-SLT-50) */}
              <Card
                title={
                  <span>
                    <FileProtectOutlined style={{ marginRight: 8, color: '#1677ff' }} />
                    {t('ui.checkoutAnnexTitle')}
                  </span>
                }
                style={{ marginTop: 24 }}
              >
                <Paragraph type="secondary">{t('ui.checkoutAnnexDesc')}</Paragraph>
                {isAnnexLoading ? (
                  <div style={{ textAlign: 'center', padding: '24px 0' }}>
                    <Spin />
                  </div>
                ) : isLegacyCheckout ? (
                  <Alert type="info" message={t('ui.checkoutAnnexLegacy')} showIcon />
                ) : annexError ? (
                  <Alert type="error" message={errorMessage(annexError, t)} showIcon />
                ) : annex ? (
                  <div>
                    <div style={{ marginBottom: 12 }}>
                      <Text type="secondary">{t('ui.contentHashLabel')}: </Text>
                      <Text code copyable>
                        {annex.contentHash}
                      </Text>
                    </div>

                    <div
                      style={{
                        maxHeight: 280,
                        overflowY: 'auto',
                        padding: '12px 16px',
                        background: '#fafafa',
                        border: '1px solid #d9d9d9',
                        borderRadius: 6,
                        whiteSpace: 'pre-wrap',
                        fontFamily: 'monospace',
                        fontSize: 13,
                        marginBottom: 16,
                      }}
                    >
                      {annex.content}
                    </div>

                    {annex.acceptance ? (
                      <Alert
                        type="success"
                        message={t('ui.checkoutAnnexAccepted')}
                        description={`Đồng ý lúc: ${new Date(annex.acceptance.acceptedAt).toLocaleString('vi-VN')}`}
                        showIcon
                      />
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                        <Checkbox
                          checked={annexAgreed}
                          onChange={(e) => setAnnexAgreed(e.target.checked)}
                        >
                          {t('ui.checkoutAnnexAgreed')}
                        </Checkbox>
                        <div>
                          <Button
                            type="primary"
                            disabled={!annexAgreed}
                            loading={acceptAnnex.isPending}
                            onClick={handleAcceptAnnex}
                          >
                            {t('ui.checkoutAnnexAcceptBtn')}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </Card>
            </Col>

            <Col xs={24} lg={8}>
              <Card
                title={
                  <span>
                    <CreditCardOutlined style={{ marginRight: 8 }} />
                    {t('ui.checkoutDetailTitle', { id: checkout.id.slice(0, 8) })}
                  </span>
                }
              >
                <Statistic
                  title={t('ui.totalFee')}
                  value={Number(checkout.totalAmount).toLocaleString('vi-VN')}
                  suffix={checkout.currency}
                  valueStyle={{ color: '#1677ff', fontWeight: 600 }}
                />

                <Divider style={{ margin: '16px 0' }} />

                <Countdown
                  title={
                    <span>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      {t('ui.checkoutExpiresIn')}
                    </span>
                  }
                  value={holdDeadline}
                  format="mm:ss"
                  onFinish={() => {
                    setShowPaymentModal(false);
                    message.warning(t('ui.checkoutCancelled'));
                    void navigate('/rentals/available');
                  }}
                />

                <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <Button
                    type="primary"
                    size="large"
                    block
                    icon={<QrcodeOutlined />}
                    loading={payCheckout.isPending}
                    disabled={!isAnnexAccepted || isAnnexLoading}
                    onClick={handlePay}
                  >
                    {t('ui.payNow')}
                  </Button>
                  <Button
                    danger
                    block
                    icon={<CloseCircleOutlined />}
                    onClick={handleCancelCheckout}
                  >
                    {t('ui.cancelCheckout')}
                  </Button>
                </div>
              </Card>
            </Col>
          </Row>
        )}

        {/* Modal QR Code Thanh toán */}
        <Modal
          title={
            <span>
              <QrcodeOutlined style={{ marginRight: 8, color: '#1677ff' }} />
              {t('ui.paymentQr')}
            </span>
          }
          open={showPaymentModal && !isPaid}
          onCancel={() => setShowPaymentModal(false)}
          footer={[
            <Button
              key="cancel"
              danger
              icon={<CloseCircleOutlined />}
              onClick={handleCancelCheckout}
            >
              {t('ui.cancelCheckout')}
            </Button>,
            <Button key="close" onClick={() => setShowPaymentModal(false)}>
              {t('ui.close')}
            </Button>,
          ]}
        >
          <div style={{ textAlign: 'center', padding: '16px 0' }}>
            {paymentIntent?.qrPayload ? (
              <div
                style={{
                  display: 'inline-block',
                  padding: 16,
                  background: '#fff',
                  borderRadius: 8,
                  border: '1px solid #f0f0f0',
                }}
              >
                <QRCode value={paymentIntent.qrPayload} size={220} />
              </div>
            ) : (
              <Spin />
            )}

            {(() => {
              const displayReference = (() => {
                if (!paymentIntent?.qrPayload)
                  return paymentIntent?.paymentId?.slice(0, 8) ?? '...';
                const parts = paymentIntent.qrPayload.split('|');
                if (parts.length >= 2 && parts[1]?.startsWith('CHK-')) {
                  return parts[1];
                }
                return paymentIntent.qrPayload.startsWith('CHK-')
                  ? paymentIntent.qrPayload
                  : paymentIntent.paymentId.slice(0, 8);
              })();

              return (
                <Paragraph style={{ marginTop: 16 }}>
                  <Text strong>{t('ui.paymentCode')}: </Text>
                  <Text copyable code style={{ fontSize: 16, fontWeight: 'bold' }}>
                    {displayReference}
                  </Text>
                </Paragraph>
              );
            })()}

            {isValidHttpsUrl(paymentIntent?.checkoutUrl) && (
              <div style={{ marginTop: 12, marginBottom: 12 }}>
                <Button
                  type="primary"
                  icon={<ExportOutlined />}
                  onClick={() => {
                    window.open(paymentIntent!.checkoutUrl!, '_blank', 'noopener,noreferrer');
                  }}
                >
                  {t('ui.openPayosCheckout')}
                </Button>
              </div>
            )}

            <Paragraph type="secondary">{t('ui.scanQrInstructions')}</Paragraph>

            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                marginTop: 16,
              }}
            >
              <Spin size="small" />
              <Text type="secondary">Đang chờ xác nhận từ cổng thanh toán...</Text>
            </div>
          </div>
        </Modal>
      </div>
    </RequireRole>
  );
}
