import React, { useMemo, useState } from 'react';
import { Landmark, FileDown, FileUp, RotateCcw, Target, Trash2, Coins, Wallet, CalendarClock, Tags, Sparkles, Users, Building2, Network, ScrollText } from 'lucide-react';
import { LedgerStore, BudgetGoal, Account, FxRate, Period, Transaction, Category, UserProfile, Organization, Counterparty, createId } from '../lib/store/schema';
import type { UserRole } from '../lib/store/schema';
import { ROLE_LABELS, can, currentProfile, visibleTransactions } from '../lib/store/roles';
import type { RoleAction } from '../lib/store/roles';
import { groupPnl, consolidationBalanced, canDeleteOrg, orgParentOptions } from '../lib/store/consolidation';
import { auditProfileName } from '../lib/store/audit';
import { budgetSummary, monthForecast, currentYM, daysInMonth } from '../lib/store/budgets';
import {
  totalsInBase, currencyBreakdown, monthFxGainLoss, toBase,
  mergeExternalRates, lastDayOfMonth, BASE_CURRENCY, CbrRate,
} from '../lib/store/fx';
import { ymOf, nextPeriods, periodRows, makeCorrection, mtdYtd } from '../lib/store/periods';
import {
  UNCATEGORIZED, applyHeuristics, categorizePrompt, parseCategorizeResponse,
  AiCategorizeItem,
} from '../lib/store/categorize';
import { getDefaultConfig, detectLocalLLM, chatWithLocalLLM } from '../lib/llmIntegration';
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
  onPeriodsChange: (periods: Period[]) => void;
  onTransactionsChange: (transactions: Transaction[]) => void;
  onCategoriesChange: (categories: Category[]) => void;
  onProfileChange: (userId: string) => void;
  onUsersChange: (users: UserProfile[]) => void;
  onOrganizationsChange: (organizations: Organization[]) => void;
  onCounterpartiesChange: (counterparties: Counterparty[]) => void;
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

function DeltaChip({ value }: { value: number | null }) {
  if (value === null) return <span className="text-[10px] font-mono text-[var(--text-muted)]">сравнение н/д</span>;
  return (
    <span className={cn(
      "text-[10px] font-mono px-1.5 py-0.5 rounded",
      value >= 0 ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-500'
    )}>{value >= 0 ? '+' : ''}{Math.round(value)}%</span>
  );
}

/**
 * Вкладка «Учёт»: что сохранено в хранилище (переживает перезапуск),
 * итоги, разбивка по месяцам, журнал операций, бэкапы.
 */
