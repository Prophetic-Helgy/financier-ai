/**
 * Мультивалютность (Фаза 3.3): пересчёт в базовую валюту и курсовые разницы.
 * Чистые функции — весь учётный расчёт проверяется без UI (test-fx.ts).
 *
 * Модель:
 *  - базовая валюта — RUB (рынок РФ, приложение офлайн-ориентированное);
 *  - FxRate.rate — сколько RUB за 1 единицу валюты (code);
 *  - курс на дату операции — последний сохранённый курс с датой ≤ даты
 *    операции (курсы ЦБ публикуются за рабочий день, даты операций — любые);
 *  - нет курса для валюты → пересчёт 1:1 с пометкой «нет курса» (UI подсказывает
 *    добавить курс), данные не «ломаются»;
 *  - курсовые разницы за месяц (для ДС): переоценка остатка валютного счёта
 *    на курс начала и конца месяца; = конец(в баз.) − начало(в баз.) − поток(в баз.).
 */
import type { FxRate, Transaction } from './schema';

export const BASE_CURRENCY = 'RUB';

/** Курс ЦБ РФ по конкретной дате (исторический, XML). Rate = RUB за 1 единицу */
export interface CbrRate {
  code: string;
  rate: number;
}

export function firstDayOfMonth(ym: string): string {
  return ym + '-01';
}

export function lastDayOfMonth(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  if (!y || !m) return ym + '-31';
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
}

/** 'YYYY-MM-DD' → предыдущий календарный день */
function prevDay(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  const t = new Date(y, m - 1, d - 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

/**
 * Курс на дату: последний сохранённый курс с date <= given (по возрастанию дат).
 * RUB — всегда 1. Нет ни одного курса → null.
 */
export function resolveRate(rates: FxRate[], code: string, date: string): { rate: number; date: string } | null {
  const c = (code || BASE_CURRENCY).toUpperCase();
  if (c === BASE_CURRENCY) return { rate: 1, date };
  let best: FxRate | null = null;
  for (const r of rates) {
    if ((r.code || '').toUpperCase() !== c) continue;
    if (!r.date || !(r.rate > 0)) continue;
    if (r.date <= date && (!best || r.date > best.date)) best = r;
  }
  return best ? { rate: best.rate, date: best.date } : null;
}

export interface ConvertedAmount {
  base: number;      // сумма в базовой валюте
  rate: number;      // использованный курс (1 при RUB / при отсутствии курса)
  rateDate: string | null; // дата курса (null — курса не нашлось)
  missing: boolean;  // true — для валюты нет ни одного курса
}

/** Пересчитать сумму в базовую валюту по курсу на дату операции */
export function toBase(amount: number, currency: string, date: string, rates: FxRate[]): ConvertedAmount {
  const resolved = resolveRate(rates, currency, date);
  if (!resolved) {
    return { base: amount, rate: 1, rateDate: null, missing: (currency || BASE_CURRENCY).toUpperCase() !== BASE_CURRENCY };
  }
  return { base: amount * resolved.rate, rate: resolved.rate, rateDate: resolved.date, missing: false };
}

/** Суммы в базовой валюте. ym ('YYYY-MM') — только за месяц; без ym — все операции */
export function totalsInBase(transactions: Transaction[], rates: FxRate[], ym?: string): { income: number; expense: number; net: number; missing: string[] } {
  let income = 0, expense = 0;
  const missing = new Set<string>();
  for (const t of transactions) {
    if (ym && (t.date || '').slice(0, 7) !== ym) continue;
    const c = toBase(t.amount, t.currency, t.date, rates);
    if (c.missing) missing.add((t.currency || BASE_CURRENCY).toUpperCase());
    if (t.type === 'income') income += c.base; else expense += c.base;
  }
  return { income, expense, net: income - expense, missing: [...missing].sort() };
}

/** Номинальная разбивка по валютам. ym — только за месяц; без ym — все операции */
export function currencyBreakdown(transactions: Transaction[], ym?: string): Array<{ currency: string; income: number; expense: number; net: number }> {
  const m = new Map<string, { income: number; expense: number }>();
  for (const t of transactions) {
    if (ym && (t.date || '').slice(0, 7) !== ym) continue;
    const cur = (t.currency || BASE_CURRENCY).toUpperCase();
    const cur2 = m.get(cur) || { income: 0, expense: 0 };
    if (t.type === 'income') cur2.income += t.amount; else cur2.expense += t.amount;
    m.set(cur, cur2);
  }
  return [...m.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([currency, v]) => ({ currency, income: v.income, expense: v.expense, net: v.income - v.expense }));
}

/**
 * Курсовые разницы месяца (переоценка валютных остатков):
 * по каждому счёту с валютными операциями:
 *   конец(в баз.) − начало(в баз.) − поток месяца (в баз., по курсам дат).
 * Нужны курсы и на дату «день перед началом месяца», и на конец месяца;
 * если для какой-то валюты их нет — разницу по ней не считаем (0).
 */
export function monthFxGainLoss(transactions: Transaction[], ym: string, rates: FxRate[]): number {
  const openDate = prevDay(firstDayOfMonth(ym));
  const closeDate = lastDayOfMonth(ym);

  if (rates.length === 0) return 0;

  // Балансы по паре (счёт, валюта): сальдо до месяца и поток месяца в базовой
  const before = new Map<string, number>();
  const monthNet = new Map<string, number>();
  const flowsBase = new Map<string, number>();
  const keys = new Set<string>();

  for (const t of transactions) {
    const cur = (t.currency || BASE_CURRENCY).toUpperCase();
    if (cur === BASE_CURRENCY) continue;
    const key = t.accountId + '|' + cur;
    keys.add(key);
    const signed = t.type === 'income' ? t.amount : -t.amount;
    if ((t.date || '').slice(0, 7) === ym) {
      monthNet.set(key, (monthNet.get(key) || 0) + signed);
      flowsBase.set(key, (flowsBase.get(key) || 0) + signed * toBase(t.amount, cur, t.date, rates).rate);
    } else {
      before.set(key, (before.get(key) || 0) + signed);
    }
  }

  let totalFx = 0;
  for (const key of keys) {
    const cur = key.slice(key.indexOf('|') + 1);
    const b = before.get(key) || 0;
    const net = monthNet.get(key) || 0;
    if (b === 0 && net === 0) continue;
    const rateOpen = resolveRate(rates, cur, openDate);
    const rateClose = resolveRate(rates, cur, closeDate);
    if (!rateOpen || !rateClose) continue; // нет курса — не переоцениваем
    totalFx += (b + net) * rateClose.rate - b * rateOpen.rate - (flowsBase.get(key) || 0);
  }
  return totalFx;
}

/**
 * Слияние курсов из внешнего источника (ЦБ) в хранилище:
 * те же code+date заменяются, новые добавляются; результат отсортирован.
 */
export function mergeExternalRates(existing: FxRate[], incoming: CbrRate[], date: string, makeId: () => string): FxRate[] {
  const m = new Map<string, FxRate>(existing.map(r => [`${(r.code || '').toUpperCase()}|${r.date}`, r]));
  for (const r of incoming) {
    const key = `${r.code.toUpperCase()}|${date}`;
    if (!Number.isFinite(r.rate) || r.rate <= 0) continue;
    const prev = m.get(key);
    m.set(key, prev
      ? { ...prev, rate: r.rate }
      : { id: makeId(), date, code: r.code.toUpperCase(), rate: r.rate });
  }
  return [...m.values()].sort((a, b) => (a.code + a.date).localeCompare(b.code + b.date));
}
