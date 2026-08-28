/**
 * Периоды (Фаза 3.5): закрытие месяцев, MTD/YTD, корректирующие записи.
 * Чистые функции над хранилищем — без побочных эффектов, тестируемы в tsx.
 */
import { LedgerStore, Period, Transaction, FxRate, createId } from './schema';
import { toBase, BASE_CURRENCY } from './fx';

/** 'YYYY-MM-DD' → 'YYYY-MM' (период, которому принадлежит операция) */
export function ymOf(date: string): string {
  return (date || '').slice(0, 7);
}

/** Множество закрытых месяцев ('YYYY-MM' → true) */
export function closedYMSet(store: LedgerStore): Set<string> {
  const s = new Set<string>();
  for (const p of store.periods) {
    if (p.closedAt && /^\d{4}-\d{2}$/.test(p.name)) s.add(p.name);
  }
  return s;
}

export function isPeriodClosed(store: LedgerStore, ym: string): boolean {
  return closedYMSet(store).has(ym);
}

/**
 * Новое состояние списка периодов после закрытия/открытия месяца
 * (upsert по имени; «открыть» = удалить запись). now — ISO-время закрытия.
 */
export function nextPeriods(periods: Period[], orgId: string, ym: string, closed: boolean, now: string): Period[] {
  const rest = periods.filter(p => p.name !== ym);
  if (!closed) return rest;
  return [...rest, { id: createId(), orgId, name: ym, closedAt: now }];
}

/** Строка месяца для UI: итоги в базовой валюте + статус закрытия */
export interface PeriodRow {
  ym: string;
  closed: boolean;
  closedAt: string | null;
  income: number;
  expense: number;
  net: number;
  count: number;
  corrections: number;
}

/** Месяцы = объединение месяцев с операциями и закрытых периодов, свежие сверху */
export function periodRows(store: LedgerStore, limit = 12): PeriodRow[] {
  const closed = closedYMSet(store);
  const closedAt = new Map<string, string>();
  for (const p of store.periods) if (p.closedAt && p.name) closedAt.set(p.name, p.closedAt);
  const m = new Map<string, PeriodRow>();
  const ensure = (ym: string): PeriodRow => {
    let r = m.get(ym);
    if (!r) {
      r = {
        ym, closed: closed.has(ym), closedAt: closedAt.get(ym) || null,
        income: 0, expense: 0, net: 0, count: 0, corrections: 0,
      };
      m.set(ym, r);
    }
    return r;
  };
  for (const ym of closed) ensure(ym);
  for (const t of store.transactions) {
    const ym = ymOf(t.date);
    if (!/^\d{4}-\d{2}$/.test(ym)) continue;
    const r = ensure(ym);
    const base = toBase(t.amount, t.currency, t.date, store.fxRates).base;
    if (t.type === 'income') r.income += base; else r.expense += base;
    r.net = r.income - r.expense;
    r.count++;
    if (t.correction) r.corrections++;
  }
  return [...m.values()].sort((a, b) => b.ym.localeCompare(a.ym)).slice(0, limit);
}

// ============================================================
// Корректирующие записи: единственный способ изменить закрытый период
// ============================================================

export interface CorrectionInput {
  date: string;      // 'YYYY-MM-DD', обязана попасть в закрытый месяц
  type: 'income' | 'expense';
  amount: number;
  currency: string;  // валюта счёта назначения
  accountId: string;
  orgId: string;
  category: string;
  purpose: string;   // комментарий; сохраняется как «Корректировка: …»
}

/** Создать корректирующую операцию (дата — в прошлый, закрытый период) */
export function makeCorrection(i: CorrectionInput, now: string): Transaction {
  return {
    id: createId(),
    orgId: i.orgId,
    accountId: i.accountId,
    date: i.date,
    amount: Math.abs(i.amount),
    currency: i.currency || BASE_CURRENCY,
    type: i.type,
    counterpartyId: '',
    category: i.category,
    purpose: i.purpose ? `Корректировка: ${i.purpose}` : 'Корректировка',
    source: 'manual',
    importedAt: now,
    correction: true,
  };
}

// ============================================================
// MTD / YTD: сравнение с тем же периодом прошлого месяца / года
// ============================================================

export interface PeriodTotals { income: number; expense: number; net: number }

export interface MtdYtd {
  ym: string;           // текущий месяц
  mtd: PeriodTotals;        // текущий месяц, до сегодняшнего дня включительно
  mtdPrev: PeriodTotals;    // предыдущий месяц, те же числа (1..D)
  ytd: PeriodTotals;        // с начала года до сегодняшнего дня
  ytdPrev: PeriodTotals;    // тот же отрезок прошлого года (01.01..прошлый месяц, D)
  mtdDeltaPct: number | null; // % к net прошлого периода (null — базовый период пуст)
  ytdDeltaPct: number | null;
}

function sumRange(transactions: Transaction[], rates: FxRate[], from: string, to: string): PeriodTotals {
  const t: PeriodTotals = { income: 0, expense: 0, net: 0 };
  for (const tx of transactions) {
    if (tx.date < from || tx.date > to) continue;
    const base = toBase(tx.amount, tx.currency, tx.date, rates).base;
    if (tx.type === 'income') t.income += base; else t.expense += base;
  }
  t.net = t.income - t.expense;
  return t;
}

function prevMonthYM(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function pct(cur: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((cur - prev) / Math.abs(prev)) * 100;
}

/** MTD/YTD в базовой валюте; today — 'YYYY-MM-DD' */
export function mtdYtd(transactions: Transaction[], rates: FxRate[], today: string): MtdYtd {
  const ym = today.slice(0, 7);
  const day = today.slice(8, 10);
  const prevYM = prevMonthYM(ym);
  const prevYear = String(Number(ym.slice(0, 4)) - 1);
  const mtd = sumRange(transactions, rates, `${ym}-01`, today);
  // если в прошлом месяце дней меньше (напр. 31 → февраль), конец диапазона
  // просто не существует — покрывается весь месяц
  const mtdPrev = sumRange(transactions, rates, `${prevYM}-01`, `${prevYM}-${day}`);
  const ytd = sumRange(transactions, rates, `${ym.slice(0, 4)}-01-01`, today);
  const ytdPrev = sumRange(transactions, rates, `${prevYear}-01-01`, `${prevYear}-${ym.slice(5)}-${day}`);
  return {
    ym, mtd, mtdPrev, ytd, ytdPrev,
    mtdDeltaPct: pct(mtd.net, mtdPrev.net),
    ytdDeltaPct: pct(ytd.net, ytdPrev.net),
  };
}
