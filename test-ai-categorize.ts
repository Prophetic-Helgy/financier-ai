/**
 * Smoke-тест Фазы 3.7: автокатегоризация (эвристика + ИИ-промпт/парсер).
 * Запуск: npx tsx test-ai-categorize.ts
 *
 * Проверяет:
 *  1. heuristicCategory — совпадения словаря (регистр, kind-фильтр, нет совпадения).
 *  2. applyHeuristics — меняет только «Без категории», корректировки не трогает,
 *     категории создаёт (builtin: false), возвращает счётчик.
 *  3. Импорт — эвристика на новом: categorized в ImportResult, категории создаются.
 *  4. categorizePrompt — система требует JSON и «Без категории», юзер — список + операции.
 *  5. parseCategorizeResponse — чистый JSON, JSON в markdown-ограде, отсев
 *     чужих категорий/видов/номеров, битый JSON.
 */
import { createEmptyStore, createId } from './src/lib/store/schema';
import type { Category, Transaction } from './src/lib/store/schema';
import type { ParsedDocument as PD } from './src/lib/parsers/bankParsers';
import { importDocumentToStore } from './src/lib/store/store';
import {
  heuristicCategory, applyHeuristics, ensureCategoryByName, categorizePrompt,
  parseCategorizeResponse, UNCATEGORIZED, AiCategorizeItem,
} from './src/lib/store/categorize';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const NOW = '2026-08-28T12:00:00Z';

function cat(name: string, kind: 'income' | 'expense', builtin = false): Category {
  return { id: createId(), name, kind, builtin };
}

function tx(over: Partial<Transaction> & { amount: number }): Transaction {
  return {
    id: createId(), orgId: 'o', accountId: 'a', date: '2026-08-10',
    amount: over.amount, currency: 'RUB', type: 'expense', counterpartyId: '',
    category: UNCATEGORIZED, purpose: '', source: 't',
    importedAt: NOW, ...over,
  };
}

