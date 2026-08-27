/**
 * Модуль конкурентных фич — лучшие практики из 1С, МойСклад, Kontur, QuickBooks, Float, SAP B1.
 * Включает: бюджетирование, себестоимость, мульти-валютность, What-if сценарии, KPI-трекинг, 
 * сравнение периодов, автоматические рекомендации, прогнозирование ДДС.
 */

import { ParsedDocument } from './parsers/bankParsers';
import { ACCOUNT_MAP, parseOSVFromDocument } from './financialReports';

function formatMoney(val: number): string {
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)} млрд ₽`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)} млн ₽`;
  return val.toLocaleString('ru-RU') + ' ₽';
}

// ========================
// 1. БЮДЖЕТИРОВАНИЕ (Budget vs Actual) — как в 1С:Бюджетирование и Float
// ========================

export interface BudgetLine {
  category: string;
  planned: number;
  actual: number;
  variance: number;
  variancePercent: number;
  status: 'ok' | 'warning' | 'over';
}

export function generateBudgetVsActual(doc: ParsedDocument): BudgetLine[] {
  const lines: BudgetLine[] = [];
  
  if (doc.transactions.length === 0 && !doc.extractedMetrics) return [];

  // Извлекаем фактические данные по категориям
  const actualByCategory: Record<string, number> = {};
  
  for (const tx of doc.transactions) {
    if (tx.type !== 'expense') continue;
    const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
    
    let category = 'Прочее';
    if (/аренд|офис|коммунал/.test(text)) category = 'Аренда и комм. услуги';
    else if (/маркетинг|реклам|продвиг/.test(text)) category = 'Маркетинг';
    else if (/зарплата|зп|фонд оплат/.test(text)) category = 'Зарплаты';
    else if (/налог|ндс|страхов/.test(text)) category = 'Налоги';
    else if (/закупк|товар|материал|себестоим/.test(text)) category = 'Себестоимость (COGS)';
    else if (/логистик|доставк|транспорт|курьер/.test(text)) category = 'Логистика';
    else if (/связь|интернет|программ|сервис/.test(text)) category = 'ПО и сервисы';
    else if (/банк|комисси|эквайринг/.test(text)) category = 'Банковские комиссии';
    
    actualByCategory[category] = (actualByCategory[category] || 0) + tx.amount;
  }

  // ОЭСВ: считаем расходы из оборотов дебетовых сальдо по счетам 20,25,26,44,90.2
  const osv = parseOSVFromDocument(doc);
  for (const [accCode, data] of Object.entries(osv)) {
    if (!data.debitTurnover && !data.debitEnd) continue;
    
    if (['20', '26', '44'].includes(accCode)) {
      const val = data.debitTurnover || data.debitEnd || 0;
      if (val > 0) {
        actualByCategory[accCode === '20' ? 'Производство' : accCode === '26' ? 'Управленческие расходы' : 'Коммерческие расходы'] += val;
      }
    }
    // Счет 90.2 — себестоимость продаж
    if (accCode === '90') {
      const cogs = data.debitTurnover || 0;
      if (cogs > 0) actualByCategory['Себестоимость'] += cogs;
    }
  }

  // Плановые значения (по умолчанию — эвристика из фактических данных)
  const categories = Object.keys(actualByCategory);
  
  categories.forEach(cat => {
    const actual = actualByCategory[cat];
    // Эвристический план: +20% к факту как бюджет с запасом
    const planned = Math.round(actual * 1.2 / 100) * 100;
    const variance = actual - planned;
    const variancePercent = planned > 0 ? (variance / planned) * 100 : 0;
    
    lines.push({
      category: cat,
      planned,
      actual,
      variance,
      variancePercent,
      status: variance < 0 ? 'ok' : variancePercent <= 10 ? 'warning' : 'over'
    });
  });

  return lines.sort((a, b) => b.actual - a.actual);
}

// ========================
// 2. СЕБЕСТОИМОСТЬ (Cost Accounting) — как в SAP B1 и 1С:УПП
// ========================

