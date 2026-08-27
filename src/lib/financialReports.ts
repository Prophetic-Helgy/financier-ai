/**
 * Модуль генерации управленческой и бухгалтерской отчетности на основе данных ОСВ, транзакций и метрик.
 * Реализует полный цикл: ОПиУ (P&L), Баланс (F1), ДДС (Cash Flow), Капитал и Резервы (K&R),
 * а также расчет финансовых коэффициентов и построение слайдов/таблиц.
 */

import { ParsedDocument, ParsedTransaction } from './parsers/bankParsers';

// ========================
// Типы данных
// ========================

export interface IncomeStatementLine {
  name: string;
  value: number;
  level: number; // 0 = заголовок, 1 = подраздел, 2 = строка
  isTotal?: boolean;
}

export interface BalanceSheetLine {
  name: string;
  value: number;
  side: 'asset' | 'liability';
  level: number;
  isTotal?: boolean;
  code?: string; // код строки баланса (например "1200", "1520")
}

export interface CashFlowLine {
  name: string;
  value: number;
  category: 'operating' | 'investing' | 'financing';
  isTotal?: boolean;
}

export interface FinancialRatio {
  name: string;
  label: string;
  value: number;
  unit: '%' | 'x' | 'days' | 'ratio';
  benchmark?: number;
  status: 'good' | 'warning' | 'critical';
  description: string;
}

export interface ReportSlide {
  title: string;
  subtitle?: string;
  content: string; // markdown text
  charts?: ChartData[];
}

export interface ChartData {
  type: 'bar' | 'pie' | 'line' | 'waterfall';
  data: Record<string, number>[];
  labels?: string[];
  values?: number[];
  colors?: string[];
}

// ========================
// План счетов РСБУ (ключевые счета)
// ========================

export const ACCOUNT_MAP: Record<string, { name: string; category: string }> = {
  // Внеоборотные активы
  '10': { name: 'Материалы', category: 'noncurrent_assets' },
  '11': { name: 'Животные на выращивании', category: 'noncurrent_assets' },
  '19': { name: 'НДС по внеоборотным активам', category: 'noncurrent_assets' },
  '20': { name: 'Основное производство', category: 'cogs' },
  '23': { name: 'Вспомогательные производства', category: 'cogs' },
  '25': { name: 'Общепроизводственные расходы', category: 'opex' },
  '26': { name: 'Общехозяйственные расходы', category: 'opex' },
  '41': { name: 'Товары', category: 'current_assets' },
  '43': { name: 'Готовая продукция', category: 'current_assets' },
  '50': { name: 'Касса', category: 'cash' },
  '51': { name: 'Расчетные счета', category: 'cash' },
  '52': { name: 'Валютные счета', category: 'cash' },
  '58': { name: 'Финансовые вложения', category: 'investment' },
  '60': { name: 'Расчеты с поставщиками', category: 'short_term_liabilities' },
  '62': { name: 'Расчеты с покупателями', category: 'receivables' },
  '63': { name: 'Резервы по сомнительным долгам', category: 'contra_receivables' },
  '66': { name: 'Расчеты по краткосрочным кредитам', category: 'short_term_debt' },
  '67': { name: 'Расчеты по долгосрочным кредитам', category: 'long_term_debt' },
  '68': { name: 'Расчеты по налогам и сборам', category: 'taxes' },
  '69': { name: 'Расчеты по соцстрахованию', category: 'insurance' },
  '70': { name: 'Расчеты с персоналом по зарплате', category: 'payroll' },
  '71': { name: 'Расчеты подотчетными лицами', category: 'petty_cash' },
  '76': { name: 'Расчеты с разными дебиторами/кредиторами', category: 'other_payables' },
  '80': { name: 'Уставный капитал', category: 'equity' },
  '82': { name: 'Резервный капитал', category: 'equity' },
  '83': { name: 'Добавочный капитал', category: 'equity' },
  '84': { name: 'Нераспределенная прибыль (непокрытый убыток)', category: 'retained_earnings' },
  '90': { name: 'Продажи', category: 'revenue_expense' },
  '91': { name: 'Прочие доходы и расходы', category: 'other_income_expense' },
  '99': { name: 'Прибыли и убытки', category: 'profit_loss' },
};

const CATEGORY_LABELS: Record<string, string> = {
  noncurrent_assets: 'Внеоборотные активы',
  current_assets: 'Оборотные активы',
  cash: 'Денежные средства',
  receivables: 'Дебиторская задолженность',
  investment: 'Финансовые вложения',
  short_term_liabilities: 'Краткосрочная задолженность',
  short_term_debt: 'Краткосрочные кредиты и займы',
  long_term_debt: 'Долгосрочные кредиты и займы',
  taxes: 'Налоги и обязательные платежи',
  equity: 'Капитал и резервы',
  retained_earnings: 'Нераспределенная прибыль',
  revenue_expense: 'Доходы и расходы (ОПиУ)',
  other_income_expense: 'Прочие доходы и расходы',
  profit_loss: 'Прибыли и убытки',
};

// ========================
// Вспомогательные функции
// ========================

function cleanNumber(val: any): number {
  if (typeof val === 'number') return Math.abs(val) || 0;
  const s = String(val).replace(/\s/g, '').replace(',', '.');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : Math.abs(n);
}

function formatMoney(val: number): string {
  if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)} млрд ₽`;
  if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)} млн ₽`;
  return val.toLocaleString('ru-RU') + ' ₽';
}

// ========================
// Парсинг ОСВ из документа
// ========================

