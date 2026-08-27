/**
 * Модуль заглушек (mock data) для всех кабинетов.
 * Заглушки показываются пока клиент не добавит реальные данные.
 * После добавления реальных данных показываются только они.
 */

import { ParsedDocument } from './parsers/bankParsers';

// --- Типы заглушек ---

export interface MockKPI {
  label: string;
  value: number;
  unit: string;
  status: 'good' | 'warning' | 'bad';
  icon: string;
}

export interface MockChartPoint {
  date: string;
  income: number;
  expense: number;
  profit?: number;
}

export interface MockPieSlice {
  name: string;
  value: number;
}

export interface MockTransaction {
  date: string;
  type: 'income' | 'expense';
  payee?: string;
  payer?: string;
  purpose: string;
  amount: number;
}

export interface MockDashboard {
  kpis: MockKPI[];
  chartData: MockChartPoint[];
  pieData: MockPieSlice[];
  transactions: MockTransaction[];
  description: string;
}

// ============================================
// 1. ФИЗИЧЕСКОЕ ЛИЦО
// ============================================
export const personalMock: MockDashboard = {
  description: 'Личные финансы: анализ доходов, расходов, кредитов и активов',
  kpis: [
    { label: 'Зарплата (нетто)', value: 185000, unit: '₽/мес', status: 'good', icon: '💰' },
    { label: 'Расходы за месяц', value: 112400, unit: '₽/мес', status: 'good', icon: '📊' },
    { label: 'Сбережения', value: 72600, unit: '₽/мес', status: 'good', icon: '🏦' },
    { label: 'Фин. подушка', value: 4.2, unit: 'мес расходов', status: 'warning', icon: '🛡️' },
    { label: 'Кредитная нагрузка', value: 32, unit: '% дохода', status: 'warning', icon: '⚠️' },
    { label: 'Инвест. портфель', value: 1450000, unit: '₽', status: 'good', icon: '📈' },
  ],
  chartData: [
    { date: 'Окт', income: 185000, expense: 98000, profit: 87000 },
    { date: 'Ноя', income: 185000, expense: 134000, profit: 51000 },
    { date: 'Дек', income: 370000, expense: 156000, profit: 214000 }, // + премия
    { date: 'Янв', income: 185000, expense: 112400, profit: 72600 },
    { date: 'Фев', income: 185000, expense: 105000, profit: 80000 },
    { date: 'Мар', income: 185000, expense: 118000, profit: 67000 },
  ],
  pieData: [
    { name: 'Жильё (аренда/ипотeka)', value: 45000 },
    { name: 'Продукты', value: 28000 },
    { name: 'Транспорт', value: 12400 },
    { name: 'Развлечения', value: 8900 },
    { name: 'Кредит/коммунальные', value: 18100 },
  ],
  transactions: [
    { date: '2025-03-01', type: 'income', payer: 'ООО ТехноПрогресс', purpose: 'Зарплата', amount: 185000 },
    { date: '2025-03-02', type: 'expense', payee: 'Сбербанк', purpose: 'Ипотека', amount: 35000 },
    { date: '2025-03-03', type: 'expense', payee: 'Перекрёсток', purpose: 'Продукты', amount: 8400 },
    { date: '2025-03-05', type: 'expense', payee: 'Яндекс.Такси', purpose: 'Транспорт', amount: 3200 },
    { date: '2025-03-07', type: 'expense', payee: 'Кинопоиск', purpose: 'Подписка', amount: 399 },
    { date: '2025-03-10', type: 'expense', payee: 'М.Видео', purpose: 'Наушники', amount: 12900 },
    { date: '2025-03-15', type: 'expense', payee: 'ЖКХ', purpose: 'Коммунальные', amount: 6700 },
    { date: '2025-03-18', type: 'expense', payee: 'Лукойл', purpose: 'АЗС', amount: 5000 },
    { date: '2025-03-20', type: 'income', payer: 'Брокерский счёт', purpose: 'Дивиденды', amount: 12400 },
  ],
};