function main() {
  console.log('\n[1] heuristicCategory');
  check('АПТЕКА СМЫНА (расход) → Аптека', heuristicCategory({ kind: 'expense', counterparty: 'АПТЕКА СМЫНА', purpose: 'ОПЛАТА ПО КАРТЕ' })?.name === 'Аптека');
  check('ЛУКОЙЛ → Топливо', heuristicCategory({ kind: 'expense', counterparty: 'ООО ЛУКОЙЛ', purpose: 'ОПЛАТА ТОВАРОВ' })?.name === 'Топливо');
  check('МТС + «оплата услуг связи» → Связь', heuristicCategory({ kind: 'expense', counterparty: 'МТС', purpose: 'ОПЛАТА СВЯЗИ' })?.name === 'Связь');
  check('«оплата жку» (расход) → ЖКХ', heuristicCategory({ kind: 'expense', counterparty: 'УК', purpose: 'ОПЛАТА ЖКУ ЗА АПРЕЛЬ' })?.name === 'ЖКХ');
  check('«зарплата за июль» (доход) → Зарплата', heuristicCategory({ kind: 'income', counterparty: 'ООО РОСНО', purpose: 'ЗПЛАТА ЗА ИЮЛЬ' })?.name === 'Зарплата');
  check('«возврат по кредиту» (доход) → Возврат', heuristicCategory({ kind: 'income', counterparty: 'ВТБ', purpose: 'ВОЗВРАТ ПО КРЕДИТУ' })?.name === 'Возврат');
  check('пусто → null', heuristicCategory({ kind: 'expense', counterparty: '', purpose: '' }) === null);
  check('«ООО РОМАШКА / оплата счёта» → null (нет правила)', heuristicCategory({ kind: 'expense', counterparty: 'ООО РОМАШКА', purpose: 'ОПЛАТА СЧЁТА 123' }) === null);
  const incomePharmacy = heuristicCategory({ kind: 'income', counterparty: 'АПТЕКА СМЫНА', purpose: 'ВОЗВРАТ' });
  check('kind-фильтр: доход от «АПТЕКИ» не даёт «Аптека» (расход)', incomePharmacy?.name !== 'Аптека');

  console.log('\n[2] applyHeuristics');
  const s = createEmptyStore();
  s.counterparties.push({ id: 'c1', name: 'АПТЕКА СМЫНА' }, { id: 'c2', name: 'ООО ЛУКОЙЛ' }, { id: 'c3', name: 'ООО РОМАШКА' });
  s.transactions.push(
    tx({ amount: 500, counterpartyId: 'c1', purpose: 'ОПЛАТА ПО КАРТЕ' }),                    // → Аптека
    tx({ amount: 300, counterpartyId: 'c2', purpose: 'ОПЛАТА ТОВАРОВ' }),                    // → Топливо
    tx({ amount: 100, counterpartyId: 'c3', purpose: 'ОПЛАТА СЧЁТА' }),                      // → остаётся
    tx({ amount: 200, counterpartyId: 'c1', category: 'Продукты' }),                          // уже категоризована — не меняется
    tx({ amount: 90, counterpartyId: 'c1', correction: true }),                               // корректировка — не меняется
  );
  const changed = applyHeuristics(s);
  check('изменено 2 из 5', changed === 2, String(changed));
  check('c0 → Аптека, c1 → Топливо', s.transactions[0].category === 'Аптека' && s.transactions[1].category === 'Топливо',
    `${s.transactions[0].category}/${s.transactions[1].category}`);
  check('c2 осталась «Без категории»', s.transactions[2].category === UNCATEGORIZED);
  check('уже категоризованная не затронута', s.transactions[3].category === 'Продукты');
  check('корректировка не затронута', s.transactions[4].category === UNCATEGORIZED);
  check('категории созданы (builtin: false)',
    s.categories.some(c => c.name === 'Аптека' && c.kind === 'expense' && !c.builtin)
    && s.categories.some(c => c.name === 'Топливо' && c.kind === 'expense' && !c.builtin),
    JSON.stringify(s.categories.map(c => c.name)));
  const dup = ensureCategoryByName(s.categories, 'АПТЕКА', 'expense');
  check('ensureCategoryByName идемпотентна по регистру', dup.name === 'Аптека' && !s.categories.some(c => c.name === 'АПТЕКА'));

  console.log('\n[3] Импорт: эвристика на новых операциях');
  const imp = createEmptyStore();
  const doc: PD = {
    docType: 'transactions',
    fileName: 'stmt.csv',
    rawText: '',
    transactions: [
      { date: '10.08.2026', amount: -500, payer: 'x', payee: 'АПТЕКА СМЫНА', purpose: 'ОПЛАТА ПО КАРТЕ', type: 'expense', account: 'x' },
      { date: '11.08.2026', amount: -300, payer: 'x', payee: 'ООО ЛУКОЙЛ', purpose: 'ОПЛАТА ТОВАРОВ', type: 'expense', account: 'x' },
      { date: '12.08.2026', amount: -100, payer: 'x', payee: 'ООО РОМАШКА', purpose: 'ОПЛАТА СЧЁТА 123', type: 'expense', account: 'x' },
      { date: '13.08.2026', amount: 80000, payer: 'ООО РОСНО', payee: 'x', purpose: 'ЗПЛАТА ЗА ИЮЛЬ', type: 'income', account: 'x' },
    ],
  };
  const r = importDocumentToStore(imp, doc);
  check('added 4, categorized 3', r.added === 4 && r.categorized === 3, JSON.stringify(r));
  const cats = imp.categories.map(c => c.name).sort();
  check('созданы Аптека/Топливо/Зарплата (+«Без категории»)',
    ['Аптека', 'Топливо', 'Зарплата', UNCATEGORIZED].every(n => cats.includes(n)),
    JSON.stringify(cats));
  check('операция без правила — «Без категории»', imp.transactions.find(t => t.counterpartyId && t.category === UNCATEGORIZED) !== undefined);

  console.log('\n[4] categorizePrompt');
  const items: AiCategorizeItem[] = [
    { id: 't1', kind: 'expense', counterparty: 'ООО РОМАШКА', purpose: 'ОПЛАТА СЧЁТА', amount: 100 },
    { id: 't2', kind: 'income', counterparty: 'ООО РОСНО', purpose: 'АВАНС', amount: 50000 },
  ];
  const cats2 = [cat('Продукты', 'expense'), cat('Зарплата', 'income'), cat(UNCATEGORIZED, 'expense', true)];
  const prompt = categorizePrompt(items, cats2);
  check('2 сообщения system/user', prompt.length === 2 && prompt[0].role === 'system' && prompt[1].role === 'user');
  check('система: ТОЛЬКО JSON + «Без категории»', prompt[0].content.includes('JSON') && prompt[0].content.includes(UNCATEGORIZED));
  check('юзер: списки по видам и обе операции',
    prompt[1].content.includes('Продукты') && prompt[1].content.includes('Зарплата')
    && prompt[1].content.includes('ООО РОМАШКА') && prompt[1].content.includes('АВАНС')
    && prompt[1].content.includes('доход') && prompt[1].content.includes('расход'));

  console.log('\n[5] parseCategorizeResponse');
  const m1 = parseCategorizeResponse('{"1": "Продукты", "2": "Зарплата"}', items, cats2);
  check('чистый JSON: 2 валидные пары', m1.size === 2 && m1.get('t1') === 'Продукты' && m1.get('t2') === 'Зарплата', JSON.stringify([...m1]));
  const m2 = parseCategorizeResponse('Вот ответ:\n```json\n{"1": "Продукты"}\n```', items, cats2);
  check('JSON в markdown-ограде разбирается', m2.size === 1 && m2.get('t1') === 'Продукты');
  const m3 = parseCategorizeResponse('{"1": "Зарплата", "2": "Зарплата", "9": "Зарплата"}', items, cats2);
  check('отсев: чужой вид (t1→Зарплата), чужой номер (9)', m3.size === 1 && m3.get('t1') === undefined && m3.get('t2') === 'Зарплата', JSON.stringify([...m3]));
  const m4 = parseCategorizeResponse('{"1": "Кафе"}', items, cats2);
  check('неизвестная категория отброшена', m4.size === 0);
  check('битый JSON → пусто', parseCategorizeResponse('{не json', items, cats2).size === 0);
  check('пусто → пусто', parseCategorizeResponse('', items, cats2).size === 0);
  const m5 = parseCategorizeResponse('{"1": "продукты"}', items, cats2);
  check('регистр категории не важен', m5.size === 1 && m5.get('t1') === 'Продукты');

  console.log(`\nИтого: ${passed} прошло, ${failed} упало`);
  if (failed > 0) process.exit(1);
}

main();
