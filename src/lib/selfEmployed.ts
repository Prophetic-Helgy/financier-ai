/**
 * Аналитика для самозанятых и ИП (переходная форма между физлицом и МСБ)
 */

import { ParsedDocument } from './parsers/bankParsers';

export type SelfEmployedProfile = 'selfemployed' | 'ip';

export interface SEAnalyticsItem {
  title: string;
  data: Record<string, string | number>;
}

export function generateSelfEmployedAnalytics(doc: ParsedDocument): SEAnalyticsItem[] {
  const transactions = doc.transactions || [];
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);
  const totalExpense = transactions.filter(t => t.type === 'expense').reduce((s, t) => s + (t.amount || 0), 0);
  const netIncome = totalIncome - totalExpense;

  // Категоризация расходов
  const categories: Record<string, number> = {};
  for (const t of transactions.filter(t => t.type === 'expense')) {
    const cat = t.purpose || 'Прочее';
    categories[cat] = (categories[cat] || 0) + (t.amount || 0);
  }

  // Категоризация доходов
  const incomeCategories: Record<string, number> = {};
  for (const t of transactions.filter(t => t.type === 'income')) {
    const cat = t.payer || 'Прочий';
    incomeCategories[cat] = (incomeCategories[cat] || 0) + (t.amount || 0);
  }

  return [
    {
      title: 'Финансовый обзор',
      data: {
        'Общий доход': totalIncome,
        'Общие расходы': totalExpense,
        'Чистый доход': netIncome,
        'Транзакций обработано': transactions.length,
        'Средний чек дохода': totalIncome / Math.max(1, transactions.filter(t => t.type === 'income').length),
        'Налоговая нагрузка (4%/6%)': netIncome > 0 ? fmt(netIncome * 0.04) + ' - ' + fmt(netIncome * 0.06) : '0.00',
      }
    },
    {
      title: 'Структура доходов по источникам',
      data: Object.fromEntries(
        Object.entries(incomeCategories).map(([k, v]) => [k, fmt(v)])
      ) as Record<string, string | number>
    },
    {
      title: 'Структура расходов по категориям',
      data: Object.fromEntries(
        Object.entries(categories).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, fmt(v)])
      ) as Record<string, string | number>
    },
    {
      title: 'Рекомендации по налогообложению',
      data: {
        'НПД (самозанятый) до 2.4 млн/год': netIncome * 12 <= 2400000 ? 'Подходит' : 'Превышен лимит',
        'НДФЛ 13% + страховые': 'Рассмотрите при доходе > 2.4 млн/год',
        'Патент (ИП)': 'Доступен для отдельных видов деятельности',
        'ОСНО с НДС': 'При необходимости выставления счетов с НДС',
      }
    },
    {
      title: 'Ключевые показатели',
      data: {
        'Доход в месяц (средний)': totalIncome / Math.max(1, transactions.length / 30),
        'Маржинальность': totalIncome > 0 ? ((netIncome / totalIncome) * 100).toFixed(1) + '%' : '0.0%',
        'Коэффициент расходов': totalIncome > 0 ? (totalExpense / totalIncome).toFixed(2) : '0.00',
      }
    },
  ];
}

export function generateIPAnalytics(doc: ParsedDocument): SEAnalyticsItem[] {
  const analytics = generateSelfEmployedAnalytics(doc);
  
  // Дополнительные метрики для ИП
  const transactions = doc.transactions || [];
  const totalIncome = transactions.filter(t => t.type === 'income').reduce((s, t) => s + (t.amount || 0), 0);

  analytics.push({
    title: 'Режим налогообложения ИП',
    data: {
      'УСН Доходы 6%': fmt(totalIncome * 0.06),
      'УСН Доходы-Расходы 15%': 'Требуется детализация расходов',
      'Страховые взносы (фикс.) ~49 500 ₽/год': 'Можно уменьшить налог',
      'НПД (до 2.4 млн)': totalIncome <= 2400000 ? 'Возможно' : 'Превышен лимит',
    }
  });

  analytics.push({
    title: 'Обязательные отчеты ИП',
    data: {
      'Декларация УСН (31 января)': 'Ежегодно',
      'Книга учета (КУДиР)': 'При УСН Доходы-Расходы',
      'Расчет по страховым (при работниках)': 'Квартально',
      'Банковские операции': 'Все транзакции',
    }
  });

  return analytics;
}

function fmt(n: number): string { return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
