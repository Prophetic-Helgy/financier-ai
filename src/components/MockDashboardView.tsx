/**
 * Компонент отображения заглушек (mock dashboard).
 * Показывается когда у пользователя нет реальных данных.
 * Демонстрирует функционал кабинета с вымышленными данными.
 */

import React, { useMemo } from 'react';
import { cn } from '../lib/utils';
import { mockByMode, MockDashboard, MockKPI } from '../lib/mockData';
import { 
  TrendingUp, TrendingDown, DollarSign, Activity, 
  AlertCircle, CheckCircle2, Info, Database, 
  BarChart3, PieChart, ArrowRightLeft, Sparkles,
  Target, Shield, Percent, Package, Building2, Globe,
  CreditCard, TrendingUpDown, Wallet, Receipt, Users, Zap
} from 'lucide-react';

interface MockDashboardViewProps {
  mode: string;
  onUploadClick: () => void;
}

// --- Форматирование чисел ---
function formatMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000_000) {
    return (value / 1_000_000_000).toFixed(1).replace('.', ',') + ' млрд';
  }
  if (Math.abs(value) >= 1_000_000) {
    return (value / 1_000_000).toFixed(1).replace('.', ',') + ' млн';
  }
  return value.toLocaleString('ru-RU');
}

// --- KPI Карточка ---
function KPICard({ kpi }: { kpi: MockKPI }) {
  const statusColors = {
    good: 'text-emerald-500',
    warning: 'text-amber-500',
    bad: 'text-rose-500',
  };

  const statusBg = {
    good: 'border-emerald-500/20 bg-emerald-500/5',
    warning: 'border-amber-500/20 bg-amber-500/5',
    bad: 'border-rose-500/20 bg-rose-500/5',
  };

  return (
    <div className={cn(
      "bg-[var(--surface)] border rounded-xl p-4 transition-all hover:shadow-md",
      statusBg[kpi.status]
    )}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-lg">{kpi.icon}</span>
        <div className={cn("w-2 h-2 rounded-full", 
          kpi.status === 'good' ? 'bg-emerald-500' : 
          kpi.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500'
        )} />
      </div>
      <div className="text-xs text-[var(--text-muted)] mb-1">{kpi.label}</div>
      <div className={cn("text-xl font-bold font-mono", statusColors[kpi.status])}>
        {kpi.value.toLocaleString('ru-RU')}
      </div>
      <div className="text-[10px] text-[var(--text-muted)] mt-1">{kpi.unit}</div>
    </div>
  );
}

