/**
 * Smoke-тест Фазы 3.5: периоды (закрытие месяца, корректирующие записи, MTD/YTD).
 * Запуск: npx tsx test-periods.ts
 *
 * Проверяет:
 *  1. ymOf — месяц операции.
 *  2. nextPeriods — close/reopen (upsert по имени).
 *  3. periodRows — строки месяцев (статус, итоги, счётчик корректировок).
 *  4. makeCorrection — корректирующая операция (поля, префикс назначения).
 *  5. Миграция не нужна: схема v2 без изменений (correction — опциональное поле).
 *  6. Импорт: операции в закрытый месяц блокируются (blocked), после открытия — идут.
 *  7. MTD/YTD — сравнение с т.п. прошлого месяца/года (ручной расчёт, валюта, края).
 */
import { createEmptyStore, createId } from './src/lib/store/schema';
import type { FxRate, Transaction } from './src/lib/store/schema';
import type { ParsedDocument as PD } from './src/lib/parsers/bankParsers';
import { importDocumentToStore } from './src/lib/store/store';
import {
  ymOf, nextPeriods, isPeriodClosed, periodRows, makeCorrection, mtdYtd,
} from './src/lib/store/periods';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const NOW = '2026-08-28T12:00:00Z';
const TODAY = '2026-08-28';

function tx(over: Partial<Transaction> & { amount: number }): Transaction {
  return {
    id: createId(), orgId: 'o', accountId: 'a', date: '2026-08-10',
    amount: over.amount, currency: 'RUB', type: 'expense', counterpartyId: '',
    category: 'Без категории', purpose: '', source: 't',
    importedAt: NOW, ...over,
  };
}

