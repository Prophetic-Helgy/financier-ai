/**
 * Холдинг и консолидация (Фаза 4).
 * Чистые функции без доступа к файлам — UI и тесты используют их напрямую.
 *
 * Модель межфирменного учёма:
 *  - контрагент (Counterparty) может быть привязан к юрлицу группы (orgId);
 *  - операция, у которой контрагент — ЧУЖОЕ юрлицо группы, — межфирменная (intercompany).
 *
 * Консолидированный P&L группы:
 *  - внешние операции суммируются по всем юрлицам (в базовой валюте, курсы на дату операции);
 *  - межфирменные операции НЕ являются потоком группы и исключаются из итогов;
 *  - сопоставление пар: расход A (A→B) и доход B (A→B) с одинаковой датой,
 *    суммой и валютой считаются «погашенными» (elimination);
 *  - не попавшие в пару межфирменные операции — unmatched (флаг: книги не сходится).
 *
 * Инвариант (балансовые книги): при unmatched = 0
 *   group.net === Σ net по юрлицам — консолидированный результат совпадает с суммой.
 * При unmatched > 0 расхождение — сигнал, что одна из сторон не провела операцию.
 */
import type { LedgerStore, Transaction } from './schema';
import { toBase } from './fx';

/** Допуск при сравнении сумм пар (разные источники парсинга, копеецкие остатки) */
const AMOUNT_EPS = 0.005;

/**
 * Юрлицо группы, к которому привязан контрагент операции.
 * null — если контрагент не связан с группой или это собственное юрлицо операции.
 */
export function intercompanyOrgId(store: LedgerStore, tx: Transaction): string | null {
  if (!tx || !tx.counterpartyId) return null;
  const cp = (store.counterparties ?? []).find(c => c && c.id === tx.counterpartyId);
  if (!cp || !cp.orgId) return null;
  const org = (store.organizations ?? []).find(o => o && o.id === cp.orgId);
  if (!org || org.id === tx.orgId) return null;
  return org.id;
}

/** Операция — межфирменная (контрагент — чужое юрлицо собственной группы) */
export function isIntercompanyTx(store: LedgerStore, tx: Transaction): boolean {
  return intercompanyOrgId(store, tx) !== null;
}

/** Строка P&L по юрлицу (все суммы — в базовой валюте) */
export interface OrgPnlRow {
  orgId: string;
  orgName: string;
  income: number;
  expense: number;
  net: number;
  /** Межфирменные части (внутри income/expense) — для наглядности */
  icIncome: number;
  icExpense: number;
}

/** Консолидированный отчёт по группе */
export interface GroupPnl {
  /** Строки по юрлицам (в порядке store.organizations) */
  rows: OrgPnlRow[];
  /** Итог группы ПОСЛЕ элиминирования межфирменных операций */
  group: { income: number; expense: number; net: number };
  /** Сопоставленные пары (A→B: расход + встречный доход) */
  eliminated: { pairs: number; amount: number };
  /** Межфирменные операции без встречной записи */
  unmatched: { count: number; amount: number };
}

interface IcTx {
  tx: Transaction;
  /** Направление денежного потока: fromOrg → toOrg (у расхода — orgId → контрагент,
   *  у дохода — контрагент → orgId) */
  fromOrg: string;
  toOrg: string;
}

/**
 * Консолидированный P&L. ym ('YYYY-MM') — только за месяц; без ym — все операции.
 */
