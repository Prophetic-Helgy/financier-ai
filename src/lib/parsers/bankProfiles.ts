// Фаза 3.1: профили-парсеры выписок банков РФ (Сбер, Т-Банк, Альфа, ВТБ).
//
// Единый движок: находит строку заголовков (по токенам колонок: дата + дебет/
// кредит/сумма) в первых строках текста и мапит колонки; формат строк — CSV/
// TSV (XLSX перед конвертацией в CSV в bankParsers.extractExcelData).
// Профили банков добавляют: определение банка (имя файла → преамбула → БИК →
// текст) и метку банка для полей account.
//
// Реальные форматы (проверено по выгрузкам):
//  - Сбербанк:  Дата;Время;Дебет;Кредит;Назначение платежа
//  - Т-Банк:    Дата операции;Описание;Дебет;Кредит;Сальдо
//  - Альфа:     преамбула (Владелец/ИНН/БИК) + Дата операции;Номер документа;
//               Дебет;Кредит;Контрагент (двухстрочный заголовок, без «Назначения»)
//  - ВТБ:       Дата;Время;Дебет;Кредит;Назначение платежа
// Числа: «1 234,56» / «1.234,56» / «1234.56». Даты: DD.MM.YYYY и варианты.

import type { ParsedTransaction } from "./bankParsers";

export interface BankStatementResult {
  bank: string;
  bankId: string;
  transactions: ParsedTransaction[];
}

interface BankProfile {
  id: string;
  bank: string;
  re: RegExp;
}