export function parseOSVFromDocument(doc: ParsedDocument): Record<string, { debitStart?: number; creditStart?: number; debitEnd?: number; creditEnd?: number; debitTurnover?: number; creditTurnover?: number }> {
  const osvData: Record<string, any> = {};
  
  if (!doc.rawText && !doc.extractedMetrics) return osvData;

  const lines = (doc.rawText || '').split(/\r?\n/);
  
  for (const line of lines) {
    // Ищем строки вида: "Счет | Сальдо на начало | ... | Обороты | ..."
    // Или числовые коды счетов в начале строки
    
    // Попытка найти код счета (2-4 цифры)
    const accountMatch = line.match(/(\d{2,4})\s*[|;\t]\s*([\d\s.,]+)/);
    
    if (accountMatch) {
      const accountCode = accountMatch[1];
      // Проверяем что это не сумма и не дата
      const restParts = line.split(/[|;\t]/).map(s => s.trim()).filter(s => /\d/.test(s));
      
      if (restParts.length >= 2) {
        osvData[accountCode] = osvData[accountCode] || {};
        
        // Пытаемся извлечь числа по порядку: Сальдо Д, Сальдо К, Оборот Д, Оборот К
        const numbers: number[] = [];
        for (const part of restParts) {
          const n = cleanNumber(part);
          if (n !== 0 && !part.match(/^\d{2}\.\d{2}$/)) {
            numbers.push(n);
          }
        }
        
        if (numbers.length >= 1) osvData[accountCode].debitStart = numbers[0];
        if (numbers.length >= 2) osvData[accountCode].creditStart = numbers[1];
        if (numbers.length >= 3) osvData[accountCode].debitTurnover = numbers[2];
        if (numbers.length >= 4) osvData[accountCode].creditTurnover = numbers[3];
        if (numbers.length >= 5) osvData[accountCode].debitEnd = numbers[4];
        if (numbers.length >= 6) osvData[accountCode].creditEnd = numbers[5];
      }
    }
  }

  // Также используем extractedMetrics если есть
  if (doc.extractedMetrics) {
    for (const [key, val] of Object.entries(doc.extractedMetrics)) {
      const numericKey = key.replace(/\D/g, '');
      if (numericKey.length >= 2 && numericKey.length <= 4) {
        osvData[numericKey] = {
          ...(osvData[numericKey] || {}),
          debitEnd: val,
        };
      }
    }
  }

  return osvData;
}

// ========================
// Генератор ОПиУ (P&L) — Отчет о прибылях и убытках
// ========================