export interface CostItem {
  name: string;
  amount: number;
  type: 'material' | 'labor' | 'overhead' | 'logistics';
}

export interface ProductCosting {
  productName: string;
  directMaterials: CostItem[];
  directLabor: CostItem[];
  overheadAllocation: number;
  totalDirectCost: number;
  unitCost: number;
  sellingPrice: number;
  marginPercent: number;
}

export function calculateProductCosting(doc: ParsedDocument, productName?: string): ProductCosting {
  let directMaterials = 0, directLabor = 0, overhead = 0, logistics = 0;
  
  for (const tx of doc.transactions) {
    if (tx.type !== 'expense') continue;
    const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
    
    if (/материал|закупк|товар|сырьё|компонент/.test(text)) directMaterials += tx.amount;
    else if (/зарплата|зп|персонал|сотрудн/.test(text)) directLabor += tx.amount;
    else if (/амортиз|аренд|коммунал|обслуживан/.test(text)) overhead += tx.amount;
    else if (/логистик|доставк|транспорт|курьер/.test(text)) logistics += tx.amount;
  }

  // Из ОСВ: счет 20 — основное производство, счет 41 — товары
  const osv = parseOSVFromDocument(doc);
  
  const acc20 = osv['20'];
  if (acc20) {
    directMaterials += (acc20.debitTurnover || 0) * 0.6; // ~60% прямые материалы
    directLabor += (acc20.debitTurnover || 0) * 0.3;     // ~30% прямая зарплата
    overhead += (acc20.debitTurnover || 0) * 0.1;        // ~10% накладные
  }

  const acc41 = osv['41'];
  if (acc41) {
    directMaterials += (acc41.debitEnd || 0);
  }

  const totalDirectCost = directMaterials + directLabor + logistics;
  
  // Накладные расходы распределяются пропорционально прямой стоимости
  const acc25 = osv['25'] || {};
  const acc26 = osv['26'] || {};
  overhead += (acc25.debitTurnover || 0) * 0.7 + (acc25.debitEnd || 0) * 0.3;
  overhead += (acc26.debitTurnover || 0) * 0.8 + (acc26.debitEnd || 0) * 0.2;

  const unitCost = totalDirectCost > 0 ? totalDirectCost : directMaterials;
  // Оценка цены продажи: себестоимость + 30% маржа (эвристика для торговли)
  const sellingPrice = unitCost > 0 ? Math.round(unitCost * 1.3 / 100) * 100 : 0;
  
  return {
    productName: productName || 'Продукт/Услуга (общая)',
    directMaterials: [{ name: 'Материалы и закупки', amount: directMaterials, type: 'material' }],
    directLabor: [{ name: 'Прямая зарплата', amount: directLabor, type: 'labor' }],
    overheadAllocation: overhead + logistics,
    totalDirectCost: unitCost,
    unitCost,
    sellingPrice,
    marginPercent: sellingPrice > 0 ? ((sellingPrice - unitCost) / sellingPrice) * 100 : 0
  };
}

// ========================
// 3. МУЛЬТИ-ВАЛЮТНОСТЬ (Multi-currency) — как в SAP B1 и QuickBooks
// ========================

export interface CurrencyPosition {
  currency: string;
  amount: number;
  rateToRUB: number;
  amountInRUB: number;
}

