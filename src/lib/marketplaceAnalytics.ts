/**
 * Аналитика для селлеров маркетплейсов (Wildberries, Ozon, Яндекс.Маркет, СберМаркет, Авито)
 * 
 * Источники данных:
 * - API Wildberries: https://api.wildberries.ru/swagger.html
 * - API Ozon Seller: https://docs.ozon.ru/global/api-seller/
 * - API Яндекс.Маркет: https://developer.market.yandex.ru/
 * - API СберМаркет (для партнеров): https://dev.sbermarket.ru/
 * - API Авито: https://developers.avito.tech/
 */

import { ParsedDocument } from './parsers/bankParsers';

export type MarketplacePlatform = 'wildberries' | 'ozon' | 'yandex_market' | 'sbermarket' | 'avito';

export interface SellerAnalyticsItem {
  title: string;
  data: Record<string, string | number>;
}

// ==================== КОНФИГУРАЦИЯ МАРКЕТПЛЕЙСОВ ====================

interface MarketplaceConfig {
  name: string;
  apiEndpoint: string;
  authType: 'api_key' | 'bearer_token' | 'oauth';
  reportFormats: string[];
  keyMetrics: string[];
}

const MARKETPLACE_CONFIGS: Record<MarketplacePlatform, MarketplaceConfig> = {
  wildberries: {
    name: 'Wildberries',
    apiEndpoint: 'https://suppliers.wildberries.ru/ex/report/getReportByUuid',
    authType: 'api_key',
    reportFormats: ['xlsx', 'csv'],
    keyMetrics: ['Выручка', 'Комиссия WB', 'Логистика', 'ROI', 'Окупаемость рекламы']
  },
  ozon: {
    name: 'Ozon Seller',
    apiEndpoint: 'https://api-seller.ozon.ru/v1/',
    authType: 'bearer_token',
    reportFormats: ['xlsx', 'json'],
    keyMetrics: ['Выручка', 'Комиссия Ozon', 'Логистика', 'Рейтинг', 'Оборачиваемость']
  },
  yandex_market: {
    name: 'Яндекс.Маркет',
    apiEndpoint: 'https://api.market.yandex.ru/seller-v1',
    authType: 'oauth',
    reportFormats: ['xlsx', 'csv'],
    keyMetrics: ['Выручка', 'Комиссия ЯМ', 'Логистика', 'Конверсия', 'CTR рекламы']
  },
  sbermarket: {
    name: 'СберМаркет',
    apiEndpoint: 'https://partner-api.sbermarket.ru/',
    authType: 'bearer_token',
    reportFormats: ['xlsx', 'json'],
    keyMetrics: ['Заказы', 'Выручка', 'Комиссия', 'Возвраты']
  },
  avito: {
    name: 'Авито Бизнес',
    apiEndpoint: 'https://api.avito.ru/seller/v1/',
    authType: 'oauth',
    reportFormats: ['csv', 'xlsx'],
    keyMetrics: ['Публикации', 'Запросы покупателей', 'Конверсия', 'Рейтинг']
  }
};

// ==================== API ИНТЕГРАЦИЯ ====================

export function getMarketplaceConfig(platform: MarketplacePlatform): MarketplaceConfig {
  return MARKETPLACE_CONFIGS[platform];
}

export async function fetchWBReport(apiKey: string, reportId: string) {
  const response = await fetch(
    `https://api.wildberries.ru/api/v1/report/${reportId}`,
    { headers: { 'Authorization': apiKey } }
  );
  return response.json();
}

export async function fetchOzonReport(authToken: string, reportType: string) {
  const response = await fetch(
    `https://api-seller.ozon.ru/v1/report/${reportType}`,
    { headers: { 'Client-Id': authToken, 'Api-Key': authToken } }
  );
  return response.json();
}

export async function fetchYandexMarketReport(token: string) {
  const response = await fetch(
    `https://api.market.yandex.ru/seller-v1/orders`,
    { headers: { 'Authorization': `Bearer ${token}` } }
  );
  return response.json();
}