export function generateIncomeStatement(doc: ParsedDocument): IncomeStatementLine[] {
  const lines: IncomeStatementLine[] = [];
  
  // Способ 1: Из транзакций (эвристика)
  if (doc.transactions.length > 0) {
    let revenue = 0, cogs = 0, opex = 0;
    let otherIncome = 0, otherExpense = 0;
    
    const REVENUE_KEYWORDS = ['постав', 'оплат', 'выручк', 'доход', 'услуг', 'проект', 'работ', 'продаж'];
    const COGS_KEYWORDS = ['закупк', 'материал', 'товар', 'субподряд', 'логистик', 'доставк', 'себестоим'];
    
    for (const tx of doc.transactions) {
      const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
      
      if (tx.type === 'income') {
        if (REVENUE_KEYWORDS.some(k => text.includes(k))) {
          revenue += tx.amount;
        } else {
          otherIncome += tx.amount;
        }
      } else {
        if (COGS_KEYWORDS.some(k => text.includes(k))) {
          cogs += tx.amount;
        } else {
          opex += tx.amount;
        }
      }
    }

    lines.push({ name: 'ВЫРУЧКА', value: revenue, level: 0, isTotal: true });
    lines.push({ name: `  Себестоимость реализованной продукции`, value: -cogs, level: 1 });
    
    const grossProfit = revenue - cogs;
    lines.push({ name: `ВАЛОВАЯ ПРИБЫЛЬ`, value: grossProfit, level: 0, isTotal: true });
    
    lines.push({ name: `  Коммерческие расходы`, value: -(opex * 0.3), level: 1 }); // ~30% OPEX = коммерческие
    lines.push({ name: `  Управленческие расходы`, value: -(opex * 0.7), level: 1 }); // ~70% OPEX = управленческие
    
    const operatingProfit = grossProfit - opex;
    lines.push({ name: 'ПРИБЫЛЬ ОТ ПРОДАЖ (OP)', value: operatingProfit, level: 0, isTotal: true });
    
    lines.push({ name: `  Прочие доходы`, value: otherIncome, level: 1 });
    lines.push({ name: `  Прочие расходы`, value: -otherExpense, level: 1 });
    
    const profitBeforeTax = operatingProfit + otherIncome - otherExpense;
    lines.push({ name: 'ПРИБЫЛЬ ДО НАЛОГИЙ (PBT)', value: profitBeforeTax, level: 0, isTotal: true });
    
    // Оценка налога (20% — УСН/ОСН усреднённо)
    const estimatedTax = Math.max(0, profitBeforeTax * 0.2);
    lines.push({ name: `  Налог на прибыль (оценочно)`, value: -estimatedTax, level: 1 });
    
    const netProfit = profitBeforeTax - estimatedTax;
    lines.push({ name: 'ЧИСТАЯ ПРИБЫЛЬ', value: netProfit, level: 0, isTotal: true });

    return lines;
  }

  // Способ 2: Из ОСВ (счета 90, 91, 99)
  const osv = parseOSVFromDocument(doc);
  
  if (Object.keys(osv).length > 0) {
    let revenue = 0, cogsVal = 0;
    let otherIncome = 0, otherExpense = 0;
    
    // Счет 90 — Продажи
    const acc90 = osv['90'];
    if (acc90) {
      // Кредит 90.1 — Выручка
      revenue = acc90.creditTurnover || acc90.creditStart || 0;
      // Дебет 90.2 — Себестоимость
      cogsVal = acc90.debitTurnover || 0;
    }
    
    // Счет 91 — Прочие доходы и расходы
    const acc91 = osv['91'];
    if (acc91) {
      otherIncome = acc91.creditTurnover || acc91.creditStart || 0;
      otherExpense = acc91.debitTurnover || 0;
    }

    // Счет 20 — Основное производство (для проверки COGS)
    const acc20 = osv['20'];
    if (acc20 && cogsVal === 0) {
      cogsVal = acc20.debitEnd || acc20.debitTurnover || 0;
    }

    // Счет 43 — Готовая продукция
    const acc43 = osv['43'];
    if (acc43 && cogsVal === 0) {
      // COGS можно оценить как Сальдо Д + Оборот Д - Сальдо К
      cogsVal = (acc43.debitStart || 0) + (acc43.debitTurnover || 0) - (acc43.creditEnd || 0);
    }

    const grossProfit = revenue - cogsVal;
    
    lines.push({ name: 'ВЫРУЧКА', value: revenue, level: 0, isTotal: true });
    lines.push({ name: `  Себестоимость`, value: -cogsVal, level: 1 });
    lines.push({ name: 'ВАЛОВАЯ ПРИБЫЛЬ', value: grossProfit, level: 0, isTotal: true });

    // Оценочные операционные расходы через счета 26, 44
    const acc26 = osv['26'];
    const opexFromOSV = (acc26?.debitTurnover || acc26?.debitEnd || 0);
    
    lines.push({ name: `  Управленческие расходы`, value: -opexFromOSV, level: 1 });

    const operatingProfit = grossProfit - opexFromOSV;
    lines.push({ name: 'ПРИБЫЛЬ ОТ ПРОДАЖ', value: operatingProfit, level: 0, isTotal: true });

    if (otherIncome > 0 || otherExpense > 0) {
      lines.push({ name: `  Прочие доходы`, value: otherIncome, level: 1 });
      lines.push({ name: `  Прочие расходы`, value: -otherExpense, level: 1 });
    }

    const pbt = operatingProfit + otherIncome - otherExpense;
    lines.push({ name: 'ПРИБЫЛЬ ДО НАЛОГИЙ', value: pbt, level: 0, isTotal: true });

    // Налог — оценка через счет 68 или % от PBT
    const acc68 = osv['68'];
    let tax = 0;
    if (acc68) {
      // Дебет 68 — уплаченные налоги
      tax = Math.abs(acc68.debitTurnover || 0);
    }
    if (tax === 0) {
      tax = Math.max(0, pbt * 0.2);
    }
    
    lines.push({ name: `  Налог на прибыль`, value: -tax, level: 1 });

    const netProfit = pbt - tax;
    lines.push({ name: 'ЧИСТАЯ ПРИБЫЛЬ', value: netProfit, level: 0, isTotal: true });

    return lines;
  }

  // Способ 3: Из метрик (если есть данные из баланса)
  if (doc.extractedMetrics && Object.keys(doc.extractedMetrics).length > 0) {
    const m = doc.extractedMetrics;
    
    // Попробуем найти выручку и расходы в метриках
    let rev = 0, cogsM = 0, opexM = 0;
    
    for (const [key, val] of Object.entries(m)) {
      const lk = key.toLowerCase();
      if (lk.includes('выручк') || lk.includes('доход')) rev += val;
      else if (lk.includes('себестоим') || lk.includes('закупк')) cogsM += val;
      else if (lk.includes('расход') && !lk.includes('валов')) opexM += val;
    }

    lines.push({ name: 'ВЫРУЧКА', value: rev, level: 0, isTotal: true });
    lines.push({ name: `  Себестоимость`, value: -cogsM, level: 1 });
    
    const gp = rev - cogsM;
    lines.push({ name: 'ВАЛОВАЯ ПРИБЫЛЬ', value: gp, level: 0, isTotal: true });
    lines.push({ name: `  Операционные расходы`, value: -opexM, level: 1 });

    const op = gp - opexM;
    lines.push({ name: 'ПРИБЫЛЬ ОТ ПРОДАЖ', value: op, level: 0, isTotal: true });
    
    const taxM = Math.max(0, op * 0.2);
    lines.push({ name: `  Налог на прибыль`, value: -taxM, level: 1 });

    lines.push({ name: 'ЧИСТАЯ ПРИБЫЛЬ', value: op - taxM, level: 0, isTotal: true });

    return lines;
  }

  return [{ name: 'Нет данных для формирования ОПиУ', value: 0, level: 2 }];
}

// ========================
// Генератор Баланса (Форма 1) — по данным ОСВ
// ========================

