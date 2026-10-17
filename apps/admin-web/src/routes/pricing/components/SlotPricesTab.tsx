import {
  Alert,
  Button,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { type MachineSlot, usePricingMachines, usePricingSlots, useSetRentPrice } from '../api';
import { formatVnd } from '@/shared/format';

/**
 * Giá thuê niêm yết từng slot (FR-SLT-32). Slot có giá mới hiện trong danh sách slot trống cho
 * thương hiệu (FR-SLT-19); đặt `null` là đóng slot khỏi danh sách đó.
 */
export function SlotPricesTab() {
  const { t } = useI18n();
  const machines = usePricingMachines();
  const [chosenMachine, setMachineId] = useState<string | undefined>();
  // Chưa chọn thì lấy máy đầu tiên — phần lớn lúc đầu nền tảng chỉ có một máy.
  const machineId = chosenMachine ?? machines.data?.items[0]?.id;
  const slots = usePricingSlots(machineId);
  const setPrice = useSetRentPrice();
  const [editing, setEditing] = useState<MachineSlot | null>(null);
  const [price, setPriceInput] = useState<number | null>(null);

  const save = async (value: string | null) => {
    if (!editing) return;
    try {
      await setPrice.mutateAsync({ slotId: editing.id, price: value });
      message.success(t('ui.pricingSaved'));
      setEditing(null);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<MachineSlot> = [
    {
      title: t('ui.mySlotsSlot'),
      dataIndex: 'slotNumber',
      key: 'slotNumber',
      render: (n: number) => `#${n}`,
    },
    {
      title: t('ui.slotStatus'),
      dataIndex: 'status',
      key: 'status',
      render: (s: MachineSlot['status']) => <Tag>{t(`slotStatus.${s}`)}</Tag>,
    },
    {
      title: t('ui.pricingMonthlyRentPrice'),
      key: 'monthlyRentPrice',
      render: (_, slot) =>
        slot.monthlyRentPrice ? (
          <Typography.Text strong>{formatVnd(slot.monthlyRentPrice)}</Typography.Text>
        ) : (
          <Tag>{t('ui.pricingNotForRent')}</Tag>
        ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, slot) => (
        <Button
          type="link"
          size="small"
          onClick={() => {
            setEditing(slot);
            setPriceInput(slot.monthlyRentPrice ? Number(slot.monthlyRentPrice) : null);
          }}
        >
          {t('ui.pricingSetRentPrice')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('ui.pricingRentPriceHint')}
      />
      <Space style={{ marginBottom: 16 }}>
        <Select
          style={{ width: 320 }}
          placeholder={t('ui.pricingSelectMachine')}
          loading={machines.isLoading}
          value={machineId}
          onChange={setMachineId}
          options={(machines.data?.items ?? []).map((m) => ({
            value: m.id,
            label: `${m.displayName} (${m.serialNumber})`,
          }))}
        />
      </Space>
      <Table
        rowKey="id"
        loading={slots.isLoading}
        columns={columns}
        dataSource={slots.data ?? []}
        pagination={false}
      />
      <Modal
        open={editing !== null}
        title={`${t('ui.pricingSetRentPrice')} — ${t('ui.mySlotsSlot')} #${editing?.slotNumber ?? ''}`}
        onCancel={() => setEditing(null)}
        destroyOnHidden
        footer={[
          <Button
            key="close"
            danger
            disabled={!editing?.monthlyRentPrice}
            loading={setPrice.isPending}
            onClick={() => void save(null)}
          >
            {t('ui.pricingCloseForRent')}
          </Button>,
          <Button key="cancel" onClick={() => setEditing(null)}>
            {t('ui.cancel')}
          </Button>,
          <Button
            key="save"
            type="primary"
            disabled={price === null}
            loading={setPrice.isPending}
            onClick={() => void save(price === null ? null : String(price))}
          >
            {t('ui.save')}
          </Button>,
        ]}
      >
        <InputNumber
          autoFocus
          min={0}
          precision={0}
          style={{ width: '100%' }}
          suffix="VND"
          value={price}
          onChange={(v) => setPriceInput(v)}
          placeholder={t('ui.pricingMonthlyRentPrice')}
        />
      </Modal>
    </>
  );
}