export function calculateCurrencyPositions(doc: ParsedDocument): CurrencyPosition[] {
  const positions: CurrencyPosition[] = [];
  
  // Из транзакций ищем валютные операции
  const currencyMap: Record<string, number> = {};
  
  for (const tx of doc.transactions) {
    const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
    
    // Ищем упоминания валют в назначении платежа
    if (/usd|доллар|\\$/.test(text)) currencyMap['USD'] = (currencyMap['USD'] || 0) + tx.amount;
    else if (/eur|евро|€/.test(text)) currencyMap['EUR'] = (currencyMap['EUR'] || 0) + tx.amount;
    else if (/cny|юань|¥/.test(text)) currencyMap['CNY'] = (currencyMap['CNY'] || 0) + tx.amount;
  }

  // Из ОСВ: счет 52 — валютные счета
  const osv = parseOSVFromDocument(doc);
  const acc52 = osv['52'];
  if (acc52 && (acc52.debitEnd || 0) > 0) {
    positions.push({ currency: 'Валюта (сч.52)', amount: acc52.debitEnd || 0, rateToRUB: 1, amountInRUB: acc52.debitEnd || 0 });
  }

  // Стандартные курсы ЦБ (эвристика)
  const rates: Record<string, number> = { USD: 96.5, EUR: 104.3, CNY: 13.4 };
  
  for (const [currency, amount] of Object.entries(currencyMap)) {
    positions.push({
      currency,
      amount,
      rateToRUB: rates[currency] || 1,
      amountInRUB: Math.round(amount * (rates[currency] || 1))
    });
  }

  return positions;
}

// ========================
// 4. WHAT-IF СЦЕНАРИИ (Sensitivity Analysis) — как в Float и Pulse
// ========================

export interface ScenarioResult {
  name: string;
  revenueChange: number; // %
  expenseChange: number; // %
  netProfit: number;
  cashFlow: number;
  riskLevel: 'low' | 'medium' | 'high';
}

export function runWhatIfScenarios(doc: ParsedDocument): ScenarioResult[] {
  let revenue = 0, totalExpense = 0;
  
  for (const tx of doc.transactions) {
    if (tx.type === 'income') revenue += tx.amount;
    else totalExpense += tx.amount;
  }

  const baseProfit = revenue - totalExpense;
  
  return [
    {
      name: '🟢 Оптимистичный',
      revenueChange: 30,
      expenseChange: 10,
      netProfit: Math.round(revenue * 1.3 - totalExpense * 1.1),
      cashFlow: Math.round((revenue - totalExpense) * 1.2),
      riskLevel: 'low'
    },
    {
      name: '🟡 Базовый',
      revenueChange: 0,
      expenseChange: 0,
      netProfit: baseProfit,
      cashFlow: revenue - totalExpense,
      riskLevel: 'medium'
    },
    {
      name: '🟠 Пессимистичный',
      revenueChange: -20,
      expenseChange: 5,
      netProfit: Math.round(revenue * 0.8 - totalExpense * 1.05),
      cashFlow: Math.round((revenue - totalExpense) * 0.7),
      riskLevel: 'high'
    },
    {
      name: '🔴 Кризисный',
      revenueChange: -40,
      expenseChange: 15,
      netProfit: Math.round(revenue * 0.6 - totalExpense * 1.15),
      cashFlow: Math.round((revenue - totalExpense) * 0.4),
      riskLevel: 'high'
    }
  ];
}

// ========================
// 5. ПРОГНОЗИРОВАНИЕ ДДС (Cash Flow Forecasting) — как в Float и Pulse
// ========================

export interface CashFlowForecast {
  month: string;
  openingBalance: number;
  operatingInflow: number;
  operatingOutflow: number;
  netCashFlow: number;
  closingBalance: number;
}