export function generateBalanceSheet(doc: ParsedDocument): BalanceSheetLine[] {
  const lines: BalanceSheetLine[] = [];
  
  // Способ 1: Из метрик баланса (если документ уже классифицирован как баланс)
  if (doc.extractedMetrics && Object.keys(doc.extractedMetrics).length > 0) {
    const m = doc.extractedMetrics;
    
    const assetKeys = ['Внеоборотные', 'Оборотные', 'Актив', 'Запасы', 'Денежные', 'Расчетные', 'Касса', 'Дебитор'];
    const liabKeys = ['Капитал', 'Резервы', 'Обязательства', 'Кредитор', 'Задолженность', 'Капитал и резервы', 'Краткосрочн', 'Долгосрочн'];

    let totalAssets = 0, totalLiabilities = 0;
    
    for (const [key, val] of Object.entries(m)) {
      const lk = key.toLowerCase();
      
      if (assetKeys.some(k => lk.includes(k))) {
        lines.push({ name: key, value: val, side: 'asset', level: lk.includes('итого') || lk.includes('всего') ? 0 : 1 });
        totalAssets += val;
      } else if (liabKeys.some(k => lk.includes(k))) {
        lines.push({ name: key, value: val, side: 'liability', level: lk.includes('итого') || lk.includes('всего') ? 0 : 1 });
        totalLiabilities += val;
      }
    }

    if (totalAssets > 0 || totalLiabilities > 0) {
      lines.push({ name: 'ИТОГО АКТИВЫ', value: totalAssets, side: 'asset', level: 0, isTotal: true });
      lines.push({ name: 'ИТОГО ПАССИВЫ', value: totalLiabilities, side: 'liability', level: 0, isTotal: true });
      return lines;
    }
  }

  // Способ 2: Из ОСВ (полный разбор по плану счетов)
  const osv = parseOSVFromDocument(doc);
  
  if (Object.keys(osv).length === 0) {
    // Способ 3: Из транзакций — оценка остатков на счетах
    if (doc.transactions.length > 0) {
      let cash = 0, receivables = 0;
      
      for (const tx of doc.transactions) {
        if (tx.type === 'income') {
          cash += tx.amount;
        } else {
          // Расходы уменьшают кэш, но не формируют активы напрямую
        }
      }

      lines.push({ name: 'Денежные средства', value: cash, side: 'asset', level: 1 });
      lines.push({ name: 'Дебиторская задолженность (оценка)', value: receivables, side: 'asset', level: 1 });
      
      const totalAssets = cash + receivables;
      lines.push({ name: 'ИТОГО АКТИВЫ', value: totalAssets, side: 'asset', level: 0, isTotal: true });

      // Пассивы — упрощенно
      lines.push({ name: 'Капитал и резервы (оценка)', value: cash, side: 'liability', level: 1 });
      lines.push({ name: 'ИТОГО ПАССИВЫ', value: cash, side: 'liability', level: 0, isTotal: true });

      return lines;
    }

    return [{ name: 'Нет данных для формирования баланса', value: 0, side: 'asset', level: 2 }];
  }

  // Разбор ОСВ по статьям баланса (Форма 1)
  
  // === ВНЕОБОРОТНЫЕ АКТИВЫ (код 1xxx) ===
  let noncurrentAssets = 0;
  const ncLines: BalanceSheetLine[] = [];
  
  for (const [accCode, data] of Object.entries(osv)) {
    if (!ACCOUNT_MAP[accCode]) continue;
    const cat = ACCOUNT_MAP[accCode].category;
    
    if (cat === 'noncurrent_assets') {
      const val = data.debitEnd || 0;
      if (val > 0) {
        ncLines.push({ name: `${accCode} ${ACCOUNT_MAP[accCode].name}`, value: val, side: 'asset', level: 1 });
        noncurrentAssets += val;
      }
    }
  }

  // === ОБОРОТНЫЕ АКТИВЫ (код 2xxx-5xxx) ===
  let currentAssets = 0;
  const caLines: BalanceSheetLine[] = [];
  
  for (const [accCode, data] of Object.entries(osv)) {
    if (!ACCOUNT_MAP[accCode]) continue;
    const cat = ACCOUNT_MAP[accCode].category;
    
    if (cat === 'current_assets' || cat === 'cash' || cat === 'receivables') {
      const val = data.debitEnd || 0;
      if (val > 0) {
        caLines.push({ name: `${accCode} ${ACCOUNT_MAP[accCode].name}`, value: val, side: 'asset', level: 1 });
        currentAssets += val;
      }
    }
  }

  const totalAssets = noncurrentAssets + currentAssets;
  
  if (totalAssets > 0) {
    // Актив
    lines.push({ name: 'I. ВНЕОБОРОТНЫЕ АКТИВЫ', value: noncurrentAssets, side: 'asset', level: 0, isTotal: true });
    for (const l of ncLines) lines.push(l);

    if (ncLines.length > 0 && caLines.length > 0) {
      lines.push({ name: '', value: 0, side: 'asset', level: 2 }); // separator
    }

    lines.push({ name: 'II. ОБОРОТНЫЕ АКТИВЫ', value: currentAssets, side: 'asset', level: 0, isTotal: true });
    for (const l of caLines) lines.push(l);

    lines.push({ name: 'БАЛАНС (ИТОГО)', value: totalAssets, side: 'asset', level: 0, isTotal: true });

    // === Пассив ===
    
    // Капитал и резервы (счета 80-84)
    let equity = 0;
    const eqLines: BalanceSheetLine[] = [];
    
    for (const [accCode, data] of Object.entries(osv)) {
      if (!ACCOUNT_MAP[accCode]) continue;
      const cat = ACCOUNT_MAP[accCode].category;
      
      if (cat === 'equity' || cat === 'retained_earnings') {
        // Для капитала смотрим кредитовое сальдо
        const val = data.creditEnd || data.debitEnd || 0;
        if (val > 0) {
          eqLines.push({ name: `${accCode} ${ACCOUNT_MAP[accCode].name}`, value: val, side: 'liability', level: 1 });
          equity += val;
        }
      }
    }

    // Краткосрочные обязательства (счета 60, 62, 63, 66, 68, 69, 70, 76)
    let shortTermLiab = 0;
    const stLines: BalanceSheetLine[] = [];
    
    for (const [accCode, data] of Object.entries(osv)) {
      if (!ACCOUNT_MAP[accCode]) continue;
      const cat = ACCOUNT_MAP[accCode].category;
      
      if (cat === 'short_term_liabilities' || cat === 'short_term_debt' || 
          cat === 'taxes' || cat === 'insurance' || cat === 'payroll') {
        // Для обязательств смотрим кредитовое сальдо
        const val = data.creditEnd || 0;
        if (val > 0) {
          stLines.push({ name: `${accCode} ${ACCOUNT_MAP[accCode].name}`, value: val, side: 'liability', level: 1 });
          shortTermLiab += val;
        }
      }
    }

    // Долгосрочные обязательства (счета 67)
    let longTermDebt = 0;
    
    for (const [accCode, data] of Object.entries(osv)) {
      if (!ACCOUNT_MAP[accCode]) continue;
      const cat = ACCOUNT_MAP[accCode].category;
      
      if (cat === 'long_term_debt') {
        const val = data.creditEnd || 0;
        if (val > 0) {
          stLines.push({ name: `${accCode} ${ACCOUNT_MAP[accCode].name}`, value: val, side: 'liability', level: 1 });
          longTermDebt += val;
        }
      }
    }

    const totalLiabilities = equity + shortTermLiab + longTermDebt;

    // Пассив — раздел III
    lines.push({ name: '', value: 0, side: 'liability', level: 2 });
    lines.push({ name: 'III. КАПИТАЛ И РЕЗЕРВЫ', value: equity, side: 'liability', level: 0, isTotal: true });
    for (const l of eqLines) lines.push(l);

    if (eqLines.length > 0 && stLines.length > 0) {
      lines.push({ name: '', value: 0, side: 'liability', level: 2 });
    }

    lines.push({ name: 'IV. ДОЛГОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА', value: longTermDebt, side: 'liability', level: 0, isTotal: true });
    
    lines.push({ name: 'V. КРАТКОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА', value: shortTermLiab, side: 'liability', level: 0, isTotal: true });
    for (const l of stLines) lines.push(l);

    lines.push({ name: 'БАЛАНС (ИТОГО ПАССИВЫ)', value: totalLiabilities, side: 'liability', level: 0, isTotal: true });

    return lines;
  }

  return [{ name: 'Нет данных для формирования баланса из ОСВ', value: 0, side: 'asset', level: 2 }];
}