// ============================================
// 2. СЕМЬЯ
// ============================================
export const familyMock: MockDashboard = {
  description: 'Семейный бюджет: совместные доходы, расходы, цели накоплений',
  kpis: [
    { label: 'Общий доход семьи', value: 340000, unit: '₽/мес', status: 'good', icon: '💑' },
    { label: 'Общие расходы', value: 215000, unit: '₽/мес', status: 'good', icon: '📊' },
    { label: 'Свободные средства', value: 125000, unit: '₽/мес', status: 'good', icon: '💎' },
    { label: 'Накопления на цель', value: 890000, unit: '₽ / 2 млн', status: 'warning', icon: '🎯' },
    { label: 'Детские расходы', value: 42000, unit: '₽/мес', status: 'good', icon: '👶' },
    { label: 'Подушка безопасности', value: 5.8, unit: 'мес расходов', status: 'good', icon: '🛡️' },
  ],
  chartData: [
    { date: 'Окт', income: 340000, expense: 198000, profit: 142000 },
    { date: 'Ноя', income: 340000, expense: 210000, profit: 130000 },
    { date: 'Дек', income: 520000, expense: 285000, profit: 235000 },
    { date: 'Янв', income: 340000, expense: 215000, profit: 125000 },
    { date: 'Фев', income: 340000, expense: 225000, profit: 115000 },
    { date: 'Мар', income: 340000, expense: 215000, profit: 125000 },
  ],
  pieData: [
    { name: 'Жильё / ипотека', value: 65000 },
    { name: 'Продукты / быт', value: 52000 },
    { name: 'Дети (сад, секции)', value: 42000 },
    { name: 'Транспорт / авто', value: 28000 },
    { name: 'Отдых / развлечения', value: 18000 },
    { name: 'Здоровье', value: 10000 },
  ],
  transactions: [
    { date: '2025-03-01', type: 'income', payer: 'ООО ТехноПрогресс', purpose: 'Зарплата (муж)', amount: 185000 },
    { date: '2025-03-01', type: 'income', payer: 'Клиника Здоровье', purpose: 'Зарплата (жена)', amount: 155000 },
    { date: '2025-03-03', type: 'expense', payee: 'Сбербанк', purpose: 'Ипотека', amount: 52000 },
    { date: '2025-03-05', type: 'expense', payee: 'Пятёрочка', purpose: 'Продукты', amount: 12400 },
    { date: '2025-03-07', type: 'expense', payee: 'Детский сад', purpose: 'Оплата сада', amount: 25000 },
    { date: '2025-03-10', type: 'expense', payee: 'Спортмастер', purpose: 'Секции (хоккей)', amount: 15000 },
    { date: '2025-03-12', type: 'expense', payee: 'Аптека.ру', purpose: 'Витамины', amount: 4800 },
    { date: '2025-03-15', type: 'expense', payee: 'Газпромнефть', purpose: 'Бензин', amount: 8500 },
    { date: '2025-03-20', type: 'expense', payee: 'Wildberries', purpose: 'Одежда детям', amount: 9200 },
  ],
};