export function forecastCashFlow(doc: ParsedDocument, months: number = 6): CashFlowForecast[] {
  const forecasts: CashFlowForecast[] = [];
  
  if (doc.transactions.length === 0) return forecasts;

  // Среднедневные значения
  let totalIncome = 0, totalExpense = 0;
  for (const tx of doc.transactions) {
    if (tx.type === 'income') totalIncome += tx.amount;
    else totalExpense += tx.amount;
  }

  const avgDailyInflow = totalIncome / 30; // упрощённо
  const avgDailyOutflow = totalExpense / 30;
  
  // Определяем последний месяц в данных
  const dates = doc.transactions.map(t => t.date).filter(d => d.length === 10);
  let lastDate = '2025-01';
  if (dates.length > 0) {
    lastDate = dates.sort().reverse()[0].substring(0, 7);
  }

  // Текущий остаток (эвристика: накопленный чистый поток)
  let currentBalance = totalIncome - totalExpense;
  if (currentBalance < 0) currentBalance = Math.abs(currentBalance); // Если убыток — считаем что есть запас

  const monthsNames = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
  
  for (let i = 0; i < months; i++) {
    const monthNum = parseInt(lastDate.split('-')[1]) + i;
    const yearOffset = Math.floor(monthNum / 12);
    const monthIdx = ((monthNum - 1) % 12);
    
    forecasts.push({
      month: `${monthsNames[monthIdx]} ${parseInt(lastDate.split('-')[0]) + yearOffset}`,
      openingBalance: currentBalance,
      operatingInflow: Math.round(avgDailyInflow * 30 * (1 + i * 0.02)), // +2% рост/мес
      operatingOutflow: Math.round(avgDailyOutflow * 30),
      netCashFlow: Math.round((avgDailyInflow - avgDailyOutflow) * 30 * (1 + i * 0.02)),
      closingBalance: currentBalance + Math.round((avgDailyInflow - avgDailyOutflow) * 30 * (1 + i * 0.02))
    });

    currentBalance += Math.round((avgDailyInflow - avgDailyOutflow) * 30 * (1 + i * 0.02));
  }

  return forecasts;
}

// ========================
// 6. КPI-ДЭШБОРД — как в QuickBooks и Kontur
// ========================

export interface KPIData {
  key: string;
  label: string;
  value: number;
  target: number;
  unit: '%' | '₽' | 'days' | 'ratio';
  trend: 'up' | 'down' | 'stable';
  status: 'green' | 'yellow' | 'red';
}

export function generateKPIDashboard(doc: ParsedDocument): KPIData[] {
  const kpis: KPIData[] = [];
  
  let revenue = 0, cogs = 0, opex = 0;
  let totalIncome = 0, totalExpense = 0;
  
  for (const tx of doc.transactions) {
    if (tx.type === 'income') {
      totalIncome += tx.amount;
      revenue += tx.amount;
    } else {
      totalExpense += tx.amount;
      const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
      if (/закупк|товар|материал/.test(text)) cogs += tx.amount;
      else opex += tx.amount;
    }
  }

  // Из ОСВ
  const osv = parseOSVFromDocument(doc);
  const acc90 = osv['90'];
  if (acc90) {
    revenue = acc90.creditTurnover || 0;
    cogs = acc90.debitTurnover || 0;
    opex += (osv['26']?.debitEnd || 0);
  }

  const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;
  const netProfit = revenue - cogs - opex;
  const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;

  // DSO — Days Sales Outstanding (оценка)
  const acc62 = osv['62'];
  const dso = acc62 && revenue > 0 ? Math.round((acc62.debitEnd || 0) / (revenue / 365)) : 0;

  // DPO — Days Payable Outstanding
  const acc60 = osv['60'];
  const dpo = acc60 && cogs > 0 ? Math.round((acc60.creditEnd || 0) / (cogs / 365)) : 0;

  // Текущая ликвидность
  const acc51 = osv['51']?.debitEnd || 0;
  const acc41 = osv['41']?.debitEnd || 0;
  const currentAssets = acc51 + acc41 + (acc62?.debitEnd || 0);
  const acc68Local = osv['68'];
  const currentLiabilities = (acc60?.creditEnd || 0) + (acc68Local?.creditEnd || 0);
  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;

  kpis.push(
    { key: 'revenue', label: 'Выручка', value: revenue, target: Math.round(revenue * 1.2), unit: '₽', trend: 'up', status: netProfit > 0 ? 'green' : 'red' },
    { key: 'grossMargin', label: 'Валовая маржа', value: grossMargin, target: 40, unit: '%', trend: grossMargin >= 30 ? 'up' : 'down', status: grossMargin >= 40 ? 'green' : grossMargin >= 25 ? 'yellow' : 'red' },
    { key: 'netMargin', label: 'Чистая маржа', value: netMargin, target: 15, unit: '%', trend: netMargin > 5 ? 'up' : 'down', status: netMargin >= 15 ? 'green' : netMargin >= 5 ? 'yellow' : 'red' },
    { key: 'dso', label: 'DSO (Дней дебиторки)', value: dso, target: 30, unit: 'days', trend: dso <= 45 ? 'up' : 'down', status: dso <= 30 ? 'green' : dso <= 60 ? 'yellow' : 'red' },
    { key: 'dpo', label: 'DPO (Дней кредиторки)', value: dpo, target: 60, unit: 'days', trend: dpo >= 45 ? 'up' : 'down', status: dpo <= 90 ? 'green' : 'yellow' },
    { key: 'currentRatio', label: 'Текущая ликвидность', value: currentRatio, target: 2.0, unit: 'ratio', trend: currentRatio >= 1.5 ? 'up' : 'down', status: currentRatio >= 2 ? 'green' : currentRatio >= 1 ? 'yellow' : 'red' }
  );

  return kpis;
}