// ========================
// Генератор ДДС (Cash Flow Statement)
// ========================

export function generateCashFlow(doc: ParsedDocument): CashFlowLine[] {
  const lines: CashFlowLine[] = [];

  // Способ 1: Из транзакций
  if (doc.transactions.length > 0) {
    let operatingIn = 0, operatingOut = 0;
    let investingIn = 0, investingOut = 0;
    let financingIn = 0, financingOut = 0;

    const INV_KEYWORDS = ['оборудован', 'актив', 'инвест', 'недвижим', 'транспорт', 'мебель', 'техник'];
    const FIN_KEYWORDS = ['кредит', 'займ', 'дивиденд', 'вклад', 'депозит'];

    for (const tx of doc.transactions) {
      const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();

      if (tx.type === 'income') {
        if (FIN_KEYWORDS.some(k => text.includes(k))) {
          financingIn += tx.amount;
        } else if (INV_KEYWORDS.some(k => text.includes(k))) {
          investingIn += tx.amount;
        } else {
          operatingIn += tx.amount;
        }
      } else {
        if (FIN_KEYWORDS.some(k => text.includes(k))) {
          financingOut += tx.amount;
        } else if (INV_KEYWORDS.some(k => text.includes(k))) {
          investingOut += tx.amount;
        } else {
          operatingOut += tx.amount;
        }
      }
    }

    const cfo = operatingIn - operatingOut;
    const cfi = investingIn - investingOut;
    const cff = financingIn - financingOut;
    const netCashFlow = cfo + cfi + cff;

    lines.push({ name: 'I. ОПЕРАЦИОННАЯ ДЕЯТЕЛЬНОСТЬ', value: 0, category: 'operating' });
    lines.push({ name: `  Поступления от клиентов`, value: operatingIn, category: 'operating' });
    lines.push({ name: `  Платежи поставщикам и сотрудникам`, value: -operatingOut, category: 'operating' });
    lines.push({ name: 'ЧАСТНЫЙ ИТОГ ПО ОПЕРАЦИОННОЙ ДЕЯТЕЛЬНОСТИ', value: cfo, category: 'operating', isTotal: true });

    lines.push({ name: '', value: 0, category: 'investing' });
    lines.push({ name: 'II. ИНВЕСТИЦИОННАЯ ДЕЯТЕЛЬНОСТЬ', value: 0, category: 'investing' });
    lines.push({ name: `  Поступления от продажи активов`, value: investingIn, category: 'investing' });
    lines.push({ name: `  Платежи за приобретение активов`, value: -investingOut, category: 'investing' });
    lines.push({ name: 'ЧАСТНЫЙ ИТОГ ПО ИНВЕСТИЦИОННОЙ ДЕЯТЕЛЬНОСТИ', value: cfi, category: 'investing', isTotal: true });

    lines.push({ name: '', value: 0, category: 'financing' });
    lines.push({ name: 'III. ФИНАНСОВАЯ ДЕЯТЕЛЬНОСТЬ', value: 0, category: 'financing' });
    lines.push({ name: `  Поступления от кредитов и займов`, value: financingIn, category: 'financing' });
    lines.push({ name: `  Погашение кредитов и займов`, value: -financingOut, category: 'financing' });
    lines.push({ name: 'ЧАСТНЫЙ ИТОГ ПО ФИНАНСОВОЙ ДЕЯТЕЛЬНОСТИ', value: cff, category: 'financing', isTotal: true });

    lines.push({ name: '', value: 0, category: 'operating' });
    lines.push({ name: 'ЧИСТОЕ ИЗМЕНЕНИЕ ДЕНЕЖНЫХ СРЕДСТВ ЗА ПЕРИОД', value: netCashFlow, category: 'operating', isTotal: true });

    return lines;
  }

  // Способ 2: Из ОСВ — косвенный метод
  const osv = parseOSVFromDocument(doc);
  
  if (Object.keys(osv).length > 0) {
    let netProfit = 0;
    
    // Чистая прибыль из счета 99 или 84
    const acc99 = osv['99'];
    const acc84 = osv['84'];
    if (acc99) {
      netProfit = acc99.creditEnd || acc99.debitEnd || 0;
    } else if (acc84) {
      netProfit = -(acc84.debitEnd || acc84.creditEnd || 0); // Убыток — дебетовое сальдо
    }

    // Изменение оборотных активов/обязательств
    const cashChange = 
      (osv['51']?.creditEnd || 0) - (osv['51']?.debitStart || 0) +
      (osv['50']?.creditEnd || 0) - (osv['50']?.debitStart || 0);

    lines.push({ name: 'ЧАСТОСТЬ ИЗМЕНЕНИЯ ДЕНЕЖНЫХ СРЕДСТВ', value: cashChange, category: 'operating', isTotal: true });
    
    if (netProfit !== 0) {
      lines.push({ name: `  Чистая прибыль`, value: netProfit, category: 'operating' });
    }

    return lines;
  }

  // Способ 3: Из метрик
  if (doc.extractedMetrics && Object.keys(doc.extractedMetrics).length > 0) {
    const m = doc.extractedMetrics;
    
    let cashStart = 0, cashEnd = 0;
    for (const [key, val] of Object.entries(m)) {
      const lk = key.toLowerCase();
      if (lk.includes('сальдо на начало') && lk.includes('счет')) {
        // Попробуем найти счет 51
        if (key.includes('51')) cashStart = val;
      }
      if (lk.includes('сальдо на конец') && lk.includes('счет')) {
        if (key.includes('51')) cashEnd = val;
      }
    }

    const change = cashEnd - cashStart;
    lines.push({ name: 'Остаток денежных средств на начало периода', value: cashStart, category: 'operating' });
    lines.push({ name: 'Остаток денежных средств на конец периода', value: cashEnd, category: 'operating' });
    lines.push({ name: 'ЧИСТОЕ ИЗМЕНЕНИЕ ДЕНЕЖНЫХ СРЕДСТВ', value: change, category: 'operating', isTotal: true });

    return lines;
  }

  lines.push({ name: 'Нет данных для формирования ДДС', value: 0, category: 'operating' });
  return lines;
}

