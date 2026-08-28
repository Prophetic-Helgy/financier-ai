import React, { useMemo, useState } from 'react';
import { Landmark, FileDown, FileUp, RotateCcw, Target, Trash2, Coins, Wallet } from 'lucide-react';
import { LedgerStore, BudgetGoal, Account, FxRate, createId } from '../lib/store/schema';
import { budgetSummary, monthForecast, currentYM, daysInMonth } from '../lib/store/budgets';
import {
  totalsInBase, currencyBreakdown, monthFxGainLoss, toBase,
  mergeExternalRates, BASE_CURRENCY, CbrRate,
} from '../lib/store/fx';
import { cn } from '../lib/utils';

interface LedgerViewProps {
  store: LedgerStore;
  busy: boolean;
  onExportBackup: () => void;
  onRestoreFile: () => void;
  onRestoreLatestBackup: () => void;
  onBudgetsChange: (budgets: BudgetGoal[]) => void;
  onAccountsChange: (accounts: Account[]) => void;
  onFxRatesChange: (rates: FxRate[]) => void;
}

const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'CNY', 'KZT', 'BYN', 'AMD', 'AZN', 'UZS', 'PLN', 'TRY'];
const ACCOUNT_KINDS: Array<{ value: Account['kind']; label: string }> = [
  { value: 'bank', label: 'Банк' },
  { value: 'card', label: 'Карта' },
  { value: 'cash', label: 'Наличные' },
  { value: 'other', label: 'Другое' },
];

function kindLabel(k: string): string {
  return ACCOUNT_KINDS.find(x => x.value === k)?.label || k;
}

const MONTHS_RU = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

function monthLabel(ym: string): string {
  const [y, m] = ym.split('-');
  const idx = parseInt(m, 10) - 1;
  return `${MONTHS_RU[idx] || m} ${y}`;
}

function fmt(v: number): string {
  return v.toLocaleString('ru-RU', { maximumFractionDigits: 2 });
}

function StatCard({ label, value, tone, sub }: { label: string; value: string; tone?: 'emerald' | 'rose'; sub?: string }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</div>
      <div className={cn(
        "font-mono font-medium text-lg",
        tone === 'emerald' ? 'text-emerald-500' : tone === 'rose' ? 'text-rose-500' : 'text-[var(--fg)]'
      )}>{value}</div>
      {sub && <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{sub}</div>}
    </div>
  );
}

/**
 * Вкладка «Учёт»: что сохранено в хранилище (переживает перезапуск),
 * итоги, разбивка по месяцам, журнал операций, бэкапы.
 */
