/**
 * Локальные профили и роли (Фаза 3.6 — семейный/совместный сценарий).
 * Чистые функции без доступа к файлам — UI и тесты используют их напрямую.
 *
 * Роль управляет ДВУМЯ вещами:
 *  1. Доступ к действиям (импорт, бюджеты, периоды, бэкапы…) — матрица MATRIX.
 *  2. Видимость операций: у профиля может быть список категорий,
 *     которые ему видны (пустой список = все).
 */
import type { LedgerStore, Transaction, UserProfile, UserRole } from './schema';

/** Подписи ролей для UI (кириллица) */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Владелец',
  member: 'Участник',
  viewer: 'Наблюдатель',
};

/** Действия, к которым может быть ограничен доступ */
export type RoleAction =
  | 'import'       // импорт выписок / добавление операций
  | 'categorize'   // эвристика и AI-категоризация
  | 'categories'   // CRUD категорий
  | 'budgets'      // CRUD бюджетов
  | 'accounts'     // CRUD счетов
  | 'fxRates'      // курсы валют
  | 'periods'      // закрытие/открытие периодов и корректировки
  | 'restore';     // восстановление из бэкапа / файлов

/** Матрица прав: admin — всё; member — всё кроме периодов и бэкапов; viewer — только просмотр */
const MATRIX: Record<UserRole, Record<RoleAction, boolean>> = {
  admin: { import: true, categorize: true, categories: true, budgets: true, accounts: true, fxRates: true, periods: true, restore: true },
  member: { import: true, categorize: true, categories: true, budgets: true, accounts: true, fxRates: true, periods: false, restore: false },
  viewer: { import: false, categorize: false, categories: false, budgets: false, accounts: false, fxRates: false, periods: false, restore: false },
};

/** Может ли роль выполнить действие */
export function can(role: UserRole, action: RoleAction): boolean {
  return MATRIX[role]?.[action] ?? false;
}

/** Синтетический профиль на случай, если meta.currentUserId бит/отсутствует */
function syntheticAdmin(): UserProfile {
  return { id: 'fallback-admin', name: 'Владелец', role: 'admin', visibleCategories: [], createdAt: '' };
}

/** Активный профиль: meta.currentUserId → первый пользователь → синтетический admin */
export function currentProfile(store: Pick<LedgerStore, 'users' | 'meta'>): UserProfile {
  const users = Array.isArray(store.users) ? store.users : [];
  const id = store.meta?.currentUserId;
  if (typeof id === 'string') {
    const found = users.find(u => u && u.id === id);
    if (found) return found;
  }
  if (users.length > 0 && users[0]) return users[0];
  return syntheticAdmin();
}

/** Видна ли пользователю категория с данным именем (регистра независимо) */
export function canSeeCategory(p: UserProfile, categoryName: string): boolean {
  if (p.role === 'admin') return true;
  if (!Array.isArray(p.visibleCategories) || p.visibleCategories.length === 0) return true;
  const target = (categoryName || '').toLowerCase();
  return p.visibleCategories.some(c => (c || '').toLowerCase() === target);
}

/** Операции, видимые активному профилю (админ или пустой список — все) */
export function visibleTransactions(store: Pick<LedgerStore, 'users' | 'meta' | 'transactions'>): Transaction[] {
  const p = currentProfile(store);
  const txs = Array.isArray(store.transactions) ? store.transactions : [];
  if (p.role === 'admin' || !Array.isArray(p.visibleCategories) || p.visibleCategories.length === 0) {
    return txs;
  }
  const allowed = new Set(p.visibleCategories.map(c => (c || '').toLowerCase()));
  return txs.filter(t => allowed.has((t.category || '').toLowerCase()));
}
