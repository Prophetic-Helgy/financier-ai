/**
 * Журнал аудита (Фаза 4 — кто/когда/что изменил).
 * Чистые функции: запись добавляется в CLONED-хранилище перед сохранением
 * (шаблон уже используется в Dashboard: structuredClone → мутировать → saveStore).
 */
import type { AuditEntry, LedgerStore } from './schema';
import { createId } from './schema';
import { currentProfile } from './roles';

/** Максимальная длина журнала: tail (новые записи — в конец, старые отбрасываются) */
export const AUDIT_LOG_LIMIT = 500;

/** Короткая строка для detail: не более 200 символов */
function clampDetail(detail: string): string {
  const s = (detail || '').replace(/\s+/g, ' ').trim();
  return s.length > 200 ? s.slice(0, 197) + '…' : s;
}

/**
 * Добавить запись аудита в (уже склонированное!) хранилище и вернуть то же хранилище.
 * Профиль — активный (meta.currentUserId); время — фиксированный now (ISO),
 * параметр — чтобы тесты не зависели от системных часов.
 */
export function appendAudit(store: LedgerStore, action: string, entity: string, detail: string, now: string): LedgerStore {
  const entry: AuditEntry = {
    id: createId(),
    at: now,
    profileId: currentProfile(store).id,
    action,
    entity,
    detail: clampDetail(detail),
  };
  const log = Array.isArray(store.auditLog) ? store.auditLog : [];
  log.push(entry);
  store.auditLog = log.length > AUDIT_LOG_LIMIT ? log.slice(log.length - AUDIT_LOG_LIMIT) : log;
  store.meta.updatedAt = now;
  return store;
}

/** Имя профиля по id (для UI); неизвестный id → «(профиль удалён)» */
export function auditProfileName(store: LedgerStore, profileId: string): string {
  const u = (Array.isArray(store.users) ? store.users : []).find(x => x.id === profileId);
  return u ? u.name : '(профиль удалён)';
}

/**
 * Проверка целостности журнала: id уникальны, at — ISO-дата,
 * profileId ссылается на существующего пользователя (кроме 'fallback-admin').
 */
export function validateAuditLog(store: LedgerStore): string[] {
  const errors: string[] = [];
  const log = Array.isArray(store.auditLog) ? store.auditLog : [];
  const ids = new Set<string>();
  const userIds = new Set((Array.isArray(store.users) ? store.users : []).map(u => u.id));
  for (const e of log) {
    if (!e || typeof e.id !== 'string' || !e.id) errors.push('запись без id');
    else if (ids.has(e.id)) errors.push(`дублирующийся id записи ${e.id}`);
    else ids.add(e.id);
    if (e && e.id && !/^[\d]{4}-[\d]{2}-[\d]{2}T/.test(e.at || '')) errors.push(`некорректное at: ${e.at}`);
    if (e && e.id && !userIds.has(e.profileId) && e.profileId !== 'fallback-admin') {
      errors.push(`profileId ссылается на несуществующего пользователя: ${e.profileId}`);
    }
  }
  if (log.length > AUDIT_LOG_LIMIT) errors.push(`журнал длиннее ${AUDIT_LOG_LIMIT} (${log.length})`);
  return errors;
}