// ============================================
// 3. САМОЗАНЯТЫЕ / ИП
// ============================================
export const selfEmployedMock: MockDashboard = {
  description: 'Самозанятость / ИП: доходы, налоги НПД/УСН, оптимизация',
  kpis: [
    { label: 'Доход за квартал', value: 1850000, unit: '₽', status: 'good', icon: '💰' },
    { label: 'НПД (6% клиент-юр)', value: 111000, unit: '₽', status: 'good', icon: '📋' },
    { label: 'НПД (4% клиент-физ)', value: 28000, unit: '₽', status: 'good', icon: '📋' },
    { label: 'Лимит 2.4 млн', value: 73, unit: '% использовано', status: 'warning', icon: '⚠️' },
    { label: 'Чистая прибыль', value: 1481000, unit: '₽/кв', status: 'good', icon: '📈' },
    { label: 'Ср. чек', value: 18500, unit: '₽', status: 'good', icon: '🧾' },
  ],
  chartData: [
    { date: 'Окт', income: 580000, expense: 0, profit: 545200 },
    { date: 'Ноя', income: 620000, expense: 0, profit: 585200 },
    { date: 'Дек', income: 450000, expense: 0, profit: 418500 }, // праздники
    { date: 'Янв', income: 520000, expense: 0, profit: 494000 },
    { date: 'Фев', income: 590000, expense: 0, profit: 560600 },
    { date: 'Мар', income: 650000, expense: 0, profit: 617500 },
  ],
  pieData: [
    { name: 'Веб-разработка', value: 720000 },
    { name: 'Консультации', value: 480000 },
    { name: 'Дизайн', value: 350000 },
    { name: 'Курсы / обучение', value: 200000 },
    { name: 'Прочее', value: 100000 },
  ],
  transactions: [
    { date: '2025-03-01', type: 'income', payer: 'ООО СтартАп', purpose: 'Разработка лендинга', amount: 120000 },
    { date: '2025-03-05', type: 'income', payer: 'Иванов А.И. (физ)', purpose: 'Консультация по налогам', amount: 15000 },
    { date: '2025-03-08', type: 'income', payer: 'ИП Смирнов', purpose: 'Дизайн визиток', amount: 25000 },
    { date: '2025-03-12', type: 'income', payer: 'ООО МедиаГрупп', purpose: 'Редизайн сайта', amount: 180000 },
    { date: '2025-03-15', type: 'income', payer: 'Петрова М.С. (физ)', purpose: 'Настройка 1С', amount: 35000 },
    { date: '2025-03-18', type: 'expense', payee: 'ФНС', purpose: 'НПД квартал', amount: 45000 },
    { date: '2025-03-20', type: 'income', payer: 'ООО ТехноСервис', purpose: 'API интеграция', amount: 250000 },
    { date: '2025-03-25', type: 'income', payer: 'КурсыПро (платформа)', purpose: 'Профильный курс', amount: 85000 },
  ],
};

// ============================================
// 4. СЕЛЛЕРЫ МАРКЕТПЛЕЙСОВ
// ============================================
export const sellerMock: MockDashboard = {
  description: 'Селлер: unit-экономика, маржинальность, ROI рекламы WB/Ozon',
  kpis: [
    { label: 'Выручка (WB + Ozon)', value: 4850000, unit: '₽/мес', status: 'good', icon: '🛒' },
    { label: 'Маржа', value: 23.5, unit: '%', status: 'good', icon: '📊' },
    { label: 'Чистая прибыль', value: 1140000, unit: '₽/мес', status: 'good', icon: '💰' },
    { label: 'ROI рекламы', value: 340, unit: '%', status: 'good', icon: '📣' },
    { label: 'Возвраты', value: 3.2, unit: '%', status: 'good', icon: '↩️' },
    { label: 'Точка безубыточности', value: 1240, unit: 'ед/мес', status: 'good', icon: '🎯' },
  ],
  chartData: [
    { date: 'Окт', income: 3200000, expense: 2650000, profit: 550000 },
    { date: 'Ноя', income: 3800000, expense: 3100000, profit: 700000 },
    { date: 'Дек', income: 6500000, expense: 5200000, profit: 1300000 }, // Чёрная пятница
    { date: 'Янв', income: 4200000, expense: 3500000, profit: 700000 },
    { date: 'Фев', income: 4600000, expense: 3700000, profit: 900000 },
    { date: 'Мар', income: 4850000, expense: 3710000, profit: 1140000 },
  ],
  pieData: [
    { name: 'Wildberries', value: 2900000 },
    { name: 'Ozon', value: 1500000 },
    { name: 'Яндекс.Маркет', value: 450000 },
  ],
  transactions: [
    { date: '2025-03-01', type: 'income', payer: 'Wildberries', purpose: 'Выплата за февраль', amount: 1850000 },
    { date: '2025-03-03', type: 'income', payer: 'Ozon', purpose: 'Выплата за февраль', amount: 920000 },
    { date: '2025-03-05', type: 'expense', payee: 'Завод TextileCo', purpose: 'Закупка товара (5000 ед)', amount: 1500000 },
    { date: '2025-03-07', type: 'expense', payee: 'WB реклама', purpose: 'Продвижение каталога', amount: 180000 },
    { date: '2025-03-10', type: 'expense', payee: 'Ozon реклама', purpose: 'Автокампания', amount: 95000 },
    { date: '2025-03-12', type: 'expense', payee: 'Деловые Линии', purpose: 'Логистика на склад WB', amount: 42000 },
    { date: '2025-03-15', type: 'income', payer: 'Яндекс.Маркет', purpose: 'Выплата', amount: 280000 },
    { date: '2025-03-18', type: 'expense', payee: 'WB комиссия', purpose: 'Комиссия за март', amount: 420000 },
    { date: '2025-03-20', type: 'expense', payee: 'Фотография', purpose: 'Контент для карточек', amount: 35000 },
  ],
};

