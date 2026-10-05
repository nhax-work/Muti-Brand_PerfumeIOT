import type { components } from '@scentstation/contracts';
import { useQuery } from '@tanstack/react-query';
import { config } from '@/shared/config';
import { api } from './client';
import { unwrap } from './errors';

export const catalogQueryKey = ['kiosk', 'catalog', config.machineSerial] as const;

export const DEMO_CATALOG: components['schemas']['KioskCatalog'] = {
  machineSerial: config.machineSerial || 'SCENTATION-PARIS-01',
  machineStatus: 'ONLINE',
  operatingMode: 'NORMAL',
  items: [
    {
      slotId: 'slot-1',
      slotNumber: 1,
      available: true,
      brandName: 'SCENTATION PARIS',
      product: {
        id: 'prod-1',
        name: "Nuit d’Or",
        description:
          "Infusion d'ambre précieux, safran d'Orient et accords de fumée de bois de oud impérial. Một sự pha trộn mê hoặc đưa giác quan vào cung điện phương Đông dưới ánh trăng vàng.",
        imageUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBjHLKHQ-e9v8rbVauKmO7a4XdFgitH2PX04adOLTIDcdpPwTMgj-ABCxgZT3y1iVk4EkVCclPnFJrm2AP7heA3adEYnqsJsWfuHluEESKmnpcpMphfmLkxdj5oTKVTETo2E8JdzRMpvqTaHozpF27TbIsqMhy3BEIWgUjwP0FNUks_8sX00O_fphckeGjDYOqtj7WxsNLAxCBLfThMPkP3xN9K3q-NAOeoySXLnRZdVHO09viZHUTm',
        fragranceNotes: {
          top: ['Safran Iran', 'Cam Bergamote'],
          heart: ['Hổ Phách Xám', 'Hoa Hồng Damask'],
          base: ['Oud Hoàng Gia', 'Khói Trầm Hương'],
        },
      },
      pricePerSpray: '35000',
      currency: 'VND',
    },
    {
      slotId: 'slot-2',
      slotNumber: 2,
      available: false,
      brandName: 'SCENTATION PARIS',
      product: {
        id: 'prod-2',
        name: 'Ambre Impérial',
        description:
          "Ciste labdanum d'Andalousie, vanille Bourbon et velours de cuir noir. Phiên bản giới hạn đắt đỏ đang trong đợt thu hoạch mẻ ủ nguyên liệu mới tại Grasse.",
        imageUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuCi8kgz8yWcTDwPznpLifDSV9mqx5f3T3sYLxfM6aJ_dbkYiY_UC6j3hY7txxWfnMG_isJJ_WxlMdGt86bRV0k5TcAN7LhxMhSljyTmn-S0JL3tHi7E5tKCO0o1rDcYx1bUoCUByKyl285EKIYD9FVctJyP40qzusM13xM7ejEW6CiqwAJQ0giQD8CVUL1YFtP4SrXTwDlazB_1IZIdSpdY4fOXGMnYaHb0jli_1Dxeu02TDqO-E1Ce',
        fragranceNotes: {
          top: ['Ciste Labdanum', 'Hạt Nhục Đậu Khấu'],
          heart: ['Da Thuộc Đen', 'Đậu Tonka'],
          base: ['Vanille Bourbon', 'Gỗ Tuyết Tùng'],
        },
      },
      pricePerSpray: '42000',
      currency: 'VND',
    },
    {
      slotId: 'slot-3',
      slotNumber: 3,
      available: true,
      brandName: 'SCENTATION PARIS',
      product: {
        id: 'prod-3',
        name: 'Fleur Blanche',
        description:
          "Tubéreuse nocturne de Grasse, jasmin sambac et sève de néroli solaire. Nốt hương hoa trắng thanh khiết ngập tràn ánh nắng bình minh Côte d'Azur.",
        imageUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuDrwnlACE74MpP3ze5UCHx_2MWHdGE2a8EZ9tRcjojME_0ZFCpdnP8jrPGBhM6K1Mgy7p_XSRWJLkdJ_wej47ts_3-MrYMHDU42ZQVo25IJO2lIXI8_BCcJ5IMtnb3uL-ftOT32o5Bvy9EoQXsQvhVifruPsELMB_uIfnTopfCgYTTWWVGV1kCOGuW8ZvwdU1C3JUXQZcGEjkAzJriCenzlJFxWW23Nk5LJXIhwJ_DJu1i9vd1buJsL',
        fragranceNotes: {
          top: ['Néroli Solaire', 'Lá Cam Chanh'],
          heart: ['Huệ Trắng Grasse', 'Nhài Sambac'],
          base: ['Xạ Hương Trắng', 'Hổ Phách'],
        },
      },
      pricePerSpray: '34000',
      currency: 'VND',
    },
    {
      slotId: 'slot-4',
      slotNumber: 4,
      available: true,
      brandName: 'SCENTATION PARIS',
      product: {
        id: 'prod-4',
        name: 'Bois Mystique',
        description:
          "Cèdre de l'Atlas fumé, encens sacré d'Oman et vétiver racine d'Haïti. Nốt gỗ rừng cổ thụ tĩnh lặng mang lại chiều sâu tâm hồn tĩnh tại thiêng liêng.",
        imageUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuDhEcCtoyj-KiT2weL0jXt1iCyGCvxYPjrqSQ1hyqIdMsULOb2OpvFNcrpU-Oaz7Qd-fcogDGELsRPoK2ByYreFQ6wn7Z3PdFRLDz9DKjfQ9vllHdOZ-0K7e9Frpr_7mvKpGnpz1lQUl-NcssHIf8GV4tORcyBPSyLHP1uvMBw8U0nv4wa9oreMxMhsc28LTVNijTDmfP30P5J3ZboqBmEG9RPa935bwAEgRRe-XEJAGJVrtJg-_BwT',
        fragranceNotes: {
          top: ['Tuyết Tùng Atlas', 'Nhựa Thơm'],
          heart: ['Hương Trầm Oman', 'Hoắc Hương'],
          base: ['Vétiver Haiti', 'Gỗ Đàn Hương'],
        },
      },
      pricePerSpray: '36000',
      currency: 'VND',
    },
    {
      slotId: 'slot-5',
      slotNumber: 5,
      available: true,
      brandName: 'SCENTATION PARIS',
      product: {
        id: 'prod-5',
        name: 'Rose Éternelle',
        description:
          'Hoa hồng Tháng Năm Grasse kết hợp hạt tiêu hồng và xạ hương cashmeran quý phái.',
        imageUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBjHLKHQ-e9v8rbVauKmO7a4XdFgitH2PX04adOLTIDcdpPwTMgj-ABCxgZT3y1iVk4EkVCclPnFJrm2AP7heA3adEYnqsJsWfuHluEESKmnpcpMphfmLkxdj5oTKVTETo2E8JdzRMpvqTaHozpF27TbIsqMhy3BEIWgUjwP0FNUks_8sX00O_fphckeGjDYOqtj7WxsNLAxCBLfThMPkP3xN9K3q-NAOeoySXLnRZdVHO09viZHUTm',
        fragranceNotes: {
          top: ['Tiêu Hồng', 'Lý Chua Đen'],
          heart: ['Hoa Hồng Grasse', 'Mẫu Đơn'],
          base: ['Xạ Hương Cashmeran', 'Gỗ Trắng'],
        },
      },
      pricePerSpray: '40000',
      currency: 'VND',
    },
  ],
};

/**
 * Danh mục của máy này. Gọi trực tiếp API backend `/kiosk/machines/{serialNumber}/catalog`
 * theo số serial của máy (FR-ORD-01, FR-ORD-03).
 */
export function useKioskCatalog() {
  return useQuery({
    queryKey: catalogQueryKey,
    queryFn: async () => {
      return await unwrap(
        api.GET('/kiosk/machines/{serialNumber}/catalog', {
          params: { path: { serialNumber: config.machineSerial } },
        }),
      );
    },
    refetchInterval: config.catalogPollMs,
    retry: 2,
  });
}
