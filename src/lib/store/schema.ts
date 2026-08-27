/**
 * Сущности хранилища учёта (Фаза 1).
 * Версия схемы — schemaVersion; любые изменения структуры проходят
 * через цепочку миграций в migrations.ts (обратная совместимость).
 */

export const SCHEMA_VERSION = 1;

/** UUID с фолбэком для окружений без crypto.randomUUID */
export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof (crypto as { randomUUID?: () => string }).randomUUID === 'function') {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

/** Организация (юрлицо). Базовая сущность — всё ведётся в рамках организации */
export interface Organization {
  id: string;
  name: string;
  isDefault: boolean;
  createdAt: string;
}

export type AccountKind = 'bank' | 'card' | 'cash' | 'other';

/** Счёт (банк/карта/наличные), валюта — ISO 4217 */
export interface Account {
  id: string;
  orgId: string;
  name: string;
  kind: AccountKind;
  currency: string;
  createdAt: string;
}

/** Контрагент (партнёр, получатель/платёж) */
export interface Counterparty {
  id: string;
  name: string;
}

/** Категория (статья) дохода/расхода */
export interface Category {
  id: string;
  name: string;
  kind: 'income' | 'expense';
  builtin: boolean;
}

/** Транзакция. amount всегда > 0, направление — в type */
export interface Transaction {
  id: string;
  orgId: string;
  accountId: string;
  date: string; // 'YYYY-MM-DD' (нормализованный)
  amount: number;
  type: 'income' | 'expense';
  counterpartyId: string;
  category: string; // имя категории
  purpose: string;
  source: string; // имя файла-источника или 'manual'
  importedAt: string;
}

/** Бюджетная цель: месячный лимит по категории (используется в Фазе 3) */
export interface BudgetGoal {
  id: string;
  orgId: string;
  category: string;
  monthlyLimit: number;
  currency: string;
}

/** Период (месяц), может быть «закрыт» (используется в Фазе 3) */
export interface Period {
  id: string;
  orgId: string;
  name: string; // 'YYYY-MM'
  closedAt: string | null;
}

/** Ручные записи вкладки «Активы» */
export interface ManualEntryIncome { id: string; name: string; amount: number; freq: string }
export interface ManualEntryCredit { id: string; name: string; amount: number; rate: number; scheme: string }
export interface ManualEntryAsset { id: string; name: string; value: number; type: string; yieldRate: number }

export interface ManualEntries {
  incomes: ManualEntryIncome[];
  credits: ManualEntryCredit[];
  assets: ManualEntryAsset[];
}

export interface LedgerStore {
  schemaVersion: number;
  meta: {
    createdAt: string;
    updatedAt: string;
  };
  organizations: Organization[];
  accounts: Account[];
  counterparties: Counterparty[];
  categories: Category[];
  transactions: Transaction[];
  budgets: BudgetGoal[];
  periods: Period[];
  manual: ManualEntries;
}

/** Пустое хранилище: организация + основной счёт + встроенные категории */
export function createEmptyStore(): LedgerStore {
  const now = new Date().toISOString();
  const orgId = createId();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { createdAt: now, updatedAt: now },
    organizations: [{ id: orgId, name: 'Моя организация', isDefault: true, createdAt: now }],
    accounts: [{ id: createId(), orgId, name: 'Основной счёт', kind: 'bank', currency: 'RUB', createdAt: now }],
    counterparties: [],
    categories: [
      { id: createId(), name: 'Без категории', kind: 'income', builtin: true },
      { id: createId(), name: 'Без категории', kind: 'expense', builtin: true },
    ],
    transactions: [],
    budgets: [],
    periods: [],
    manual: { incomes: [], credits: [], assets: [] },
  };
}
