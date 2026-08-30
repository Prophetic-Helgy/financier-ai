/**
 * Автокатегоризация операций (Фаза 3.7) — два уровня:
 *
 *  1. Эвристика: словарь ключевых слов по контрагенту/назначению — офлайн,
 *     детерминированна. Применяется автоматически при импорте (store.ts)
 *     и повторно по кнопке «Категоризовать» из вкладки «Учёт».
 *  2. ИИ: локальный LLM (LM Studio) категоризирует только то, что не
 *     определила эвристика. Промпт и парсер JSON-ответа — чистые функции
 *     здесь; вызов LLM — в UI (LedgerView).
 *
 * Категории, которых нет в хранилище, автоматически создаются
 * (builtin: false) через ensureCategoryByName.
 */
import { createId } from './schema';
import type { Category, Transaction } from './schema';
import { sanitizePromptText } from '../llmIntegration';

/** Имя встроенной категории для операций без определённой категории. */
export const UNCATEGORIZED = 'Без категории';

export interface CategorizeInput {
  kind: 'income' | 'expense';
  counterparty: string;
  purpose: string;
}

interface Rule {
  category: string;
  kind: 'income' | 'expense';
  /** Подстроки (нижний регистр) в «контрагент + назначение». Работает первое совпадение. */
  words: string[];
}

/** Порядок важен: сначала специфичные правила, потом общие. */
const RULES: Rule[] = [
  // Доходы
  { kind: 'income', category: 'Зарплата', words: ['зплат', 'аванс', 'оклад', 'гонорар'] },
  { kind: 'income', category: 'Социальные выплаты', words: ['пособие', 'пенсия', 'стипендия', 'маткапитал', 'соцвыплата'] },
  { kind: 'income', category: 'Дивиденды', words: ['дивиденд'] },
  { kind: 'income', category: 'Проценты', words: ['процент', 'вклад'] },
  { kind: 'income', category: 'Возврат', words: ['возврат', 'вернул'] },
  { kind: 'income', category: 'Продажа', words: ['продаж'] },

  // Расходы
  { kind: 'expense', category: 'Аптека', words: ['аптек', 'смина', 'пика', 'мать и дитя', 'рива'] },
  { kind: 'expense', category: 'Топливо', words: ['заправк', 'лукойл', 'роснефть', 'газпромнефть', 'shell', 'тнк', 'нефтепродукт'] },
  { kind: 'expense', category: 'Связь', words: ['мтс', 'билайн', 'tele2', 'yota', 'vodafone', 'интернет', 'связь'] },
  { kind: 'expense', category: 'ЖКХ', words: ['жкх', 'жку', 'еирц', 'водоканал', 'энергосбыт', 'квартплата', 'управляющ', 'тэц', 'отопление', 'за газ', 'электрич'] },
  { kind: 'expense', category: 'Транспорт', words: ['метрополитен', 'проезд', 'билет', 'такси', 'taxi', 'uber', 'самокат', 'каршеринг', 'ржд', 'аэрофлот'] },
  { kind: 'expense', category: 'Продукты', words: ['продукт', 'магнит', 'пятерочк', 'перекрестк', 'дикси', 'ашан', 'верный', 'спар', 'вкусвилл', 'сады россии', 'окей'] },
  { kind: 'expense', category: 'Покупки', words: ['ozon', 'wildberries', 'маркетплейс', 'ламода', 'ikea', 'спортмастер', 'красное и белое', 'красное&белое'] },
  { kind: 'expense', category: 'Образование', words: ['школ', 'детский сад', 'институт', 'вуз', 'репетитор'] },
  { kind: 'expense', category: 'Развлечения', words: ['концерт', 'театр', 'кинотеатр', 'цирк', 'матч', 'кино'] },
  { kind: 'expense', category: 'Здоровье', words: ['клиник', 'больниц', 'медцентр', 'стоматолог', 'врач', 'поликлиник'] },
  { kind: 'expense', category: 'Налоги и пошлины', words: ['налог', 'фнс', 'штраф', 'пошлина'] },
  { kind: 'expense', category: 'Комиссия', words: ['комисси'] },
  { kind: 'expense', category: 'Снятие наличных', words: ['снятие', 'наличны'] },
  { kind: 'expense', category: 'Перевод', words: ['перевод'] },
];

/** Категория по эвристике (первое совпадение) или null, если ничего не подошло. */
export function heuristicCategory(inp: CategorizeInput): { name: string; kind: 'income' | 'expense' } | null {
  const text = `${inp.counterparty || ''} ${inp.purpose || ''}`.toLowerCase();
  if (!text.trim()) return null;
  for (const rule of RULES) {
    if (rule.kind !== inp.kind) continue;
    if (rule.words.some(w => text.includes(w))) return { name: rule.category, kind: rule.kind };
  }
  return null;
}

