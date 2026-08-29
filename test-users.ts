/**
 * Smoke-тест Фазы 3.6: локальные профили и роли (семейный сценарий).
 * Запуск: npx tsx test-users.ts
 *
 * Проверяет:
 *  1. Миграция v2 → v3: создаётся профиль-владелец (admin) и meta.currentUserId,
 *     данные не меняются.
 *  2. Миграция v3 идемпотентна (id профилей стабильны).
 *  3. currentProfile: meta-совпадение / битый meta → users[0] / нет users → синтетический admin.
 *  4. Матрица прав can(): admin — всё, member — без периодов и бэкапов, viewer — ничего.
 *  5. visibleTransactions: admin — все; пустой список — все; фильтр по категориям (без учёта регистра).
 *  6. canSeeCategory: ключевые ячейки.
 */
import { createEmptyStore, createId } from './src/lib/store/schema';
import type { LedgerStore, Transaction } from './src/lib/store/schema';
import { migrateStore } from './src/lib/store/migrations';
import { currentProfile, can, canSeeCategory, visibleTransactions, ROLE_LABELS } from './src/lib/store/roles';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

function tx(over: Partial<Transaction> & { amount: number }): Transaction {
  return {
    id: createId(), orgId: 'o', accountId: 'a', date: '2026-08-10',
    amount: over.amount, currency: 'RUB', type: 'expense', counterpartyId: 'c',
    category: 'Без категории', purpose: '', source: 't',
    importedAt: '2026-08-28T00:00:00Z', ...over,
  };
}

/** Хранилище версии 2 (как было у пользователей до Фазы 3.6) */
function makeV2(): any {
  const s = createEmptyStore();
  s.schemaVersion = 2;
  delete s.users;
  delete s.meta.currentUserId;
  s.transactions = [
    tx({ date: '2026-08-05', category: 'Аптека', amount: 1000 }),
    tx({ date: '2026-08-20', category: 'Аптека', amount: 500 }),
    tx({ date: '2026-08-10', category: 'Без категории', amount: 700 }),
    tx({ date: '2026-08-01', type: 'income', category: 'Зарплата', amount: 100000 }),
  ];
  return s;
}

function main() {
  console.log('\n[1] Миграция v2 → v3');
  const v2 = makeV2();
  const txBefore = v2.transactions.map((t: any) => t.id).sort();
  const s3 = migrateStore(v2);
  check('schemaVersion = 4 (цепочка доходит до v4)', s3.schemaVersion === 4, String(s3.schemaVersion));
  check('Создан профиль-владелец admin', s3.users.length === 1 && s3.users[0].role === 'admin', JSON.stringify(s3.users));
  check('meta.currentUserId ссылается на владельца', s3.meta.currentUserId === s3.users[0].id);
  check('Операции сохранены (id не изменились)',
    JSON.stringify(s3.transactions.map((t: any) => t.id).sort()) === JSON.stringify(txBefore));
  check('Остальные сущности на месте',
    s3.organizations.length === 1 && s3.accounts.length === 1 && s3.categories.length === 2);

  console.log('\n[2] Миграция v3 идемпотентна');
  const s3b = migrateStore(s3);
  check('id профиля не изменился', s3b.users[0].id === s3.users[0].id, `${s3.users[0].id} vs ${s3b.users[0].id}`);
  check('currentUserId не изменился', s3b.meta.currentUserId === s3.meta.currentUserId);
  check('schemaVersion остался 4', s3b.schemaVersion === 4);

  console.log('\n[3] currentProfile: фолбэки');
  const owner = s3.users[0];
  const member = { id: createId(), name: 'Супруг', role: 'member' as const, visibleCategories: [], createdAt: '' };
  const withTwo: any = { ...s3, users: [owner, member], meta: { ...s3.meta, currentUserId: member.id } };
  check('meta указывает на member → возвращается member', currentProfile(withTwo).id === member.id);
  check('битый currentUserId → users[0]', currentProfile({ ...withTwo, meta: { ...s3.meta, currentUserId: 'нет-такого' } }).id === owner.id);
  check('пустые users → синтетический admin', currentProfile({ ...s3, users: [] }).role === 'admin');

  console.log('\n[4] Матрица прав can()');
  const actions = ['import', 'categorize', 'categories', 'budgets', 'accounts', 'fxRates', 'periods', 'restore'] as const;
  check('admin: всё разрешено', actions.every(a => can('admin', a)));
  check('member: без периодов и бэкапов', !can('member', 'periods') && !can('member', 'restore'));
  check('member: импорт/бюджеты/категории разрешены',
    can('member', 'import') && can('member', 'budgets') && can('member', 'categories') && can('member', 'categorize'));
  check('viewer: ничего не разрешено', actions.every(a => !can('viewer', a)));
  check('Подписи ролей: Владелец/Участник/Наблюдатель',
    ROLE_LABELS.admin === 'Владелец' && ROLE_LABELS.member === 'Участник' && ROLE_LABELS.viewer === 'Наблюдатель');

  console.log('\n[5] visibleTransactions: видимость по категориям');
  const viewer = { id: createId(), name: 'Дочь', role: 'viewer' as const, visibleCategories: ['аптека'], createdAt: '' };
  const memberAll = { ...member, id: createId() };
  const base = { ...s3, transactions: s3.transactions };

  const allAsAdmin = visibleTransactions(base);
  check('admin видит все 4 операции', allAsAdmin.length === 4, String(allAsAdmin.length));

  const memberStore: any = { ...base, users: [owner, memberAll], meta: { ...s3.meta, currentUserId: memberAll.id } };
  check('member с пустым списком видит все', visibleTransactions(memberStore).length === 4);

  const viewerStore: any = { ...base, users: [owner, viewer], meta: { ...s3.meta, currentUserId: viewer.id } };
  const vis = visibleTransactions(viewerStore);
  check('viewer видит 2 (только Аптека, без учёта регистра)', vis.length === 2, String(vis.length));
  check('фильтр case-insensitive: "аптека" поймало "Аптека"',
    vis.every(t => t.category === 'Аптека'));
  check('зарплата (доход) не прошла фильтр', !vis.some(t => t.category === 'Зарплата'));

  const unknownProfile = { ...viewer, id: createId(), visibleCategories: ['ТакогоНет'] };
  const unknown: any = { ...base, users: [owner, unknownProfile], meta: { ...s3.meta, currentUserId: unknownProfile.id } };
  check('неизвестные категории в списке → ничего не видно (без ошибок)',
    visibleTransactions(unknown).length === 0);

  console.log('\n[6] canSeeCategory');
  check('admin: любая категория видна', canSeeCategory(owner, 'Без категории') && canSeeCategory(owner, 'Любая'));
  check('пустой список: всё видно', canSeeCategory(member, 'Без категории'));
  check('список: своё имя (регистр не важен)', canSeeCategory(viewer, 'АПТЕКА') && canSeeCategory(viewer, 'аптека'));
  check('список: чужое имя не видно', !canSeeCategory(viewer, 'Зарплата'));

  console.log(`\nИтого: ${passed} пройдено, ${failed} ошибок`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