export function LedgerView({ store, busy, onExportBackup, onRestoreFile, onRestoreLatestBackup, onBudgetsChange, onAccountsChange, onFxRatesChange, onPeriodsChange, onTransactionsChange, onCategoriesChange, onProfileChange, onUsersChange, onOrganizationsChange, onCounterpartiesChange }: LedgerViewProps) {
  // Фаза 3.6: активный профиль, его видимые операции и доступ к действиям по роли.
  // view — «срез» хранилища с отфильтрованными операциями для periodRows/budgetSummary.
  const profile = currentProfile(store);
  const txs = useMemo(() => visibleTransactions(store), [store]);
  const view = useMemo(() => ({ ...store, transactions: txs }), [store, txs]);
  const canDo = (a: RoleAction) => can(profile.role, a);

  // Фаза 3.3: итоги — в базовой валюте (RUB), валютные операции по курсу на дату
  const stats = useMemo(() => {
    const base = totalsInBase(txs, store.fxRates);
    return {
      ...base,
      balance: base.net,
      count: txs.length,
      // подписка «в т.ч. X USD …» — только для не-базовых валют
      sub: currencyBreakdown(txs)
        .filter(c => c.currency !== BASE_CURRENCY)
        .map(c => `${fmt(c.net)} ${c.currency}`)
        .join(' · ') || undefined,
    };
  }, [txs, store.fxRates]);

  const cpName = useMemo(() => new Map(store.counterparties.map(c => [c.id, c.name])), [store.counterparties]);

  const txSorted = useMemo(
    () => [...txs]
      .sort((a, b) => (b.date + b.importedAt).localeCompare(a.date + a.importedAt))
      .slice(0, 200),
    [txs]
  );

  const byMonth = useMemo(() => {
    const m = new Map<string, { income: number; expense: number }>();
    for (const t of txs) {
      const key = (t.date || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      const cur = m.get(key) || { income: 0, expense: 0 };
      const base = toBase(t.amount, t.currency, t.date, store.fxRates).base;
      if (t.type === 'income') cur.income += base; else cur.expense += base;
      m.set(key, cur);
    }
    // курсовые разницы месяца (переоценка валютных остатков) — только если есть валютные операции
    const hasForeign = txs.some(t => (t.currency || BASE_CURRENCY).toUpperCase() !== BASE_CURRENCY);
    return [...m.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 12)
      .map(([ym, v]) => [ym, { ...v, fx: hasForeign ? monthFxGainLoss(txs, ym, store.fxRates) : 0 }] as const);
  }, [txs, store.fxRates]);

  const backupBtn = "flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--fg)] transition-colors disabled:opacity-50";
  const rowBtn = "px-2 py-1 bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-[11px] text-[var(--text-muted)] hover:text-[var(--fg)] transition-colors";
  const fieldCls = "bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1.5";

  // Фаза 3.4: бюджеты и план-факт
  const curYM = currentYM();
  const [budgetYM, setBudgetYM] = useState(curYM);
  const [bCat, setBCat] = useState('');
  const [bLimit, setBLimit] = useState('');
  const [whatIf, setWhatIf] = useState(0);

  const ymOptions = useMemo(() => {
    const set = new Set<string>([curYM]);
    for (const t of txs) {
      const ym = (t.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) set.add(ym);
    }
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [txs, curYM]);

  const summary = useMemo(() => budgetSummary(view, budgetYM), [view, budgetYM]);

  const isCurrentYM = budgetYM === curYM;
  const asOfDay = isCurrentYM ? new Date().getDate() : budgetYM < curYM ? daysInMonth(budgetYM) : 0;
  const forecast = useMemo(() => monthForecast(txs, budgetYM, asOfDay), [txs, budgetYM, asOfDay]);

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
    for (const t of txs) m.set(t.accountId, (m.get(t.accountId) || 0) + 1);
    return m;
  }, [txs]);

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
    || txs.some(t => (t.currency || BASE_CURRENCY).toUpperCase() !== BASE_CURRENCY)
    || store.accounts.some(a => (a.currency || 'RUB').toUpperCase() !== BASE_CURRENCY);
  const ratesSorted = useMemo(
    () => [...store.fxRates].sort((a, b) => (b.date + b.code).localeCompare(a.date + a.code)).slice(0, 50),
    [store.fxRates]
  );

  // Фаза 3.5: периоды — закрытие/открытие, корректирующие записи, MTD/YTD
  const today = new Date().toISOString().slice(0, 10);
  const periodTable = useMemo(() => periodRows(view), [view]);
  const mtdYtdData = useMemo(() => mtdYtd(txs, store.fxRates, today), [txs, store.fxRates, today]);

  const [correctionYM, setCorrectionYM] = useState<string | null>(null);
  const [corrDate, setCorrDate] = useState('');
  const [corrType, setCorrType] = useState<'income' | 'expense'>('expense');
  const [corrAmount, setCorrAmount] = useState('');
  const [corrAccountId, setCorrAccountId] = useState('');
  const [corrCat, setCorrCat] = useState('');
  const [corrNote, setCorrNote] = useState('');

  const togglePeriod = (ym: string, closed: boolean) => {
    onPeriodsChange(nextPeriods(store.periods, orgId, ym, closed, new Date().toISOString()));
  };
  const openCorrection = (ym: string) => {
    setCorrectionYM(ym);
    setCorrDate(ym >= curYM ? today : lastDayOfMonth(ym));
    setCorrType('expense');
    setCorrAmount('');
    setCorrAccountId(store.accounts[0]?.id || '');
    setCorrCat(store.categories.find(c => c.builtin && c.kind === 'expense')?.name || '');
    setCorrNote('');
  };
  const corrAccount = store.accounts.find(a => a.id === corrAccountId) || store.accounts[0];
  const corrCur = (corrAccount?.currency || 'RUB').toUpperCase();
  const addCorrection = () => {
    if (!correctionYM || !corrAccount) return;
    const amount = Number(corrAmount.replace(',', '.'));
    if (!/^\d{4}-\d{2}-\d{2}$/.test(corrDate) || ymOf(corrDate) !== correctionYM
      || !Number.isFinite(amount) || amount <= 0) return;
    onTransactionsChange([...store.transactions, makeCorrection({
      date: corrDate,
      type: corrType,
      amount,
      currency: corrAccount.currency || BASE_CURRENCY,
      accountId: corrAccount.id,
      orgId,
      category: corrCat || 'Без категории',
      purpose: corrNote.trim(),
    }, new Date().toISOString())]);
    setCorrectionYM(null);
    setCorrAmount('');
    setCorrNote('');
  };

  // Фаза 3.7: категории и автокатегоризация (эвристика + локальный LLM)
  const [catName, setCatName] = useState('');
  const [catKind, setCatKind] = useState<'income' | 'expense'>('expense');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiMsg, setAiMsg] = useState<string | null>(null);

  const catCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of txs) m.set(t.category, (m.get(t.category) || 0) + 1);
    return m;
  }, [txs]);

  // Без корректировок: они живут в закрытых месяцах и не перекатегоризируются (Фаза 3.5)
  const uncatCount = useMemo(
    () => txs.filter(t => t.category === UNCATEGORIZED && !t.correction).length,
    [txs]);

  const addCategory = () => {
    const name = catName.trim();
    if (!name) return;
    const exists = store.categories.some(c => c.name.toLowerCase() === name.toLowerCase() && c.kind === catKind);
    if (!exists) {
      onCategoriesChange([...store.categories, { id: createId(), name, kind: catKind, builtin: false }]);
    }
    setCatName('');
  };
  const removeCategory = (id: string) => {
    const c = store.categories.find(x => x.id === id);
    if (!c || c.builtin) return;
    if ((catCount.get(c.name) || 0) > 0) return; // на категории есть операции
    onCategoriesChange(store.categories.filter(x => x.id !== id));
  };

  // Эвристика: по ключевым словам в контрагенте/назначении (офлайн, детерминированно).
  // Фаза 3.6: работает только над видимыми активному профилю операциями.
  const runHeuristics = () => {
    const visibleIds = new Set(txs.map(t => t.id));
    const all = store.transactions.map(t => ({ ...t }));
    const scoped = all.filter(t => visibleIds.has(t.id));
    const categories = [...store.categories];
    const changed = applyHeuristics({ transactions: scoped, categories, counterparties: store.counterparties });
    if (changed > 0) {
      const byId = new Map(scoped.map(t => [t.id, t]));
      onTransactionsChange(all.map(t => byId.get(t.id) || t));
      onCategoriesChange(categories);
    }
  };

  // Фаза 3.6: управление профилями (только владелец)
  const [editingVisibilityId, setEditingVisibilityId] = useState<string | null>(null);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileRole, setNewProfileRole] = useState<UserRole>('member');
  const adminCount = store.users.filter(u => u.role === 'admin').length;

  const addProfile = () => {
    const name = newProfileName.trim();
    if (!name) return;
    onUsersChange([...store.users, { id: createId(), name, role: newProfileRole, visibleCategories: [], createdAt: new Date().toISOString() }]);
    setNewProfileName('');
  };
  const removeProfile = (id: string) => {
    const u = store.users.find(x => x.id === id);
    if (!u || u.role === 'admin' || id === profile.id) return;
    onUsersChange(store.users.filter(x => x.id !== id));
  };
  const changeProfileRole = (id: string, role: UserRole) => {
    const u = store.users.find(x => x.id === id);
    if (!u || u.role === role) return;
    // Нельзя понизить последнего владельца и собственный активный admin-профиль
    if (u.role === 'admin' && role !== 'admin' && (adminCount <= 1 || id === profile.id)) return;
    onUsersChange(store.users.map(x => x.id === id ? { ...x, role } : x));
  };
  const toggleVisibility = (id: string, catName: string, on: boolean) => {
    onUsersChange(store.users.map(x => x.id === id ? {
      ...x,
      visibleCategories: on
        ? [...x.visibleCategories, catName]
        : x.visibleCategories.filter(c => c.toLowerCase() !== catName.toLowerCase()),
    } : x));
  };

  // ИИ: локальный LLM (LM Studio) категоризирует «Без категории» (видимые операции)
  const aiCategorize = async () => {
    const uncat = txs.filter(t => t.category === UNCATEGORIZED && !t.correction);
    if (uncat.length === 0) return;
    setAiBusy(true);
    setAiMsg(null);
    try {
      const det = await detectLocalLLM();
      if (!det.available) {
        throw new Error('LM Studio недоступен — запустите сервер (http://127.0.0.1:1234, включите CORS)');
      }
      const config = { ...getDefaultConfig(), endpoint: det.endpoint };
      const cp = new Map(store.counterparties.map(c => [c.id, c.name]));
      const items: AiCategorizeItem[] = uncat.slice(0, 60).map(t => ({
        id: t.id, kind: t.type,
        counterparty: cp.get(t.counterpartyId) || '',
        purpose: t.purpose, amount: t.amount,
      }));
      const found = new Map<string, string>();
      for (let i = 0; i < items.length; i += 25) {
        const batch = items.slice(i, i + 25);
        const res = await chatWithLocalLLM(config, categorizePrompt(batch, store.categories), { temperature: 0.1, maxTokens: 1500 });
        if (res.error) throw new Error(res.text || res.error);
        for (const [id, name] of parseCategorizeResponse(res.text, batch, store.categories)) found.set(id, name);
      }
      if (found.size === 0) {
        setAiMsg('Модель не вернула ни одной подходящей категории — добавьте свои категории и повторите.');
        return;
      }
      onTransactionsChange(store.transactions.map(t => (found.has(t.id) ? { ...t, category: found.get(t.id)! } : t)));
      setAiMsg(`ИИ: ${found.size} из ${items.length} операций получили категорию`);
    } catch (e: any) {
      setAiMsg('ИИ-категоризация не удалась: ' + (e?.message || e));
    } finally {
      setAiBusy(false);
    }
  };
  const hasUserCategories = store.categories.some(c => !c.builtin);

  // Фаза 4: дерево юрлиц группы (мульти-энтити) и связь «контрагент = юрлицо группы»
  const [orgName, setOrgName] = useState('');
  const [orgParent, setOrgParent] = useState('');
  const linkedCpByOrg = useMemo(() => {
    const m = new Map<string, Counterparty>();
    for (const c of store.counterparties) if (c.orgId) m.set(c.orgId, c);
    return m;
  }, [store.counterparties]);
  const freeCounterparties = useMemo(
    () => store.counterparties.filter(c => !c.orgId),
    [store.counterparties]
  );

  const addOrg = () => {
    const name = orgName.trim();
    if (!name) return;
    onOrganizationsChange([...store.organizations, {
      id: createId(), name, isDefault: false, createdAt: new Date().toISOString(),
      parentId: orgParent || null,
    }]);
    setOrgName('');
    setOrgParent('');
  };
  const removeOrg = (id: string) => {
    if (!canDeleteOrg(store, id).ok) return;
    onOrganizationsChange(store.organizations.filter(o => o.id !== id));
    if (store.counterparties.some(c => c.orgId === id)) {
      onCounterpartiesChange(store.counterparties.map(c => c.orgId === id ? { ...c, orgId: null } : c));
    }
  };
  const changeOrgParent = (id: string, parentId: string) => {
    const allowed = new Set(orgParentOptions(store, id));
    const np = parentId && allowed.has(parentId) ? parentId : null;
    if ((store.organizations.find(o => o.id === id)?.parentId ?? null) === np) return;
    onOrganizationsChange(store.organizations.map(o => o.id === id ? { ...o, parentId: np } : o));
  };
  // Привязка/отвязка контрагента к юрлицу группы: один контрагент — у одного юрлица,
  // одно юрлицо — у одного контрагента; повторный клик снимает связь
  const linkCounterparty = (orgId: string, cpId: string) => {
    const target = cpId && store.counterparties.some(c => c.id === cpId) ? cpId : null;
    onCounterpartiesChange(store.counterparties.map(c => {
      if (c.id === target) return { ...c, orgId: c.orgId === orgId ? null : orgId };
      if (c.orgId === orgId) return { ...c, orgId: null };
      return c;
    }));
  };

  // Фаза 4: консолидированный P&L группы (elimination межфирменных операций)
  const [consYM, setConsYM] = useState(''); // '' — все периоды
  const consOptions = useMemo(() => {
    const s = new Set<string>();
    for (const t of store.transactions) {
      const ym = (t.date || '').slice(0, 7);
      if (/^\d{4}-\d{2}$/.test(ym)) s.add(ym);
    }
    return [...s].sort((a, b) => b.localeCompare(a));
  }, [store.transactions]);
  const group = useMemo(() => groupPnl(store, consYM || undefined), [store, consYM]);
  const balanced = useMemo(() => consolidationBalanced(store, consYM || undefined), [store, consYM]);

  // Фаза 4: журнал аудита (кто/когда/что) — последние записи
  const auditRows = useMemo(() => [...(store.auditLog ?? [])].reverse().slice(0, 30), [store.auditLog]);

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
            <button
              onClick={onRestoreFile}
              disabled={busy || !canDo('restore')}
              className={backupBtn}
              title={canDo('restore') ? 'Заменить данные файлом бэкапа' : 'Недоступно для текущей роли (только владелец)'}
            >
              <FileUp className="w-3.5 h-3.5" /> Из файла
            </button>
            <button
              onClick={onRestoreLatestBackup}
              disabled={busy || !canDo('restore')}
              className={backupBtn}
              title={canDo('restore') ? 'Восстановить последний автоматический бэкап' : 'Недоступно для текущей роли (только владелец)'}
            >
              <RotateCcw className="w-3.5 h-3.5" /> Авто-бэкап
            </button>
          </div>
        </div>

        {/* Профили (Фаза 3.6): семейный/совместный сценарий — роли и видимость категорий */}
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
            <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Профили (кто видит что)
            </h3>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] text-[var(--text-muted)]">Текущий профиль:</span>
              <select
                value={profile.id}
                onChange={e => onProfileChange(e.target.value)}
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1.5"
              >
                {store.users.map(u => (
                  <option key={u.id} value={u.id}>{u.name} — {ROLE_LABELS[u.role] || u.role}</option>
                ))}
              </select>
              <span className={cn(
                "text-[10px] font-medium px-1.5 py-0.5 rounded",
                profile.role === 'admin' ? 'bg-indigo-500/15 text-indigo-400'
                  : profile.role === 'member' ? 'bg-emerald-500/15 text-emerald-500'
                    : 'bg-[var(--surface-inner)] text-[var(--text-muted)]'
              )}>{ROLE_LABELS[profile.role] || profile.role}</span>
              {profile.role !== 'admin' && (profile.visibleCategories || []).length > 0 && (
                <span className="text-[10px] text-[var(--text-muted)]">видит категории: {profile.visibleCategories.join(', ')}</span>
              )}
            </div>
            {profile.role === 'admin' && (
              <>
                <div className="space-y-1.5">
                  {store.users.map(u => (
                    <div key={u.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-[var(--fg)] w-40 truncate">{u.name}</span>
                      <select
                        value={u.role}
                        onChange={e => changeProfileRole(u.id, e.target.value as UserRole)}
                        disabled={u.role === 'admin' && (adminCount <= 1 || u.id === profile.id)}
                        title={u.role === 'admin' && (adminCount <= 1 || u.id === profile.id)
                          ? 'Нельзя понизить последнего владельца (или самого себя)'
                          : 'Роль профиля'}
                        className={fieldCls}
                      >
                        {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                      {u.role !== 'admin' && (
                        <button onClick={() => setEditingVisibilityId(editingVisibilityId === u.id ? null : u.id)} className={rowBtn}>
                          {editingVisibilityId === u.id ? 'Скрыть список' : 'Категории (видимость)'}
                        </button>
                      )}
                      <button
                        onClick={() => removeProfile(u.id)}
                        disabled={u.role === 'admin' || u.id === profile.id}
                        title={u.role === 'admin' ? 'Профиль владельца не удаляется' : u.id === profile.id ? 'Нельзя удалить свой активный профиль' : 'Удалить профиль'}
                        className="p-1 text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
                {editingVisibilityId && (() => {
                  const u = store.users.find(x => x.id === editingVisibilityId);
                  if (!u) return null;
                  return (
                    <div className="bg-[var(--surface-inner)] rounded-lg p-3">
                      <div className="text-[11px] text-[var(--text-muted)] mb-2">
                        {u.name}: отмеченные категории видны, остальные операции в итогах этого профиля не участвуют. Пустой список — видит всё.
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {store.categories.map(c => (
                          <label key={c.id} className="flex items-center gap-1.5 text-xs text-[var(--fg)] cursor-pointer">
                            <input
                              type="checkbox"
                              checked={u.visibleCategories.some(x => x.toLowerCase() === c.name.toLowerCase())}
                              onChange={e => toggleVisibility(u.id, c.name, e.target.checked)}
                            />
                            {c.name} ({c.kind === 'income' ? 'доход' : 'расход'})
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <input
                    value={newProfileName}
                    onChange={e => setNewProfileName(e.target.value)}
                    placeholder="Имя профиля (например: Супруг)"
                    className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2.5 py-1.5 w-48"
                  />
                  <select
                    value={newProfileRole}
                    onChange={e => setNewProfileRole(e.target.value as UserRole)}
                    className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1.5"
                  >
                    {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                  </select>
                  <button
                    onClick={addProfile}
                    disabled={!newProfileName.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
                  >
                    Добавить профиль
                  </button>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Локальные профили: роль определяет доступ к действиям, список категорий — видимость операций.
                  </span>
                </div>
              </>
            )}
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
                      disabled={!canDo('accounts') || n > 0 || store.accounts.length <= 1}
                      title={!canDo('accounts') ? 'Недоступно для текущей роли' : n > 0 ? `Нельзя удалить: ${n} операций` : 'Удалить счёт'}
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
                disabled={!canDo('accounts') || !accName.trim()}
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

        {/* Организации (Фаза 4): юрлица группы — дерево, межфирменные контрагенты */}
        {(store.organizations.length > 1 || canDo('organizations')) && (
          <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
              <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Организации (группа)
              </h3>
            </div>
            <div className="p-4 space-y-2">
              <div className="space-y-1.5">
                {store.organizations.map(o => {
                  const chk = canDeleteOrg(store, o.id);
                  const linked = linkedCpByOrg.get(o.id);
                  const parentName = o.parentId ? store.organizations.find(p => p.id === o.parentId)?.name : null;
                  return (
                    <div key={o.id} className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-[var(--fg)] w-44 truncate" title={o.name}>{o.name}</span>
                      {o.isDefault && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[var(--surface-inner)] text-[var(--text-muted)]">основная</span>}
                      {parentName && <span className="text-[10px] text-[var(--text-muted)]">подчинена: {parentName}</span>}
                      {linked && <span className="text-[10px] text-cyan-400">контрагент: {linked.name}</span>}
                      {canDo('organizations') && (
                        <>
                          <select
                            value={o.parentId ?? ''}
                            onChange={e => changeOrgParent(o.id, e.target.value)}
                            disabled={o.isDefault}
                            className={fieldCls}
                            title={o.isDefault ? 'У основной организации нет родителя' : 'Родительская организация (дерево холдинга)'}
                          >
                            <option value="">— без родителя —</option>
                            {orgParentOptions(store, o.id).map(pid => (
                              <option key={pid} value={pid}>{store.organizations.find(p => p.id === pid)?.name}</option>
                            ))}
                          </select>
                          <select
                            value={linked?.id ?? ''}
                            onChange={e => linkCounterparty(o.id, e.target.value)}
                            className={fieldCls}
                            title="Внешний контрагент = юрлицо группы: операции с ним считаются межфирменными и элиминируются при консолидации"
                          >
                            <option value="">— контрагент не привязан —</option>
                            {(linked ? [linked, ...freeCounterparties] : freeCounterparties).map(c => (
                              <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                          </select>
                          <button
                            onClick={() => removeOrg(o.id)}
                            disabled={!chk.ok}
                            title={chk.ok ? 'Удалить организацию' : chk.reason}
                            className="p-0.5 text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              {canDo('organizations') && (
                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    value={orgName}
                    onChange={e => setOrgName(e.target.value)}
                    placeholder="Название юрлица (например: ООО «Альфа»)"
                    className={fieldCls + " w-52"}
                  />
                  <select value={orgParent} onChange={e => setOrgParent(e.target.value)} className={fieldCls}>
                    <option value="">— без родителя —</option>
                    {store.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                  </select>
                  <button
                    onClick={addOrg}
                    disabled={!orgName.trim()}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
                  >
                    Добавить юрлицо
                  </button>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    Счета и операции привязываются к юрлицу (при импорте — через счёт). Межфирменное: привяжите контрагента к юрлицу группы.
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

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
                  disabled={!canDo('fxRates') || cbrBusy || !/^\d{4}-\d{2}-\d{2}$/.test(cbrDate)}
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
                            disabled={!canDo('fxRates')}
                            title={canDo('fxRates') ? 'Удалить курс' : 'Недоступно для текущей роли'}
                            className="p-1 text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-30 transition-colors"
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
                  disabled={!canDo('fxRates') || !fxCode.trim() || fxRate.trim() === ''}
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
                          disabled={!canDo('budgets')}
                          title={canDo('budgets') ? 'Удалить бюджет' : 'Недоступно для текущей роли'}
                          className="p-1 text-[var(--text-muted)] hover:text-rose-500 disabled:opacity-30 transition-colors"
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
                disabled={!canDo('budgets') || !bCat.trim() || bLimit.trim() === ''}
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

        {/* Периоды (Фаза 3.5): закрытые месяцы только для чтения, корректирующие записи */}
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
            <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <CalendarClock className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Периоды
            </h3>
          </div>
          <div className="p-4 space-y-3">
            {periodTable.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)]">
                Закрытый месяц защищён: импорт в него невозможен, цифры меняют только корректирующие записи.
              </p>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="py-1.5 font-medium">Месяц</th>
                    <th className="py-1.5 font-medium">Статус</th>
                    <th className="py-1.5 font-medium text-right">Доходы</th>
                    <th className="py-1.5 font-medium text-right">Расходы</th>
                    <th className="py-1.5 font-medium text-right">Итог</th>
                    <th className="py-1.5 font-medium text-right">Операций</th>
                    <th className="py-1.5 font-medium text-right">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {periodTable.map(row => (
                    <tr key={row.ym} className="hover:bg-[var(--surface-inner)]/50 transition-colors">
                      <td className="py-2 text-sm text-[var(--fg)]">{monthLabel(row.ym)}</td>
                      <td className="py-2">
                        {row.closed ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-400" title={row.closedAt ? `Закрыт: ${row.closedAt}` : undefined}>Закрыт</span>
                        ) : row.ym === curYM ? (
                          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-500">Текущий</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface)] text-[var(--text-muted)]">Открыт</span>
                        )}
                      </td>
                      <td className="py-2 text-xs font-mono text-right text-emerald-500">+{fmt(row.income)}</td>
                      <td className="py-2 text-xs font-mono text-right text-rose-500">-{fmt(row.expense)}</td>
                      <td className={cn("py-2 text-xs font-mono text-right", row.net >= 0 ? 'text-[var(--fg)]' : 'text-rose-400')}>= {fmt(row.net)}</td>
                      <td className="py-2 text-xs font-mono text-right text-[var(--text-muted)]">
                        {row.count}{row.corrections > 0 && ` (${row.corrections} корр.)`}
                      </td>
                      <td className="py-2 text-right whitespace-nowrap">
                        {!canDo('periods') ? (
                          <span className="text-[10px] text-[var(--text-muted)]" title="Действия с периодами доступны только владельцу">—</span>
                        ) : row.closed ? (
                          <>
                            <button onClick={() => openCorrection(row.ym)} className={rowBtn + " mr-1.5"}>Корректировка</button>
                            <button onClick={() => togglePeriod(row.ym, false)} className={rowBtn} title="Открыть период: импорт в него снова станет возможен">Открыть снова</button>
                          </>
                        ) : row.ym < curYM ? (
                          <button onClick={() => togglePeriod(row.ym, true)} className={rowBtn}>Закрыть</button>
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {correctionYM && (
              <div className="bg-[var(--surface-inner)] rounded-lg p-3 space-y-2">
                <div className="text-xs font-medium text-[var(--fg)]">Корректирующая запись в {monthLabel(correctionYM)}</div>
                <div className="flex items-center gap-2 flex-wrap">
                  <input type="date" value={corrDate} onChange={e => setCorrDate(e.target.value)} className={fieldCls} />
                  <select
                    value={corrType}
                    onChange={e => {
                      const t = e.target.value as 'income' | 'expense';
                      setCorrType(t);
                      setCorrCat(store.categories.find(c => c.builtin && c.kind === t)?.name || '');
                    }}
                    className={fieldCls}
                  >
                    <option value="expense">Расход</option>
                    <option value="income">Доход</option>
                  </select>
                  <input value={corrAmount} onChange={e => setCorrAmount(e.target.value)} placeholder={`Сумма, ${corrCur}`} inputMode="decimal" className={fieldCls} />
                  <select value={corrAccount?.id || ''} onChange={e => setCorrAccountId(e.target.value)} className={fieldCls}>
                    {store.accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({(a.currency || 'RUB').toUpperCase()})</option>
                    ))}
                  </select>
                  <select value={corrCat} onChange={e => setCorrCat(e.target.value)} className={fieldCls}>
                    {store.categories.filter(c => c.kind === corrType).map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <input value={corrNote} onChange={e => setCorrNote(e.target.value)} placeholder="Почему (например: доплата по счёту)" className={fieldCls + " w-52"} />
                  <button
                    onClick={addCorrection}
                    disabled={corrAmount.trim() === '' || !/^\d{4}-\d{2}-\d{2}$/.test(corrDate) || ymOf(corrDate) !== correctionYM}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
                  >
                    Добавить
                  </button>
                  <button onClick={() => setCorrectionYM(null)} className={rowBtn}>Отмена</button>
                </div>
                <p className="text-[10px] text-[var(--text-muted)]">
                  Записывается с датой из закрытого месяца — влияет на итоги этого месяца, в журнале помечена «корр.».
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Категории (Фаза 3.7): статьи для бюджетов и автокатегоризации */}
        <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
            <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
              <Tags className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Категории
            </h3>
          </div>
          <div className="p-4 space-y-2">
            <div className="flex flex-wrap gap-2">
              {store.categories.map(c => {
                const n = catCount.get(c.name) || 0;
                return (
                  <div key={c.id} className="flex items-center gap-2 bg-[var(--surface-inner)] rounded-lg px-3 py-1.5">
                    <span className="text-xs text-[var(--fg)]">{c.name}</span>
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded",
                      c.kind === 'income' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-rose-500/15 text-rose-400'
                    )}>{c.kind === 'income' ? 'доход' : 'расход'}</span>
                    <span className="text-[10px] text-[var(--text-muted)]">{n} оп.</span>
                    <button
                      onClick={() => removeCategory(c.id)}
                      disabled={!canDo('categories') || c.builtin || n > 0}
                      title={!canDo('categories') ? 'Недоступно для текущей роли' : c.builtin ? 'Встроенная категория — не удаляется' : n > 0 ? `Нельзя удалить: ${n} операций` : 'Удалить категорию'}
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
                value={catName}
                onChange={e => setCatName(e.target.value)}
                placeholder="Категория (например: Продукты)"
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2.5 py-1.5 w-48"
              />
              <select
                value={catKind}
                onChange={e => setCatKind(e.target.value as 'income' | 'expense')}
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1.5"
              >
                <option value="expense">Расход</option>
                <option value="income">Доход</option>
              </select>
              <button
                onClick={addCategory}
                disabled={!canDo('categories') || !catName.trim()}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-md text-xs font-medium text-white transition-colors"
              >
                Добавить категорию
              </button>
              <span className="text-[10px] text-[var(--text-muted)]">
                Используются в бюджетах и автокатегоризации (эвристика при импорте + ИИ). Удаляется только пустая категория.
              </span>
            </div>
          </div>
        </div>

        {/* Консолидация (Фаза 4): групповой P&L с элиминированием межфирменных операций */}
        {store.organizations.length > 1 && (
          <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
                <Network className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Консолидация (группа, в {BASE_CURRENCY})
              </h3>
              <select
                value={consYM}
                onChange={e => setConsYM(e.target.value)}
                className="bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-xs text-[var(--fg)] px-2 py-1.5"
                title="Период консолидированного отчёта"
              >
                <option value="">Все периоды</option>
                {consOptions.map(ym => <option key={ym} value={ym}>{monthLabel(ym)}</option>)}
              </select>
            </div>
            <div className="p-4 space-y-3">
              {group.rows.length === 0 ? (
                <p className="text-xs text-[var(--text-muted)]">В выбранном периоде нет операций.</p>
              ) : (
                <>
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                        <th className="py-1.5 font-medium">Юрлицо</th>
                        <th className="py-1.5 font-medium text-right">Доходы</th>
                        <th className="py-1.5 font-medium text-right">Расходы</th>
                        <th className="py-1.5 font-medium text-right">Итог</th>
                        <th className="py-1.5 font-medium text-right" title="Межфирменные операции: доходы / расходы с юрлицами группы (из итогов группы исключаются)">Межфирм.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {group.rows.map(r => (
                        <tr key={r.orgId} className="hover:bg-[var(--surface-inner)]/50 transition-colors">
                          <td className="py-1.5 text-xs text-[var(--fg)]">{r.orgName}</td>
                          <td className="py-1.5 text-xs font-mono text-right text-emerald-500">+{fmt(r.income)}</td>
                          <td className="py-1.5 text-xs font-mono text-right text-[var(--fg)]">-{fmt(r.expense)}</td>
                          <td className={cn("py-1.5 text-xs font-mono text-right", r.net >= 0 ? 'text-[var(--fg)]' : 'text-rose-400')}>{fmt(r.net)}</td>
                          <td className="py-1.5 text-[10px] font-mono text-right text-[var(--text-muted)]">
                            {r.icIncome > 0 && <span className="text-emerald-500">+{fmt(r.icIncome)}</span>}
                            {r.icIncome > 0 && r.icExpense > 0 && ' / '}
                            {r.icExpense > 0 && <span className="text-rose-400">-{fmt(r.icExpense)}</span>}
                            {r.icIncome === 0 && r.icExpense === 0 && '—'}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-[var(--surface-inner)]/60">
                        <td className="py-1.5 text-xs font-semibold text-[var(--fg)]">Группа (после элиминирования)</td>
                        <td className="py-1.5 text-xs font-mono font-medium text-right text-emerald-500">+{fmt(group.group.income)}</td>
                        <td className="py-1.5 text-xs font-mono font-medium text-right text-[var(--fg)]">-{fmt(group.group.expense)}</td>
                        <td className={cn("py-1.5 text-xs font-mono font-medium text-right", group.group.net >= 0 ? 'text-[var(--fg)]' : 'text-rose-400')}>{fmt(group.group.net)}</td>
                        <td className="py-1.5 text-[10px] font-mono text-right text-[var(--text-muted)]">
                          −{fmt(group.eliminated.amount)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] text-[var(--text-muted)]">
                      Погашено пар (A→B: расход + встречный доход): {group.eliminated.pairs} на {fmt(group.eliminated.amount)} {BASE_CURRENCY}
                    </span>
                    {group.unmatched.count > 0 ? (
                      <span className="text-[10px] font-medium text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-0.5"
                        title="Межфирменная операция проведена только одной стороной — группы не сходится, проверьте книги юрлиц">
                        не погашено: {group.unmatched.count} оп. на {fmt(group.unmatched.amount)} {BASE_CURRENCY} — книги юрлиц не сходятся
                      </span>
                    ) : (
                      <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 rounded-md px-2 py-0.5">
                        {balanced.ok ? 'Консолидированный результат сходится: итог группы = сумма итогов юрлиц' : `Расхождение: ${fmt(balanced.diff)} ${BASE_CURRENCY}`}
                      </span>
                    )}
                  </div>
                </>
              )}
              <p className="text-[10px] text-[var(--text-muted)]">
                Межфирменные операции (контрагент — юрлицо группы, привязка в разделе «Организации») не являются потоком группы и вычитаются из итога;
                сопоставление пар — по дате, сумме и валюте.
              </p>
            </div>
          </div>
        )}

        {/* Журнал аудита (Фаза 4): кто/когда/что изменил */}
        {auditRows.length > 0 && (
          <div className="mb-6 bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden">
            <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50">
              <h3 className="font-semibold text-sm text-[var(--fg)] flex items-center gap-1.5">
                <ScrollText className="w-3.5 h-3.5 text-[var(--text-muted)]" /> Журнал аудита
                <span className="text-[var(--text-muted)] font-normal text-xs ml-1">(последние {auditRows.length} из {(store.auditLog ?? []).length})</span>
              </h3>
            </div>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="px-4 py-2 font-medium border-b border-[var(--border)]">Когда</th>
                  <th className="px-4 py-2 font-medium border-b border-[var(--border)]">Профиль</th>
                  <th className="px-4 py-2 font-medium border-b border-[var(--border)]">Действие</th>
                  <th className="px-4 py-2 font-medium border-b border-[var(--border)]">Детали</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {auditRows.map(e => (
                  <tr key={e.id} className="hover:bg-[var(--surface-inner)]/50 transition-colors">
                    <td className="px-4 py-1.5 text-[11px] font-mono whitespace-nowrap text-[var(--text-muted)]">
                      {new Date(e.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-1.5 text-xs text-[var(--fg)]">{auditProfileName(store, e.profileId)}</td>
                    <td className="px-4 py-1.5 text-[11px] font-mono text-[var(--text-muted)]">{e.action}</td>
                    <td className="px-4 py-1.5 text-[11px] text-[var(--text-muted)]">{e.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {txs.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-center text-[var(--text-muted)]">
            <Landmark className="w-10 h-10 mb-3 opacity-20" />
            <p className="text-sm font-medium">
              {store.transactions.length === 0 ? 'В учёте пока нет операций' : 'Для этого профиля нет видимых операций'}
            </p>
            <p className="text-xs mt-1">
              {store.transactions.length === 0
                ? 'Загрузите выписку в левой панели и нажмите «Импортировать в учёт» — данные сохранятся между запусками.'
                : 'Профиль видит операции по выбранным категориям — попросите владельца настроить видимость в разделе «Профили».'}
            </p>
          </div>
        ) : (
          <>
            {/* MTD / YTD (Фаза 3.5): текущий месяц/год до сегодня vs тот же период прошлого месяца/года */}
            <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Текущий месяц (до {today.slice(8, 10)}.{today.slice(5, 7)})
                  </div>
                  <DeltaChip value={mtdYtdData.mtdDeltaPct} />
                </div>
                <div className={cn("font-mono text-lg font-medium", mtdYtdData.mtd.net >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                  = {fmt(mtdYtdData.mtd.net)} ₽
                </div>
                <div className="text-[10px] text-[var(--text-muted)]" title="Доходы − расходы за те же числа (1..сегодня) предыдущего месяца">
                  т.п. прошлого месяца: {fmt(mtdYtdData.mtdPrev.net)} ₽
                </div>
              </div>
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                    Год {today.slice(0, 4)} (YTD)
                  </div>
                  <DeltaChip value={mtdYtdData.ytdDeltaPct} />
                </div>
                <div className={cn("font-mono text-lg font-medium", mtdYtdData.ytd.net >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                  = {fmt(mtdYtdData.ytd.net)} ₽
                </div>
                <div className="text-[10px] text-[var(--text-muted)]" title="Доходы − расходы с 1 января до сегодняшнего дня прошлого года">
                  т.п. прошлого года: {fmt(mtdYtdData.ytdPrev.net)} ₽
                </div>
              </div>
            </div>

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
              <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center justify-between gap-3 flex-wrap">
                <h3 className="font-semibold text-sm text-[var(--fg)]">
                  Операции
                  {stats.count > 200 && (
                    <span className="text-[var(--text-muted)] font-normal text-xs ml-2">(показаны последние 200)</span>
                  )}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                  {uncatCount > 0 && (
                    <button
                      onClick={runHeuristics}
                      disabled={!canDo('categorize')}
                      className={rowBtn}
                      title={canDo('categorize') ? 'Эвристика: ключевые слова в контрагенте/назначении (офлайн, мгновенно)' : 'Недоступно для текущей роли'}
                    >
                      Категоризовать ({uncatCount})
                    </button>
                  )}
                  <button
                    onClick={aiCategorize}
                    disabled={!canDo('categorize') || aiBusy || uncatCount === 0 || !hasUserCategories}
                    title={
                      !hasUserCategories
                        ? 'Сначала добавьте хотя бы одну категорию в разделе «Категории» — ИИ назначает операции по категориям из вашего списка'
                        : 'Локальный LLM (LM Studio) назначит категории из вашего списка операциям «Без категории» (до 60 шт. за раз)'
                    }
                    className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-md text-[11px] font-medium hover:bg-indigo-500/20 disabled:opacity-50 transition-colors"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    {aiBusy ? 'Категоризация…' : 'ИИ (LM Studio)'}
                  </button>
                  {aiMsg && (
                    <span className="text-[11px] text-[var(--text-muted)] max-w-[420px]">{aiMsg}</span>
                  )}
                </div>
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
                      <td className="px-4 py-2 text-xs font-mono whitespace-nowrap text-[var(--fg)]">
                        {tx.date}
                        {tx.correction && (
                          <span className="ml-1.5 font-sans text-[9px] text-amber-500 border border-amber-500/30 rounded px-1 align-middle" title="Корректирующая запись в закрытый период (Фаза 3.5)">корр.</span>
                        )}
                      </td>
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
