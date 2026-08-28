/**
 * Smoke-тест Фазы 3.4: бюджеты и план-факт.
 * Запуск: npx tsx test-budgets.ts
 *
 * Проверяет:
 *  1. daysInMonth (включая февраль 29/28) и currentYM.
 *  2. budgetSummary — план-факт по категориям за месяц, unbudgeted, итоги.
 *  3. monthForecast — темп по прошедшим дням, asOfDay=0, закрытый месяц.
 *  4. Сквозной: импорт выписки Сбера → бюджет «Без категории» → план-факт.
 */
import fs from 'fs';
import path from 'path';
import { createEmptyStore, createId } from './src/lib/store/schema';
import type { BudgetGoal, Transaction } from './src/lib/store/schema';
import { importDocumentToStore } from './src/lib/store/store';
import { budgetSummary, monthForecast, daysInMonth, currentYM } from './src/lib/store/budgets';
import { parseBankStatement } from './src/lib/parsers/bankProfiles';
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
    id: createId(), orgId: 'o', accountId: 'a', date: '2026-08-10',
    amount: over.amount, currency: 'RUB', type: 'expense', counterpartyId: 'c',
    category: 'Без категории', purpose: '', source: 't',
    importedAt: '2026-08-28T00:00:00Z', ...over,
  };
}

function main() {
  console.log('\n[1] daysInMonth / currentYM');
  check('2024-02 → 29 дней (високосный)', daysInMonth('2024-02') === 29, String(daysInMonth('2024-02')));
  check('2025-02 → 28 дней', daysInMonth('2025-02') === 28, String(daysInMonth('2025-02')));
  check('2026-12 → 31 день', daysInMonth('2026-12') === 31, String(daysInMonth('2026-12')));
  check('мусор → fallback 30', daysInMonth('xxx') === 30);
  const now = new Date();
  const expectYM = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  check('currentYM = актуальный месяц', currentYM() === expectYM, currentYM());

  console.log('\n[2] budgetSummary: план-факт 2026-08');
  const budgets: BudgetGoal[] = [
    { id: createId(), orgId: 'o', category: 'Еда', monthlyLimit: 5000, currency: 'RUB' },
    { id: createId(), orgId: 'o', category: 'Транспорт', monthlyLimit: 2000, currency: 'RUB' },
  ];
  const transactions: Transaction[] = [
    tx({ date: '2026-08-05', category: 'Еда', amount: 1000 }),
    tx({ date: '2026-08-20', category: 'Еда', amount: 2500 }),
    tx({ date: '2026-08-10', category: 'Транспорт', amount: 300 }),
    tx({ date: '2026-08-15', category: 'Без категории', amount: 700 }),
    tx({ date: '2026-09-01', category: 'Еда', amount: 999 }), // другой месяц — не считается
    tx({ date: '2026-08-01', type: 'income', category: 'Без категории', amount: 5000 }), // доход — не считается
  ];
  const s = budgetSummary({ budgets, transactions }, '2026-08');
  const food = s.lines.find(l => l.category === 'Еда')!;
  const trans = s.lines.find(l => l.category === 'Транспорт')!;
  check('Еда: факт 3500', near(food.actual, 3500), String(food.actual));
  check('Еда: остаток 1500, pct 0.7', near(food.remaining, 1500) && near(food.pct, 0.7), `${food.remaining}/${food.pct}`);
  check('Транспорт: факт 300, pct 0.15', near(trans.actual, 300) && near(trans.pct, 0.15), `${trans.actual}/${trans.pct}`);
  check('unbudgeted = 700 (Без категории)', near(s.unbudgeted, 700), String(s.unbudgeted));
  check('totalLimit = 7000', near(s.totalLimit, 7000), String(s.totalLimit));
  check('totalActual = 4500 (все расходы месяца)', near(s.totalActual, 4500), String(s.totalActual));
  const sSept = budgetSummary({ budgets, transactions }, '2026-09');
  check('сент: факт Еды 999 (свой месяц)', near(sSept.lines[0].actual, 999), String(sSept.lines[0].actual));

  console.log('\n[3] monthForecast: темп и прогноз');
  const f15 = monthForecast(transactions, '2026-08', 15);
  check('asOf 15: потрачено 2000 (05+10+15 числа)', near(f15.spent, 2000), String(f15.spent));
  check('asOf 15: темп 133.33/день', near(f15.pacePerDay, 2000 / 15), String(f15.pacePerDay));
  check('asOf 15: прогноз к концу 4133.33', near(f15.projectedTotal, (2000 / 15) * 31), String(f15.projectedTotal));
  const f0 = monthForecast(transactions, '2026-08', 0);
  check('asOf 0: ничего не потрачено', f0.spent === 0 && f0.projectedTotal === 0);
  const f31 = monthForecast(transactions, '2026-08', 31);
  check('закрытый месяц: прогноз = факт 4500', near(f31.projectedTotal, 4500), String(f31.projectedTotal));

  console.log('\n[4] Сквозной: выписка Сбера → бюджет «Без категории»');
  const csv = fs.readFileSync(path.join(process.cwd(), 'test-data', 'bank-statements', 'sberbank_statement.csv'), 'utf-8');
  const bs = parseBankStatement(csv, 'sberbank_statement.csv');
  const store = createEmptyStore();
  const doc: ParsedDocument = { docType: 'transactions', transactions: bs.transactions, rawText: '', fileName: 'sberbank_statement.csv' };
  const imp = importDocumentToStore(store, doc);
  check('Импорт: 6 операций', imp.added === 6, String(imp.added));
  const ym = store.transactions[0].date.slice(0, 7);
  store.budgets.push({
    id: createId(), orgId: store.organizations[0].id,
    category: 'Без категории', monthlyLimit: 10000, currency: 'RUB',
  });
  const sberSummary = budgetSummary(store, ym);
  const expTotal = store.transactions.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
  const uncat = store.categories.find(c => c.builtin && c.kind === 'expense')!.name;
  const uncatExp = store.transactions.filter(t => t.type === 'expense' && t.category === uncat).reduce((sum, t) => sum + t.amount, 0);
  const line = sberSummary.lines.find(l => l.category === 'Без категории')!;
  check(`План-факт ${ym}: факт = ${uncatExp}`, near(line.actual, uncatExp), `${line.actual} vs ${uncatExp}`);
  check('Остаток в бюджете 10 000', near(line.remaining, 10000 - uncatExp), String(line.remaining));
  check(`Эвристика: комиссия 250 вне бюджета «${uncat}»`, near(sberSummary.unbudgeted, 250) && store.transactions.find(t => t.amount === 250 && t.category !== uncat) !== undefined, 'unbudgeted=' + sberSummary.unbudgeted + ', cat=' + (store.transactions.find(t => t.amount === 250)?.category || '?'));
  const fc = monthForecast(store.transactions, ym, daysInMonth(ym));
  check('Прогноз закрытого месяца = факт', near(fc.projectedTotal, expTotal), String(fc.projectedTotal));

  console.log(`\nИтого: ${passed} пройдено, ${failed} ошибок`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
