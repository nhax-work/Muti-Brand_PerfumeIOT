import { CalendarOutlined } from '@ant-design/icons';
import {
  Button,
  Card,
  Col,
  DatePicker,
  InputNumber,
  Row,
  Select,
  Space,
  Typography,
  message,
} from 'antd';
import dayjs from 'dayjs';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { formatDateTime } from '@/shared/format';
import { useI18n } from '@/shared/i18n';
import { useAssignableStaff } from '@/shared/lookups';
import { useSetPeriodicMaintenance } from '../api';

/**
 * Cấu hình bảo trì định kỳ cho từng máy: gán cố định 1 nhân viên vận hành,
 * chu kỳ (ngày, mặc định 30 ngày = hàng tháng) và mốc bảo trì tiếp theo.
 */
export function PeriodicMaintenanceCard({
  machineId,
  staffId,
  intervalDays,
  nextDueAt,
  lastDoneAt,
}: {
  machineId: string;
  staffId: string | null;
  intervalDays: number;
  nextDueAt: string | null;
  lastDoneAt: string | null;
}) {
  const { t } = useI18n();
  const staff = useAssignableStaff();
  const save = useSetPeriodicMaintenance();

  const [selectedStaff, setSelectedStaff] = useState<string | null>(staffId);
  const [days, setDays] = useState<number>(intervalDays || 30);
  const [nextDate, setNextDate] = useState<dayjs.Dayjs | null>(nextDueAt ? dayjs(nextDueAt) : null);

  const handleSave = () => {
    save.mutate(
      {
        id: machineId,
        staffId: selectedStaff,
        intervalDays: days,
        nextDueAt: nextDate ? nextDate.toISOString() : null,
      },
      {
        onSuccess: () => void message.success('Đã lưu lịch bảo trì định kỳ cho máy'),
        onError: (e) => void message.error(errorMessage(e, t)),
      },
    );
  };

  return (
    <Card
      title={
        <Space>
          <CalendarOutlined /> Bảo trì định kỳ hàng tháng
        </Space>
      }
      extra={
        <Button type="primary" loading={save.isPending} onClick={handleSave}>
          {t('ui.save') ?? 'Lưu'}
        </Button>
      }
    >
      <Row gutter={[16, 12]}>
        <Col xs={24} md={10}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            Nhân viên phụ trách cố định
          </Typography.Text>
          <Select
            allowClear
            showSearch
            style={{ width: '100%' }}
            optionFilterProp="label"
            loading={staff.loading}
            options={staff.options}
            value={selectedStaff ?? undefined}
            placeholder="Chọn nhân viên bảo trì định kỳ"
            onChange={(val) => {
              const nextStaff = val ?? null;
              setSelectedStaff(nextStaff);
              if (nextStaff && !nextDate) {
                setNextDate(dayjs().add(days, 'day'));
              }
            }}
          />
        </Col>
        <Col xs={24} sm={12} md={6}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            Chu kỳ (ngày)
          </Typography.Text>
          <InputNumber
            min={1}
            max={365}
            style={{ width: '100%' }}
            value={days}
            onChange={(v) => setDays(typeof v === 'number' && v >= 1 ? v : 30)}
          />
        </Col>
        <Col xs={24} sm={12} md={8}>
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 4 }}>
            Mốc bảo trì định kỳ tiếp theo
          </Typography.Text>
          <DatePicker
            showTime
            format="DD/MM/YYYY HH:mm"
            style={{ width: '100%' }}
            value={nextDate}
            placeholder="Chọn ngày giờ đến hạn"
            onChange={(d) => setNextDate(d)}
          />
        </Col>
      </Row>
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
        Hệ thống tự động gửi thông báo nhắc nhở đến nhân viên phụ trách trên App trước hạn 3 ngày và
        tạo phiếu kiểm tra & vệ sinh định kỳ.
        {lastDoneAt ? ` Lần bảo trì định kỳ gần nhất: ${formatDateTime(lastDoneAt)}.` : ''}
      </Typography.Paragraph>
    </Card>
  );
}
