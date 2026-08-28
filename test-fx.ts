/**
 * Smoke-тест Фазы 3.3: мультивалютность (курсы, пересчёт, курсовые разницы).
 * Запуск: npx tsx test-fx.ts
 *
 * Проверяет:
 *  1. Даты: firstDayOfMonth/lastDayOfMonth (включая високосный февраль).
 *  2. resolveRate — последний курс с датой <= даты операции.
 *  3. toBase / totalsInBase / currencyBreakdown — пересчёт и «нет курса».
 *  4. monthFxGainLoss — переоценка валютных остатков (ручной расчёт).
 *  5. mergeExternalRates — слияние курсов ЦБ (замена/добавление/сортировка).
 *  6. Миграция v1 → v2: currency у старых операций = RUB, fxRates = [].
 *  7. Импорт: валюта операций = валюта счёта; дедупликация различает валюты.
 */
import { createEmptyStore, createId } from './src/lib/store/schema';
import type { FxRate, Transaction, Account } from './src/lib/store/schema';
import { migrateStore } from './src/lib/store/migrations';
import { importDocumentToStore } from './src/lib/store/store';
import {
  firstDayOfMonth, lastDayOfMonth, resolveRate, toBase,
  totalsInBase, currencyBreakdown, monthFxGainLoss, mergeExternalRates,
} from './src/lib/store/fx';
import type { ParsedDocument } from './src/lib/parsers/bankParsers';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

function tx(over: Partial<Transaction> & { amount: number }): Transaction {
  return {
    id: createId(), orgId: 'o', accountId: 'a', date: '2026-02-10',
    amount: over.amount, currency: 'RUB', type: 'expense', counterpartyId: 'c',
    category: 'Без категории', purpose: '', source: 't',
    importedAt: '2026-08-28T00:00:00Z', ...over,
  };
}
const rate = (date: string, code: string, r: number): FxRate => ({ id: createId(), date, code, rate: r });