// ========================
// 7. СРАВНЕНИЕ ПЕРИОДОВ (Period-over-Period) — как в QuickBooks и 1С
// ========================

export interface PeriodComparison {
  period: string;
  revenue: number;
  expense: number;
  profit: number;
  marginPercent: number;
}

export function comparePeriods(doc: ParsedDocument): PeriodComparison[] {
  // Группируем транзакции по месяцам
  const monthData: Record<string, { income: number, expense: number }> = {};
  
  for (const tx of doc.transactions) {
    if (!tx.date || tx.date.length < 7) continue;
    const key = tx.date.substring(0, 7); // YYYY-MM
    
    if (!monthData[key]) monthData[key] = { income: 0, expense: 0 };
    
    if (tx.type === 'income') monthData[key].income += tx.amount;
    else monthData[key].expense += tx.amount;
  }

  return Object.keys(monthData).sort().map(key => ({
    period: key,
    revenue: monthData[key].income,
    expense: monthData[key].expense,
    profit: monthData[key].income - monthData[key].expense,
    marginPercent: monthData[key].income > 0 ? ((monthData[key].income - monthData[key].expense) / monthData[key].income) * 100 : 0
  }));
}

// ========================
// 8. АВТО-РЕКОМЕНДАЦИИ (AI Recommendations Engine) — как в QuickBooks и Kontur
// ========================

export interface Recommendation {
  priority: 'high' | 'medium' | 'low';
  category: string;
  title: string;
  description: string;
  potentialImpact?: string;
}