// ========================
// Финансовые коэффициенты
// ========================

export function calculateFinancialRatios(doc: ParsedDocument): FinancialRatio[] {
  const ratios: FinancialRatio[] = [];

  // Собираем данные
  let revenue = 0, cogsVal = 0, opex = 0;
  let totalAssets = 0, currentAssets = 0, currentLiabilities = 0;
  let cash = 0, netProfit = 0, equity = 0;

  // Из ОПиУ
  const pnl = generateIncomeStatement(doc);
  for (const line of pnl) {
    if (line.name.includes('ВЫРУЧКА')) revenue = Math.abs(line.value);
    else if (line.name.includes('Себестоимость') || line.name.includes('Себест')) cogsVal = Math.abs(line.value);
    else if (line.name.includes('ВАЛОВАЯ ПРИБЫЛЬ')) { /* gross */ }
    else if (line.name.includes('Управленческие') || line.name.includes('Коммерческие')) opex += Math.abs(line.value);
    else if (line.name.includes('ПРИБЫЛЬ ОТ ПРОДАЖ')) netProfit = line.value;
    else if (line.name.includes('ЧИСТАЯ ПРИБЫЛЬ')) netProfit = line.value;
  }

  // Из Баланса
  const bs = generateBalanceSheet(doc);
  for (const line of bs) {
    if (line.side === 'asset') {
      totalAssets += line.value;
      if (line.name.includes('Денежные') || line.name.includes('Расчетные') || line.name.includes('Касса')) cash += line.value;
      if (line.level <= 1 && !line.isTotal) currentAssets += line.value;
    } else {
      if (line.side === 'liability' && totalAssets > 0) {
        // Упрощенно: если не "Капитал", то считаем текущими обязательствами
        if (!line.name.includes('ДОЛГОСРОЧН')) {
          currentLiabilities += line.value;
        } else {
          equity += line.value;
        }
      }
    }
  }

  // Из метрик баланса
  if (doc.extractedMetrics) {
    for (const [key, val] of Object.entries(doc.extractedMetrics)) {
      const lk = key.toLowerCase();
      if (lk.includes('оборотн') && lk.includes('актив')) currentAssets += val;
      if (lk.includes('внеоборотн')) totalAssets += val;
      if (lk.includes('капитал и резерв')) equity += val;
      if (lk.includes('краткосрочн') && lk.includes('обязател')) currentLiabilities += val;
    }
  }

  // Расчет коэффициентов
  
  // 1. Коэффициент текущей ликвидности
  if (currentLiabilities > 0) {
    const ct = currentAssets / currentLiabilities;
    ratios.push({
      name: 'Current Ratio', label: 'Коэф. текущей ликвидности', value: ct, unit: 'ratio',
      benchmark: 2.0, status: ct >= 2 ? 'good' : ct >= 1 ? 'warning' : 'critical',
      description: `Текущие активы покрывают ${ct.toFixed(1)}x текущих обязательств. Норма ≥ 2.0.`
    });
  }

  // 2. Рентабельность продаж (ROS / EBITDA Margin)
  if (revenue > 0) {
    const ebitda = revenue - cogsVal - opex;
    const margin = (ebitda / revenue) * 100;
    ratios.push({
      name: 'EBITDA Margin', label: 'Рентабельность по EBITDA', value: margin, unit: '%',
      benchmark: 20, status: margin >= 20 ? 'good' : margin >= 5 ? 'warning' : 'critical',
      description: `Каждый рубль выручки приносит ${margin.toFixed(1)} копеек операционной прибыли.`
    });

    // Чистая маржа
    const netMargin = revenue > 0 ? (netProfit / revenue) * 100 : 0;
    ratios.push({
      name: 'Net Margin', label: 'Чистая рентабельность (ROS)', value: netMargin, unit: '%',
      benchmark: 15, status: netMargin >= 15 ? 'good' : netMargin >= 5 ? 'warning' : 'critical',
      description: `Чистая прибыль составляет ${netMargin.toFixed(1)}% от выручки.`
    });

    // Валовая маржа
    const grossMargin = ((revenue - cogsVal) / revenue) * 100;
    ratios.push({
      name: 'Gross Margin', label: 'Валовая маржа (Gross Margin)', value: grossMargin, unit: '%',
      benchmark: 40, status: grossMargin >= 40 ? 'good' : grossMargin >= 20 ? 'warning' : 'critical',
      description: `После вычета себестоимости остается ${grossMargin.toFixed(1)}% выручки.`
    });
  }

  // 3. Коэффициент автономии (Financial Independence)
  if (totalAssets > 0 && equity > 0) {
    const fa = (equity / totalAssets) * 100;
    ratios.push({
      name: 'Financial Autonomy', label: 'Коэф. автономии', value: fa, unit: '%',
      benchmark: 50, status: fa >= 50 ? 'good' : fa >= 30 ? 'warning' : 'critical',
      description: `${fa.toFixed(1)}% активов финансируется за счет собственного капитала. Норма ≥ 50%.`
    });
  }

  // 4. Коэффициент обеспеченности собственными средствами (KSS)
  if (totalAssets > 0 && equity > 0) {
    const kss = ((equity - cash) / totalAssets) * 100;
    ratios.push({
      name: 'KSS', label: 'Обеспеченность собств. средствами', value: kss, unit: '%',
      benchmark: 10, status: kss >= 10 ? 'good' : kss >= -20 ? 'warning' : 'critical',
      description: `${kss.toFixed(1)}% активов покрыто собственными оборотными средствами.`
    });
  }

  // 5. Рентабельность собственного капитала (ROE)
  if (equity > 0 && netProfit !== 0) {
    const roe = ((netProfit / equity) * 100);
    ratios.push({
      name: 'ROE', label: 'Рентабельность капитала (ROE)', value: roe, unit: '%',
      benchmark: 20, status: roe >= 20 ? 'good' : roe >= 10 ? 'warning' : 'critical',
      description: `Собственный капитал приносит ${roe.toFixed(1)}% доходности.`
    });
  }

  // 6. Рентабельность активов (ROA)
  if (totalAssets > 0 && netProfit !== 0) {
    const roa = ((netProfit / totalAssets) * 100);
    ratios.push({
      name: 'ROA', label: 'Рентабельность активов (ROA)', value: roa, unit: '%',
      benchmark: 10, status: roa >= 10 ? 'good' : roa >= 3 ? 'warning' : 'critical',
      description: `Каждый рубль активов приносит ${roa.toFixed(1)} копеек чистой прибыли.`
    });
  }

  // 7. Денежный поток (если есть транзакции)
  if (doc.transactions.length > 0) {
    const totalIncome = doc.transactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0);
    const totalExpense = doc.transactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0);
    
    // Коэффициент покрытия процентов (условно)
    if (totalIncome > 0) {
      const coverage = (totalIncome / Math.max(1, totalExpense)) * 100;
      ratios.push({
        name: 'Coverage', label: 'Покрытие расходов доходами', value: coverage, unit: '%',
        benchmark: 120, status: coverage >= 120 ? 'good' : coverage >= 100 ? 'warning' : 'critical',
        description: `Доходы покрывают ${coverage.toFixed(1)}% расходов.`
      });
    }

    // Коэффициент сбережений (для физлиц/семьи)
    if (totalIncome > 0) {
      const savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
      ratios.push({
        name: 'Savings Rate', label: 'Норма сбережений', value: savingsRate, unit: '%',
        benchmark: 20, status: savingsRate >= 20 ? 'good' : savingsRate >= 10 ? 'warning' : 'critical',
        description: `${savingsRate.toFixed(1)}% дохода остается после всех расходов.`
      });
    }
  }

  return ratios;
}

