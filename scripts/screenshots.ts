/**
 * Скриншоты приложения для release (Фаза 6 / релиз 1.0.1).
 * Запуск: npx tsx scripts/screenshots.ts
 *
 * Как это работает: playwright-core управляет нашим же Electron-процессом
 * (executablePath из node_modules/electron), отдельным --user-data-dir и
 * преднаполненным хранилищем (ТОЛЬКО синтетические данные). OK.
 * Загружает CSV-фикстуру Сбера и листает ключевые экраны.
 * Файлы: screenshots/*.png (имена латиницей — GitHub release assets).
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { _electron } = require('playwright-core') as { _electron: any };

const ROOT = path.resolve('.');
const UD = path.join(ROOT, 'screenshots', '.userdata');
const SHOTS = path.join(ROOT, 'screenshots');
const T0 = Date.now();
const at = (offsetDays: number) => new Date(T0 + offsetDays * 86400000).toISOString();

// ============================================================
// Синтетическое хранилище (v4): холдинг ООО «Альфа» → ООО «Бета»
// ============================================================
function seedStore() {
  const mk = (o: any, i: number) => ({ id: o[0], orgId: o[1], accountId: o[2], date: o[3], amount: o[4], currency: o[5], type: o[6], counterpartyId: o[7], category: o[8], purpose: o[9], source: 'seed', importedAt: at(-10) });
  const T: (o: any[], i: number) => any = mk;
  const tx: any[] = [
    ['t01', 'org-a', 'acc-a-rub', '2026-05-12', 1250000, 'RUB', 'income', 'cp-klient1', 'Выручка', 'Оплата по договору 12/26'],
    ['t02', 'org-a', 'acc-a-rub', '2026-05-18', 240000, 'RUB', 'expense', 'cp-post1', 'Закуп товаров', 'Партия товара, инв. 45'],
    ['t03', 'org-a', 'acc-a-rub', '2026-05-25', 65000, 'RUB', 'expense', 'cp-arenda', 'Аренда', 'Аренда офиса май'],
    ['t04', 'org-a', 'acc-a-rub', '2026-06-03', 980000, 'RUB', 'income', 'cp-klient2', 'Выручка', 'Оплата по договору 09/26'],
    ['t05', 'org-a', 'acc-a-rub', '2026-06-11', 150000, 'RUB', 'expense', 'cp-marketing', 'Маркетинг', 'Рекламная кампания», контекст'],
    ['t06', 'org-a', 'acc-a-rub', '2026-06-19', 320000, 'RUB', 'expense', 'cp-fund', 'Зарплата', 'ФОТ июнь'],
    ['t07', 'org-a', 'acc-a-rub', '2026-06-20', 90000, 'RUB', 'expense', 'cp-bank', 'Комиссии', 'РКО комиссия'],
    ['t08', 'org-a', 'acc-a-rub', '2026-06-28', 72000, 'RUB', 'expense', 'cp-post1', 'Закуп товаров', 'Партия товара, инв. 51'],
    ['t09', 'org-a', 'acc-a-usd', '2026-06-30', 4200, 'USD', 'income', 'cp-foreign', 'Экспорт', 'Контракт EXP-7 (USD)'],
    ['t10', 'org-a', 'acc-a-rub', '2026-07-04', 1310000, 'RUB', 'income', 'cp-klient1', 'Выручка', 'Оплата по договору 12/26 (2)'],
    ['t11', 'org-a', 'acc-a-rub', '2026-07-08', 68000, 'RUB', 'expense', 'cp-arenda', 'Аренда', 'Аренда офиса июль'],
    ['t12', 'org-a', 'acc-a-rub', '2026-07-15', 205000, 'RUB', 'expense', 'cp-post1', 'Закуп товаров', 'Партия товара, инв. 58'],
    ['t13', 'org-a', 'acc-a-rub', '2026-07-22', 46000, 'RUB', 'expense', 'cp-marketing', 'Маркетинг', 'Таргет, июль'],
    ['t14', 'org-a', 'acc-a-rub', '2026-07-31', 335000, 'RUB', 'expense', 'cp-fund', 'Зарплата', 'ФОТ июль'],
    ['t15', 'org-a', 'acc-a-rub', '2026-08-05', 870000, 'RUB', 'income', 'cp-klient3', 'Выручка', 'Аванс по договору 21/26'],
    ['t16', 'org-a', 'acc-a-rub', '2026-08-07', 68000, 'RUB', 'expense', 'cp-arenda', 'Аренда', 'Аренда офиса август'],
    ['t17', 'org-a', 'acc-a-rub', '2026-08-12', 118000, 'RUB', 'expense', 'cp-post1', 'Закуп товаров', 'Партия товара, инв. 62'],
    ['t18', 'org-a', 'acc-a-rub', '2026-08-14', 52000, 'RUB', 'expense', 'cp-marketing', 'Маркетинг', 'Видеопродакшн'],
    ['t19', 'org-a', 'acc-a-rub', '2026-08-19', 310000, 'RUB', 'expense', 'cp-fund', 'Зарплата', 'Аванс ФОТ'],
    ['t20', 'org-a', 'acc-a-rub', '2026-08-21', 41000, 'RUB', 'expense', 'cp-kanc', 'Канцелярия', 'Офисные расходники'],
    ['t21', 'org-a', 'acc-a-rub', '2026-08-24', 145000, 'RUB', 'expense', 'cp-beta', 'Межфирменные', 'Услуги по договору 3/26-Б'],
    // «Бета» (дочерняя): получает услуги от Альфы, продаёт наружу
    ['t22', 'org-b', 'acc-b-rub', '2026-06-15', 145000, 'RUB', 'income', 'cp-beta', 'Выручка', 'Услуги по договору 3/26-Б'],
    ['t23', 'org-b', 'acc-b-rub', '2026-06-25', 38000, 'RUB', 'expense', 'cp-kanc', 'Канцелярия', 'Хознужды'],
    ['t24', 'org-b', 'acc-b-rub', '2026-07-10', 165000, 'RUB', 'income', 'cp-klient3', 'Выручка', 'Монтажные работы'],
    ['t25', 'org-b', 'acc-b-rub', '2026-07-18', 145000, 'RUB', 'expense', 'cp-alpha', 'Межфирменные', 'Услуги Альфы, акт 07'],
    ['t26', 'org-b', 'acc-b-rub', '2026-07-25', 61000, 'RUB', 'expense', 'cp-fund', 'Зарплата', 'ФОТ июль (Бета)'],
    ['t27', 'org-b', 'acc-b-rub', '2026-08-08', 210000, 'RUB', 'income', 'cp-klient2', 'Выручка', 'Сервисный контракт'],
    ['t28', 'org-b', 'acc-b-rub', '2026-08-16', 145000, 'RUB', 'expense', 'cp-alpha', 'Межфирменные', 'Услуги Альфы, акт 08'],
    ['t29', 'org-b', 'acc-b-rub', '2026-08-20', 47000, 'RUB', 'expense', 'cp-marketing', 'Маркетинг', 'Каталог продукции'],
    ['t30', 'org-b', 'acc-b-cash', '2026-08-26', 12000, 'RUB', 'expense', 'cp-kanc', 'Канцелярия', 'Наличные, расходники'],
  ].map(T);
  return {
    schemaVersion: 4,
    meta: { createdAt: at(-120), updatedAt: at(-1), currentUserId: 'u-admin' },
    organizations: [
      { id: 'org-a', name: 'ООО «Альфа»', isDefault: true, createdAt: at(-120), parentId: null },
      { id: 'org-b', name: 'ООО «Бета»', isDefault: false, createdAt: at(-90), parentId: 'org-a' },
    ],
    accounts: [
      { id: 'acc-a-rub', orgId: 'org-a', name: 'Расчётный счёт', kind: 'bank', currency: 'RUB', createdAt: at(-120) },
      { id: 'acc-a-usd', orgId: 'org-a', name: 'Валютный счёт', kind: 'bank', currency: 'USD', createdAt: at(-100) },
      { id: 'acc-b-rub', orgId: 'org-b', name: 'Расчётный счёт', kind: 'bank', currency: 'RUB', createdAt: at(-90) },
      { id: 'acc-b-cash', orgId: 'org-b', name: 'Касса', kind: 'cash', currency: 'RUB', createdAt: at(-90) },
    ],
    counterparties: [
      { id: 'cp-klient1', name: 'АО «Стройсервис»' },
      { id: 'cp-klient2', name: 'ИП Смирнова А.В.' },
      { id: 'cp-klient3', name: 'ООО «ТехноТрейд»' },
      { id: 'cp-post1', name: 'ООО «Поставка+»' },
      { id: 'cp-arenda', name: 'УК «Гранд Плаза»' },
      { id: 'cp-marketing', name: 'ООО «МедиаЛаб»' },
      { id: 'cp-fund', name: 'ФОТ (наёмные сотрудники)' },
      { id: 'cp-bank', name: 'Банк (РКО)' },
      { id: 'cp-kanc', name: 'ООО «Офисмаркет»' },
      { id: 'cp-foreign', name: 'Nordwind Trading OY' },
      { id: 'cp-alpha', name: 'ООО «Альфа»', orgId: 'org-a' },
      { id: 'cp-beta', name: 'ООО «Бета»', orgId: 'org-b' },
    ],
    categories: [
      { id: 'c1', name: 'Без категории', kind: 'income', builtin: true },
      { id: 'c2', name: 'Без категории', kind: 'expense', builtin: true },
      { id: 'c3', name: 'Выручка', kind: 'income', builtin: false },
      { id: 'c4', name: 'Экспорт', kind: 'income', builtin: false },
      { id: 'c5', name: 'Закуп товаров', kind: 'expense', builtin: false },
      { id: 'c6', name: 'Аренда', kind: 'expense', builtin: false },
      { id: 'c7', name: 'Маркетинг', kind: 'expense', builtin: false },
      { id: 'c8', name: 'Зарплата', kind: 'expense', builtin: false },
      { id: 'c9', name: 'Комиссии', kind: 'expense', builtin: false },
      { id: 'c10', name: 'Канцелярия', kind: 'expense', builtin: false },
      { id: 'c11', name: 'Межфирменные', kind: 'expense', builtin: false },
    ],
    transactions: tx,
    budgets: [
      { id: 'b1', orgId: 'org-a', category: 'Аренда', monthlyLimit: 80000, currency: 'RUB' },
      { id: 'b2', orgId: 'org-a', category: 'Маркетинг', monthlyLimit: 60000, currency: 'RUB' },
      { id: 'b3', orgId: 'org-a', category: 'Закуп товаров', monthlyLimit: 250000, currency: 'RUB' },
    ],
    fxRates: [
      { id: 'f1', date: '2026-06-30', code: 'USD', rate: 82.35 },
      { id: 'f2', date: '2026-07-15', code: 'USD', rate: 81.9 },
      { id: 'f3', date: '2026-08-01', code: 'USD', rate: 83.12 },
      { id: 'f4', date: '2026-08-15', code: 'USD', rate: 84.05 },
      { id: 'f5', date: '2026-08-15', code: 'EUR', rate: 91.4 },
      { id: 'f6', date: '2026-08-15', code: 'CNY', rate: 11.7 },
    ],
    periods: [
      { id: 'p1', orgId: 'org-a', name: '2026-06', closedAt: at(-30) },
      { id: 'p2', orgId: 'org-a', name: '2026-07', closedAt: at(-2) },
      { id: 'p3', orgId: 'org-b', name: '2026-07', closedAt: at(-2) },
    ],
    users: [
      { id: 'u-admin', name: 'Анна (директор)', role: 'admin', visibleCategories: [], createdAt: at(-120) },
      { id: 'u-viewer', name: 'Сергей (наблюдатель)', role: 'viewer', visibleCategories: ['Аренда', 'Канцелярия'], createdAt: at(-40) },
    ],
    auditLog: [
      { id: 'a1', at: at(-90), profileId: 'u-admin', action: 'organizations.upsert', entity: 'organization', detail: 'Создана ООО «Бета» (дочерняя ООО «Альфа»)' },
      { id: 'a2', at: at(-30), profileId: 'u-admin', action: 'periods.close', entity: 'period', detail: 'Закрыт период 2026-06' },
      { id: 'a3', at: at(-10), profileId: 'u-admin', action: 'transactions.import', entity: 'transaction', detail: 'Импорт выписки: 18 операций добавлено' },
      { id: 'a4', at: at(-2), profileId: 'u-admin', action: 'periods.close', entity: 'period', detail: 'Закрыт период 2026-07 (org-a, org-b)' },
      { id: 'a5', at: at(-1), profileId: 'u-admin', action: 'users.upsert', entity: 'user', detail: 'Профиль «Сергей (наблюдатель)»: роль viewer' },
    ],
    manual: { incomes: [], credits: [], assets: [] },
  };
}

async function main() {
  fs.rmSync(UD, { recursive: true, force: true });
  fs.mkdirSync(path.join(UD, 'seed'), { recursive: true });
  fs.writeFileSync(path.join(UD, 'financier-store.json'), JSON.stringify(seedStore(), null, 2), 'utf-8');
  fs.mkdirSync(SHOTS, { recursive: true });

  // main.cjs в не-packaged режиме грузит http://localhost:3000 — поднимаем
  // vite preview (раздаёт dist/), иначе Electron покажет страницу ошибки.
  const preview = spawn('npx', ['vite', 'preview', '--port', '3000', '--host', '127.0.0.1'], {
    cwd: ROOT, stdio: 'ignore', shell: true,
  });
  const stopPreview = () => { try { preview.kill('SIGTERM'); } catch { /* уже мёртв */ } };
  process.on('exit', stopPreview);
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch('http://127.0.0.1:3000/');
      if (r.ok) break;
    } catch { /* сервер ещё поднимается */ }
    await new Promise((r) => setTimeout(r, 500));
  }

  const exe = path.join(ROOT, 'node_modules', 'electron', 'dist', 'electron.exe');
  const app = await _electron.launch({
    executablePath: exe,
    args: [path.join(ROOT, 'electron', 'main.cjs'), `--user-data-dir=${UD}`],
    env: (() => { const e = { ...process.env } as any; delete e.ELECTRON_RUN_AS_NODE; return e; })(),
    timeout: 60000,
  });
  // В dev-режиме main.cjs открывает DevTools — firstWindow() может оказаться
  // окном DevTools. Ждём страницу с заголовком приложения.
  let page: any = null;
  const deadline = Date.now() + 30000;
  while (!page && Date.now() < deadline) {
    for (const p of app.context().pages()) {
      try {
        const t = await p.title();
        if (t.includes('Финансист')) { page = p; break; }
      } catch { /* окно закрылось */ }
    }
    if (!page) await new Promise((r) => setTimeout(r, 500));
  }
  if (!page) throw new Error('окно «Финансист.AI» не найдено');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(3500); // React-рендер + тикер курсов

  let n = 0;
  const shot = async (name: string, opts: { full?: boolean } = {}) => {
    n += 1;
    const file = path.join(SHOTS, `${String(n).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, fullPage: !!opts.full });
    console.log('  →', path.relative(ROOT, file));
  };
  const clickText = async (t: string, timeout = 8000) => {
    await page.getByText(t, { exact: false }).first().click({ timeout });
    await page.waitForTimeout(1200);
  };

  // 1) Home — выбор профиля
  await page.getByText('Холдинг', { exact: false }).first().waitFor({ timeout: 15000 });
  await shot('home');

  // 2) Dashboard / Холдинг: аналитика-демо (мок до загрузки документа)
  await clickText('Холдинг');
  await page.getByText('Учёт', { exact: true }).first().waitFor({ timeout: 15000 });
  await shot('dashboard-demo');

  // 3) Учёт с посевными данными (холдинг, бюджеты, периоды, профили, аудит)
  await clickText('Учёт', 15000);
  await shot('ledger', { full: true });

  // 4) Загрузка выписки Сбера → разбор документа
  const fileInput = page.locator('input[type="file"]').first();
  await fileInput.setInputFiles(path.join(ROOT, 'test-data', 'bank-statements', 'sberbank_statement.csv'));
  await page.waitForTimeout(5000); // parseDocument + рендер
  await clickText('Таблица');
  await shot('statement-parsed');

  // 5) Импорт в учёт → журнал пополняется
  const importBtn = page.getByText('Импортировать в учёт', { exact: false }).first();
  if (await importBtn.count()) {
    await importBtn.click({ timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(3000);
  }
  await clickText('Учёт', 15000);
  await shot('ledger-after-import');

  // 6) Экспорт отчётов
  await clickText('Экспорт');
  await shot('export');

  // 7) Отчёты (набор доступных по загруженным данным)
  await clickText('Отчеты');
  await shot('reports');

  await app.close();
  stopPreview();
  console.log(`Готово: ${n} скриншотов в screenshots/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
