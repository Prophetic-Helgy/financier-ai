/**
 * Бюджеты и план-факт (Фаза 3.4, M3).
 * Чистые функции над хранимыми данными — тестируются без UI (test-budgets.ts).
 * Бюджет (BudgetGoal) — месячный лимит по категории, действует на каждый месяц;
 * план-факт считается по выбранному месяцу. Прогноз — по темпу первых дней.
 */
import type { BudgetGoal, Transaction } from './schema';

export interface BudgetLine {
  category: string;
  limit: number;
  actual: number;
  remaining: number;
  pct: number; // actual / limit (0, если limit = 0)
}

export interface MonthBudgetSummary {
  ym: string;
  lines: BudgetLine[];
  unbudgeted: number; // расходы без бюджета
  totalLimit: number;
  totalActual: number; // ВСЕ расходы месяца (с бюджетами и без)
}

/** 'YYYY-MM' → число дней в месяце */
export function daysInMonth(ym: string): number {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return 30;
  return new Date(y, m, 0).getDate();
}

/** Текущий месяц 'YYYY-MM' */
export function currentYM(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * План-факт за месяц: actual = сумма расходов категории в этом месяце.
 * Категории без бюджета попадают в unbudgeted.
 */
export function budgetSummary(
  data: { budgets: BudgetGoal[]; transactions: Transaction[] },
  ym: string,
): MonthBudgetSummary {
  const byCategory = new Map<string, number>();
  let totalActual = 0;
  for (const t of data.transactions) {
    if (t.type !== 'expense' || (t.date || '').slice(0, 7) !== ym) continue;
    totalActual += t.amount;
    byCategory.set(t.category, (byCategory.get(t.category) || 0) + t.amount);
  }
  const lines: BudgetLine[] = data.budgets.map(b => {
    const actual = byCategory.get(b.category) || 0;
    return {
      category: b.category,
      limit: b.monthlyLimit,
      actual,
      remaining: b.monthlyLimit - actual,
      pct: b.monthlyLimit > 0 ? actual / b.monthlyLimit : 0,
    };
  });
  const budgetedCats = new Set(data.budgets.map(b => b.category));
  let unbudgeted = 0;
  for (const [cat, sum] of byCategory) if (!budgetedCats.has(cat)) unbudgeted += sum;
  return {
    ym,
    lines,
    unbudgeted,
    totalLimit: lines.reduce((s, l) => s + l.limit, 0),
    totalActual,
  };
}

export interface MonthForecast {
  spent: number;
  daysElapsed: number;
  daysInMonth: number;
  pacePerDay: number; // spent / daysElapsed
  projectedTotal: number; // «к концу месяца при текущем темпе»
}

/**
 * Прогноз месяца по темпу первых дней (только расходы, даты ≤ asOfDay).
 * asOfDay — сколько дней месяца прошло (0 — данных нет, daysInMonth — месяц закрыт).
 */
export function monthForecast(
  transactions: Transaction[],
  ym: string,
  asOfDay: number,
): MonthForecast {
  const dim = daysInMonth(ym);
  const elapsed = Math.max(0, Math.min(asOfDay, dim));
  let spent = 0;
  for (const t of transactions) {
    if (t.type !== 'expense' || (t.date || '').slice(0, 7) !== ym) continue;
    const day = parseInt((t.date || '').slice(8, 10), 10);
    if (!Number.isFinite(day) || day > elapsed) continue;
    spent += t.amount;
  }
  const pace = elapsed > 0 ? spent / elapsed : 0;
  return { spent, daysElapsed: elapsed, daysInMonth: dim, pacePerDay: pace, projectedTotal: pace * dim };
}
