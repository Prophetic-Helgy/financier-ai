/**
 * Smoke-тест Фазы 5: крайние значения и устойчивость хранилища.
 * Запуск: npx tsx test-edge-cases.ts
 *
 * Проверяет:
 *  1. Суммы: 0 / отрицательные / NaN / Infinity; огромные числа (дедуп и итоги).
 *  2. Даты: пустые, некорректные (2026-13-45, 2026-02-30), високосные, форматы.
 *  3. Unicode и длинные имена: контрагенты/назначения, дедупликация case-insensitive.
 *  4. Пустой документ / пустое хранилище / migrateStore(null).
 *  5. Round-trip: JSON → parse → migrateStore (идемпотентность, данные не меняются).
 *  6. Массовый импорт: 5000 операций — время, дедупликация повторной загрузки.
 */
import { createEmptyStore } from './src/lib/store/schema';
import type { ParsedDocument, ParsedTransaction } from './src/lib/parsers/bankParsers';
import { migrateStore } from './src/lib/store/migrations';
import { importDocumentToStore, isValidISODate, normalizeDate } from './src/lib/store/store';
import { totalsInBase } from './src/lib/store/fx';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

function doc(txs: ParsedTransaction[], name = 'edge.csv'): ParsedDocument {
  return { docType: 'transactions', rawText: '', fileName: name, transactions: txs };
}
function ptx(over: Partial<ParsedTransaction> & { amount: number }): ParsedTransaction {
  return { date: '15.03.2026', amount: over.amount, type: 'expense', payer: '', payee: 'Shop', purpose: '', account: '', ...over };
}