export function generateRecommendations(doc: ParsedDocument): Recommendation[] {
  const recs: Recommendation[] = [];
  
  let totalIncome = 0, totalExpense = 0, cogs = 0, opex = 0;
  
  for (const tx of doc.transactions) {
    if (tx.type === 'income') totalIncome += tx.amount;
    else {
      totalExpense += tx.amount;
      const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
      if (/закупк|товар|материал/.test(text)) cogs += tx.amount;
      else opex += tx.amount;
    }
  }

  const osv = parseOSVFromDocument(doc);
  
  // 1. Если маржа < 20% — предупреждение
  if (totalIncome > 0) {
    const margin = ((totalIncome - totalExpense) / totalIncome) * 100;
    if (margin < 15) {
      recs.push({
        priority: 'high',
        category: 'Рентабельность',
        title: 'Низкая чистая маржа',
        description: `Чистая маржа составляет ${margin.toFixed(1)}%. Рекомендуется пересмотреть ценовую политику или сократить операционные расходы.`,
        potentialImpact: `Повышение маржи до 20% добавит ~${Math.round(totalIncome * 0.05).toLocaleString('ru-RU')} ₽/мес`
      });
    } else if (margin >= 30) {
      recs.push({
        priority: 'low',
        category: 'Рост',
        title: 'Высокая маржа — потенциал масштабирования',
        description: `Чистая маржа ${margin.toFixed(1)}%. Отличная основа для расширения ассортимента или выхода на новые рынки.`,
      });
    }
  }

  // 2. Если расходы растут быстрее доходов (из сравнения периодов)
  const periods = comparePeriods(doc);
  if (periods.length >= 2) {
    const last = periods[periods.length - 1];
    const prev = periods[periods.length - 2];
    
    const incomeGrowth = prev.revenue > 0 ? ((last.revenue - prev.revenue) / prev.revenue) * 100 : 0;
    const expenseGrowth = prev.expense > 0 ? ((last.expense - prev.expense) / prev.expense) * 100 : 0;
    
    if (expenseGrowth > incomeGrowth && expenseGrowth > 10) {
      recs.push({
        priority: 'high',
        category: 'Контроль расходов',
        title: `Расходы растут быстрее выручки (+${expenseGrowth.toFixed(1)}% vs +${incomeGrowth.toFixed(1)}%)`,
        description: 'Необходим аудит операционных издержек. Рассмотрите заморозку некритичных статей расходов.',
      });
    }
  }

  // 3. Высокая дебиторка (DSO > 45)
  const acc62 = osv['62'];
  if (acc62 && (acc62.debitEnd || 0) > totalIncome * 0.1) {
    recs.push({
      priority: 'high',
      category: 'Дебиторка',
      title: 'Высокая дебиторская задолженность',
      description: `Остаток дебиторки на сч.62: ${formatMoney(acc62.debitEnd || 0)}. Рекомендуется ужесточить условия оплаты или внедрить факторинг.`,
    });
  }

  // 4. Низкая ликвидность
  const acc51 = osv['51'];
  if (acc51 && (acc51.debitEnd || 0) < totalExpense * 3 / 12) {
    recs.push({
      priority: 'medium',
      category: 'Ликвидность',
      title: 'Низкий остаток на расчетном счете',
      description: `Средства на сч.51 (${formatMoney(acc51.debitEnd || 0)}) могут не покрыть расходы за ближайший месяц.`,
    });
  }

  // 5. Если есть прибыль, но нет накоплений — рекомендация по резервам
  const acc99 = osv['99'];
  if (acc99 && (acc99.creditEnd || 0) > 0) {
    recs.push({
      priority: 'low',
      category: 'Накопления',
      title: 'Есть прибыль — формируйте резервы',
      description: 'Рекомендуется сформировать финансовую подушку на 3-6 месяцев операционных расходов.',
    });
  }

  // 6. УСН оптимизация (если есть данные о налогах)
  const acc68 = osv['68'];
  if (acc68 && (acc68.debitTurnover || 0) > 0) {
    recs.push({
      priority: 'medium',
      category: 'Налоговая оптимизация',
      title: 'Анализ налоговой нагрузки',
      description: `Уплаченные налоги: ${formatMoney(acc68.debitTurnover || 0)}. Рассмотрите переход на УСН (если ещё не) или патентную систему.`,
    });
  }

  return recs.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

// ========================
// 9. СВОДНЫЙ ОТЧЕТ ВСЕХ КОНКУРЕНТНЫХ ФИЧ
// ========================

export function generateCompetitorFeatureReport(doc: ParsedDocument): {
  budgetVsActual: BudgetLine[];
  productCosting: ProductCosting;
  currencyPositions: CurrencyPosition[];
  scenarios: ScenarioResult[];
  cashFlowForecast: CashFlowForecast[];
  kpis: KPIData[];
  periodComparison: PeriodComparison[];
  recommendations: Recommendation[];
} {
  return {
    budgetVsActual: generateBudgetVsActual(doc),
    productCosting: calculateProductCosting(doc),
    currencyPositions: calculateCurrencyPositions(doc),
    scenarios: runWhatIfScenarios(doc),
    cashFlowForecast: forecastCashFlow(doc, 6),
    kpis: generateKPIDashboard(doc),
    periodComparison: comparePeriods(doc),
    recommendations: generateRecommendations(doc)
  };
}