function main() {
  console.log('\n[1] ymOf');
  check("'2026-08-05' → '2026-08'", ymOf('2026-08-05') === '2026-08');
  check("'2025-12-31' → '2025-12'", ymOf('2025-12-31') === '2025-12');
  check("'' → ''", ymOf('') === '');

  const orgId = 'org1';
  console.log('\n[2] nextPeriods: close/reopen (upsert)');
  const closed = nextPeriods([], orgId, '2026-07', true, NOW);
  check('close пустого списка → 1 период', closed.length === 1 && closed[0].name === '2026-07' && closed[0].closedAt === NOW, JSON.stringify(closed));
  const closed2 = nextPeriods(closed, orgId, '2026-06', true, NOW);
  check('второй месяц → 2 периода', closed2.length === 2);
  const replaced = nextPeriods(closed2, orgId, '2026-07', true, '2026-08-29T00:00:00Z');
  check('повторное закрытие = upsert (closedAt обновлён, всё ещё 2)', replaced.length === 2 && replaced.find(p => p.name === '2026-07')?.closedAt === '2026-08-29T00:00:00Z');
  const reopened = nextPeriods(replaced, orgId, '2026-07', false, NOW);
  check('reopen → запись удалена (1 период)', reopened.length === 1 && reopened[0].name === '2026-06');

  const store = createEmptyStore();
  const s0 = store.organizations[0].id;
  store.periods = nextPeriods(store.periods, s0, '2026-07', true, NOW);
  check('isPeriodClosed: 2026-07 true, 2026-08 false', isPeriodClosed(store, '2026-07') && !isPeriodClosed(store, '2026-08'));

  console.log('\n[3] periodRows');
  const rows = periodRows(store);
  check('закрытый месяц без операций присутствует (count 0, closed)', (() => { const r = rows.find(x => x.ym === '2026-07'); return !!r && r.closed && r.count === 0 && r.closedAt === NOW; })(), JSON.stringify(rows));

  store.transactions.push(
    tx({ date: '2026-07-10', type: 'income', amount: 500 }),
    tx({ date: '2026-07-15', amount: 200 }),
    tx({ date: '2026-08-05', type: 'income', amount: 1000 }),
  );
  const rows2 = periodRows(store);
  check('свежие сверху: 2026-08 → 2026-07', rows2[0]?.ym === '2026-08' && rows2[1]?.ym === '2026-07', JSON.stringify(rows2.map(r => r.ym)));
  const july = rows2.find(x => x.ym === '2026-07');
  check('июль: income 500, expense 200, net 300, closed', july?.income === 500 && july?.expense === 200 && july?.net === 300 && july?.closed, JSON.stringify(july));

  console.log('\n[4] makeCorrection');
  const corr = makeCorrection({
    date: '2026-07-20', type: 'expense', amount: -50, currency: 'RUB',
    accountId: 'a1', orgId: s0, category: 'Ремонт', purpose: 'доплата по счёту',
  }, NOW);
  check('correction=true, amount=|−50|=50', corr.correction === true && corr.amount === 50);
  check('назначение: «Корректировка: доплата по счёту»', corr.purpose === 'Корректировка: доплата по счёту', corr.purpose);
  check('source=manual, счёт/организация сохранены', corr.source === 'manual' && corr.accountId === 'a1' && corr.orgId === s0);
  store.transactions.push(corr);
  const rows3 = periodRows(store);
  const july2 = rows3.find(x => x.ym === '2026-07');
  check('корректировка в итогах июля: expense 250, corrections 1', july2?.expense === 250 && july2?.corrections === 1, JSON.stringify(july2));

  console.log('\n[6] Импорт: закрытые периоды блокируются');
  const imp = createEmptyStore();
  const impOrg = imp.organizations[0].id;
  imp.periods = nextPeriods(imp.periods, impOrg, '2026-07', true, NOW);
  const doc: PD = {
    docType: 'transactions',
    fileName: 'stmt.csv',
    rawText: '',
    transactions: [
      { date: '10.07.2026', amount: 100, payer: 'A', payee: 'B', purpose: 'p1', type: 'income', account: 'x' },
      { date: '10.08.2026', amount: 200, payer: 'A', payee: 'B', purpose: 'p2', type: 'income', account: 'x' },
    ],
  };
  const r1 = importDocumentToStore(imp, doc);
  check('закрыт июль: blocked 1, added 1 (август)', r1.blocked === 1 && r1.added === 1 && r1.skipped === 0, JSON.stringify(r1));
  const r2 = importDocumentToStore(imp, doc);
  check('повторный импорт: август — дубль, июль снова blocked', r2.added === 0 && r2.skipped === 1 && r2.blocked === 1, JSON.stringify(r2));
  imp.periods = nextPeriods(imp.periods, impOrg, '2026-07', false, NOW);
  const r3 = importDocumentToStore(imp, doc);
  check('после открытия: июль импортирован (added 1)', r3.added === 1 && r3.blocked === 0, JSON.stringify(r3));

  console.log('\n[7] MTD / YTD (сегодня = ' + TODAY + ')');
  // 2026: янв +500 (01-15), июл +800 (07-03) −300 (07-20), авг +1000 (08-05) −400 (08-10)
  // 2025: июнь +200 (06-10)
  const m = [
    tx({ date: '2026-08-05', type: 'income', amount: 1000 }),
    tx({ date: '2026-08-10', amount: 400 }),
    tx({ date: '2026-07-03', type: 'income', amount: 800 }),
    tx({ date: '2026-07-20', amount: 300 }),
    tx({ date: '2026-01-15', type: 'income', amount: 500 }),
    tx({ date: '2025-06-10', type: 'income', amount: 200 }),
    tx({ date: '2025-09-01', type: 'income', amount: 777 }), // вне YTD-окон (после 28-го дня)
  ];
  const c = mtdYtd(m, [], TODAY);
  check('MTD: income 1000, expense 400, net 600', near(c.mtd.income, 1000) && near(c.mtd.expense, 400) && near(c.mtd.net, 600), JSON.stringify(c.mtd));
  check('MTD т.п. июля (1..28): net 500', near(c.mtdPrev.net, 500), JSON.stringify(c.mtdPrev));
  check('Δ MTD = +20% ((600−500)/500)', c.mtdDeltaPct !== null && near(c.mtdDeltaPct, 20, 0.01), String(c.mtdDeltaPct));
  check('YTD: net 1600 (янв 500 + июл 500 + авг 600)', near(c.ytd.net, 1600), JSON.stringify(c.ytd));
  check('YTD т.п. 2025 (01.01..28.08): net 200, сентябрь 2025 не учитывается', near(c.ytdPrev.net, 200), JSON.stringify(c.ytdPrev));
  check('Δ YTD = +700% ((1600−200)/200)', c.ytdDeltaPct !== null && near(c.ytdDeltaPct, 700, 0.01), String(c.ytdDeltaPct));

  const empty = mtdYtd([], [], TODAY);
  check('пусто: всё 0, дельты null', empty.mtd.net === 0 && empty.ytd.net === 0 && empty.mtdDeltaPct === null && empty.ytdDeltaPct === null);

  const m2 = [tx({ date: '2026-08-05', type: 'income', amount: 100 }), tx({ date: '2026-07-05', type: 'income', amount: 100 })];
  const c2 = mtdYtd(m2, [], TODAY);
  check('равные периоды → Δ 0%', c2.mtdDeltaPct !== null && near(c2.mtdDeltaPct, 0), String(c2.mtdDeltaPct));

  // курсовая операция: 10 USD @80 (курс с 01.08) → 800 ₽ в MTD
  const usd = [tx({ date: '2026-08-05', type: 'income', amount: 10, currency: 'USD' })];
  const fx: FxRate[] = [{ id: createId(), date: '2026-08-01', code: 'USD', rate: 80 }];
  const c3 = mtdYtd(usd, fx, TODAY);
  check('MTD с курсом: 10 USD @80 → income 800', near(c3.mtd.income, 800), JSON.stringify(c3.mtd));

  // край месяца: сегодня = 31-е, в прошлом месяце (февраль) дней меньше — покрывается весь
  const febAll = mtdYtd(
    [tx({ date: '2026-02-28', type: 'income', amount: 90 })],
    [], '2026-03-31');
  check('31.03: т.п. февраля = весь февраль (90)', near(febAll.mtdPrev.net, 90), JSON.stringify(febAll.mtdPrev));
  const febYtd = mtdYtd(
    [tx({ date: '2025-02-28', type: 'income', amount: 90 })],
    [], '2026-03-31');
  check('31.03: т.п. прошлого года = весь фев 2025 (90)', near(febYtd.ytdPrev.net, 90), JSON.stringify(febYtd.ytdPrev));

  console.log(`\nИтого: ${passed} прошло, ${failed} упало`);
  if (failed > 0) process.exit(1);
}

main();