export function groupPnl(store: LedgerStore, ym?: string): GroupPnl {
  const rates = store.fxRates ?? [];
  const orgs = store.organizations ?? [];
  const cps = store.counterparties ?? [];
  const orgName = (id: string) => orgs.find(o => o.id === id)?.name ?? '(юрлицо удалено)';

  const rows: OrgPnlRow[] = [];
  const rowByOrg = new Map<string, OrgPnlRow>();
  const ensureRow = (orgId: string): OrgPnlRow => {
    let r = rowByOrg.get(orgId);
    if (!r) {
      r = { orgId, orgName: orgName(orgId), income: 0, expense: 0, net: 0, icIncome: 0, icExpense: 0 };
      rowByOrg.set(orgId, r);
      rows.push(r);
    }
    return r;
  };

  let gIncome = 0, gExpense = 0;
  const icExpense: IcTx[] = [];
  const icIncome: IcTx[] = [];

  for (const t of store.transactions ?? []) {
    if (!t) continue;
    if (ym && (t.date || '').slice(0, 7) !== ym) continue;
    const row = ensureRow(t.orgId);
    const base = toBase(t.amount, t.currency, t.date, rates).base;
    if (t.type === 'income') row.income += base; else row.expense += base;

    const cp = cps.find(c => c && c.id === t.counterpartyId);
    const toOrg = cp?.orgId && orgs.some(o => o.id === cp.orgId) && cp.orgId !== t.orgId ? cp.orgId : null;
    if (!toOrg) {
      // внешняя операция — в итог группы
      if (t.type === 'income') gIncome += base; else gExpense += base;
      continue;
    }
    // межфирменная: из итога группы исключается
    if (t.type === 'income') {
      row.icIncome += base;
      icIncome.push({ tx: t, fromOrg: toOrg, toOrg: t.orgId });
    } else {
      row.icExpense += base;
      icExpense.push({ tx: t, fromOrg: t.orgId, toOrg });
    }
  }

  // Сопоставление пар по ключу «направление | дата | сумма | валюта».
  // Ключ строится так, чтобы расход A→B и доход A→B давали ОДИН ключ.
  const pairKey = (from: string, to: string, t: Transaction) =>
    `${from}|${to}|${t.date}|${Math.round((t.amount || 0) * 100) / 100}|${(t.currency || 'RUB').toUpperCase()}`;
  const pairs = new Map<string, { exp: number; inc: number; base: number }>();
  const bump = (key: string, side: 'exp' | 'inc', base: number) => {
    const p = pairs.get(key) ?? { exp: 0, inc: 0, base };
    p[side] += 1;
    pairs.set(key, p);
  };
  for (const e of icExpense) bump(pairKey(e.fromOrg, e.toOrg, e.tx), 'exp', toBase(e.tx.amount, e.tx.currency, e.tx.date, rates).base);
  for (const i of icIncome) bump(pairKey(i.fromOrg, i.toOrg, i.tx), 'inc', toBase(i.tx.amount, i.tx.currency, i.tx.date, rates).base);

  let eliminatedPairs = 0, eliminatedAmount = 0, unmatchedCount = 0, unmatchedAmount = 0;
  for (const p of pairs.values()) {
    const paired = Math.min(p.exp, p.inc);
    const left = p.exp + p.inc - paired * 2;
    eliminatedPairs += paired;
    eliminatedAmount += paired * p.base;
    unmatchedCount += left;
    unmatchedAmount += left * p.base;
  }

  for (const r of rows) r.net = r.income - r.expense;
  // Порядок строк — порядок организаций в хранилище
  rows.sort((a, b) => orgs.findIndex(o => o.id === a.orgId) - orgs.findIndex(o => o.id === b.orgId));

  return {
    rows,
    group: { income: gIncome, expense: gExpense, net: gIncome - gExpense },
    eliminated: { pairs: eliminatedPairs, amount: eliminatedAmount },
    unmatched: { count: unmatchedCount, amount: unmatchedAmount },
  };
}

/**
 * Потомки организации в дереве parentId (все вложенные уровни).
 * Циклобезопасно: на visited-множестве, битое дерево не зацикливает.
 */
export function orgDescendants(store: LedgerStore, orgId: string): string[] {
  const orgs = store.organizations ?? [];
  const out: string[] = [];
  const seen = new Set<string>([orgId]);
  const stack = [orgId];
  while (stack.length) {
    const cur = stack.pop()!;
    for (const o of orgs) {
      if (o && o.parentId === cur && !seen.has(o.id)) {
        seen.add(o.id);
        out.push(o.id);
        stack.push(o.id);
      }
    }
  }
  return out;
}

/** Варианты родителя для выпадающего списка (все, кроме самого и его потомков) */
export function orgParentOptions(store: LedgerStore, orgId: string): string[] {
  const self = new Set([orgId, ...orgDescendants(store, orgId)]);
  return (store.organizations ?? []).filter(o => o && !self.has(o.id)).map(o => o.id);
}

/**
 * Гвард удаления организации: нельзя удалить головную (isDefault)
 * и организацию со счётами/операциями.
 */
export function canDeleteOrg(store: LedgerStore, orgId: string): { ok: boolean; reason?: string } {
  const org = (store.organizations ?? []).find(o => o && o.id === orgId);
  if (!org) return { ok: false, reason: 'Организация не найдена' };
  if (org.isDefault) return { ok: false, reason: 'Основную организацию удалить нельзя' };
  if ((store.accounts ?? []).some(a => a && a.orgId === orgId)) return { ok: false, reason: 'У организации есть счета' };
  if ((store.transactions ?? []).some(t => t && t.orgId === orgId)) return { ok: false, reason: 'У организации есть операции' };
  return { ok: true };
}

/**
 * Проверка «сходится ли группа»: unmatched = 0 и расхождение
 * group.net и Σ net юрлиц в пределах допуска (балансовые книги).
 */
export function consolidationBalanced(store: LedgerStore, ym?: string): { ok: boolean; diff: number } {
  const g = groupPnl(store, ym);
  const sumNet = g.rows.reduce((s, r) => s + r.net, 0);
  const diff = Math.abs(g.group.net - sumNet);
  return { ok: g.unmatched.count === 0 && diff < AMOUNT_EPS, diff };
}