export function LedgerView({ store, busy, onExportBackup, onRestoreFile, onRestoreLatestBackup, onBudgetsChange, onAccountsChange, onFxRatesChange }: LedgerViewProps) {
  // Фаза 3.3: итоги — в базовой валюте (RUB), валютные операции по курсу на дату
  const stats = useMemo(() => {
    const base = totalsInBase(store.transactions, store.fxRates);
    return {
      ...base,
      balance: base.net,
      count: store.transactions.length,
      // подписка «в т.ч. X USD …» — только для не-базовых валют
      sub: currencyBreakdown(store.transactions)
        .filter(c => c.currency !== BASE_CURRENCY)
        .map(c => `${fmt(c.net)} ${c.currency}`)
        .join(' · ') || undefined,
    };
  }, [store.transactions, store.fxRates]);

  const cpName = useMemo(() => new Map(store.counterparties.map(c => [c.id, c.name])), [store.counterparties]);

  const txSorted = useMemo(
    () => [...store.transactions]
      .sort((a, b) => (b.date + b.importedAt).localeCompare(a.date + a.importedAt))
      .slice(0, 200),
    [store.transactions]
  );

  const byMonth = useMemo(() => {
    const m = new Map<string, { income: number; expense: number }>();
    for (const t of store.transactions) {
      const key = (t.date || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const cur = m.get(key) || { income: 0, expense: 0 };
      const base = toBase(t.amount, t.currency, t.date, store.fxRates).base;
      if (t.type === 'income') cur.income += base; else cur.expense += base;
      m.set(key, cur);
    }
    // курсовые разницы месяца (переоценка валютных остатков) — только если есть валютные операции
    const hasForeign = store.transactions.some(t => (t.currency || BASE_CURRENCY).toUpperCase() !== BASE_CURRENCY);
    return [...m.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([ym, v]) => [ym, { ...v, fx: hasForeign ? monthFxGainLoss(store.transactions, ym, store.fxRates) : 0 }] as const);
  }, [store.transactions, store.fxRates]);

  const backupBtn = "flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--fg)] transition-colors disabled:opacity-50";

  // Фаза 3.4: бюджеты и план-факт
  const curYM = currentYM();
  const [budgetYM, setBudgetYM] = useState(curYM);
  const [bCat, setBCat] = useState('');
  const [bLimit, setBLimit] = useState('');
  const [whatIf, setWhatIf] = useState(0);

  const ymOptions = useMemo(() => {
    const set = new Set<string>([curYM]);
    for (const t of store.transactions) {
      const ym = (t.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [store.transactions, curYM]);

  const summary = useMemo(() => budgetSummary(store, budgetYM), [store, budgetYM]);

  const isCurrentYM = budgetYM === curYM;
  const asOfDay = isCurrentYM ? new Date().getDate() : budgetYM < curYM ? daysInMonth(budgetYM) : 0;
  const forecast = useMemo(() => monthForecast(store.transactions, budgetYM, asOfDay), [store.transactions, budgetYM, asOfDay]);

  const orgId = store.organizations[0]?.id || '';
  const addBudget = () => {
    const category = bCat.trim();
    const limit = Number(bLimit.replace(',', '.'));
    if (!category || !Number.isFinite(limit) || limit < 0) return;
    onBudgetsChange([
      ...store.budgets.filter(b => b.category.toLowerCase() !== category.toLowerCase()),
      { id: createId(), orgId, category, monthlyLimit: limit, currency: 'RUB' },
    ]);
    setBCat('');
    setBLimit('');
  };
  const removeBudget = (category: string) => {
    onBudgetsChange(store.budgets.filter(b => b.category.toLowerCase() !== category.toLowerCase()));
  };
  // Сколько можно тратить в день, чтобы уложиться в суммарный бюджет
  const dailyAllowance = isCurrentYM && summary.totalLimit > 0
    ? (summary.totalLimit - forecast.spent) / Math.max(1, forecast.daysInMonth - forecast.daysElapsed + 1)
    : null;
  const whatIfProjected = forecast.projectedTotal * (1 + whatIf / 100);

  // Фаза 3.3: счета (валюта) и курсы валют
  const [accName, setAccName] = useState('');
  const [accKind, setAccKind] = useState<Account['kind']>('bank');
  const [accCur, setAccCur] = useState('RUB');

  const accTxCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of store.transactions) m.set(t.accountId, (m.get(t.accountId) || 0) + 1);
    return m;
  }, [store.transactions]);

  const addAccount = () => {
    const name = accName.trim();
    const currency = accCur.trim().toUpperCase() || 'RUB';
    if (!name) return;
    onAccountsChange([...store.accounts, {
      id: createId(), orgId, name, kind: accKind, currency, createdAt: new Date().toISOString(),
    }]);
    setAccName('');
    setAccCur('RUB');
  };
  const removeAccount = (id: string) => {
    onAccountsChange(store.accounts.filter(a => a.id !== id));
  };

  const [fxCode, setFxCode] = useState('');
  const [fxDate, setFxDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fxRate, setFxRate] = useState('');
  const [cbrDate, setCbrDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [cbrBusy, setCbrBusy] = useState(false);
  const [cbrMsg, setCbrMsg] = useState<string | null>(null);

  const addRate = () => {
    const code = fxCode.trim().toUpperCase();
    const rate = Number(fxRate.replace(',', '.'));
    if (!code || code === BASE_CURRENCY || !/^\d{4}-\d{2}-\d{2}$/.test(fxDate) || !Number.isFinite(rate) || rate <= 0) return;
    const existing = store.fxRates.find(r => (r.code || '').toUpperCase() === code && r.date === fxDate);
    const next = existing
      ? store.fxRates.map(r => r.id === existing.id ? { ...r, rate } : r)
      : [...store.fxRates, { id: createId(), date: fxDate, code, rate }];
    onFxRatesChange(next);
    setFxCode(''); setFxRate('');
  };
  const removeRate = (id: string) => {
    onFxRatesChange(store.fxRates.filter(r => r.id !== id));
  };

  // Курсы ЦБ РФ на дату (исторический XML-справочник) через main-процесс
  // (у cbr.ru нет CORS для рендерера — см. electron/main.cjs fx:cbr).
  // Офлайн/браузер-режим — ручной ввод курса ниже.
  const fetchCbrRates = async () => {
    setCbrBusy(true);
    setCbrMsg(null);
    const api = window.electronAPI?.fetchCbrRates;
    if (!api) {
      setCbrMsg('Загрузка с ЦБ доступна в desktop-версии (Electron) — добавьте курс вручную');
      setCbrBusy(false);
      return;
    }
    try {
      const res = await api(cbrDate);
      if (res && 'error' in res && res.error) throw new Error(res.error);
      const rates: CbrRate[] = (res as { rates?: CbrRate[] }).rates || [];
      if (rates.length === 0) throw new Error('в ответе ЦБ нет валют');
      onFxRatesChange(mergeExternalRates(store.fxRates, rates, cbrDate, createId));
      setCbrMsg(`ЦБ: загружено ${rates.length} валют на ${cbrDate}`);
    } catch (e: any) {
      setCbrMsg('Не удалось загрузить с ЦБ' + (e?.message ? ': ' + e.message : '') + ' — добавьте курс вручную');
    } finally {
      setCbrBusy(false);
    }
  };

  const showFxSection = store.fxRates.length > 0
    || store.transactions.some(t => (t.currency || BASE_CURRENCY).toUpperCase() !== BASE_CURRENCY)
    || store.accounts.some(a => (a.currency || 'RUB').toUpperCase() !== BASE_CURRENCY);
  const ratesSorted = useMemo(
    () => [...store.fxRates].sort((a, b) => (b.date + b.code).localeCompare(a.date + a.code)).slice(0, 50),
    [store.fxRates]
  );

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-semibold text-[var(--fg)]">Учёт</h2>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Данные хранятся локально (файл в userData) и сохраняются между запусками.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onExportBackup} disabled={busy} className={backupBtn} title="Сохранить копию данных в выбранный файл">
              <FileDown className="w-3.5 h-3.5" /> Экспорт бэкапа
            </button>
            <button onClick={onRestoreFile} disabled={busy} className={backupBtn} title="Заменить данные файлом бэкапа">
              <FileUp className="w-3.5 h-3.5" /> Из файла
            </button>
            <button onClick={onRestoreLatestBackup} disabled={busy} className={backupBtn} title="Восстановить последний автоматический бэкап">
              <RotateCcw className="w-3.5 h-3.5" /> Авто-бэкап
            </button>
          </div>
        </div>

        {/* Stats (Фаза 3.3: в базовой валюте, валютные операции по курсу на дату) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <StatCard label="Операций" value={String(stats.count)} />
          <StatCard label="Доходы" value={'+' + fmt(stats.income) + ' ₽'} tone="emerald" sub={stats.sub} />
          <StatCard label="Расходы" value={'-' + fmt(stats.expense) + ' ₽'} tone="rose" sub={stats.sub} />
          <StatCard label="Баланс" value={fmt(stats.balance) + ' ₽'} tone={stats.balance >= 0 ? 'emerald' : 'rose'} sub={stats.sub} />
        </div>
        {stats.missing.length > 0 && (
          <div className="mb-4 text-[11px] text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
            Нет курсов для валют: {stats.missing.join(', ')} — суммы этих операций показаны 1:1.
            Добавьте курсы в разделе «Курсы валют» ниже.
          </div>
        )}

        {/* Счета (Фаза 3.3): валюта операций = валюта счёта */}
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
            <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Счета
            </h3>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex flex-wrap gap-2">
              {store.accounts.map(a => {
                const n = accTxCount.get(a.id) || 0;
                return (
                  <div key={a.id} className="flex items-center gap-2 bg-[var(--surface-inner)] rounded-lg px-3 py-1.5">
                    <span className="text-xs text-[var(--fg)]">{a.name}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{kindLabel(a.kind)}</span>
                    <span className={cn(
                      "text-[10px] font-mono px-1.5 py-0.5 rounded",
                      (a.currency || 'RUB').toUpperCase() === BASE_CURRENCY
                        ? 'bg-[var(--surface)] text-[var(--text-muted)]'
                        : 'bg-indigo-500/15 text-indigo-400'
                    )}>{(a.currency || 'RUB').toUpperCase()}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{n} оп.</span>
                    <button
                      onClick={() => removeAccount(a.id)}
                      disabled={n > 0 || store.accounts.length <= 1}
                      title={n > 0 ? `Нельзя удалить: ${n} операций` : 'Удалить счёт'}
                      className="p-0.5 text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                value={accName}
                onChange={e => setAccName(e.target.value)}
                placeholder="Название счёта (например: Долларовая карта)"
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2.5 py-1.5 w-56"
              />
              <select
                value={accKind}
                onChange={e => setAccKind(e.target.value as Account['kind'])}
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1.5"
              >
                {ACCOUNT_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
              </select>
              <input
                list="ledger-currencies"
                value={accCur}
                onChange={e => setAccCur(e.target.value)}
                placeholder="Валюта (ISO)"
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs font-mono text-[var(--fg)] px-2.5 py-1.5 w-28 uppercase"
              />
              <datalist id="ledger-currencies">
                {COMMON_CURRENCIES.map(c => <option key={c} value={c} />)}
              </datalist>
              <button
                onClick={addAccount}
                disabled={!accName.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
              >
                Добавить счёт
              </button>
              <span className="text-[10px] text-[var(--text-muted)]">
                импортированные операции получают валюту счёта-назначения (выбор в панели импорта)
              </span>
            </div>
          </div>
        </div>

        {/* Курсы валют (Фаза 3.3) */}
        {showFxSection && (
          <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
                <Coins className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Курсы валют (в {BASE_CURRENCY})
              </h3>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  value={cbrDate}
                  onChange={e => setCbrDate(e.target.value)}
                  className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1"
                />
                <button
                  onClick={fetchCbrRates}
                  disabled={cbrBusy || !/^\d{4}-\d{2}-\d{2}$/.test(cbrDate)}
                  className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-md text-[11px] font-medium hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
                >
                  {cbrBusy ? 'Загрузка...' : 'Загрузить с ЦБ РФ'}
                </button>
              </div>
            </div>
            <div className="p-4 space-y-3">
              {cbrMsg && <p className="text-[11px] text-[var(--text-muted)]">{cbrMsg}</p>}
              {ratesSorted.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Курсов пока нет. Загрузите курсы ЦБ РФ на нужную дату (работает онлайн, история доступна)
                  или добавьте вручную — пересчёт по операции берёт последний курс с датой ≤ даты операции.
                </p>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="py-1.5 font-medium">Валюта</th>
                      <th className="py-1.5 font-medium">Дата</th>
                      <th className="py-1.5 font-medium text-right">Курс, ₽/ед.</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {ratesSorted.map(r => (
                      <tr key={r.id} className="hover:bg-[var(--surface-inner)]/50 transition-colors">
                        <td className="py-1.5 text-xs font-mono text-[var(--fg)]">{r.code}</td>
                        <td className="py-1.5 text-xs font-mono text-[var(--text-muted)]">{r.date}</td>
                        <td className="py-1.5 text-xs font-mono text-right text-[var(--fg)]">{fmt(r.rate)}</td>
                        <td className="py-1 text-right">
                          <button
                            onClick={() => removeRate(r.id)}
                            title="Удалить курс"
                            className="p-1 text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <input
                  list="ledger-currencies"
                  value={fxCode}
                  onChange={e => setFxCode(e.target.value)}
                  placeholder="Валюта (USD)"
                  className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs font-mono text-[var(--fg)] px-2.5 py-1.5 w-28 uppercase"
                />
                <input
                  type="date"
                  value={fxDate}
                  onChange={e => setFxDate(e.target.value)}
                  className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1.5"
                />
                <input
                  value={fxRate}
                  onChange={e => setFxRate(e.target.value)}
                  placeholder="Курс, ₽/ед. (например 78.5)"
                  inputMode="decimal"
                  className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2.5 py-1.5 w-44"
                />
                <button
                  onClick={addRate}
                  disabled={!fxCode.trim() || fxRate.trim() === ''}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
                >
                  Добавить курс
                </button>
                <span className="text-[10px] text-[var(--text-muted)]">показаны последние {Math.min(50, store.fxRates.length)} из {store.fxRates.length}</span>
              </div>
            </div>
          </div>
        )}

        {/* Бюджеты: план-факт + прогноз (Фаза 3.4) */}
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center justify-between gap-3 flex-wrap">
            <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Бюджеты: план-факт
            </h3>
            <select
              value={budgetYM}
              onChange={e => setBudgetYM(e.target.value)}
              className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1"
            >
              {ymOptions.map(ym => (
                <option key={ym} value={ym}>{monthLabel(ym)}</option>
              ))}
            </select>
          </div>
          <div className="p-4 space-y-4">
            {forecast.spent > 0 ? (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                  <StatCard label={isCurrentYM ? 'Расходовано' : 'Расходы за месяц'} value={fmt(forecast.spent) + ' ₽'} />
                  <StatCard label="Темп в день" value={fmt(forecast.pacePerDay) + ' ₽'} />
                  <StatCard
                    label={budgetYM > curYM ? 'Прогноз' : 'К концу месяца'}
                    value={fmt(isCurrentYM || budgetYM > curYM ? forecast.projectedTotal : forecast.spent) + ' ₽'}
                  />
                  {dailyAllowance !== null ? (
                    <StatCard
                      label={dailyAllowance >= 0 ? 'Допуск в день в бюджете' : 'Перерасход в день'}
                      value={(dailyAllowance >= 0 ? '≤ ' : '') + fmt(Math.abs(dailyAllowance)) + ' ₽'}
                      tone={dailyAllowance >= 0 ? 'emerald' : 'rose'}
                    />
                  ) : (
                    <StatCard label="Бюджет на месяц" value={summary.totalLimit > 0 ? fmt(summary.totalLimit) + ' ₽' : '—'} />
                  )}
                </div>
                {isCurrentYM && (
                  <div className="bg-[var(--surface-inner)] rounded-lg p-3">
                    <div className="flex items-center justify-between text-xs text-[var(--text-muted)] mb-1.5 gap-2 flex-wrap">
                      <span>Что-если: темп расходов {whatIf >= 0 ? '+' : ''}{whatIf}%</span>
                      <span className="font-mono text-[var(--fg)]">→ к концу месяца ≈ {fmt(whatIfProjected)} ₽</span>
                    </div>
                    <input
                      type="range" min={-50} max={100} step={5} value={whatIf}
                      onChange={e => setWhatIf(Number(e.target.value))}
                      className="w-full accent-emerald-500"
                    />
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-[var(--text-muted)]">
                В месяце {monthLabel(budgetYM)} пока нет расходов — прогноз появится после импорта операций.
              </p>
            )}

            {summary.lines.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Бюджеты не заданы — добавьте месячный лимит по категории ниже.
              </p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-1.5 font-medium">Категория</th>
                    <th className="py-1.5 font-medium text-right">Бюджет</th>
                    <th className="py-1.5 font-medium text-right">Факт</th>
                    <th className="py-1.5 font-medium text-right">Осталось</th>
                    <th className="py-1.5 font-medium pl-3 w-40">Прогресс</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {summary.lines.map(l => (
                    <tr key={l.category} className="hover:bg-[var(--surface-inner)]/50 transition-colors">
                      <td className="py-2 text-sm text-[var(--fg)]">{l.category}</td>
                      <td className="py-2 text-xs font-mono text-right text-[var(--text-muted)]">{fmt(l.limit)}</td>
                      <td className="py-2 text-xs font-mono text-right text-[var(--fg)]">{fmt(l.actual)}</td>
                      <td className={cn(
                        "py-2 text-xs font-mono text-right",
                        l.remaining >= 0 ? 'text-emerald-500' : 'text-rose-500'
                      )}>{fmt(l.remaining)}</td>
                      <td className="py-2 pl-3">
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 flex-1 rounded bg-[var(--surface)] overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded",
                                l.pct < 0.8 ? 'bg-emerald-500' : l.pct < 1 ? 'bg-amber-500' : 'bg-rose-500'
                              )}
                              style={{ width: `${Math.min(100, l.pct * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-mono text-[var(--text-muted)] w-9 text-right">{Math.round(l.pct * 100)}%</span>
                        </div>
                      </td>
                      <td className="py-1 text-right">
                        <button
                          onClick={() => removeBudget(l.category)}
                          title="Удалить бюджет"
                          className="p-1 text-[var(--text-muted)] hover:text-rose-500 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <input
                list="budget-categories"
                value={bCat}
                onChange={e => setBCat(e.target.value)}
                placeholder="Категория (например: Еда)"
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2.5 py-1.5 w-48"
              />
              <datalist id="budget-categories">
                {store.categories.filter(c => c.kind === 'expense').map(c => (
                  <option key={c.id} value={c.name} />
                ))}
              </datalist>
              <input
                value={bLimit}
                onChange={e => setBLimit(e.target.value)}
                placeholder="Лимит в месяц, ₽"
                inputMode="decimal"
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2.5 py-1.5 w-36"
              />
              <button
                onClick={addBudget}
                disabled={!bCat.trim() || bLimit.trim() === ''}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
              >
                Добавить бюджет
              </button>
              {summary.unbudgeted > 0 && (
                <span className="text-[11px] text-[var(--text-muted)]">без бюджета: {fmt(summary.unbudgeted)} ₽</span>
              )}
            </div>
          </div>
        </div>

        {store.transactions.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-[var(--text-muted)]">
            <Landmark className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">В учёте пока нет операций</p>
            <p className="text-xs mt-1">
              Загрузите выписку в левой панели и нажмите «Импортировать в учёт» —
              данные сохранятся между запусками.
            </p>
          </div>
        ) : (
          <>
            {/* By month */}
            <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
                <h3 className="font-semibold text-sm text-[var(--fg)]">По месяцам</h3>
              </div>
              <div className="p-4 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                {byMonth.map(([ym, v]) => (
                  <div key={ym} className="bg-[var(--surface-inner)] rounded-lg p-2.5">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{monthLabel(ym)}</div>
                    <div className="text-xs font-mono text-emerald-500">+{fmt(v.income)} ₽</div>
                    <div className="text-xs font-mono text-rose-500">-{fmt(v.expense)} ₽</div>
                    <div className={cn("text-xs font-mono mt-0.5", v.income - v.expense >= 0 ? 'text-[var(--fg)]' : 'text-rose-400')}>
                      = {fmt(v.income - v.expense)} ₽
                    </div>
                    {Math.abs(v.fx) >= 0.01 && (
                      <div className={cn("text-[10px] font-mono mt-0.5", v.fx >= 0 ? 'text-emerald-500' : 'text-amber-500')}
                        title="Курсовые разницы: переоценка валютных остатков на курс конца месяца">
                        курс. разницы {v.fx >= 0 ? '+' : ''}{fmt(v.fx)} ₽
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Transactions table */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
                <h3 className="font-semibold text-sm text-[var(--fg)]">
                  Операции
                  {stats.count > 200 && (
                    <span className="text-[var(--text-muted)] font-normal text-xs ml-2">(показаны последние 200)</span>
                  )}
                </h3>
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[var(--surface-inner)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] sticky top-0 shadow-sm z-10">
                    <th className="px-4 py-2.5 font-medium border-b border-[var(--border)]">Дата</th>
                    <th className="px-4 py-2.5 font-medium border-b border-[var(--border)]">Контрагент</th>
                    <th className="px-4 py-2.5 font-medium border-b border-[var(--border)]">Назначение</th>
                    <th className="px-4 py-2.5 font-medium border-b border-[var(--border)]">Источник</th>
                    <th className="px-4 py-2.5 font-medium border-b border-[var(--border)] text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {txSorted.map(tx => (
                    <tr key={tx.id} className="hover:bg-[var(--surface-inner)]/50 transition-colors">
                      <td className="px-4 py-2 text-xs font-mono whitespace-nowrap text-[var(--fg)]">{tx.date}</td>
                      <td className="px-4 py-2 text-sm text-[var(--fg)]">{cpName.get(tx.counterpartyId) || '—'}</td>
                      <td className="px-4 py-2 text-xs text-[var(--text-muted)] truncate max-w-xs" title={tx.purpose}>{tx.purpose || '—'}</td>
                      <td className="px-4 py-2 text-[11px] text-[var(--text-muted)] truncate max-w-[140px]" title={tx.source}>{tx.source}</td>
                      <td className={cn(
                        "px-4 py-2 text-sm font-mono text-right whitespace-nowrap",
                        tx.type === 'income' ? 'text-emerald-500' : 'text-[var(--fg)]'
                      )}>
                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)} {(tx.currency || BASE_CURRENCY).toUpperCase()}
                        {((tx.currency || BASE_CURRENCY).toUpperCase() !== BASE_CURRENCY) && (() => {
                          const c = toBase(tx.amount, tx.currency, tx.date, store.fxRates);
                          return (
                            <div className="text-[10px] text-[var(--text-muted)]">
                              ≈ {c.missing ? 'нет курса' : fmt(c.base) + ' ₽'}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