// ==================== АНАЛИТИКА СЕЛЛЕРА ====================

export function generateSellerAnalytics(doc: ParsedDocument, platform?: MarketplacePlatform): SellerAnalyticsItem[] {
  const transactions = doc.transactions || [];
  const totalRevenue = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const totalCost = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const profit = totalRevenue - totalCost;

  // Категоризация по маркетплейсам из purpose
  const platformStats: Record<string, { revenue: number; cost: number }> = {};
  for (const t of transactions) {
    let pName = 'Другое';
    if (t.purpose?.toLowerCase().includes('wildberries') || t.payer?.toLowerCase().includes('wb')) pName = 'Wildberries';
    else if (t.purpose?.toLowerCase().includes('ozon') || t.payee?.toLowerCase().includes('ozon')) pName = 'Ozon';
    else if (t.purpose?.toLowerCase().includes('яндекс') || t.payer?.toLowerCase().includes('яндекс')) pName = 'Яндекс.Маркет';
    else if (t.purpose?.toLowerCase().includes('сбер') || t.payee?.toLowerCase().includes('сбермаркет')) pName = 'СберМаркет';
    else if (t.purpose?.toLowerCase().includes('авито') || t.payee?.toLowerCase().includes('avito')) pName = 'Авито';

    if (!platformStats[pName]) platformStats[pName] = { revenue: 0, cost: 0 };
    if (t.type === 'income') platformStats[pName].revenue += t.amount || 0;
    else platformStats[pName].cost += t.amount || 0;
  }

  // Комиссии маркетплейсов (типичные ставки)
  const commissionRates: Record<string, number> = {
    'Wildberries': 0.15,      // 15% комиссия + логистика
    'Ozon': 0.0896,            // от 6.4% до 25%
    'Яндекс.Маркет': 0.13,     // 13-20%
    'СберМаркет': 0.10,        // ~10%
    'Авито': 0.05,             // ~5% + платные размещения
  };

  const commissionRate = platform ? (commissionRates[getMarketplaceConfig(platform).name] || 0.13) : 0.13;

  return [
    {
      title: 'Общий обзор продаж',
      data: {
        'Выручка': totalRevenue,
        'Расходы': totalCost,
        'Чистая прибыль': profit,
        'Рентабельность (ROS)': totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) + '%' : '0.0%',
        'Транзакций': transactions.length,
      }
    },
    {
      title: 'Выручка по маркетплейсам',
      data: Object.fromEntries(
        Object.entries(platformStats).map(([k, v]) => [k, fmt(v.revenue)])
      ) as Record<string, string | number>
    },
    {
      title: 'Комиссии маркетплейсов (оценка)',
      data: Object.fromEntries(
        Object.entries(platformStats)
          .filter(([k]) => commissionRates[k] !== undefined)
          .map(([k, v]) => [k, fmt(v.revenue * commissionRates[k])])
      ) as Record<string, string | number>
    },
    {
      title: 'Оптимизация налогообложения',
      data: {
        'УСН Доходы 6% (рекомендуется)': fmt(totalRevenue * 0.06),
        'УСН Д-Р 15%': totalCost > 0 ? 'При больших расходах' : 'Не выгодно',
        'Страховые взносы (-49 500 ₽)': 'Вычитаются из УСН',
      }
    },
    {
      title: 'KPI селлера',
      data: {
        'Средний чек': transactions.length > 0 ? fmt(totalRevenue / transactions.filter(t => t.type === 'income').length) : '0.00',
        'Доход на транзакцию': fmt(transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0) / Math.max(1, transactions.filter(t => t.type === 'income').length)),
        'Маржинальность': totalRevenue > 0 ? ((profit / totalRevenue) * 100).toFixed(1) + '%' : '0.0%',
      }
    },
    {
      title: 'API интеграция маркетплейсов',
      data: Object.fromEntries(
        Object.entries(MARKETPLACE_CONFIGS).map(([key, cfg]) => [cfg.name, cfg.apiEndpoint])
      ) as Record<string, string | number>
    }
  ];
}

function fmt(n: number): string { return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