// ============================================
// 5. МАЛЫЙ И СРЕДНИЙ БИЗНЕС (МСБ)
// ============================================
export const msbMock: MockDashboard = {
  description: 'МСБ: P&L, Cash Flow, Баланс, коэффициенты, бизнес-план',
  kpis: [
    { label: 'Выручка', value: 28500000, unit: '₽/кв', status: 'good', icon: '💰' },
    { label: 'EBITDA', value: 5700000, unit: '₽', status: 'good', icon: '📊' },
    { label: 'Рентабельность EBITDA', value: 20, unit: '%', status: 'good', icon: '📈' },
    { label: 'Долг / EBITDA', value: 1.8, unit: 'x', status: 'good', icon: '🏦' },
    { label: 'Оборачиваемость ДС', value: 42, unit: 'дней', status: 'warning', icon: '⏱️' },
    { label: 'Дебиторка', value: 8200000, unit: '₽', status: 'warning', icon: '⚠️' },
  ],
  chartData: [
    { date: 'Q3-24', income: 22000000, expense: 18500000, profit: 3500000 },
    { date: 'Q4-24', income: 26000000, expense: 21000000, profit: 5000000 },
    { date: 'Q1-25', income: 28500000, expense: 22800000, profit: 5700000 },
  ],
  pieData: [
    { name: 'Продажи товаров', value: 18500000 },
    { name: 'Услуги', value: 6200000 },
    { name: 'Прочие доходы', value: 3800000 },
  ],
  transactions: [
    { date: '2025-01-05', type: 'income', payer: 'ПАО Сбербанк', purpose: 'Кредитные средства', amount: 15000000 },
    { date: '2025-01-10', type: 'income', payer: 'ООО МегаТрейд', purpose: 'Оплата счёта №145', amount: 4200000 },
    { date: '2025-01-15', type: 'expense', payee: 'ИП Поставщик', purpose: 'Товар по договору', amount: 3800000 },
    { date: '2025-01-20', type: 'expense', payee: 'Бухгалтерия', purpose: 'Аутсорсинг', amount: 85000 },
    { date: '2025-01-25', type: 'expense', payee: 'ФНС', purpose: 'Налог УСН 6%', amount: 1380000 },
    { date: '2025-02-01', type: 'income', payer: 'ООО АльфаСтрой', purpose: 'Аванс по договору', amount: 6500000 },
    { date: '2025-02-10', type: 'expense', payee: 'Аренда склада', purpose: 'Аренда февраля', amount: 450000 },
    { date: '2025-02-15', type: 'expense', payee: 'Зарплата', purpose: 'ФОТ февраль', amount: 2800000 },
    { date: '2025-02-20', type: 'income', payer: 'ООО РегионСервис', purpose: 'Оплата счёта №178', amount: 3200000 },
  ],
};