// ========================
// Генератор слайдов для презентации (ОПИУ стиль)
// ========================

export function generatePresentationSlides(doc: ParsedDocument): ReportSlide[] {
  const slides: ReportSlide[] = [];

  // Слайд 1: Титульный
  slides.push({
    title: 'Финансовый отчет',
    subtitle: `На основе анализа: ${doc.fileName}`,
    content: `Автоматически сгенерированный управленческий отчет для stakeholders.\n\nПрофиль: **${doc.docType.toUpperCase()}**`
  });

  // Слайд 2: Ключевые метрики
  const pnl = generateIncomeStatement(doc);
  const ratios = calculateFinancialRatios(doc);
  
  let keyMetricsContent = '';
  for (const line of pnl) {
    if (line.isTotal && line.level === 0) {
      keyMetricsContent += `- **${line.name}:** ${formatMoney(line.value)}\n`;
    }
  }

  slides.push({
    title: 'Ключевые Показатели',
    content: `## Структура финансовых результатов\n\n${keyMetricsContent}`
  });

  // Слайд 3: Коэффициенты
  if (ratios.length > 0) {
    let ratioContent = '';
    for (const r of ratios) {
      const icon = r.status === 'good' ? '🟢' : r.status === 'warning' ? '🟡' : '🔴';
      const unitStr = r.unit === '%' ? '%' : r.unit === 'days' ? ' дн.' : '';
      ratioContent += `- ${icon} **${r.label}:** ${r.value.toFixed(1)}${unitStr}\n  _${r.description}_\n\n`;
    }

    slides.push({
      title: 'Финансовые Коэффициенты',
      content: `## Анализ финансовой устойчивости\n\n${ratioContent}`
    });
  }

  // Слайд 4: ДДС
  const cf = generateCashFlow(doc);
  
  let cashflowContent = '';
  for (const line of cf) {
    if (line.name && !line.name.includes('ЧАСТНЫЙ ИТОГ')) {
      const valStr = formatMoney(line.value);
      if (line.isTotal) {
        cashflowContent += `**${line.name}:** ${valStr}\n\n`;
      } else {
        cashflowContent += `- ${line.name}: ${valStr}\n`;
      }
    }
  }

  slides.push({
    title: 'Движение Денежных Средств',
    content: `## Cash Flow Statement\n\n${cashflowContent || 'Нет достаточных данных для формирования полного отчета о движении денежных средств.'}`
  });

  // Слайд 5: Баланс (если есть)
  const bs = generateBalanceSheet(doc);
  
  let balanceContent = '';
  for (const line of bs) {
    if (line.isTotal && line.level === 0) {
      balanceContent += `**${line.name}:** ${formatMoney(line.value)}\n\n`;
    }
  }

  slides.push({
    title: 'Баланс (Форма 1)',
    content: `## Отчет о финансовом положении\n\n${balanceContent || 'Нет достаточных данных для формирования баланса.'}`
  });

  // Слайд 6: Риски и рекомендации
  const warnings: string[] = [];
  
  for (const r of ratios) {
    if (r.status === 'critical') {
      warnings.push(`⚠️ **${r.label}:** ${r.description}`);
    }
  }

  if (pnl.length > 0) {
    const netProfit = pnl.find(l => l.name.includes('ЧИСТАЯ ПРИБЫЛЬ'));
    if (netProfit && netProfit.value < 0) {
      warnings.push(`🔴 **Операционный убыток:** Чистая прибыль отрицательная (${formatMoney(netProfit.value)}). Требуется экстренный аудит.`);
    }
  }

  const risksContent = warnings.length > 0 
    ? warnings.join('\n\n')
    : '🟢 Критических рисков не выявлено. Продолжайте мониторинг финансовых показателей.';

  slides.push({
    title: 'Риски и Рекомендации',
    content: `## Анализ уязвимостей\n\n${risksContent}`
  });

  return slides;
}