const BANK_PROFILES: BankProfile[] = [
  { id: "sber", bank: "Сбербанк", re: /сбербанк|sberbank/i },
  { id: "tbank", bank: "Т-Банк", re: /т-банк|тинькофф|tinkoff/i },
  { id: "alfa", bank: "Альфа-Банк", re: /альфа-?банк|alfabank/i },
  { id: "vtb", bank: "ВТБ", re: /втб24|банк втб|(^|[\s;,(«"'])втб([\s;,.»"')]|$)/i },
];

// БИК как резервный способ определения (из преамбулы выписки)
const BIK_BY_BANK: Record<string, string[]> = {
  sber: ["044525225"],
  tbank: ["044525589"],
  alfa: ["044525593"],
};

interface ColumnMap {
  date?: number;
  debit?: number;
  credit?: number;
  amount?: number;
  purpose?: number;
  counterparty?: number;
  balance?: number;
}

// Порядок важен: «Сумма списания» → дебет, «Сумма зачисления» → кредит,
// «Сумма (операции)» → amount
const HEADER_TOKENS: Array<[keyof ColumnMap, RegExp]> = [
  ["date", /дата/],
  ["debit", /дебет|списан/],
  ["credit", /кредит|зачислен|поступлен/],
  ["amount", /сумма/],
  ["purpose", /назначени|описани|комментари|примечани/],
  ["counterparty", /контрагент|получатель|плательщик|корреспондент|наименование/],
  ["balance", /сальдо|баланс/],
];

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false;
      } else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === delim) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function detectDelimiter(lines: string[]): string | null {
  const sample = lines.join("\n");
  let best: string | null = null;
  let bestCount = 0;
  for (const d of [";", ",", "\t"]) {
    let count = 0;
    for (const ch of sample) if (ch === d) count++;
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return bestCount >= 2 ? best : null;
}

function buildColumnMap(headerLine: string, delim: string): ColumnMap {
  const cells = splitCsvLine(headerLine, delim);
  const map: ColumnMap = {};
  cells.forEach((cell, idx) => {
    const c = cell.toLowerCase();
    if (!c) return;
    for (const [key, re] of HEADER_TOKENS) {
      if (map[key] === undefined && re.test(c)) {
        map[key] = idx;
        break;
      }
    }
  });
  return map;
}

function findHeaderRow(lines: string[], delim: string): number {
  const limit = Math.min(lines.length, 30);
  for (let i = 0; i < limit; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const map = buildColumnMap(line, delim);
    if (map.date !== undefined && (map.debit !== undefined || map.credit !== undefined || map.amount !== undefined)) {
      return i;
    }
  }
  return -1;
}

// «10.06.2015», «10-06-2015», «10.06.15», «2015-06-10», «10.06.2015 09:30:00»
// → «10.06.2015»; нераспознано → ''
function normalizeDateStr(raw: string | undefined): string {
  const s = String(raw || "").trim().split(/\s+/)[0];
  let m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (m) return `${m[1]}.${m[2]}.${m[3]}`;
  m = s.match(/^(\d{2})[./-](\d{2})[./-](\d{2})$/);
  if (m) return `${m[1]}.${m[2]}.20${m[3]}`;
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  return "";
}

// «1 234,56» / «1.234,56» / «1234.56» / «1 234 567» → number; null если не число.
// Правила: два разделителя — последний десятичный; один «,» с 1–2 цифрами
// после — десятичный; один «.» с ровно 3 цифрами после (без других точек) —
// разрядный (денежные суммы не имеют 3 знаков после запятой).
function parseMoney(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  let s = String(raw).trim().replace(/[\s ]/g, "");
  if (!s || s === "—" || s === "/" || s === "-") return null;
  const m = s.match(/^-?[\d.,]+$/);
  if (!m) return null;
  s = m[0];
  const neg = s.startsWith("-");
  if (neg) s = s.slice(1);
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const dec = s.length - lastComma - 1;
    s = dec <= 2 ? s.replace(/,/g, (x, i) => (i === lastComma ? "." : x)) : s.replace(/,/g, "");
  } else if (lastDot > -1) {
    const dec = s.length - lastDot - 1;
    if (dec === 3 && s.indexOf(".") === lastDot) s = s.replace(/\./g, "");
  }
  const value = parseFloat(s);
  if (!Number.isFinite(value)) return null;
  return neg ? -value : value;
}

function detectBank(text: string, lines: string[], fileName: string): string {
  const fname = fileName.toLowerCase();
  const preamble = lines.slice(0, 15).join("\n");
  const matchAny = (s: string): string | null => {
    for (const p of BANK_PROFILES) if (p.re.test(s)) return p.id;
    return null;
  };
  // 1) имя файла, 2) преамбула, 3) БИК, 4) первые 4КБ текста (напр. «АО „Альфа-Банк“» в колонке контрагента)
  const byName = matchAny(fname);
  if (byName) return byName;
  const byPreamble = matchAny(preamble);
  if (byPreamble) return byPreamble;
  const bik = preamble.match(/бики?[\s;:|]*([0-9]{9})/i);
  if (bik) {
    for (const [bank, list] of Object.entries(BIK_BY_BANK)) {
      if (list.includes(bik[1])) return bank;
    }
  }
  return matchAny(text.substring(0, 4000)) || "generic";
}

/**
 * Разобрать текст банковской выписки (CSV/TSV или XLSX, преобразованный в CSV).
 * Возвращает список транзакций (пустой, если формат не похож на выписку)
 * и определённый банк.
 */
export function parseBankStatement(text: string, fileName?: string): BankStatementResult {
  const empty: BankStatementResult = { bank: "Банк (выписка)", bankId: "generic", transactions: [] };
  if (!text || text.length < 20) return empty;

  const lines = text.split(/\r?\n/).slice(0, 5000);
  const nonEmpty = lines.filter((l) => l.trim().length > 0);
  if (nonEmpty.length < 3) return empty;

  const delim = detectDelimiter(nonEmpty.slice(0, 10));
  if (!delim) return empty;

  const headerIdx = findHeaderRow(lines, delim);
  if (headerIdx < 0) return empty;
  const map = buildColumnMap(lines[headerIdx], delim);

  const bankId = detectBank(text, lines, fileName || "");
  const profile = BANK_PROFILES.find((p) => p.id === bankId) || { id: "generic", bank: "Банк (выписка)", re: /$^/ };

  const transactions: ParsedTransaction[] = [];
  for (let i = headerIdx + 1; i < lines.length && transactions.length < 5000; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cells = splitCsvLine(line, delim);
    const date = normalizeDateStr(cells[map.date!]);
    if (!date) continue;

    let amount = 0;
    let type: "income" | "expense";
    if (map.debit !== undefined && map.credit !== undefined) {
      const d = parseMoney(cells[map.debit]);
      const c = parseMoney(cells[map.credit]);
      if (d !== null && d > 0) { amount = d; type = "expense"; }
      else if (c !== null && c > 0) { amount = c; type = "income"; }
      else continue;
    } else if (map.amount !== undefined) {
      const a = parseMoney(cells[map.amount]);
      if (a === null || a === 0) continue;
      amount = Math.abs(a);
      type = a < 0 ? "expense" : "income";
    } else {
      continue;
    }

    const purpose = map.purpose !== undefined ? (cells[map.purpose] || "").trim() : "";
    const cp = map.counterparty !== undefined ? (cells[map.counterparty] || "").trim() : "";
    if (/^(итого|всего)/i.test(purpose) || (/^(итого|всего)/i.test(cp) && !purpose)) continue;

    transactions.push({
      date,
      amount,
      // Для доходов контрагент — плательщик, для расходов — получатель
      // (согласовано с counterpartyName() в store.ts)
      payer: type === "income" ? cp : "",
      payee: type === "expense" ? cp : "",
      purpose: purpose || cp || "Операция по счёту",
      type,
      account: profile.bank,
    });
  }

  return { bank: profile.bank, bankId: profile.id, transactions };
}