function main() {
  console.log('\n[1] Даты месяца');
  check('firstDay 2026-02 → 2026-02-01', firstDayOfMonth('2026-02') === '2026-02-01');
  check('lastDay 2026-02 → 2026-02-28', lastDayOfMonth('2026-02') === '2026-02-28');
  check('lastDay 2024-02 → 2024-02-29 (високосный)', lastDayOfMonth('2024-02') === '2024-02-29');
  check('lastDay 2026-12 → 2026-12-31', lastDayOfMonth('2026-12') === '2026-12-31');

  console.log('\n[2] resolveRate: последний курс с датой <= даты операции');
  const rates = [rate('2026-01-15', 'USD', 70), rate('2026-01-20', 'USD', 75)];
  check('RUB → всегда 1', resolveRate(rates, 'RUB', '2026-01-01')?.rate === 1);
  check('нет ни одного курса → null', resolveRate(rates, 'EUR', '2026-01-25') === null);
  const r19 = resolveRate(rates, 'USD', '2026-01-19');
  check('19.01 → курс 15.01 (70)', r19?.rate === 70 && r19?.date === '2026-01-15', JSON.stringify(r19));
  const r25 = resolveRate(rates, 'USD', '2026-01-25');
  check('25.01 → курс 20.01 (75)', r25?.rate === 75, JSON.stringify(r25));
  check('10.01 → раньше всех курсов → null', resolveRate(rates, 'USD', '2026-01-10') === null);

  console.log('\n[3] toBase / totalsInBase / currencyBreakdown');
  check('RUB: 100 → 100, без missing', (() => { const c = toBase(100, 'RUB', '2026-01-19', rates); return c.base === 100 && !c.missing; })());
  check('USD 100 на 19.01 @70 → 7000', (() => { const c = toBase(100, 'USD', '2026-01-19', rates); return near(c.base, 7000) && c.rateDate === '2026-01-15'; })());
  check('USD без курса → 1:1 + missing', (() => { const c = toBase(100, 'EUR', '2026-01-19', rates); return c.base === 100 && c.missing; })());

  const mixed = [
    tx({ date: '2026-02-05', type: 'income', amount: 1000, currency: 'RUB' }),
    tx({ date: '2026-02-10', type: 'expense', amount: 100, currency: 'USD' }),
    tx({ date: '2026-03-01', type: 'expense', amount: 999, currency: 'RUB' }), // другой месяц
  ];
  const feb = [rate('2026-02-10', 'USD', 82)];
  const tot = totalsInBase(mixed, feb, '2026-02');
  check('фев: доходы 1000, расходы 8200 (100 USD @82)', near(tot.income, 1000) && near(tot.expense, 8200), JSON.stringify(tot));
  check('фев: net −7200 (1000 − 8200)', near(tot.net, -7200), String(tot.net));
  check('missing пуст, когда курс есть', tot.missing.length === 0);
  const totNoRate = totalsInBase(mixed, [], '2026-02');
  check('нет курса → 1:1 и missing [USD]', near(totNoRate.expense, 100) && totNoRate.missing.includes('USD'), JSON.stringify(totNoRate));
  const all = totalsInBase(mixed, feb);
  check('без ym — все операции (расходы 9199)', near(all.expense, 8200 + 999), String(all.expense));

  const bd = currencyBreakdown(mixed, '2026-02');
  check('разбивка: RUB net 1000', bd.find(c => c.currency === 'RUB')?.net === 1000, JSON.stringify(bd));
  check('разбивка: USD net −100', bd.find(c => c.currency === 'USD')?.net === -100);

  console.log('\n[4] monthFxGainLoss: переоценка валютных остатков');
  // USD-счёт: янв +1000 (сальдо до февраля = 1000), фев: +500 (10.02), −200 (20.02).
  // Курсы: 31.01 → 80, 10.02 → 82, 28.02 → 84.
  // Ожидание: 1000 × (84−80) + 300 × (84−82) = 4000 + 600 = 4600 ₽
  const fxRates = [rate('2026-01-31', 'USD', 80), rate('2026-02-10', 'USD', 82), rate('2026-02-28', 'USD', 84)];
  const usdTx = [
    tx({ accountId: 'u', date: '2026-01-15', type: 'income', amount: 1000, currency: 'USD' }),
    tx({ accountId: 'u', date: '2026-02-10', type: 'income', amount: 500, currency: 'USD' }),
    tx({ accountId: 'u', date: '2026-02-20', type: 'expense', amount: 200, currency: 'USD' }),
  ];
  check('фев: курсовые разницы = 4600', near(monthFxGainLoss(usdTx, '2026-02', fxRates), 4600), String(monthFxGainLoss(usdTx, '2026-02', fxRates)));
  check('янв: нет курса 31.12 → 0 (не переоцениваем)', monthFxGainLoss(usdTx, '2026-01', fxRates) === 0);
  check('только RUB → 0', monthFxGainLoss([tx({ amount: 500 })], '2026-02', fxRates) === 0);
  check('нет курсов → 0', monthFxGainLoss(usdTx, '2026-02', []) === 0);
  // Валюта дорожает, остаток растёт за счёт дохода: сверка с потоком
  const totFeb = totalsInBase(usdTx, fxRates, '2026-02');
  check('поток февраля в базовой = 24 600 (500@82 − 200@82)', near(totFeb.net, 24600), String(totFeb.net));

  console.log('\n[5] mergeExternalRates: слияние курсов ЦБ');
  const base = [rate('2026-02-28', 'USD', 80), rate('2026-02-28', 'EUR', 85)];
  const merged = mergeExternalRates(base, [{ code: 'usd', rate: 84 }, { code: 'GBP', rate: 100 }, { code: 'XXX', rate: NaN }], '2026-02-28', createId);
  const mUsd = merged.find(r => r.code === 'USD')!;
  check('USD 31.02 заменён 80 → 84', mUsd.rate === 84);
  check('GBP добавлен', merged.some(r => r.code === 'GBP' && r.rate === 100));
  check('EUR не тронут', merged.some(r => r.code === 'EUR' && r.rate === 85));
  check('мусорный курс (NaN) не добавлен', !merged.some(r => r.code === 'XXX'));
  check('итого 3 записи', merged.length === 3, String(merged.length));

  console.log('\n[6] Миграция v1 → v3 (цепочка 2 шага)');
  const v1: any = {
    schemaVersion: 1,
    meta: { createdAt: 'x', updatedAt: 'x' },
    organizations: [{ id: 'o', name: 'Тест', isDefault: true, createdAt: 'x' }],
    accounts: [{ id: 'a', orgId: 'o', name: 'Основной', kind: 'bank', currency: 'RUB', createdAt: 'x' }],
    counterparties: [{ id: 'c', name: 'Магнит' }],
    categories: [],
    transactions: [{
      id: 't1', orgId: 'o', accountId: 'a', date: '2026-01-01', amount: 100,
      type: 'expense', counterpartyId: 'c', category: 'Без категории', purpose: '', source: 's', importedAt: 'x',
    }],
    budgets: [], periods: [], manual: { incomes: [], credits: [], assets: [] },
  };
  const s2 = migrateStore(v1);
  check('schemaVersion = 3 (v1 → v2 → v3)', s2.schemaVersion === 3);
  check('старая операция получила currency = RUB', s2.transactions[0].currency === 'RUB');
  check('fxRates = []', Array.isArray(s2.fxRates) && s2.fxRates.length === 0);
  check('создан профиль-владелец (Фаза 3.6)', s2.users.length === 1 && s2.users[0].role === 'admin');
  check('остальные данные не тронуты (amount 100, 1 транзакция)', s2.transactions.length === 1 && s2.transactions[0].amount === 100);

  console.log('\n[7] Импорт: валюта счёта + дедупликация по валюте');
  const store = createEmptyStore();
  const org = store.organizations[0];
  const usdAcc: Account = { id: createId(), orgId: org.id, name: 'Долларовая карта', kind: 'card', currency: 'USD', createdAt: 'x' };
  store.accounts.push(usdAcc);
  const doc: ParsedDocument = {
    docType: 'transactions', rawText: '', fileName: 'usd-statement.csv',
    transactions: [{ date: '10.02.2026', amount: 120, type: 'expense', payer: '', payee: 'Shop', purpose: 'Goods', account: '' }],
  };
  const r1 = importDocumentToStore(store, doc, usdAcc.id);
  check('импорт в USD-счёт: 1 операция', r1.added === 1, String(r1.added));
  check('валюта операции = USD', store.transactions[0].currency === 'USD');
  const r2 = importDocumentToStore(store, doc); // тот же документ, но в RUB-счёт
  check('та же операция в другой валюте — не дубль (added = 1)', r2.added === 1, `added=${r2.added}, skipped=${r2.skipped}`);
  const r3 = importDocumentToStore(store, doc, usdAcc.id);
  check('повтор в тот же USD-счёт — дубль (skipped = 1)', r3.skipped === 1 && r3.added === 0, `added=${r3.added}, skipped=${r3.skipped}`);
  check('в хранилище 2 операции', store.transactions.length === 2);

  console.log(`\nИтого: ${passed} пройдено, ${failed} ошибок`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
