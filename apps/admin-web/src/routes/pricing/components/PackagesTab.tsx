import { PlusOutlined } from '@ant-design/icons';
import { Button, Form, Input, InputNumber, Modal, Switch, Table, Tag, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useState } from 'react';
import { errorMessage } from '@/shared/api';
import { useI18n } from '@/shared/i18n';
import { type RentalPackage, useRentalPackages, useSavePackage } from '../api';

interface PackageForm {
  name: string;
  durationMonths: number;
  discountPercent: number;
  isActive: boolean;
}

/** Gói thuê 3/6/12 tháng (FR-SLT-30). Số tháng chỉ đặt lúc tạo — contract không cho sửa. */
export function PackagesTab() {
  const { t } = useI18n();
  const { data, isLoading } = useRentalPackages();
  const save = useSavePackage();
  const [editing, setEditing] = useState<RentalPackage | 'new' | null>(null);
  const [form] = Form.useForm<PackageForm>();

  const open = (pkg: RentalPackage | 'new') => {
    setEditing(pkg);
    form.setFieldsValue(
      pkg === 'new'
        ? { name: '', durationMonths: 3, discountPercent: 0, isActive: true }
        : {
            name: pkg.name,
            durationMonths: pkg.durationMonths,
            discountPercent: pkg.discountPercent,
            isActive: pkg.isActive,
          },
    );
  };

  const submit = async () => {
    // Form sai: antd đã hiện lỗi cạnh từng ô — không ném tiếp thành lỗi promise không ai bắt.
    const values = await form.validateFields().catch(() => null);
    if (!values) return;
    try {
      await save.mutateAsync(
        editing === 'new'
          ? {
              create: {
                name: values.name,
                durationMonths: values.durationMonths,
                discountPercent: values.discountPercent,
              },
            }
          : {
              id: (editing as RentalPackage).id,
              update: {
                name: values.name,
                discountPercent: values.discountPercent,
                isActive: values.isActive,
              },
            },
      );
      message.success(t('ui.pricingSaved'));
      setEditing(null);
    } catch (error) {
      message.error(errorMessage(error, t));
    }
  };

  const columns: ColumnsType<RentalPackage> = [
    { title: t('ui.pricingName'), dataIndex: 'name', key: 'name' },
    { title: t('ui.pricingDurationMonths'), dataIndex: 'durationMonths', key: 'durationMonths' },
    {
      title: t('ui.pricingDiscountPercent'),
      dataIndex: 'discountPercent',
      key: 'discountPercent',
      render: (v: number) => `${v}%`,
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
      render: (_, pkg) => (
        <Button type="link" size="small" onClick={() => open(pkg)}>
          {t('ui.pricingEdit')}
        </Button>
      ),
    },
  ];

  return (
    <>
      <Button
        type="primary"
        icon={<PlusOutlined />}
        style={{ marginBottom: 16 }}
        onClick={() => open('new')}
      >
        {t('ui.pricingAddPackage')}
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
        title={editing === 'new' ? t('ui.pricingAddPackage') : t('ui.pricingEditPackage')}
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
          <Form.Item
            name="durationMonths"
            label={t('ui.pricingDurationMonths')}
            extra={editing !== 'new' ? t('ui.pricingDurationLocked') : undefined}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber
              min={1}
              precision={0}
              disabled={editing !== 'new'}
              style={{ width: '100%' }}
            />
          </Form.Item>
          <Form.Item
            name="discountPercent"
            label={t('ui.pricingDiscountPercent')}
            rules={[{ required: true, message: t('validation.required') }]}
          >
            <InputNumber min={0} max={100} style={{ width: '100%' }} />
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