// ============================================
// 6. ХОЛДИНГИ
// ============================================
export const holdingMock: MockDashboard = {
  description: 'Холдинг: консолидация МСФО, аудит, мультивалютность',
  kpis: [
    { label: 'Консолид. выручка', value: 485000000, unit: '₽/кв', status: 'good', icon: '🏢' },
    { label: 'EBITDA ГК', value: 97000000, unit: '₽', status: 'good', icon: '📊' },
    { label: 'Net Debt / EBITDA', value: 2.1, unit: 'x', status: 'good', icon: '🏦' },
    { label: 'ROE', value: 18.5, unit: '%', status: 'good', icon: '📈' },
    { label: 'Валютные позиции', value: -12500000, unit: 'USD', status: 'warning', icon: '💱' },
    { label: 'Дочерние компании', value: 7, unit: 'субъектов', status: 'good', icon: '🏗️' },
  ],
  chartData: [
    { date: 'Q3-24', income: 380000000, expense: 310000000, profit: 70000000 },
    { date: 'Q4-24', income: 420000000, expense: 345000000, profit: 75000000 },
    { date: 'Q1-25', income: 485000000, expense: 388000000, profit: 97000000 },
  ],
  pieData: [
    { name: 'ООО ПромИнвест', value: 185000000 },
    { name: 'АО ТехноГрупп', value: 142000000 },
    { name: 'ООО ЛогистикПро', value: 88000000 },
    { name: 'ООО СервисПлюс', value: 45000000 },
    { name: 'Прочие', value: 25000000 },
  ],
  transactions: [
    { date: '2025-01-02', type: 'income', payer: 'АО ТехноГрупп', purpose: 'Дивиденды 2024', amount: 85000000 },
    { date: '2025-01-10', type: 'income', payer: 'ООО ПромИнвест', purpose: 'Выручка (консолид.)', amount: 142000000 },
    { date: '2025-01-15', type: 'expense', payee: 'VTB Банк', purpose: 'Кредитная линия', amount: 50000000 },
    { date: '2025-01-20', type: 'expense', payee: 'КБК бюджет', purpose: 'Налог на прибыль', amount: 28000000 },
    { date: '2025-02-01', type: 'income', payer: 'ООО ЛогистикПро', purpose: 'Выручка (консолид.)', amount: 68000000 },
    { date: '2025-02-10', type: 'expense', payee: 'Аудitor КPMG', purpose: 'Годовой аудит', amount: 4500000 },
    { date: '2025-02-15', type: 'income', payer: 'Экспорт (EUR)', purpose: 'Поставка Equipment EU', amount: 95000000 },
    { date: '2025-02-20', type: 'expense', payee: 'Лизинг', purpose: 'Лизинг оборудования', amount: 18000000 },
    { date: '2025-03-01', type: 'income', payer: 'ООО СервисПлюс', purpose: 'Выручка (консолид.)', amount: 35000000 },
    { date: '2025-03-10', type: 'expense', payee: 'ЦБ РФ', purpose: 'Валютный контроль', amount: 12000000 },
  ],
};

// --- Экспорт заглушки по режиму ---
export const mockByMode: Record<string, MockDashboard> = {
  personal: personalMock,
  family: familyMock,
  selfemployed: selfEmployedMock,
  seller: sellerMock,
  msb: msbMock,
  holding: holdingMock,
};

/**
 * Преобразует mock данные в формат ParsedDocument
 * для совместимости с RichAnalyticsReport
 */
export function mockToParsedDocument(mock: MockDashboard): ParsedDocument {
  return {
    docType: 'transactions',
    fileName: '[Демо-режим] Заглушка для демонстрации',
    transactions: mock.transactions.map(t => ({
      date: t.date,
      type: t.type,
      payee: t.payee || '',
      payer: t.payer || '',
      purpose: t.purpose,
      amount: t.amount,
      account: '',
    })),
    rawText: `Демо-данные: ${mock.description}`,
    extractedMetrics: {},
  };
}
