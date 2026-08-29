/**
 * Smoke-тест Фазы 4: холдинг/консолидация (мульти-энтити, elimination, audit log).
 * Запуск: npx tsx test-consolidation.ts
 *
 * Проверяет:
 *  1. Миграция v3 → v4 (parentId, auditLog) и цепочка v1 → v4; идемпотентность.
 *  2. Дерево организаций: потомки, варианты родителя, гвард удаления.
 *  3. Межфирменная операция: контрагент = юрлицо группы (и только чужое).
 *  4. groupPnl: групповой P&L, elimination пар, инвариант «группа = сумма юрлиц».
 *  5. Непогашенные межфирменные операции — флаг «книги не сходятся».
 *  6. Краевые случаи сопоставления: дата, кратность, валюта (курс), период ym.
 *  7. Audit: appendAudit (профиль, cap 500, clamp detail), validateAuditLog.
 */
import { createEmptyStore, createId, SCHEMA_VERSION } from './src/lib/store/schema';
import type { LedgerStore, Transaction, AuditEntry } from './src/lib/store/schema';
import { migrateStore } from './src/lib/store/migrations';
import {
  groupPnl, isIntercompanyTx, intercompanyOrgId, orgDescendants,
  orgParentOptions, canDeleteOrg, consolidationBalanced,
} from './src/lib/store/consolidation';
import { appendAudit, validateAuditLog, AUDIT_LOG_LIMIT } from './src/lib/store/audit';
import { can } from './src/lib/store/roles';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

const NOW = '2026-08-29T12:00:00Z';

function tx(over: Partial<Transaction> & { amount: number; orgId: string }): Transaction {
  return {
    id: createId(), orgId: over.orgId, accountId: 'a', date: '2026-08-10',
    amount: over.amount, currency: 'RUB', type: 'expense', counterpartyId: '',
    category: 'Без категории', purpose: '', source: 't', importedAt: NOW, ...over,
  };
}

/** Холдинг: 2 юрлица (А — головная, Б — дочернее), контрагенты: внешний + 2 юрлица группы */
function holdingStore(): LedgerStore & { orgA: string; orgB: string; cpX: string; cpA: string; cpB: string } {
  const s = createEmptyStore();
  const orgA = s.organizations[0].id;
  const orgB = createId();
  s.organizations.push({ id: orgB, name: 'ООО Бета', isDefault: false, createdAt: NOW, parentId: orgA });
  s.accounts.push({ id: createId(), orgId: orgB, name: 'Счёт Бета', kind: 'bank', currency: 'RUB', createdAt: NOW });
  const cpX = createId(), cpA = createId(), cpB = createId();
  s.counterparties.push(
    { id: cpX, name: 'Поставщик' },
    { id: cpA, name: 'Группа Альфа', orgId: orgA },
    { id: cpB, name: 'ООО Бета', orgId: orgB },
  );
  return { ...s, orgA, orgB, cpX, cpA, cpB };
}

/** Базовый сценарий ROADMAP: А: +5000 (внешний), −1000 (→Б); Б: +1000 (←А), −400 (внешний) */
function scenarioTxs(h: ReturnType<typeof holdingStore>): Transaction[] {
  return [
    tx({ orgId: h.orgA, type: 'income', amount: 5000, counterpartyId: h.cpX }),
    tx({ orgId: h.orgA, type: 'expense', amount: 1000, counterpartyId: h.cpB }),
    tx({ orgId: h.orgB, type: 'income', amount: 1000, counterpartyId: h.cpA }),
    tx({ orgId: h.orgB, type: 'expense', amount: 400, counterpartyId: h.cpX }),
  ];
}

