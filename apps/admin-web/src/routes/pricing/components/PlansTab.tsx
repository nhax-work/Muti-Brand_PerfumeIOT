import { PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, Modal, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { type StoragePlan, useSavePlan, useStoragePlans } from '../api';
import { formatVnd } from '@/shared/format';

interface PlanForm {
  name: string;
  description: string;
  monthlyPrice: number;
  coveragePercent: number;
  coverageCap: number;
  isActive: boolean;
}

/**
 * Gói bảo quản — bảo hiểm hàng hóa (FR-SLT-31). Ngừng mở bán gói cuối cùng đang mở bị máy chủ từ
 * chối (gói bảo quản là bắt buộc khi mua gói); lỗi đó hiện nguyên văn.
 */
export function PlansTab() {
  const { t } = useI18n();
  const { data, isLoading } = useStoragePlans();
  const save = useSavePlan();
  const [editing, setEditing] = useState<StoragePlan | 'new' | null>(null);
  const [form] = Form.useForm<PlanForm>();

  const open = (plan: StoragePlan | 'new') => {
    setEditing(plan);
    form.setFieldsValue(
      plan === 'new'
        ? {
            name: '',
            description: '',
            monthlyPrice: 0,
            coveragePercent: 0,
            coverageCap: 0,
            isActive: true,
          }
        : {
            name: plan.name,
            description: plan.description ?? '',
            monthlyPrice: Number(plan.monthlyPrice),
            coveragePercent: plan.coveragePercent,
            coverageCap: Number(plan.coverageCap),
            isActive: plan.isActive,
          },
    );
  };

  const submit = async () => {
    // Form sai: antd đã hiện lỗi cạnh từng ô — không ném tiếp thành lỗi promise không ai bắt.
    const v = await form.validateFields().catch(() => null);
    if (!v) return;
    const fields = {
      name: v.name,
      description: v.description,
      monthlyPrice: String(v.monthlyPrice),
      coveragePercent: v.coveragePercent,
      coverageCap: String(v.coverageCap),
    };
    try {
      await save.mutateAsync(
        editing === 'new'
          ? { create: fields }
          : { id: (editing as StoragePlan).id, update: { ...fields, isActive: v.isActive } },
      );
      message.success(t('ui.pricingSaved'));
      setEditing(null);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<StoragePlan> = [
    { title: t('ui.pricingName'), dataIndex: 'name', key: 'name' },
    {
      title: t('ui.pricingDescription'),
      dataIndex: 'description',
      key: 'description',
      render: (d: string | null) => d ?? '—',
    },
    {
      title: t('ui.pricingMonthlyPrice'),
      key: 'monthlyPrice',
      render: (_, p) => formatVnd(p.monthlyPrice),
    },
    {
      title: t('ui.pricingCoveragePercent'),
      dataIndex: 'coveragePercent',
      key: 'coveragePercent',
      render: (v: number) => `${v}%`,
    },
    {
      title: t('ui.pricingCoverageCap'),
      key: 'coverageCap',
      render: (_, p) => formatVnd(p.coverageCap),
    },
    {
      title: t('ui.pricingStatus'),
      dataIndex: 'isActive',
      key: 'isActive',
      render: (active: boolean) =>
        active ? (
          <Tag color="green">{t('ui.pricingOnSale')}</Tag>
        ) : (
          <Tag>{t('ui.pricingOffSale')}</Tag>
        ),
    },
    {
      title: t('ui.actions'),
      key: 'actions',
      render: (_, plan) => (
        <Button type="link" size="small" onClick={() => open(plan)}>
          {t('ui.pricingEdit')}
        </Button>
      ),
    },
  ];

  const money = { min: 0, precision: 0, style: { width: '100%' } } as const;

  return (
    <>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        style={{ marginBottom: 16 }}
        onClick={() => open('new')}
      >
        {t('ui.pricingAddPlan')}
      </Button>
      <Table
        rowKey="id"
        loading={isLoading}
        columns={columns}
        dataSource={data ?? []}
        pagination={false}
      />
      <Modal
        open={editing !== null}
        title={editing === 'new' ? t('ui.pricingAddPlan') : t('ui.pricingEditPlan')}
        okText={t('ui.save')}
        cancelText={t('ui.cancel')}
        confirmLoading={save.isPending}
        onOk={() => void submit()}
        onCancel={() => setEditing(null)}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label={t('ui.pricingName')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <Input maxLength={100} />
          </Form.Item>
          <Form.Item name="description" label={t('ui.pricingDescription')}>
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item
            name="monthlyPrice"
            label={t('ui.pricingMonthlyPrice')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber {...money} />
          </Form.Item>
          <Form.Item
            name="coveragePercent"
            label={t('ui.pricingCoveragePercent')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="coverageCap"
            label={t('ui.pricingCoverageCap')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber {...money} />
          </Form.Item>
          {editing !== 'new' && (
            <Form.Item name="isActive" label={t('ui.pricingOnSale')} valuePropName="checked">
              <Switch />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </>
  );
}