// --- мини bar chart ---
function MiniBarChart({ data }: { data: { date: string; income: number; expense: number; profit?: number }[] }) {
  const maxVal = Math.max(...data.map(d => Math.max(d.income, d.expense)));

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-4 h-4 text-indigo-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Доходы vs Расходы</h3>
        <div className="ml-auto flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500/60" /> Доходы
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500/60" /> Расходы
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-500/60" /> Прибыль
          </span>
        </div>
      </div>
      <div className="flex items-end gap-2 h-32">
        {data.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5 h-full justify-end">
            <div className="flex items-end gap-0.5 w-full h-full">
              <div 
                className="flex-1 bg-emerald-500/60 rounded-t-sm min-h-[2px] transition-all"
                style={{ height: `${(d.income / maxVal) * 100}%` }}
                title={`Доход: ${d.income.toLocaleString('ru-RU')} ₽`}
              />
              <div 
                className="flex-1 bg-rose-500/60 rounded-t-sm min-h-[2px] transition-all"
                style={{ height: `${(d.expense / maxVal) * 100}%` }}
                title={`Расход: ${d.expense.toLocaleString('ru-RU')} ₽`}
              />
              {d.profit !== undefined && (
                <div 
                  className="flex-1 bg-indigo-500/60 rounded-t-sm min-h-[2px] transition-all"
                  style={{ height: `${(Math.max(0, d.profit) / maxVal) * 100}%` }}
                  title={`Прибыль: ${d.profit?.toLocaleString('ru-RU')} ₽`}
                />
              )}
            </div>
            <span className="text-[9px] text-[var(--text-muted)] mt-1">{d.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Pie Chart ---
function MiniPieChart({ data, title = 'Структура' }: { data: { name: string; value: number }[]; title?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  
  const colors = [
    'rgb(16, 185, 129)', 'rgb(59, 130, 246)', 'rgb(168, 85, 247)',
    'rgb(245, 158, 11)', 'rgb(244, 63, 94)', 'rgb(20, 184, 166)', 'rgb(99, 102, 241)',
  ];

  let cumulative = 0;
  const stops = data.map((d, i) => {
    const start = (cumulative / total) * 360;
    cumulative += d.value;
    const end = (cumulative / total) * 360;
    return `${colors[i % colors.length]} ${start}deg ${end}deg`;
  });

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <PieChart className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">{title}</h3>
      </div>
      <div className="flex items-center gap-4">
        <div 
          className="w-24 h-24 rounded-full shrink-0"
          style={{ background: `conic-gradient(${stops.join(', ')})` }}
        />
        <div className="flex-1 space-y-1">
          {data.map((d, i) => (
            <div key={i} className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                <span 
                  className="w-2 h-2 rounded-sm shrink-0"
                  style={{ backgroundColor: colors[i % colors.length] }}
                />
                <span className="text-[var(--text-muted)]">{d.name}</span>
              </div>
              <span className="font-mono text-[var(--fg)]">
                {((d.value / total) * 100).toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// --- Таблица транзакций ---
function TransactionsTable({ transactions }: { transactions: { date: string; type: 'income' | 'expense'; payee?: string; payer?: string; purpose: string; amount: number }[] }) {
  const display = transactions.slice(0, 8);

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--border)] flex items-center gap-2">
        <ArrowRightLeft className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Последние операции</h3>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">показано {display.length} из {transactions.length}</span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="bg-[var(--surface-inner)]/50 text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
            <th className="px-4 py-2 font-medium">Дата</th>
            <th className="px-4 py-2 font-medium">Контрагент</th>
            <th className="px-4 py-2 font-medium">Назначение</th>
            <th className="px-4 py-2 text-right font-medium">Сумма</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--border)]">
          {display.map((tx, i) => (
            <tr key={i} className="hover:bg-[var(--surface-inner)]/30 transition-colors">
              <td className="px-4 py-2 text-xs font-mono text-[var(--fg)] whitespace-nowrap">{tx.date}</td>
              <td className="px-4 py-2 text-xs text-[var(--fg)]">{tx.type === 'expense' ? tx.payee : tx.payer}</td>
              <td className="px-4 py-2 text-xs text-[var(--text-muted)] max-w-[200px] truncate" title={tx.purpose}>{tx.purpose}</td>
              <td className={cn(
                "px-4 py-2 text-xs font-mono text-right whitespace-nowrap font-medium",
                tx.type === 'income' ? 'text-emerald-500' : 'text-[var(--fg)]'
              )}>
                {tx.type === 'income' ? '+' : '-'}{formatMoney(tx.amount)} ₽
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ===================== СПЕЦИФИЧНЫЕ ВИДЖЕТЫ =====================

// --- Физлицо: Кредитный калькулятор ---
function CreditOptimizerWidget() {
  const credits = [
    { name: 'Ипотека Сбер', balance: 3200000, rate: 14.5, monthly: 52000, years: 18 },
    { name: 'Автокредит ВТБ', balance: 680000, rate: 16.9, monthly: 18500, years: 3 },
    { name: 'Кредитная карта', balance: 45000, rate: 39.0, monthly: 5200, years: 1 },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <CreditCard className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Оптимизация кредитов</h3>
        <span className="ml-auto text-[10px] text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded">AI рекомендация</span>
      </div>
      <div className="space-y-3">
        {credits.map((c, i) => (
          <div key={i} className="bg-[var(--surface-inner)]/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-[var(--fg)]">{c.name}</span>
              <span className="text-xs font-mono text-[var(--text-muted)]">{c.rate}%</span>
            </div>
            <div className="flex items-center justify-between text-[10px] text-[var(--text-muted)]">
              <span>Остаток: {formatMoney(c.balance)} ₽</span>
              <span>Платёж: {c.monthly.toLocaleString('ru-RU')} ₽/мес</span>
            </div>
            {/* Priority bar */}
            <div className="mt-2 h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
              <div 
                className={cn("h-full rounded-full", 
                  c.rate > 30 ? 'bg-rose-500' : c.rate > 15 ? 'bg-amber-500' : 'bg-emerald-500'
                )}
                style={{ width: `${Math.min(100, (c.rate / 50) * 100)}%` }}
              />
            </div>
            {i === 2 && (
              <div className="mt-2 text-[10px] text-rose-400 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Приоритет погашения: ставка 39%! Гасить в первую очередь.
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Физлицо: Подушка безопасности ---
function SafetyFundWidget() {
  const monthlyExpenses = 112400;
  const currentSavings = 470000;
  const targetMonths = 6;
  const target = monthlyExpenses * targetMonths;
  const progress = (currentSavings / target) * 100;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Shield className="w-4 h-4 text-emerald-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Финансовая подушка</h3>
      </div>
      <div className="text-center mb-4">
        <div className="text-3xl font-bold font-mono text-emerald-500">{(progress).toFixed(0)}%</div>
        <div className="text-xs text-[var(--text-muted)] mt-1">накоплено из цели</div>
      </div>
      <div className="h-3 bg-[var(--bg)] rounded-full overflow-hidden mb-3">
        <div 
          className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 rounded-full transition-all"
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="bg-[var(--surface-inner)]/50 rounded p-2 text-center">
          <div className="text-[var(--text-muted)]">Есть</div>
          <div className="font-mono font-medium text-emerald-500">{formatMoney(currentSavings)} ₽</div>
        </div>
        <div className="bg-[var(--surface-inner)]/50 rounded p-2 text-center">
          <div className="text-[var(--text-muted)]">Цель ({targetMonths} мес)</div>
          <div className="font-mono font-medium text-[var(--fg)]">{formatMoney(target)} ₽</div>
        </div>
      </div>
      <div className="mt-3 text-[10px] text-[var(--text-muted)] text-center">
        При текущих тратах {formatMoney(monthlyExpenses)} ₽/мес нужно накопить ещё {formatMoney(target - currentSavings)} ₽
      </div>
    </div>
  );
}

// --- Семья: Цели накоплений ---
function FamilyGoalsWidget() {
  const goals = [
    { name: 'Отпуск 2025', target: 350000, current: 210000, icon: '🏖️', deadline: 'Июль 2025' },
    { name: 'Новая машина', target: 2500000, current: 890000, icon: '🚗', deadline: '2026' },
    { name: 'Образование ребёнка', target: 500000, current: 120000, icon: '📚', deadline: '2027' },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Target className="w-4 h-4 text-cyan-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Семейные цели</h3>
      </div>
      <div className="space-y-3">
        {goals.map((g, i) => {
          const progress = (g.current / g.target) * 100;
          return (
            <div key={i} className="bg-[var(--surface-inner)]/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{g.icon}</span>
                  <div>
                    <div className="text-xs font-medium text-[var(--fg)]">{g.name}</div>
                    <div className="text-[10px] text-[var(--text-muted)]">до {g.deadline}</div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono font-medium text-cyan-500">{progress.toFixed(0)}%</div>
                </div>
              </div>
              <div className="h-2 bg-[var(--bg)] rounded-full overflow-hidden mb-1">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-[var(--text-muted)]">
                <span>{formatMoney(g.current)} ₽</span>
                <span>из {formatMoney(g.target)} ₽</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- Самозанятые: Сравнение налогов ---
function TaxComparisonWidget() {
  const income = 1850000;
  const npd4 = income * 0.04; // физ лица
  const npd6 = income * 0.06; // юр лица
  const usn6 = income * 0.06; // УСН 6%
  const usn15 = income * 0.15; // УСН 15%

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Receipt className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Сравнение налогов</h3>
        <span className="ml-auto text-[10px] text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded">НПД выгоднее!</span>
      </div>
      <div className="space-y-2">
        {[
          { label: 'НПД 4% (клиент-физ)', amount: 74000, highlight: false, note: 'При доходах от физлиц' },
          { label: 'НПД 6% (клиент-юр)', amount: 111000, highlight: true, note: 'Рекомендуемый режим' },
          { label: 'УСН 6% (Доходы)', amount: 111000, highlight: false, note: 'Альтернатива для ИП' },
          { label: 'УСН 15% (Д-Р)', amount: 277500, highlight: false, note: 'Если есть подтверждённые расходы' },
        ].map((t, i) => (
          <div key={i} className={cn(
            "flex items-center justify-between p-2.5 rounded-lg",
            t.highlight ? "bg-amber-500/10 border border-amber-500/20" : "bg-[var(--surface-inner)]/30"
          )}>
            <div>
              <div className="text-xs text-[var(--fg)]">{t.label}</div>
              <div className="text-[10px] text-[var(--text-muted)]">{t.note}</div>
            </div>
            <div className="text-right">
              <div className={cn("text-sm font-mono font-bold", t.highlight ? "text-amber-500" : "text-[var(--fg)]")}>
                {t.amount.toLocaleString('ru-RU')} ₽
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 p-2 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
        <div className="text-[10px] text-emerald-500 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Экономия НПД vs УСН 15%: {formatMoney(277500 - 111000)} ₽ за квартал
        </div>
      </div>
    </div>
  );
}

// --- Селлеры: Unit-экономика ---
function UnitEconomyWidget() {
  const products = [
    { name: 'Футболка оверсайз', platform: 'WB', price: 2490, cost: 680, commission: 25, logistics: 180, ads: 320, returns: 3.2 },
    { name: 'Худи унисекс', platform: 'Ozon', price: 3990, cost: 1200, commission: 22, logistics: 350, ads: 480, returns: 4.1 },
    { name: 'Сумка кросс-боди', platform: 'WB', price: 1890, cost: 420, commission: 28, logistics: 150, ads: 210, returns: 2.8 },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Package className="w-4 h-4 text-violet-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Unit-экономика товаров</h3>
      </div>
      <div className="space-y-3">
        {products.map((p, i) => {
          const commissionAmt = p.price * (p.commission / 100);
          const totalCost = p.cost + commissionAmt + p.logistics + p.ads;
          const margin = p.price - totalCost;
          const marginPct = ((margin / p.price) * 100);
          return (
            <div key={i} className="bg-[var(--surface-inner)]/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded font-medium",
                    p.platform === 'WB' ? "bg-pink-500/10 text-pink-400" : "bg-blue-500/10 text-blue-400"
                  )}>{p.platform}</span>
                  <span className="text-xs font-medium text-[var(--fg)]">{p.name}</span>
                </div>
                <span className={cn(
                  "text-xs font-mono font-bold",
                  marginPct > 20 ? "text-emerald-500" : marginPct > 10 ? "text-amber-500" : "text-rose-500"
                )}>
                  {marginPct.toFixed(1)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-[10px]">
                <div className="bg-[var(--bg)] rounded p-1.5 text-center">
                  <div className="text-[var(--text-muted)]">Цена</div>
                  <div className="font-mono font-medium text-[var(--fg)]">{p.price.toLocaleString()} ₽</div>
                </div>
                <div className="bg-[var(--bg)] rounded p-1.5 text-center">
                  <div className="text-[var(--text-muted)]">Себестоимость</div>
                  <div className="font-mono text-[var(--fg)]">{formatMoney(totalCost)} ₽</div>
                </div>
                <div className="bg-[var(--bg)] rounded p-1.5 text-center">
                  <div className="text-[var(--text-muted)]">Маржа/ед</div>
                  <div className={cn("font-mono font-bold", marginPct > 20 ? "text-emerald-500" : "text-amber-500")}>
                    {formatMoney(margin)} ₽
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// --- МСБ: Финансовые коэффициенты ---
function FinancialRatiosWidget() {
  const ratios = [
    { name: 'Текущая ликвидность', value: 1.8, norm: '≥ 1.5', status: 'good' as const, icon: '💧' },
    { name: 'Автономии', value: 0.42, norm: '≥ 0.3', status: 'good' as const, icon: '🏛️' },
    { name: 'Рентабельность продаж', value: '12.4%', norm: '≥ 10%', status: 'good' as const, icon: '📈' },
    { name: 'Оборачиваемость ДЗ', value: '38 дн', norm: '< 45 дн', status: 'good' as const, icon: '🔄' },
    { name: 'Долговая нагрузка', value: '1.8x', norm: '< 3x', status: 'good' as const, icon: '⚖️' },
    { name: 'Cash Burn Rate', value: '-12%', norm: '< 0%', status: 'warning' as const, icon: '🔥' },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUpDown className="w-4 h-4 text-indigo-400" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Финансовые коэффициенты</h3>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {ratios.map((r, i) => (
          <div key={i} className={cn(
            "p-2.5 rounded-lg border",
            r.status === 'good' ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"
          )}>
            <div className="flex items-center gap-1 mb-1">
              <span className="text-xs">{r.icon}</span>
              <span className="text-[10px] text-[var(--text-muted)]">{r.name}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className={cn(
                "text-sm font-mono font-bold",
                r.status === 'good' ? "text-emerald-500" : "text-amber-500"
              )}>{r.value}</span>
              <span className="text-[9px] text-[var(--text-muted)]">норма {r.norm}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Холдинги: Структура ГК ---
function HoldingStructureWidget() {
  const companies = [
    { name: 'ООО ПромИнвест', type: 'Производство', revenue: 185, profit: 38, share: 100, color: 'bg-blue-500' },
    { name: 'АО ТехноГрупп', type: 'IT-услуги', revenue: 142, profit: 32, share: 100, color: 'bg-violet-500' },
    { name: 'ООО ЛогистикПро', type: 'Логистика', revenue: 88, profit: 14, share: 75, color: 'bg-emerald-500' },
    { name: 'ООО СервисПлюс', type: 'Сервис', revenue: 45, profit: 8, share: 100, color: 'bg-amber-500' },
    { name: 'ООО ИнвестКапитал', type: 'Инвестиции', revenue: 25, profit: 5, share: 51, color: 'bg-rose-500' },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-rose-400" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Структура группы компаний</h3>
        <span className="ml-auto text-[10px] text-[var(--text-muted)]">5 субъектов</span>
      </div>
      <div className="space-y-2">
        {companies.map((c, i) => (
          <div key={i} className="bg-[var(--surface-inner)]/50 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={cn("w-3 h-3 rounded-sm", c.color)} />
                <div>
                  <div className="text-xs font-medium text-[var(--fg)]">{c.name}</div>
                  <div className="text-[10px] text-[var(--text-muted)]">{c.type} • Доля {c.share}%</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-mono text-emerald-500">{c.revenue} млн ₽</div>
                <div className="text-[10px] text-[var(--text-muted)]">выручка</div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 h-1.5 bg-[var(--bg)] rounded-full overflow-hidden">
                <div className={cn("h-full rounded-full", c.color)} style={{ width: `${(c.revenue / 185) * 100}%` }} />
              </div>
              <span className="text-[10px] font-mono text-[var(--text-muted)]">EBIT {c.profit} млн</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Холдинги: Валютные позиции ---
function CurrencyPositionsWidget() {
  const currencies = [
    { code: 'USD', long: 1250000, short: 2500000, net: -1250000, rate: 96.5 },
    { code: 'EUR', long: 800000, short: 450000, net: 350000, rate: 104.2 },
    { code: 'CNY', long: 45000000, short: 12000000, net: 33000000, rate: 13.2 },
  ];

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-4">
        <Globe className="w-4 h-4 text-sky-500" />
        <h3 className="text-sm font-semibold text-[var(--fg)]">Валютные позиции</h3>
      </div>
      <div className="space-y-2">
        {currencies.map((c, i) => (
          <div key={i} className="flex items-center justify-between p-2.5 bg-[var(--surface-inner)]/30 rounded-lg">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-[var(--fg)]">{c.code}</span>
              <span className="text-[10px] text-[var(--text-muted)]">курс {c.rate} ₽</span>
            </div>
            <div className="text-right">
              <div className={cn(
                "text-sm font-mono font-bold",
                c.net >= 0 ? "text-emerald-500" : "text-rose-500"
              )}>
                {c.net >= 0 ? '+' : ''}{formatMoney(Math.abs(c.net))} ₽
              </div>
              <div className="text-[9px] text-[var(--text-muted)]">
                {c.net >= 0 ? 'долговая' : 'дебиторская'} позиция
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 p-2 bg-amber-500/5 border border-amber-500/20 rounded-lg">
        <div className="text-[10px] text-amber-500 flex items-center gap-1">
          <AlertCircle className="w-3 h-3" />
          USD-позиция: хеджировать через форвардный контракт
        </div>
      </div>
    </div>
  );
}

// --- Banner "Демо" ---
function DemoBanner({ mode, onUploadClick }: { mode: string; onUploadClick: () => void }) {
  const modeLabels: Record<string, string> = {
    personal: 'физического лица',
    family: 'семейного бюджета',
    selfemployed: 'самозанятого / ИП',
    seller: 'селлера маркетплейсов',
    msb: 'малого бизнеса',
    holding: 'холдинга',
  };

  const label = modeLabels[mode] || 'кабинета';

  return (
    <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/10 to-violet-500/10 border border-indigo-500/20 rounded-xl p-4 flex items-start gap-3">
      <Sparkles className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5" />
      <div className="flex-1">
        <h3 className="text-sm font-semibold text-indigo-400 mb-1">Демо-режим кабинета</h3>
        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Вы видите <span className="text-[var(--fg)] font-medium">демонстрационные данные</span> кабинета {label}. 
          Эти вымышленные данные показывают весь функционал аналитики, графиков и отчётов. 
          Загрузите свои реальные файлы (выписки, ОСВ, РСБУ), чтобы увидеть персональную аналитику.
        </p>
        <button 
          onClick={onUploadClick}
          className="mt-3 px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-medium hover:bg-indigo-500/30 transition-colors inline-flex items-center gap-1.5"
        >
          <Database className="w-3.5 h-3.5" />
          Загрузить свои данные
        </button>
      </div>
    </div>
  );
}

// ===================== ГЛАВНЫЙ КОМПОНЕНТ =====================

export function MockDashboardView({ mode, onUploadClick }: MockDashboardViewProps) {
  const mock = mockByMode[mode];

  if (!mock) {
    return (
      <div className="h-full flex items-center justify-center text-[var(--text-muted)]">
        <div className="text-center">
          <Info className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>Данные для режима "{mode}" не найдены</p>
        </div>
      </div>
    );
  }

  const totalIncome = mock.chartData.reduce((s, d) => s + d.income, 0);
  const totalExpense = mock.chartData.reduce((s, d) => s + d.expense, 0);
  const totalProfit = totalIncome - totalExpense;

  // Специфические виджеты для каждого кабинета
  const renderModeSpecificWidgets = () => {
    switch (mode) {
      case 'personal':
        return (
          <>
            <CreditOptimizerWidget />
            <SafetyFundWidget />
          </>
        );
      case 'family':
        return (
          <FamilyGoalsWidget />
        );
      case 'selfemployed':
        return (
          <TaxComparisonWidget />
        );
      case 'seller':
        return (
          <UnitEconomyWidget />
        );
      case 'msb':
        return (
          <FinancialRatiosWidget />
        );
      case 'holding':
        return (
          <>
            <HoldingStructureWidget />
            <CurrencyPositionsWidget />
          </>
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 lg:p-6 space-y-4">
      {/* Демо баннер */}
      <DemoBanner mode={mode} onUploadClick={onUploadClick} />

      {/* KPI карточки */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <Activity className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm font-semibold text-[var(--fg)]">Ключевые показатели</h2>
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">демо-данные</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {mock.kpis.map((kpi, i) => (
            <KPICard key={i} kpi={kpi} />
          ))}
        </div>
      </div>

      {/* Графики */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <MiniBarChart data={mock.chartData} />
        <MiniPieChart data={mock.pieData} title={
          mode === 'seller' ? 'Продажи по площадкам' :
          mode === 'holding' ? 'Выручка по компаниям' :
          mode === 'selfemployed' ? 'Доходы по источникам' :
          mode === 'family' ? 'Структура расходов' :
          mode === 'msb' ? 'Структура выручки' :
          'Структура расходов'
        } />
      </div>

      {/* Итоговая сводка */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-emerald-500/5 border border-emerald-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span className="text-[10px] text-[var(--text-muted)] uppercase">Общие доходы</span>
          </div>
          <div className="text-lg font-bold font-mono text-emerald-500">
            +{formatMoney(totalIncome)} ₽
          </div>
        </div>
        <div className="bg-rose-500/5 border border-rose-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <TrendingDown className="w-3.5 h-3.5 text-rose-500" />
            <span className="text-[10px] text-[var(--text-muted)] uppercase">Общие расходы</span>
          </div>
          <div className="text-lg font-bold font-mono text-rose-500">
            -{formatMoney(totalExpense)} ₽
          </div>
        </div>
        <div className={cn(
          "border rounded-xl p-4",
          totalProfit >= 0 
            ? "bg-indigo-500/5 border-indigo-500/20" 
            : "bg-rose-500/5 border-rose-500/20"
        )}>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className={cn("w-3.5 h-3.5", totalProfit >= 0 ? "text-indigo-500" : "text-rose-500")} />
            <span className="text-[10px] text-[var(--text-muted)] uppercase">Чистая прибыль</span>
          </div>
          <div className={cn(
            "text-lg font-bold font-mono",
            totalProfit >= 0 ? "text-indigo-500" : "text-rose-500"
          )}>
            {totalProfit >= 0 ? '+' : ''}{formatMoney(totalProfit)} ₽
          </div>
        </div>
      </div>

      {/* Специфические виджеты для кабинета */}
      {renderModeSpecificWidgets()}

      {/* Таблица транзакций */}
      <TransactionsTable transactions={mock.transactions} />

      {/* Описание */}
      <div className="text-center text-[10px] text-[var(--text-muted)] pb-4">
        {mock.description} • Данные демонстрационные • Загрузите свои файлы для персональной аналитики
      </div>
    </div>
  );
}