/** Найти категорию по имени и виду; при отсутствии — создать (builtin: false). Мутация переданного массива. */
export function ensureCategoryByName(categories: Category[], name: string, kind: 'income' | 'expense'): Category {
  const found = categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.kind === kind);
  if (found) return found;
  const cat: Category = { id: createId(), name, kind, builtin: false };
  categories.push(cat);
  return cat;
}

/** Минимальный срез хранилища, нужный для повторной эвристической категоризации. */
export interface CategorizableStore {
  transactions: Transaction[];
  categories: Category[];
  counterparties: { id: string; name: string }[];
}

/**
 * Повторно категоризовать операции «Без категории» по эвристике
 * (мутация переданного объекта — клонируйте операции/категории перед вызовом).
 * Корректирующие записи пропускаются: они относятся к закрытому месяцу,
 * и закрытые периоды не меняются (Фаза 3.5).
 * Возвращает число изменённых операций.
 */
export function applyHeuristics(store: CategorizableStore): number {
  const cp = new Map(store.counterparties.map(c => [c.id, c.name]));
  let changed = 0;
  for (const tx of store.transactions) {
    if (tx.correction || tx.category !== UNCATEGORIZED) continue;
    const hit = heuristicCategory({
      kind: tx.type,
      counterparty: cp.get(tx.counterpartyId) || '',
      purpose: tx.purpose,
    });
    if (!hit) continue;
    tx.category = ensureCategoryByName(store.categories, hit.name, hit.kind).name;
    changed++;
  }
  return changed;
}

/** Операция для ИИ-категоризации (без привязки к хранилищу). */
export interface AiCategorizeItem {
  id: string;
  kind: 'income' | 'expense';
  counterparty: string;
  purpose: string;
  amount: number;
}

/**
 * Промпт для локального LLM: каждой операции — ровно одна категория из
 * списка пользователя. Структурно совместим с ChatMessage из llmIntegration.
 */
export function categorizePrompt(items: AiCategorizeItem[], categories: Category[]) {
  const names = (k: 'income' | 'expense') =>
    categories.filter(c => c.kind === k).map(c => c.name);
  // Поля из импортированных выписок — недоверенные (пентест, находка #7):
  // fence-escape + сворачиваем в одну строку, чтобы запись нельзя было «раздвоить».
  const oneLine = (s: unknown, max: number) =>
    sanitizePromptText(String(s ?? ''), max).replace(/[\r\n]+/g, ' ');
  const lines = items.map((t, i) =>
    `${i + 1}) ${t.kind === 'income' ? 'доход' : 'расход'}, контрагент: «${oneLine(t.counterparty, 200)}», назначение: «${oneLine(t.purpose, 300)}»`
  ).join('\n');
  return [
    {
      role: 'system' as const,
      content:
        'Ты — финансовый ассистент. Назначь каждой операции ровно одну категорию ' +
        'из списка (именно так, как она написана в списке). Ответь ТОЛЬКО JSON-объектом ' +
        'без пояснений и без markdown: ключ — номер операции, значение — название категории. ' +
        `Если ни одна не подходит, используй "${UNCATEGORIZED}".`,
    },
    {
      role: 'user' as const,
      content:
        `Категории для доходов: ${names('income').join(', ') || '—'}\n` +
        `Категории для расходов: ${names('expense').join(', ') || '—'}\n\n` +
        `Операции:\n${lines}`,
    },
  ];
}

/**
 * Разобрать JSON-ответ LLM вида {"1": "Продукты", ...}.
 * Ключ — номер операции (1-based). Недействительные записи (нет такой
 * операции, неизвестная категория, несоответствие вида доход/расход)
 * отбрасываются. Возвращает Map<tx.id, имя категории>.
 */
export function parseCategorizeResponse(
  text: string,
  items: AiCategorizeItem[],
  categories: Category[],
): Map<string, string> {
  const out = new Map<string, string>();
  if (!text) return out;
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return out;
  let data: unknown;
  try {
    data = JSON.parse(text.slice(start, end + 1));
  } catch {
    return out;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return out;
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    const item = items[Number(key) - 1];
    if (!item || typeof value !== 'string') continue;
    const name = value.trim();
    const cat = categories.find(c => c.name.toLowerCase() === name.toLowerCase() && c.kind === item.kind);
    if (cat) out.set(item.id, cat.name);
  }
  return out;
}
