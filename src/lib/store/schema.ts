/**
 * Сущности хранилища учёта (Фаза 1).
 * Версия схемы — schemaVersion; любые изменения структуры проходят
 * через цепочку миграций в migrations.ts (обратная совместимость).
 */

export const SCHEMA_VERSION = 3;

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
  currency: string; // ISO 4217, валюта суммы (обычно валюта счёта); RUB — базовая
  type: 'income' | 'expense';
  counterpartyId: string;
  category: string; // имя категории
  purpose: string;
  source: string; // имя файла-источника или 'manual'
  importedAt: string;
  correction?: boolean; // корректирующая запись в закрытый период (Фаза 3.5) — единственная допустимая мутация закрытого месяца
}

/** Бюджетная цель: месячный лимит по категории (используется в Фазе 3) */
export interface BudgetGoal {
  id: string;
  orgId: string;
  category: string;
  monthlyLimit: number;
  currency: string;
}

/** Курс валюты (Фаза 3.3): rate — сколько базовой валюты (RUB) за 1 единицу code */
export interface FxRate {
  id: string;
  date: string; // 'YYYY-MM-DD'
  code: string; // ISO 4217 (не RUB)
  rate: number;
}

/** Период (месяц), может быть «закрыт» (используется в Фазе 3) */
export interface Period {
  id: string;
  orgId: string;
  name: string; // 'YYYY-MM'
  closedAt: string | null;
}

/** Роль профиля (Фаза 3.6): admin — полный доступ, member — всё кроме закрытия периодов и бэкапов, viewer — только просмотр */
export type UserRole = 'admin' | 'member' | 'viewer';

/** Локальный профиль пользователя (семейный/совместный сценарий, Фаза 3.6) */
export interface UserProfile {
  id: string;
  name: string;
  role: UserRole;
  /** Имена категорий, видимых профилю; пустой список = все (для admin всегда все) */
  visibleCategories: string[];
  createdAt: string;
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
    /** Активный профиль (Фаза 3.6); определяется в роли.ts, если отсутствует */
    currentUserId?: string;
  };
  organizations: Organization[];
  accounts: Account[];
  counterparties: Counterparty[];
  categories: Category[];
  transactions: Transaction[];
  budgets: BudgetGoal[];
  fxRates: FxRate[];
  periods: Period[];
  users: UserProfile[];
  manual: ManualEntries;
}

/** Пустое хранилище: организация + основной счёт + встроенные категории + владелец */
export function createEmptyStore(): LedgerStore {
  const now = new Date().toISOString();
  const orgId = createId();
  const ownerId = createId();
  return {
    schemaVersion: SCHEMA_VERSION,
    meta: { createdAt: now, updatedAt: now, currentUserId: ownerId },
    organizations: [{ id: orgId, name: 'Моя организация', isDefault: true, createdAt: now }],
    accounts: [{ id: createId(), orgId, name: 'Основной счёт', kind: 'bank', currency: 'RUB', createdAt: now }],
    counterparties: [],
    categories: [
      { id: createId(), name: 'Без категории', kind: 'income', builtin: true },
      { id: createId(), name: 'Без категории', kind: 'expense', builtin: true },
    ],
    transactions: [],
    budgets: [],
    fxRates: [],
    periods: [],
    users: [{ id: ownerId, name: 'Владелец', role: 'admin', visibleCategories: [], createdAt: now }],
    manual: { incomes: [], credits: [], assets: [] },
  };
}
