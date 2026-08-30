/**
 * Smoke-тест Фазы 3.1: импорт выписок банков РФ + архивы.
 * Запуск: npx tsx test-bank-import.ts
 *
 * Проверяет:
 *  1. parseBankStatement — 4 фикстуры CSV (Сбер, Т-Банк, Альфа, ВТБ):
 *     определение банка, дебет/кредит → расход/доход, числа «1 234,56».
 *  2. parseDocument — XLSX-фикстура Сбера (через extractExcelData).
 *  3. Регрессия 1С: test-data/1c_bank_statement.txt парсится как раньше.
 *  4. expandArchives — ZIP-фикстура → 2 CSV → парсятся.
 *  5. RAR (если задана env FINANCIER_TEST_RAR — локальные данные вне git) — electron/rarExtract.cjs.
 *  6. importDocumentToStore — импорт + дедупликация повторного импорта.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
import { parseBankStatement } from './src/lib/parsers/bankProfiles';
import { parseDocument } from './src/lib/parsers/bankParsers';
import { expandArchives } from './src/lib/parsers/archives';
import { importDocumentToStore } from './src/lib/store/store';
import { createEmptyStore } from './src/lib/store/schema';
import type { ParsedDocument } from './src/lib/parsers/bankParsers';

let passed = 0;
let failed = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

const DIR = path.join(process.cwd(), 'test-data', 'bank-statements');
const read = (name: string) => fs.readFileSync(path.join(DIR, name), 'utf-8');
const dataUrl = (text: string) => 'data:application/octet-stream;base64,' + Buffer.from(text, 'utf-8').toString('base64');

async function main() {
  console.log('\n[1] parseBankStatement: CSV-фикстуры 4 банков');
  const sber = parseBankStatement(read('sberbank_statement.csv'), 'sberbank_statement.csv');
  check('Сбер: банк определён (sber)', sber.bankId === 'sber', sber.bankId);
  check('Сбер: 6 транзакций', sber.transactions.length === 6, String(sber.transactions.length));
  const sberExp = sber.transactions.find(t => t.amount === 1234.56);
  check('Сбер: «1 234,56» → 1234.56, расход', !!sberExp && sberExp.type === 'expense');
  const sberInc = sber.transactions.find(t => t.amount === 120000);
  check('Сбер: кредит 120 000,00 → доход', !!sberInc && sberInc.type === 'income');
  check('Сбер: назначение сохранено', !!sberExp && sberExp.purpose.includes('Ромашка'));

  const tbank = parseBankStatement(read('tbank_statement.csv'), 'tbank_statement.csv');
  check('Т-Банк: банк определён (tbank)', tbank.bankId === 'tbank', tbank.bankId);
  check('Т-Банк: 6 транзакций', tbank.transactions.length === 6, String(tbank.transactions.length));
  check('Т-Банк: 1 250,50 → расход', !!tbank.transactions.find(t => t.amount === 1250.5 && t.type === 'expense'));
  check('Т-Банк: 30 000,00 → доход', !!tbank.transactions.find(t => t.amount === 30000 && t.type === 'income'));

  const alfa = parseBankStatement(read('alfabank_statement.csv'), 'alfabank_statement.csv');
  check('Альфа: банк по БИК (alfa)', alfa.bankId === 'alfa', alfa.bankId);
  check('Альфа: 5 транзакций', alfa.transactions.length === 5, String(alfa.transactions.length));
  check('Альфа: дебет 1200.00 → расход, контрагент=payee',
    !!alfa.transactions.find(t => t.amount === 1200 && t.type === 'expense' && t.payee.includes('Ромашка')));
  check('Альфа: кредит 8000.00 → доход, контрагент=payer',
    !!alfa.transactions.find(t => t.amount === 8000 && t.type === 'income' && t.payer.includes('Тестов')));

  const vtb = parseBankStatement(read('vtb_statement.csv'), 'vtb_statement.csv');
  check('ВТБ: банк определён (vtb)', vtb.bankId === 'vtb', vtb.bankId);
  check('ВТБ: 6 транзакций', vtb.transactions.length === 6, String(vtb.transactions.length));
  check('ВТБ: 75,90 → расход', !!vtb.transactions.find(t => t.amount === 75.9 && t.type === 'expense'));

  console.log('\n[2] parseDocument: XLSX (Сбер)');
  const xlsxB64 = fs.readFileSync(path.join(DIR, 'sberbank_statement.xlsx')).toString('base64');
  const xlsxDoc = await parseDocument('data:application/octet-stream;base64,' + xlsxB64, 'sberbank_statement.xlsx');
  check('XLSX: >= 6 транзакций', xlsxDoc.transactions.length >= 6, String(xlsxDoc.transactions.length));
  check('XLSX: docType=transactions', xlsxDoc.docType === 'transactions', xlsxDoc.docType);
  check('XLSX: банк=Сбербанк в account', xlsxDoc.transactions.some(t => t.account === 'Сбербанк'));

  console.log('\n[3] Регрессия: выписка 1С (test-data/1c_bank_statement.txt)');
  const oneC = fs.readFileSync(path.join(process.cwd(), 'test-data', '1c_bank_statement.txt'), 'utf-8');
  const oneCDoc = await parseDocument(oneC, '1c_bank_statement.txt');
  check('1С: транзакции найдены', oneCDoc.transactions.length > 0, String(oneCDoc.transactions.length));

  console.log('\n[4] Архивы: ZIP (statement_pack.zip)');
  const zipB64 = fs.readFileSync(path.join(DIR, 'statement_pack.zip')).toString('base64');
  const zipFiles = await expandArchives([{ name: 'statement_pack.zip', content: 'data:application/octet-stream;base64,' + zipB64 }]);
  check('ZIP: распаковано 2 файла', zipFiles.length === 2, String(zipFiles.length));
  const zipDocs = await Promise.all(zipFiles.map(f => parseDocument(f.content, f.name)));
  const zipSber = zipDocs.find(d => d.fileName.includes('сбер'));
  const zipTbank = zipDocs.find(d => d.fileName.includes('тбанк'));
  check('ZIP: выписка Сбера распарсена (>= 6)', !!zipSber && zipSber.transactions.length >= 6, zipSber ? String(zipSber.transactions.length) : 'нет');
  check('ZIP: выписка Т-Банка распарсена (>= 6)', !!zipTbank && zipTbank.transactions.length >= 6, zipTbank ? String(zipTbank.transactions.length) : 'нет');

  console.log('\n[5] RAR: electron/rarExtract.cjs (если задан FINANCIER_TEST_RAR)');
  // Локальные тестовые данные вне git; путь задаётся переменной окружения,
  // чтобы в репозиторий не попадали ни путь, ни имена файлов архива.
  const rarPath = process.env.FINANCIER_TEST_RAR || '';
  if (rarPath && fs.existsSync(rarPath)) {
    const { extractRarBase64 } = require('./electron/rarExtract.cjs') as { extractRarBase64: (b64: string) => Promise<any[]> };
    const b64 = fs.readFileSync(rarPath).toString('base64');
    const entries = await extractRarBase64(b64);
    check('RAR: файлы извлечены', Array.isArray(entries) && entries.length > 0, String(entries.length));
    if (entries.length > 0) {
      console.log('    (записей в архиве: ' + entries.length + ')');
    }
  } else {
    console.log('  – тестовый RAR не задан (FINANCIER_TEST_RAR), пропуск (проверяется в ручном тесте)');
  }

  console.log('\n[6] Хранилище: импорт выписки Сбера + дедупликация');
  const store = createEmptyStore();
  const r1 = importDocumentToStore(store, { ...sberAsDoc(sber), fileName: 'sberbank_statement.csv' });
  check('Импорт: добавлены операции', r1.added === sber.transactions.length, `added=${r1.added}, ожидалось ${sber.transactions.length}`);
  const r2 = importDocumentToStore(store, { ...sberAsDoc(sber), fileName: 'sberbank_statement.csv' });
  check('Дедуп: повторный импорт без дублей', r2.added === 0 && r2.skipped === sber.transactions.length, `added=${r2.added}`);
  check('Импорт: даты в ISO', store.transactions.every(t => /^\d{4}-\d{2}-\d{2}$/.test(t.date)), store.transactions[0]?.date);
  check('Импорт: расходы/доходы по типам',
    store.transactions.filter(t => t.type === 'expense').length === 3 &&
    store.transactions.filter(t => t.type === 'income').length === 3);

  console.log(`\nИтого: ${passed} пройдено, ${failed} ошибок`);
  process.exit(failed > 0 ? 1 : 0);
}

// BankStatementResult → ParsedDocument (как формирует parseDocument)
function sberAsDoc(bs: { bank: string; transactions: any[] }): ParsedDocument {
  return { docType: 'transactions', transactions: bs.transactions, rawText: '', fileName: 'sberbank_statement.csv' };
}

main().catch((e) => { console.error('CRASH:', e); process.exit(2); });