function main() {
  console.log('\n[1] Миграция v3 → v4 и цепочка v1 → v4');
  const v3raw: any = {
    schemaVersion: 3,
    meta: { createdAt: NOW, updatedAt: NOW, currentUserId: 'u1' },
    organizations: [{ id: 'o1', name: 'Орг', isDefault: true, createdAt: NOW }],
    accounts: [{ id: 'a1', orgId: 'o1', name: 'Счёт', kind: 'bank', currency: 'RUB', createdAt: NOW }],
    counterparties: [{ id: 'c1', name: 'КП' }],
    categories: [], transactions: [tx({ orgId: 'o1', amount: 100, currency: 'RUB' })],
    budgets: [], fxRates: [], periods: [],
    users: [{ id: 'u1', name: 'Владелец', role: 'admin', visibleCategories: [], createdAt: NOW }],
    manual: { incomes: [], credits: [], assets: [] },
  };
  const m3 = migrateStore(v3raw);
  check('v3 → v4: schemaVersion = 4', m3.schemaVersion === 4 && SCHEMA_VERSION === 4);
  check('v3 → v4: у организаций parentId = null', m3.organizations.every(o => o.parentId === null));
  check('v3 → v4: auditLog = []', Array.isArray(m3.auditLog) && m3.auditLog.length === 0);
  check('v3 → v4: данные не потеряны (txs/users/orgs)',
    m3.transactions.length === 1 && m3.users.length === 1 && m3.organizations.length === 1);
  const m4again = migrateStore(m3 as unknown as object);
  check('идемпотентность: v4 → v4 без изменений', m4again.schemaVersion === 4 && m4again.transactions.length === 1 && m4again.auditLog.length === 0);

  const v1raw: any = {
    schemaVersion: 1,
    meta: { createdAt: NOW, updatedAt: NOW },
    organizations: [{ id: 'o1', name: 'Орг', isDefault: true, createdAt: NOW }],
    accounts: [{ id: 'a1', orgId: 'o1', name: 'Счёт', kind: 'bank', createdAt: NOW }],
    counterparties: [], categories: [],
    transactions: [tx({ orgId: 'o1', amount: 100 })],
    manual: { incomes: [], credits: [], assets: [] },
  };
  const m14 = migrateStore(v1raw);
  check('v1 → v4: вся цепочка (currency RUB + users + parentId + auditLog)',
    m14.schemaVersion === 4
    && (m14.transactions[0] as any).currency === 'RUB'
    && m14.users.length === 1
    && m14.organizations.every(o => o.parentId === null)
    && Array.isArray(m14.auditLog));

  const empty = createEmptyStore();
  check('createEmptyStore: auditLog = [], schemaVersion = 4', empty.auditLog.length === 0 && empty.schemaVersion === 4);

  console.log('\n[2] Дерево организаций');
  {
    const s = createEmptyStore();
    const aId = s.organizations[0].id;
    const bId = createId(), cId = createId(), dId = createId();
    s.organizations.push(
      { id: bId, name: 'Б', isDefault: false, createdAt: NOW, parentId: aId },
      { id: cId, name: 'В', isDefault: false, createdAt: NOW, parentId: bId },
      { id: dId, name: 'Г', isDefault: false, createdAt: NOW, parentId: null },
    );
    const descA = orgDescendants(s, aId);
    check('orgDescendants(A) = {B, C} (2 уровня вложенности)', descA.length === 2 && descA.includes(bId) && descA.includes(cId), JSON.stringify(descA));
    check('orgDescendants(C) = []', orgDescendants(s, cId).length === 0);
    check('orgParentOptions(A) исключает A и потомков', (() => {
      const opts = orgParentOptions(s, aId);
      return opts.length === 1 && opts[0] === dId;
    })());
    check('orgParentOptions(B) = {A, D} (C — потомок B, исключён; сам B исключён)', (() => {
      const opts = orgParentOptions(s, bId);
      return opts.length === 2 && opts.includes(aId) && opts.includes(dId);
    })());
    // циклическое дерево: A → B → A (битые данные) — без зацикливания
    const sCyc = createEmptyStore();
    const x1 = sCyc.organizations[0].id, x2 = createId();
    sCyc.organizations.push({ id: x2, name: 'X2', isDefault: false, createdAt: NOW, parentId: x1 });
    sCyc.organizations[0].parentId = x2;
    const cyc = orgDescendants(sCyc, x1);
    check('цикл в дереве не зацикливает (потомки конечны)', Array.isArray(cyc) && cyc.length <= 1, JSON.stringify(cyc));
  }
  {
    const h = holdingStore();
    check('canDeleteOrg: головная (isDefault) — нельзя', !canDeleteOrg(h, h.orgA).ok);
    check('canDeleteOrg: юрлицо со счётом — нельзя', !canDeleteOrg(h, h.orgB).ok);
    h.accounts = h.accounts.filter(a => a.orgId !== h.orgB);
    const chkTx = canDeleteOrg(h, h.orgB);
    check('canDeleteOrg: юрлицо без счёта — можно', chkTx.ok, chkTx.reason || '');
    h.transactions = [tx({ orgId: h.orgB, amount: 10 })];
    check('canDeleteOrg: юрлицо с операциями — нельзя', !canDeleteOrg(h, h.orgB).ok);
    check('canDeleteOrg: несуществующая — нельзя', !canDeleteOrg(h, 'nope').ok);
  }

  console.log('\n[3] Межфирменная операция (контрагент = юрлицо группы)');
  {
    const h = holdingStore();
    h.transactions = scenarioTxs(h);
    const [tAin, tAout, tBin, tBout] = h.transactions;
    check('А → внешнему контрагенту: не межфирменная', !isIntercompanyTx(h, tAin));
    check('А → ООО Бета (orgId=B): межфирменная', isIntercompanyTx(h, tAout) && intercompanyOrgId(h, tAout) === h.orgB);
    check('Б → Альфа (orgId=A): межфирменная', isIntercompanyTx(h, tBin) && intercompanyOrgId(h, tBin) === h.orgA);
    check('операция к СВОЕМУ юрлицу (orgId=org операции) — не межфирменная', (() => {
      const t = tx({ orgId: h.orgB, amount: 5, counterpartyId: h.cpB });
      return !isIntercompanyTx(h, t);
    })());
    check('битая связь (orgId на несуществующее юрлицо) — не межфирменная', (() => {
      h.counterparties.push({ id: createId(), name: 'Призрак', orgId: 'ghost' });
      const cpid = h.counterparties[h.counterparties.length - 1].id;
      const t = tx({ orgId: h.orgA, amount: 5, counterpartyId: cpid });
      return !isIntercompanyTx(h, t);
    })());
  }

  console.log('\n[4] groupPnl: базовый сценарий (ROADMAP: 2 юрлица, консолидация сходится)');
  {
    const h = holdingStore();
    h.transactions = scenarioTxs(h);
    const g = groupPnl(h);
    const rA = g.rows.find(r => r.orgId === h.orgA)!;
    const rB = g.rows.find(r => r.orgId === h.orgB)!;
    check('строки по 2 юрлицам', g.rows.length === 2);
    check('А: +5000 / −1000 / =4000, межфирм. расход 1000',
      near(rA.income, 5000) && near(rA.expense, 1000) && near(rA.net, 4000) && near(rA.icExpense, 1000),
      JSON.stringify(rA));
    check('Б: +1000 / −400 / =600, межфирм. доход 1000',
      near(rB.income, 1000) && near(rB.expense, 400) && near(rB.net, 600) && near(rB.icIncome, 1000),
      JSON.stringify(rB));
    check('группа: доходы 5000, расходы 400, итог 4600 (межфирм. 1000 элиминировано)',
      near(g.group.income, 5000) && near(g.group.expense, 400) && near(g.group.net, 4600),
      JSON.stringify(g.group));
    check('погашена 1 пара на 1000', g.eliminated.pairs === 1 && near(g.eliminated.amount, 1000));
    check('непогашённых нет', g.unmatched.count === 0 && near(g.unmatched.amount, 0));
    check('ИНВАРИАНТ: итог группы = сумме итогов юрлиц (4000+600=4600)', near(g.group.net, rA.net + rB.net));
    check('consolidationBalanced: ok', consolidationBalanced(h).ok);
    check('ym-фильтр: пустой месяц → 0 строк', groupPnl(h, '2025-01').rows.length === 0);
    check('ym-фильтр: 2026-08 = все (операции в августе)', groupPnl(h, '2026-08').group.net === g.group.net);
  }

  console.log('\n[5] Непогашенные межфирменные операции — флаг расхождения');
  {
    const h = holdingStore();
    h.transactions = [...scenarioTxs(h), tx({ orgId: h.orgA, amount: 500, counterpartyId: h.cpB, date: '2026-08-20' })];
    const g = groupPnl(h);
    check('unmatched: 1 операция на 500', g.unmatched.count === 1 && near(g.unmatched.amount, 500), JSON.stringify(g.unmatched));
    check('групповой итог не изменился (500 — внутреннее движение, не поток группы)', near(g.group.net, 4600));
    const bal = consolidationBalanced(h);
    check('consolidationBalanced: ок=false, расхождение 500', !bal.ok && near(bal.diff, 500), JSON.stringify(bal));
  }

  console.log('\n[6] Краевые случаи сопоставления');
  {
    const h = holdingStore();
    // разные даты — пара не собирается
    h.transactions = [
      tx({ orgId: h.orgA, amount: 1000, counterpartyId: h.cpB, date: '2026-08-10' }),
      tx({ orgId: h.orgB, type: 'income', amount: 1000, counterpartyId: h.cpA, date: '2026-08-11' }),
    ];
    let g = groupPnl(h);
    check('разные даты → пара не погашена (unmatched 2)', g.eliminated.pairs === 0 && g.unmatched.count === 2, JSON.stringify(g));

    // кратность: 2 расхода + 1 доход одинаковых → 1 пара + 1 непогашённый расход
    h.transactions = [
      tx({ orgId: h.orgA, amount: 1000, counterpartyId: h.cpB, date: '2026-08-10' }),
      tx({ orgId: h.orgA, amount: 1000, counterpartyId: h.cpB, date: '2026-08-10', purpose: 'второй' }),
      tx({ orgId: h.orgB, type: 'income', amount: 1000, counterpartyId: h.cpA, date: '2026-08-10' }),
    ];
    g = groupPnl(h);
    check('2 расхода + 1 доход → 1 пара, 1 непогашённый', g.eliminated.pairs === 1 && g.unmatched.count === 1, JSON.stringify(g));

    // валюта: курс 90, пары в USD пересчитываются в базовую
    h.transactions = [
      tx({ orgId: h.orgA, amount: 10, currency: 'USD', counterpartyId: h.cpB, date: '2026-08-10' }),
      tx({ orgId: h.orgB, type: 'income', amount: 10, currency: 'USD', counterpartyId: h.cpA, date: '2026-08-10' }),
    ];
    h.fxRates.push({ id: createId(), date: '2026-08-01', code: 'USD', rate: 90 });
    g = groupPnl(h);
    check('USD-пара: элиминировано 900 (10×90) в базовой валюте', g.eliminated.pairs === 1 && near(g.eliminated.amount, 900), JSON.stringify(g.eliminated));
    check('USD-строки юрлиц в базовой валюте (ic 900)', near(g.rows.find(r => r.orgId === h.orgA)!.icExpense, 900));

    // разные суммы — не пара
    h.transactions = [
      tx({ orgId: h.orgA, amount: 1000, counterpartyId: h.cpB, date: '2026-08-10' }),
      tx({ orgId: h.orgB, type: 'income', amount: 999.99, counterpartyId: h.cpA, date: '2026-08-10' }),
    ];
    h.fxRates = [];
    g = groupPnl(h);
    check('разные суммы (1000 vs 999.99) → не пара', g.eliminated.pairs === 0 && g.unmatched.count === 2);
  }

  console.log('\n[7] Роли: организации — только владелец');
  check('admin: organizations = true', can('admin', 'organizations'));
  check('member: organizations = false', !can('member', 'organizations'));
  check('viewer: organizations = false', !can('viewer', 'organizations'));

  console.log('\n[8] Audit log');
  {
    const s = createEmptyStore();
    const ownerId = s.users[0].id;
    const n1 = '2026-08-29T10:00:00Z';
    appendAudit(s, 'transactions.import', 'transaction', 'импорт: 1 файл(а), новых операций: 12', n1);
    check('appendAudit: запись добавлена (action/entity/at/detail)', (() => {
      const e = s.auditLog[s.auditLog.length - 1];
      return s.auditLog.length === 1 && e.action === 'transactions.import' && e.entity === 'transaction'
        && e.at === n1 && e.detail.includes('12');
    })());
    check('appendAudit: profileId = активный профиль', s.auditLog[0].profileId === ownerId);
    check('appendAudit: meta.updatedAt обновлён', s.meta.updatedAt === n1);

    // cap 500: tail (старые отбрасываются)
    const s2 = createEmptyStore();
    for (let i = 0; i < AUDIT_LOG_LIMIT + 5; i++) {
      appendAudit(s2, 'test.tick', 'test', String(i), `2026-08-29T10:00:${String(i % 60).padStart(2, '0')}Z`);
    }
    check(`cap: журнал не длиннее ${AUDIT_LOG_LIMIT}`, s2.auditLog.length === AUDIT_LOG_LIMIT);
    check('cap: сохранён tail (последняя запись — i=504)', s2.auditLog[s2.auditLog.length - 1].detail === '504' && s2.auditLog[0].detail === '5');

    // clamp detail
    const s3 = createEmptyStore();
    appendAudit(s3, 'test.long', 'test', 'x'.repeat(300), n1);
    check('detail длиннее 200 символов — обрезан', s3.auditLog[0].detail.length <= 200 && s3.auditLog[0].detail.endsWith('…'));

    // validateAuditLog
    check('validateAuditLog: чистый журнал — без ошибок', validateAuditLog(s3).length === 0);
    const bad = structuredClone(s3);
    const e0: AuditEntry = bad.auditLog[0];
    bad.auditLog = [
      { ...e0, at: 'не-дата' },
      { ...e0, id: e0.id }, // дубликат id
      { ...e0, profileId: 'unknown-user' },
    ];
    const errs = validateAuditLog(bad);
    check('validateAuditLog: находит битые записи (at, дубликат, чужой profileId)', errs.length >= 3, JSON.stringify(errs));
  }

  console.log(`\nИтого: ${passed} пройдено, ${failed} ошибок`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