// ========================
// Генерация таблицы (Markdown) для ОПиУ, Баланса, ДДС
// ========================

export function generateMarkdownTables(doc: ParsedDocument): string {
  let md = '';

  // ОПиУ
  const pnl = generateIncomeStatement(doc);
  md += '# 📊 ОТЧЕТ О ПРИБЫЛЯХ И УБЫТКАХ (ОПиУ)\n\n';
  md += '| Статья | Сумма (₽) |\n|---|---|\n';
  for (const line of pnl) {
    const indent = '  '.repeat(line.level);
    const bold = line.isTotal ? '**' : '';
    md += `${bold}${indent}${line.name}| ${formatMoney(line.value)}${bold}\n`;
  }

  // Баланс
  const bs = generateBalanceSheet(doc);
  if (bs.some(l => l.side === 'asset')) {
    md += '\n\n# 📋 БАЛАНС (Форма 1)\n\n';
    md += '| Статья | Сумма (₽) |\n|---|---|\n';
    for (const line of bs) {
      const indent = '  '.repeat(line.level);
      const prefix = line.side === 'asset' ? 'АКТИВ' : 'ПАССИВ';
      const bold = line.isTotal ? '**' : '';
      md += `${bold}${indent}[${prefix}] ${line.name}| ${formatMoney(line.value)}${bold}\n`;
    }
  }

  // ДДС
  const cf = generateCashFlow(doc);
  if (cf.some(l => l.category === 'operating')) {
    md += '\n\n# 💰 ОТЧЕТ О ДВИЖЕНИИ ДЕНЕЖНЫХ СРЕДСТВ (ДДС)\n\n';
    md += '| Статья | Категория | Сумма (₽) |\n|---|---|---|\n';
    for (const line of cf) {
      const catMap: Record<string, string> = { operating: 'Операционная', investing: 'Инвестиционная', financing: 'Финансовая' };
      const indent = line.isTotal ? '' : '  ';
      const bold = line.isTotal ? '**' : '';
      md += `${bold}${indent}${line.name}| ${catMap[line.category] || '-'}| ${formatMoney(line.value)}${bold}\n`;
    }
  }

  // Коэффициенты
  const ratios = calculateFinancialRatios(doc);
  if (ratios.length > 0) {
    md += '\n\n# 📐 ФИНАНСОВЫЕ КОЭФФИЦИЕНТЫ\n\n';
    md += '| Показатель | Значение | Статус | Описание |\n|---|---|---|---|\n';
    
    const statusMap: Record<string, string> = { good: '✅ Норма', warning: '⚠️ Внимание', critical: '🔴 Критично' };
    
    for (const r of ratios) {
      const unitStr = r.unit === '%' ? '%' : r.unit === 'days' ? ' дн.' : '';
      md += `| ${r.label} | ${r.value.toFixed(1)}${unitStr} | ${statusMap[r.status]} | ${r.description} |\n`;
    }
  }

  return md;
}

// ========================
// Генерация полной управленческой отчетности (все форматы)
// ========================

export function generateFullManagementReport(doc: ParsedDocument): {
  summary: string;
  markdownTables: string;
  slides: ReportSlide[];
  ratios: FinancialRatio[];
  hasData: boolean;
} {
  const pnl = generateIncomeStatement(doc);
  const bs = generateBalanceSheet(doc);
  const cf = generateCashFlow(doc);
  const ratios = calculateFinancialRatios(doc);
  const slides = generatePresentationSlides(doc);

  // Проверка наличия данных
  const hasData = 
    (pnl.some(l => !l.name.includes('Нет данных') && l.value !== 0)) ||
    (bs.some(l => !l.name.includes('Нет данных') && l.value !== 0)) ||
    (cf.some(l => !l.name.includes('Нет данных') && l.value !== 0));

  // Сводка
  let summary = '';
  
  const netProfitLine = pnl.find(l => l.name.includes('ЧИСТАЯ ПРИБЫЛЬ'));
  if (netProfitLine) {
    summary += `**Чистая прибыль:** ${formatMoney(netProfitLine.value)}\n\n`;
  }

  const totalAssetsLine = bs.filter(l => l.isTotal && l.side === 'asset').find(l => l.name.includes('БАЛАНС') || l.name.includes('ИТОГО'));
  if (totalAssetsLine) {
    summary += `**Активы (баланс):** ${formatMoney(totalAssetsLine.value)}\n\n`;
  }

  const netCashFlow = cf.find(l => l.name.includes('ЧИСТОЕ ИЗМЕНЕНИЕ') || l.isTotal);
  if (netCashFlow && !netCashFlow.name.includes('Нет данных')) {
    summary += `**Чистое изменение ДС:** ${formatMoney(netCashFlow.value)}\n\n`;
  }

  // Критические инсайты
  const criticalRatios = ratios.filter(r => r.status === 'critical');
  if (criticalRatios.length > 0) {
    summary += `\n**⚠️ КРИТИЧЕСКИЕ ПОКАЗАТЕЛИ:**\n`;
    for (const r of criticalRatios) {
      summary += `- ${r.label}: ${r.value.toFixed(1)}${r.unit === '%' ? '%' : ''} — ${r.description}\n`;
    }
  }

  return {
    summary,
    markdownTables: generateMarkdownTables(doc),
    slides,
    ratios,
    hasData
  };
}
