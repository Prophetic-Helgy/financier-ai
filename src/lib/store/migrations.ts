import { LedgerStore, SCHEMA_VERSION, createEmptyStore } from './schema';

/**
 * Цепочка миграций: ключ — целевая версия, функция превращает
 * хранилище версии n-1 в версию n.
 * Миграции только расширяют схему (новые поля со значениями по
 * умолчанию) — старые данные пользователей не ломаются.
 */
const MIGRATIONS: Record<number, (s: any) => any> = {
  // v1 → v2 (Фаза 3.3, мультивалютность): у транзакций появляется валюта
  // (старые операции были «всё в ₽» — заполняем RUB), добавляем таблицу курсов.
  2: (v1) => ({
    ...v1,
    transactions: (v1.transactions || []).map((t: any) =>
      t && typeof t.currency === 'string' && t.currency ? t : { ...t, currency: 'RUB' }
    ),
    fxRates: Array.isArray(v1.fxRates) ? v1.fxRates : [],
    schemaVersion: 2,
  }),
};

/**
 * Принять сырые данные с диска и привести к текущей версии схемы.
 * Повреждённый/чужой файл → чистое хранилище (данные не теряются:
 * main-процесс уже откатился на бэкап, если мог).
 */
export function migrateStore(raw: unknown): LedgerStore {
  if (!raw || typeof raw !== 'object') return createEmptyStore();
  const data = raw as { schemaVersion?: unknown };

  if (typeof data.schemaVersion !== 'number') {
    console.warn('[store] schemaVersion отсутствует — файл не является хранилищем Финансист.AI, начинаю с чистого');
    return createEmptyStore();
  }

  let version = data.schemaVersion;
  if (version > SCHEMA_VERSION) {
    console.warn(`[store] Схема v${version} новее поддерживаемой v${SCHEMA_VERSION} — работаю на чистом хранилище, содержимое не трогаю`);
    return createEmptyStore();
  }

  let current: any = raw;
  while (version < SCHEMA_VERSION) {
    const step = MIGRATIONS[version + 1];
    if (!step) throw new Error(`[store] Не найдена миграция на версию ${version + 1}`);
    current = step(current);
    version = typeof current.schemaVersion === 'number' ? current.schemaVersion : version + 1;
  }
  return current as LedgerStore;
}