function main() {
  console.log('\n[1] Суммы: 0 / отрицательные / NaN / Infinity / огромные');
  {
    const store = createEmptyStore();
    const r = importDocumentToStore(store, doc([
      ptx({ amount: 0, payee: 'Zero' }),
      ptx({ amount: -150, payee: 'Neg' }),
      ptx({ amount: NaN, payee: 'NaN' }),
      ptx({ amount: Infinity, payee: 'Inf' }),
    ]));
    check('0/NaN/Infinity отскакивают, |−150| сохраняется (added=1, skipped=3)', r.added === 1 && r.skipped === 3, `added=${r.added}, skipped=${r.skipped}`);
    check('отрицательная сумма сохранена как 150', store.transactions[0]?.amount === 150, String(store.transactions[0]?.amount));

    const s2 = createEmptyStore();
    const r2 = importDocumentToStore(s2, doc([
      ptx({ amount: 1e14, payee: 'Big1' }),
      ptx({ amount: 1e15, payee: 'Big2' }),
    ]));
    check('огромные 1e14 и 1e15 — две разные операции', r2.added === 2, `added=${r2.added}`);
    check('итог по огромным точный (1.1e15)', totalsInBase(s2.transactions, [], '2026-03').expense === 1.1e15, String(totalsInBase(s2.transactions, [], '2026-03').expense));
    const r3 = importDocumentToStore(s2, doc([ptx({ amount: 1e14, payee: 'Big1' })]));
    check('повтор 1e14 — дубль (skipped=1)', r3.skipped === 1 && r3.added === 0, `added=${r3.added}, skipped=${r3.skipped}`);
  }

  console.log('\n[2] Даты: пустые / некорректные / високосные / форматы');
  {
    check('isValidISODate: 2026-02-28 — да', isValidISODate('2026-02-28'));
    check('isValidISODate: 2024-02-29 (високосный) — да', isValidISODate('2024-02-29'));
    check('isValidISODate: 2026-02-29 — нет', !isValidISODate('2026-02-29'));
    check('isValidISODate: 2026-13-45 — нет', !isValidISODate('2026-13-45'));
    check('isValidISODate: 2026-02-30 — нет', !isValidISODate('2026-02-30'));
    check('isValidISODate: пусто / мусор — нет', !isValidISODate('') && !isValidISODate('гарабаз'));

    const store = createEmptyStore();
    const r = importDocumentToStore(store, doc([
      ptx({ amount: 10, payee: 'D1', date: '' }),
      ptx({ amount: 11, payee: 'D2', date: '2026-13-45' }),
      ptx({ amount: 12, payee: 'D3', date: '2026-02-30' }),
      ptx({ amount: 13, payee: 'D4', date: 'мусор' }),
      ptx({ amount: 14, payee: 'D5', date: '29.02.2024' }),
      ptx({ amount: 15, payee: 'D6', date: '01.02.2026' }),
    ]));
    check('4 битые даты отскакивают, 2 валидные проходят (added=2, skipped=4)', r.added === 2 && r.skipped === 4, `added=${r.added}, skipped=${r.skipped}`);
    check('29.02.2024 сохранён как 2024-02-29', store.transactions.some(t => t.date === '2024-02-29'));
    check('01.02.2026 → 2026-02-01', store.transactions.some(t => t.date === '2026-02-01'));
    check('normalizeDate ISO проходит как есть', normalizeDate('2026-08-01') === '2026-08-01');
  }

  console.log('\n[3] Unicode и длинные имена');
  {
    const store = createEmptyStore();
    const longName = 'Контрагент-' + 'АБВГДЕЖЗ'.repeat(625); // 5008 символов
    const r = importDocumentToStore(store, doc([
      ptx({ amount: 100, payee: longName, purpose: 'Оплата 🚀 по договору № 12-АБВ' }),
    ]));
    check('контрагент на 5008 символов + эмодзи/кириллица — импортирован', r.added === 1 && store.counterparties[0]?.name === longName);
    const r2 = importDocumentToStore(store, doc([
      ptx({ amount: 100, payee: longName.toUpperCase(), purpose: 'ОПЛАТА 🚀 ПО ДОГОВОРУ № 12-АБВ' }),
    ]));
    check('повтор с другим регистром (кириллица + латиница) — дубль', r2.skipped === 1 && r2.added === 0, `added=${r2.added}, skipped=${r2.skipped}`);
    const r3 = importDocumentToStore(store, doc([
      ptx({ amount: 100, payee: '  ' + longName + '  ', purpose: 'Оплата 🚀 по договору № 12-АБВ' }),
    ]));
    check('повтор с лишними пробелами — дубль (trim в ключе)', r3.skipped === 1, `added=${r3.added}, skipped=${r3.skipped}`);
  }

  console.log('\n[4] Пустые данные');
  {
    const store = createEmptyStore();
    const r = importDocumentToStore(store, doc([]));
    check('пустой документ — 0/0/0/0, без падения', r.added === 0 && r.skipped === 0 && r.blocked === 0 && r.categorized === 0);
    check('migrateStore(null) — чистое хранилище', migrateStore(null).schemaVersion === 4);
    const empty = createEmptyStore();
    check('totalsInBase на пустом — нули', totalsInBase([], []).income === 0 && totalsInBase([], []).expense === 0);
  }

  console.log('\n[5] Round-trip: JSON → parse → migrateStore');
  {
    const store = createEmptyStore();
    importDocumentToStore(store, doc([
      ptx({ amount: 1234.56, payee: 'Магнит', purpose: 'Продукты' }),
      ptx({ amount: 100, type: 'income', payer: 'ООО Ромашка', purpose: 'Услуги' }),
    ]));
    const raw = JSON.parse(JSON.stringify(store));
    const back = migrateStore(raw);
    check('операции/контрагенты/категории на месте', back.transactions.length === store.transactions.length && back.counterparties.length === store.counterparties.length);
    const back2 = migrateStore(JSON.parse(JSON.stringify(back)));
    check('идемпотентность: второй проход ничего не меняет', JSON.stringify(back2) === JSON.stringify(back));
    check('суммы точны после round-trip (1234.56)', back.transactions.some(t => t.amount === 1234.56));
  }

  console.log('\n[6] Массовый импорт: 5000 операций');
  {
    const store = createEmptyStore();
    const txs: ParsedTransaction[] = [];
    for (let i = 0; i < 5000; i++) {
      const day = String((i % 28) + 1).padStart(2, '0');
      txs.push(ptx({ amount: 1000 + i, payee: `Контрагент ${i % 50}`, purpose: `Оплата №${i}`, date: `${day}.03.2026` }));
    }
    const t0 = Date.now();
    const r = importDocumentToStore(store, doc(txs, 'big.csv'));
    const ms = Date.now() - t0;
    check('5000 операций импортированы', r.added === 5000, `added=${r.added}`);
    check(`время < 3000 мс (${ms} мс)`, ms < 3000, String(ms));
    const t1 = Date.now();
    const r2 = importDocumentToStore(store, doc(txs, 'big.csv'));
    const ms2 = Date.now() - t1;
    check('повторная загрузка — все 5000 дубли', r2.skipped === 5000 && r2.added === 0, `added=${r2.added}, skipped=${r2.skipped}`);
    check(`повторный проход < 3000 мс (${ms2} мс)`, ms2 < 3000, String(ms2));
    const tot = totalsInBase(store.transactions, [], '2026-03');
    // 5000×1000 + (0+…+4999) = 5 000 000 + 12 497 500
    check('итог 5000 операций точный (17 497 500)', tot.expense === 17497500, String(tot.expense));
  }

  console.log(`\nИтого: ${passed} пройдено, ${failed} ошибок`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
