/**
 * Рендерер-слой хранилища учёта (Фаза 1).
 * В Electron — JSON-файл в userData через IPC (main.cjs: атомарная запись
 * + авто-бэкапы). В browser-режиме разработки — fallback в localStorage.
 */
import {
  LedgerStore,
  Category,
  Counterparty,
  createEmptyStore,
  createId,
} from './schema';
import { migrateStore } from './migrations';
import type { ParsedDocument, ParsedTransaction } from '../parsers/bankParsers';

interface StoreApi {
  load: () => Promise<unknown>;
  save: (data: LedgerStore) => Promise<{ ok: boolean; error?: string }>;
  backups: () => Promise<Array<{ index: number; size: number; mtime: number }>>;
  restoreBackup: (index: number) => Promise<{ ok: boolean; error?: string }>;
  export: () => Promise<{ ok: boolean; canceled?: boolean; path?: string; error?: string }>;
  importFile: () => Promise<{ ok: boolean; canceled?: boolean; error?: string }>;
}

function getStoreApi(): StoreApi | null {
  return (typeof window !== 'undefined' && window.electronAPI?.store) || null;
}

/** Доступно ли файловое хранилище (Electron) */
export function isLedgerSupported(): boolean {
  return !!getStoreApi();
}

const LS_KEY = 'financier.ledger.v1';

let cache: LedgerStore | null = null;

async function readRaw(): Promise<unknown> {
  const api = getStoreApi();
  if (api) return api.load();
  try {
    const s = localStorage.getItem(LS_KEY);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

async function writeRaw(store: LedgerStore): Promise<void> {
  const api = getStoreApi();
  if (api) {
    const res = await api.save(store);
    if (!res.ok) throw new Error(res.error || 'не удалось сохранить хранилище');
    return;
  }
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(store));
  } catch (e) {
    console.error('[store] localStorage переполнен:', e);
  }
}

/** Загрузить хранилище. fresh=true — перечитать с диска (после восстановления) */
export async function loadStore(fresh = false): Promise<LedgerStore> {
  if (cache && !fresh) return cache;
  cache = migrateStore(await readRaw());
  return cache;
}

/** Сохранить хранилище; возвращает сохранённую копию */
export async function saveStore(store: LedgerStore): Promise<LedgerStore> {
  store.meta.updatedAt = new Date().toISOString();
  cache = store;
  await writeRaw(store);
  return store;
}

export function getStoreCache(): LedgerStore | null {
  return cache;
}

// ============================================================
// «Импортировать в учёт»: транзакции документа → сущности
// ============================================================

export interface ImportResult {
  added: number;
  skipped: number;
}

/** 'dd.mm.yyyy' / произвольный формат → 'YYYY-MM-DD' */
export function normalizeDate(raw: string): string {
  const s = (raw || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = s.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

/** Ключ дедупликации: дата + сумма + контрагент + назначение + направление */
function dedupKey(t: { type: string; date: string; amount: number; counterparty: string; purpose: string }): string {
  return [
    t.type,
    normalizeDate(t.date),
    Math.round((t.amount || 0) * 100),
    (t.counterparty || '').trim().toLowerCase(),
    (t.purpose || '').trim().toLowerCase(),
  ].join('|');
}

function counterpartyName(tx: ParsedTransaction): string {
  const name = (tx.type === 'income' ? tx.payer : tx.payee) || '';
  return name.trim() || 'Неизвестный контрагент';
}

/**
 * Импортировать транзакции документа в хранилище (мутации — только
 * переданного объекта: копируйте store перед вызовом).
 * Дедупликация по date+amount+counterparty+purpose, включая уже
 * сохранённые операции и повторные загрузки того же файла.
 */
export function importDocumentToStore(store: LedgerStore, doc: ParsedDocument): ImportResult {
  let org = store.organizations.find(o => o.isDefault) || store.organizations[0];
  if (!org) {
    org = { id: createId(), name: 'Моя организация', isDefault: true, createdAt: new Date().toISOString() };
    store.organizations.push(org);
  }
  let account = store.accounts.find(a => a.orgId === org.id);
  if (!account) {
    account = {
      id: createId(), orgId: org.id, name: 'Основной счёт',
      kind: 'bank', currency: 'RUB', createdAt: new Date().toISOString(),
    };
    store.accounts.push(account);
  }
  const now = new Date().toISOString();

  const ensureCategory = (kind: 'income' | 'expense'): string => {
    const found = store.categories.find(c => c.builtin && c.kind === kind);
    if (found) return found.name;
    const cat: Category = { id: createId(), name: 'Без категории', kind, builtin: true };
    store.categories.push(cat);
    return cat.name;
  };

  const ensureCounterparty = (name: string): string => {
    const found = store.counterparties.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (found) return found.id;
    const cp: Counterparty = { id: createId(), name };
    store.counterparties.push(cp);
    return cp.id;
  };

  const cpName = new Map(store.counterparties.map(c => [c.id, c.name]));
  const seen = new Set(
    store.transactions.map(tx =>
      dedupKey({
        type: tx.type,
        date: tx.date,
        amount: tx.amount,
        counterparty: cpName.get(tx.counterpartyId) || '',
        purpose: tx.purpose,
      })
    )
  );

  let added = 0;
  let skipped = 0;
  for (const tx of doc.transactions) {
    if (!Number.isFinite(tx.amount) || tx.amount === 0) { skipped++; continue; }
    const key = dedupKey({
      type: tx.type,
      date: tx.date,
      amount: Math.abs(tx.amount),
      counterparty: counterpartyName(tx),
      purpose: tx.purpose,
    });
    if (seen.has(key)) { skipped++; continue; }
    seen.add(key);

    store.transactions.push({
      id: createId(),
      orgId: org.id,
      accountId: account.id,
      date: normalizeDate(tx.date),
      amount: Math.abs(tx.amount),
      type: tx.type === 'income' ? 'income' : 'expense',
      counterpartyId: ensureCounterparty(counterpartyName(tx)),
      category: ensureCategory(tx.type === 'income' ? 'income' : 'expense'),
      purpose: (tx.purpose || '').trim(),
      source: doc.fileName,
      importedAt: now,
    });
    added++;
  }
  return { added, skipped };
}
