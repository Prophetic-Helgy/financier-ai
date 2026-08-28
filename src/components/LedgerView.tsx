import React, { useMemo, useState } from 'react';
import { Landmark, FileDown, FileUp, RotateCcw, Target, Trash2 } from 'lucide-react';
import { LedgerStore, BudgetGoal, createId } from '../lib/store/schema';
import { budgetSummary, monthForecast, currentYM, daysInMonth } from '../lib/store/budgets';
import { cn } from '../lib/utils';

interface LedgerViewProps {
  store: LedgerStore;
  busy: boolean;
  onExportBackup: () => void;
  onRestoreFile: () => void;
  onRestoreLatestBackup: () => void;
  onBudgetsChange: (budgets: BudgetGoal[]) => void;
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

function StatCard({ label, value, tone }: { label: string; value: string; tone?: 'emerald' | 'rose' }) {
  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</div>
      <div className={cn(
        "font-mono font-medium text-lg",
        tone === 'emerald' ? 'text-emerald-500' : tone === 'rose' ? 'text-rose-500' : 'text-[var(--fg)]'
      )}>{value}</div>
    </div>
  );
}

/**
 * Вкладка «Учёт»: что сохранено в хранилище (переживает перезапуск),
 * итоги, разбивка по месяцам, журнал операций, бэкапы.
 */
export function LedgerView({ store, busy, onExportBackup, onRestoreFile, onRestoreLatestBackup, onBudgetsChange }: LedgerViewProps) {
  const stats = useMemo(() => {
    let income = 0, expense = 0;
    for (const t of store.transactions) {
      if (t.type === 'income') income += t.amount; else expense += t.amount;
    }
    return { income, expense, balance: income - expense, count: store.transactions.length };
  }, [store.transactions]);

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
      if (t.type === 'income') cur.income += t.amount; else cur.expense += t.amount;
      m.set(key, cur);
    }
    return [...m.entries()].sort((a, b) => b[0].localeCompare(a[0])).slice(0, 12);
  }, [store.transactions]);

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

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <StatCard label="Операций" value={String(stats.count)} />
          <StatCard label="Доходы" value={'+' + fmt(stats.income) + ' ₽'} tone="emerald" />
          <StatCard label="Расходы" value={'-' + fmt(stats.expense) + ' ₽'} tone="rose" />
          <StatCard label="Баланс" value={fmt(stats.balance) + ' ₽'} tone={stats.balance >= 0 ? 'emerald' : 'rose'} />
        </div>

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
                    <div className="text-xs font-mono text-emerald-500">+{fmt(v.income)}</div>
                    <div className="text-xs font-mono text-rose-500">-{fmt(v.expense)}</div>
                    <div className={cn("text-xs font-mono mt-0.5", v.income - v.expense >= 0 ? 'text-[var(--fg)]' : 'text-rose-400')}>
                      = {fmt(v.income - v.expense)}
                    </div>
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
                        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)} ₽
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
