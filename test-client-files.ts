#!/usr/bin/env tsx
/**
 * Улучшенный тест парсинга файлов клиентов
 * - PDF: полноценное извлечение текста через pdfjs-dist
 * - DOCX: извлечение через mammoth.js
 * - Транзакции: адаптация под реальные форматы ОСВ/выписок
 * - Классификация: улучшенная эвристика типов документов
 */
import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as pdfjsLib from 'pdfjs-dist';
import mammoth from 'mammoth';
import { createRequire } from 'module';

// Configure PDF.js worker for Node.js (ES module compatible)
const require = createRequire(import.meta.url);
const pdfWorkerPath = require.resolve('pdfjs-dist/build/pdf.worker.min.mjs');
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerPath;

interface ParsedTransaction {
  date: string;
  amount: number;
  payer: string;
  payee: string;
  purpose: string;
  type: "income" | "expense";
  account: string;
}

interface ParsedDocument {
  docType: string;
  transactions: ParsedTransaction[];
  rawText: string;
  fileName: string;
  extractedMetrics?: Record<string, number>;
  parseErrors?: string[];
}

// ===================== PDF PARSER =====================

async function extractPdfTextFull(filePath: string): Promise<string> {
  try {
    const buf = fs.readFileSync(filePath);
    const uint8 = new Uint8Array(buf);
    const doc = await pdfjsLib.getDocument({ data: uint8 }).promise;
    let fullText = "";
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const strings = (content.items as any[]).map((item: any) => item.str).filter(s => s && s.trim());
      fullText += strings.join(" ") + "\n";
      if (fullText.length > 300000) break; // limit
    }
    return fullText.trim();
  } catch (e: any) {
    return '[PDF ERROR] ' + (e?.message || e);
  }
}

// ===================== DOCX PARSER =====================

async function extractDocxText(filePath: string): Promise<string> {
  try {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value.trim();
  } catch (e: any) {
    // Fallback: try XML parsing
    try {
      const buf = fs.readFileSync(filePath);
      const txt = buf.toString('utf-8');
      const wMatches = txt.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
      if (wMatches) {
        return wMatches.map((m: string) => m.replace(/<[^>]+>/g, '')).join(' ').trim();
      }
    } catch {}
    return '[DOCX ERROR] ' + (e?.message || e);
  }
}

function extractDocText(filePath: string): string {
  try {
    const buf = fs.readFileSync(filePath);
    const txt = buf.toString('utf-8');
    // Try to extract text from Word 97-2003 format
    const wMatches = txt.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
    if (wMatches) {
      return wMatches.map((m: string) => m.replace(/<[^>]+>/g, '')).join(' ').trim();
    }
    // Try compound document text extraction
    const textSegments = txt.match(/[A-Za-zА-Яа-яёЁ]{3,}(?:[^\x00-\x08\x0B\x0C\x0E-\x1F]{2,}){2,}/g);
    if (textSegments && textSegments.length > 5) {
      return textSegments.join(' ').trim();
    }
    return '[DOC BINARY - text extraction limited]';
  } catch (e: any) {
    return '[DOC ERROR] ' + (e?.message || e);
  }
}

// ===================== TRANSACTION PARSERS =====================

/**
 * Распознаёт табличные данные ОСВ из текста PDF (оборотно-сальдовые ведомости)
 */
function parseOSVFromText(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  for (const line of lines) {
    // Pattern: account_number DebitCredit DebitTurnover CreditTurnover OpenBalance CloseBalance
    // Typical: "01.01.2015  Дебет  123456.78  234567.89  100000  223456.78"
    const osvPatterns = [
      /(\d{2}\.\d{2}\.\d{2,4})\s+([\d\s,.]{5,})\s+([\d\s,.]{5,})\s+([\d\s,.]{5,})\s+([\d\s,.]{5,})/,
      /Счет\s+(\d{2,3})\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})/,
      /(\d{2})\s+Дебет\s+([\d\s,.]{3,})\s+Кредит\s+([\d\s,.]{3,})/,
      /(\d{2}\.\d{2}\.\d{2,4})\s+(Дт|Кт|Дебет|Кредит)\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})/,
    ];

    for (const pattern of osvPatterns) {
      const match = line.match(pattern);
      if (match) {
        const parseNum = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
        
        if (pattern === osvPatterns[2]) {
          // Account + Debit + Credit
          const account = match[1];
          const debit = parseNum(match[2]);
          const credit = parseNum(match[3]);
          if (!isNaN(debit) && debit > 0 && debit < 1e15) {
            transactions.push({
              date: 'Период', amount: debit, payer: 'Дебет',
              payee: 'Счет ' + account, purpose: 'Оборот дебет',
              type: 'income', account: account
            });
          }
          if (!isNaN(credit) && credit > 0 && credit < 1e15) {
            transactions.push({
              date: 'Период', amount: credit, payer: 'Кредит',
              payee: 'Счет ' + account, purpose: 'Оборот кредит',
              type: 'expense', account: account
            });
          }
        } else if (pattern === osvPatterns[3]) {
          // Date + Side + Amount1 + Amount2
          const date = match[1];
          const side = match[2];
          const amount1 = parseNum(match[3]);
          const amount2 = parseNum(match[4]);
          const isDebit = side === 'Дт' || side === 'Дебет';
          if (!isNaN(amount1) && amount1 > 0 && amount1 < 1e15) {
            transactions.push({
              date, amount: amount1,
              payer: isDebit ? 'Дебет' : 'Кредит',
              payee: isDebit ? 'Кредит' : 'Дебет',
              purpose: 'Карточка счета',
              type: isDebit ? 'income' : 'expense',
              account: 'Unknown'
            });
          }
          if (!isNaN(amount2) && amount2 > 0 && amount2 < 1e15) {
            transactions.push({
              date, amount: amount2,
              payer: isDebit ? 'Кредит' : 'Дебет',
              payee: isDebit ? 'Дебет' : 'Кредит',
              purpose: 'Карточка счета',
              type: isDebit ? 'expense' : 'income',
              account: 'Unknown'
            });
          }
        }
        break;
      }
    }
  }
  return transactions;
}

/**
 * Распознаёт транзакции из банковских выписок (текстовый формат)
 */
function parseBankStatementFromText(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  
  for (const line of lines) {
    // Pattern: date amount1 amount2 description
    const bankPattern = /(\d{2}\.\d{2}\.\d{2,4})\s+([\d\s]+[,\.]\d{2})\s+([\d\s]+[,\.]\d{2})\s*(.*)/;
    const match = line.match(bankPattern);
    if (match) {
      const parseNum = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
      const date = match[1];
      const amount1 = parseNum(match[2]);
      const amount2 = parseNum(match[3]);
      const description = match[4]?.trim() || '';
      
      if (!isNaN(amount1) && amount1 > 0 && amount1 < 1e15) {
        transactions.push({
          date, amount: amount1,
          payer: 'Из выписки', payee: 'Из выписки',
          purpose: description.substring(0, 100),
          type: 'expense', account: 'Unknown'
        });
      }
      if (!isNaN(amount2) && amount2 > 0 && amount2 < 1e15 && amount2 !== amount1) {
        transactions.push({
          date, amount: amount2,
          payer: 'Из выписки', payee: 'Из выписки',
          purpose: description.substring(0, 100),
          type: 'income', account: 'Unknown'
        });
      }
    }
  }
  return transactions;
}

/**
 * Распознаёт транзакции из формата 1С-Клиент
 */
function parse1CClientBank(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  const lines = content.split(/\r?\n/);
  let currentSessionAccount = "";
  let inDocSection = false;
  let currentTx: Partial<ParsedTransaction> | null = null;
  
  for (const line of lines) {
    if (line.startsWith("РасчСчет=") && !currentSessionAccount) {
      currentSessionAccount = line.split("=")[1].trim();
    }
    if (line.startsWith("СекцияДокумент=")) {
      inDocSection = true; currentTx = {}; continue;
    }
    if (line === "КонецДокумента" && currentTx && inDocSection) {
      if (currentTx.amount && currentTx.payer && currentTx.payee) {
        transactions.push({
          date: currentTx.date || "", amount: currentTx.amount || 0,
          payer: currentTx.payer || "", payee: currentTx.payee || "",
          purpose: currentTx.purpose || "", type: currentTx.account === currentSessionAccount ? "expense" : "income",
          account: currentTx.account || ""
        });
      }
      inDocSection = false; currentTx = null; continue;
    }
    if (inDocSection && currentTx) {
      const eqIdx = line.indexOf("=");
      if (eqIdx === -1) continue;
      const key = line.substring(0, eqIdx);
      const val = line.substring(eqIdx + 1).trim();
      switch(key) {
        case "Дата": currentTx.date = val; break;
        case "Сумма": currentTx.amount = parseFloat(val); break;
        case "Плательщик": currentTx.payer = val; break;
        case "Получатель": currentTx.payee = val; break;
        case "НазначениеПлатежа": currentTx.purpose = val; break;
        case "ПлательщикСчет": if (!currentTx.account) currentTx.account = val; break;
      }
    }
  }
  return transactions;
}

// ===================== EXCEL PARSER =====================

async function extractExcelData(filePath: string): Promise<{text: string, transactions: ParsedTransaction[], excelMetrics: Record<string, number>}> {
  const base64 = fs.readFileSync(filePath).toString('base64');
  const workbook = XLSX.read(base64, { type: 'base64' });
  let fullText = "";
  const transactions: ParsedTransaction[] = [];
  const excelMetrics: Record<string, number> = {};
  
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    fullText += "\n--- " + sheetName + " ---\n";
    fullText += XLSX.utils.sheet_to_csv(worksheet);
    const rawJson = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
    
    for (const row of rawJson) {
      if (!Array.isArray(row) || row.length === 0) continue;
      
      // Try to detect transaction rows (date + amounts)
      if (sheetName === workbook.SheetNames[0] && row.length >= 2) {
        const dateStr = String(row[0] || '').trim();
        if (dateStr.match(/^\d{2}\.\d{2}\.\d{2,4}$/) || dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
          let amount = 0;
          let type: 'income' | 'expense' = 'expense';
          const val1 = parseFloat(String(row[1]).replace(/\s/g,'').replace(',','.'));
          if (!isNaN(val1) && val1 !== 0) { amount = Math.abs(val1); type = val1 > 0 ? 'income' : 'expense'; }
          if (amount === 0) {
            const val2 = parseFloat(String(row[2]).replace(/\s/g,'').replace(',','.'));
            if (!isNaN(val2) && val2 !== 0) { amount = Math.abs(val2); type = val2 > 0 ? 'income' : 'expense'; }
          }
          if (amount > 0) {
            transactions.push({
              date: dateStr, amount, purpose: String(row.length >= 4 ? row.slice(2).join(' ') : 'Excel Tx').trim().substring(0, 100),
              type, payer: 'Из файла', payee: 'Из файла', account: 'Default'
            });
            continue;
          }
        }
      }
      
      // Detect metric rows (label + number)
      let label = ""; let val = 0;
      for (let i = 0; i < row.length; i++) {
        if (typeof row[i] === 'string') {
          const cellStr = row[i].trim();
          if (cellStr.length >= 3 && isNaN(parseFloat(cellStr.replace(/\s/g, '').replace(',','.')))) {
            label = cellStr;
            for (let j = row.length - 1; j > i; j--) {
              if (row[j] !== undefined && row[j] !== null && row[j] !== '') {
                const parsedNum = parseFloat(String(row[j]).replace(/\s/g, '').replace(',','.'));
                if (!isNaN(parsedNum) && parsedNum !== 0) { val = Math.abs(parsedNum); break; }
              }
            }
            break;
          }
        }
      }
      if (label && val > 0) {
        if (!label.match(/^\d{2}\.\d{2}\.\d{4}$/) && !label.match(/^[0-9\.\-\s]+$/)) {
          excelMetrics[label] = val;
        }
      }
    }
  }
  return { text: fullText.substring(0, 300000), transactions, excelMetrics };
}

// ===================== METRICS EXTRACTOR =====================

function extractMetricsFromText(text: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const l = line.trim();
    if (l.length > 120 || l.length < 5) continue;
    
    // Pattern: "Label 123,456.78 rub"
    const m = l.match(/(Итого|Всего|Сумма|К оплате|Сальдо|Сальдо на конец|Сальдо на начало|Прибыль|Убыток|Обороты|Выручка|Себестоимость|Налог|Зарплата|Итого по счету|Остаток).+?([\d\s]+[,|\.]?\d{0,2})\s*(руб|₽|USD|EUR|$|\s)/i);
    if (m && m[1] && m[2]) {
      const key = m[1].trim();
      const val = parseFloat(m[2].replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(val) && val > 0 && !metrics[key]) metrics[key] = val;
    }
    
    // Pattern: "123,456.78" at end of line with meaningful label
    const numMatch = l.match(/^(.+?)\s*[:=\s]+\s*([\d\s]+[,\.]\d{2})\s*$/);
    if (numMatch) {
      const label = numMatch[1].trim();
      const val = parseFloat(numMatch[2].replace(/\s/g, '').replace(',', '.'));
      if (!isNaN(val) && val > 0 && label.length > 2 && label.length < 80 && !label.match(/^\d{2}\.\d{2}\.\d{2,4}$/)) {
        if (!metrics[label]) metrics[label] = val;
      }
    }
  }
  return metrics;
}

// ===================== DOCUMENT CLASSIFIER =====================

function classifyDocument(fileName: string, content: string, transactions: ParsedTransaction[], metrics: Record<string, number>): string {
  const fn = fileName.toLowerCase();
  const ct = content.toLowerCase().substring(0, 50000); // first 50K for classification
  
  // By filename patterns
  if (fn.includes('осв') || fn.includes('ob_turnover') || fn.includes('оборот')) return 'osv';
  if (fn.includes('выписк') || fn.includes('bank_statement') || fn.includes('карточка')) return 'bank_statement';
  if (fn.includes('договор') || fn.includes('contract')) return 'contract';
  if (fn.includes('счет') && (fn.includes('оплат') || fn.includes('инвойс') || fn.includes('invoice'))) return 'invoice';
  if (fn.includes('декларация') || fn.includes('деклар') || fn.includes('纳税')) return 'tax_declaration';
  if (fn.includes('баланс') || fn.includes('balance')) return 'balance_sheet';
  if (fn.includes('акт') || fn.includes('acceptance')) return 'acceptance_certificate';
  if (fn.includes('тн') || fn.includes('тнк') || fn.includes('накладная') || fn.includes('delivery')) return 'delivery_note';
  if (fn.includes('управленч') || fn.includes('management')) return 'management_report';
  if (fn.includes('форма') && fn.match(/форм[aа]?\s*\d/)) return 'financial_statement';
  if (fn.includes('тмц') || fn.includes('inventory') || fn.includes('склад')) return 'inventory';
  if (fn.includes('опросн') || fn.includes('анкет') || fn.includes('checklist')) return 'questionnaire';
  if (fn.includes('продаж') || fn.includes('sales')) return 'sales_report';
  if (fn.includes('оценк') || fn.includes('appraisal') || fn.includes('catalog')) return 'appraisal';
  
  // By content patterns
  const hasOSV = ct.includes('оборотно-сальдовая') || ct.includes('сальдо на начало') || ct.includes('сальдо на конец') || ct.includes('обороты по дебету') || ct.includes('обороты по кредиту');
  const hasBalance = ct.includes('бухгалтерский баланс') || ct.includes('расшифровки баланса') || ct.includes('форма 1');
  const hasContract = (ct.includes('договор') || ct.includes('contract')) && ct.includes('стороны') && (ct.includes('обязуется') || ct.includes('предмет'));
  const hasInvoice = ct.includes('счет на оплату') || ct.includes('инвойс') || ct.includes('invoice') || ct.includes('к оплате');
  const hasTax = ct.includes('декларация') && (ct.includes('налог') || ct.includes('усн') || ct.includes('ндфл') || ct.includes('нсф'));
  const hasBankStatement = ct.includes('выписка') && ct.includes('счет') && (ct.includes('дата') || ct.includes('сумма'));
  const hasAcceptance = ct.includes('акт приемки') || ct.includes('акт оказания') || ct.includes('принято без замечаний');
  const hasDelivery = ct.includes('товарная накладная') || ct.includes('тн') || ct.includes('отп');
  
  if (hasOSV) return 'osv';
  if (hasBalance) return 'balance_sheet';
  if (hasContract) return 'contract';
  if (hasInvoice) return 'invoice';
  if (hasTax) return 'tax_declaration';
  if (hasBankStatement) return 'bank_statement';
  if (hasAcceptance) return 'acceptance_certificate';
  if (hasDelivery) return 'delivery_note';
  
  // By data patterns
  if (transactions.length > 5) return 'bank_statement';
  if (Object.keys(metrics).length > 20) return 'financial_report';
  
  return 'other';
}

// ===================== MAIN PARSER =====================

async function parseDocument(filePath: string, fileName: string): Promise<ParsedDocument> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const result: ParsedDocument = { docType: "unknown", transactions: [], rawText: "", fileName, extractedMetrics: {}, parseErrors: [] };
  
  try {
    let text = "";
    let txns: ParsedTransaction[] = [];
    let metrics: Record<string, number> = {};
    
    if (ext === 'pdf') {
      text = await extractPdfTextFull(filePath);
      if (!text.startsWith('[PDF ERROR]')) {
        // Try OSV patterns
        const osvTxns = parseOSVFromText(text);
        if (osvTxns.length > 0) txns = osvTxns;
        
        // Try bank statement patterns
        const bankTxns = parseBankStatementFromText(text);
        if (bankTxns.length > osvTxns.length) txns = bankTxns;
        
        // Extract metrics
        metrics = extractMetricsFromText(text);
      } else {
        result.parseErrors?.push(text);
      }
    } 
    else if (ext === 'xls' || ext === 'xlsx') {
      const { text: excelText, transactions, excelMetrics } = await extractExcelData(filePath);
      text = excelText;
      txns = transactions;
      metrics = excelMetrics;
    } 
    else if (ext === 'txt' || ext === 'csv') {
      text = fs.readFileSync(filePath, 'utf-8').substring(0, 300000);
      // Try 1C format
      const tx1c = parse1CClientBank(text);
      if (tx1c.length > 0) {
        txns = tx1c;
      } else {
        // Try bank statement
        const bankTxns = parseBankStatementFromText(text);
        if (bankTxns.length > 0) txns = bankTxns;
      }
      metrics = extractMetricsFromText(text);
    } 
    else if (ext === 'docx') {
      text = await extractDocxText(filePath);
      if (!text.startsWith('[DOCX ERROR]')) {
        const osvTxns = parseOSVFromText(text);
        if (osvTxns.length > 0) txns = osvTxns;
        metrics = extractMetricsFromText(text);
      } else {
        result.parseErrors?.push(text);
      }
    } 
    else if (ext === 'doc') {
      text = extractDocText(filePath);
      if (!text.startsWith('[DOC') && text.length > 50) {
        metrics = extractMetricsFromText(text);
      }
    }
    
    result.rawText = text.substring(0, 300000);
    result.transactions = txns;
    result.extractedMetrics = metrics;
    
    // Classify document
    result.docType = classifyDocument(fileName, text, txns, metrics);
    
  } catch (err: any) {
    result.rawText = 'Error: ' + err.message;
    result.parseErrors?.push(err.message);
  }
  
  return result;
}

// ===================== MAIN =====================

async function main() {
  const baseDir = 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ВЫДАННЫЕ\\';
  const supportedExts = ['.pdf', '.xls', '.xlsx', '.txt', '.csv', '.doc', '.docx'];
  const EXCLUDED_FILES = ['~$', 'заявка на выезд', 'пример заполнения', 'кфи', 'заявка'];

  if (!fs.existsSync(baseDir)) {
    console.error('Directory not found:', baseDir);
    process.exit(1);
  }

  const clientDirs = fs.readdirSync(baseDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  console.log('\n=== IMPROVED PARSER TEST ===');
  console.log('Base dir: ' + baseDir);
  console.log('Total client dirs: ' + clientDirs.length);
  console.log('='.repeat(90));

  const testClients = clientDirs.slice(0, 10);
  console.log('Testing first ' + testClients.length + ' directories:\n');

  const stats: any = {
    totalFiles: 0, parsedFiles: 0, failedFiles: 0, skippedFiles: 0,
    docTypes: {} as Record<string, number>, extTypes: {} as Record<string, number>,
    totalTransactions: 0, totalMetrics: 0, clientResults: [] as any[],
    pdfSuccess: 0, pdfTotal: 0, docxSuccess: 0, docxTotal: 0
  };

  for (const client of testClients) {
    const clientPath = path.join(baseDir, client);
    console.log('\n>> ' + client);
    console.log('-'.repeat(60));

    let files: string[] = [];
    try {
      files = fs.readdirSync(clientPath).filter(f => {
        const ext = path.extname(f).toLowerCase();
        const name = f.toLowerCase();
        const isSupported = supportedExts.includes(ext);
        const isExcluded = EXCLUDED_FILES.some(ex => name.includes(ex));
        return isSupported && !isExcluded;
      });
    } catch (e: any) {
      console.log('  WARNING: ' + e.message);
      continue;
    }

    if (files.length === 0) {
      console.log('  (no supported files)');
      continue;
    }

    console.log('  Files to parse: ' + files.length);
    const clientStats = { files: 0, transactions: 0, metrics: 0, types: {} as Record<string, number> };

    for (const file of files) {
      const filePath = path.join(clientPath, file);
      const ext = path.extname(file).toLowerCase().substring(1);
      const fileSize = fs.statSync(filePath).size;
      stats.totalFiles++;
      stats.extTypes[ext] = (stats.extTypes[ext] || 0) + 1;
      clientStats.files++;

      // Track PDF/DOCX stats
      if (ext === 'pdf') stats.pdfTotal++;
      if (ext === 'docx') stats.docxTotal++;

      try {
        const startTime = Date.now();
        const result = await parseDocument(filePath, file);
        const elapsed = Date.now() - startTime;

        const docType = result.docType;
        stats.docTypes[docType] = (stats.docTypes[docType] || 0) + 1;
        clientStats.types[docType] = (clientStats.types[docType] || 0) + 1;
        clientStats.transactions += result.transactions.length;
        clientStats.metrics += Object.keys(result.extractedMetrics || {}).length;
        stats.totalTransactions += result.transactions.length;
        stats.totalMetrics += Object.keys(result.extractedMetrics || {}).length;
        stats.parsedFiles++;

        // Track successes
        if (ext === 'pdf' && result.rawText.length > 100 && !result.parseErrors?.length) stats.pdfSuccess++;
        if (ext === 'docx' && result.rawText.length > 100 && !result.parseErrors?.length) stats.docxSuccess++;

        const hasData = result.transactions.length > 0 || Object.keys(result.extractedMetrics || {}).length > 0;
        const hasText = result.rawText.length > 100;
        const statusIcon = hasData ? 'OK ' : hasText ? 'TXT' : '--';
        const sizeKB = (fileSize / 1024).toFixed(1);
        const txCount = result.transactions.length;
        const metricCount = Object.keys(result.extractedMetrics || {}).length;

        console.log('  [' + statusIcon + '] [' + ext.toUpperCase().padEnd(4) + '] ' + file.substring(0, 42).padEnd(43) + ' (' + sizeKB + 'KB, ' + elapsed + 'ms, text:' + result.rawText.length.toLocaleString() + ')');
        if (txCount > 0) console.log('      -> ' + txCount + ' transactions, type: ' + docType);
        if (metricCount > 0) console.log('      -> ' + metricCount + ' metrics');

        if (metricCount > 0 && metricCount <= 5) {
          for (const k of Object.keys(result.extractedMetrics || {})) {
            console.log('         ' + k + ': ' + (result.extractedMetrics as any)[k]);
          }
        } else if (metricCount > 5) {
            for (const k of Object.keys(result.extractedMetrics || {}).slice(0, 3)) {
              console.log('         ' + k + ': ' + (result.extractedMetrics as any)[k]);
            }
            console.log('         ... and ' + (metricCount - 3) + ' more');
          }

        if (result.parseErrors?.length) {
          for (const err of result.parseErrors) {
            console.log('      [ERR] ' + err.substring(0, 80));
          }
        }

      } catch (e: any) {
        stats.failedFiles++;
        console.log('  [ERR] [' + ext.toUpperCase() + '] ' + file.substring(0, 45) + ' - ' + e.message.substring(0, 50));
      }
    }

    stats.clientResults.push({
      client, files: clientStats.files, transactions: clientStats.transactions,
      metrics: clientStats.metrics, types: clientStats.types
    });
  }

  console.log('\n\n' + '='.repeat(90));
  console.log('\n=== FINAL STATISTICS ===\n');
  console.log('Directories tested: ' + testClients.length + ' of ' + clientDirs.length);
  console.log('Total files processed: ' + stats.totalFiles);
  console.log('Successfully parsed: ' + stats.parsedFiles);
  console.log('Errors: ' + stats.failedFiles);
  console.log('\nEXTRACTED DATA:');
  console.log('  Transactions: ' + stats.totalTransactions);
  console.log('  Metrics: ' + stats.totalMetrics);
  console.log('\nFORMAT SUCCESS RATES:');
  console.log('  PDF:  ' + stats.pdfSuccess + '/' + stats.pdfTotal + ' text extracted');
  console.log('  DOCX: ' + stats.docxSuccess + '/' + stats.docxTotal + ' text extracted');

  console.log('\nDOCUMENT TYPE DISTRIBUTION:');
  for (const entry of Object.entries(stats.docTypes).sort((a, b) => (b[1] as number) - (a[1] as number))) {
    const type = entry[0];
    const count = entry[1] as number;
    const pct = stats.totalFiles > 0 ? Math.round((count / stats.totalFiles) * 100) : 0;
    console.log('  ' + type.padEnd(22) + ' ' + String(count).padStart(4) + ' (' + pct + '%)');
  }

  console.log('\nFILE FORMAT DISTRIBUTION:');
  for (const entry of Object.entries(stats.extTypes).sort((a, b) => (b[1] as number) - (a[1] as number))) {
    const ext = entry[0];
    const count = entry[1] as number;
    const pct = stats.totalFiles > 0 ? Math.round((count / stats.totalFiles) * 100) : 0;
    console.log('  .' + ext.padEnd(6) + ' ' + String(count).padStart(4) + ' files (' + pct + '%)');
  }

  console.log('\nPER-CLIENT RESULTS:');
  for (const r of stats.clientResults) {
    if (r.files > 0) {
      const typeStr = Object.entries(r.types).map((e: [string, unknown]) => e[0] + ':' + (e[1] as number)).join(', ');
      const name = r.client.substring(0, 40).padEnd(42);
      console.log('  ' + name + r.files + ' files -> ' + r.transactions + ' txns, ' + r.metrics + ' metrics [' + typeStr + ']');
    }
  }

  const successRate = stats.totalFiles > 0 ? Math.round((stats.parsedFiles / stats.totalFiles) * 100) : 0;
  const classificationRate = stats.totalFiles > 0 ? Math.round(((stats.totalFiles - (stats.docTypes['other'] || 0)) / stats.totalFiles) * 100) : 0;

  console.log('\nQUALITY ASSESSMENT:');
  console.log('  Parsing stability:     ' + successRate + '%');
  console.log('  Classification rate:   ' + classificationRate + '%');
  console.log('  PDF text extraction:   ' + (stats.pdfTotal > 0 ? Math.round((stats.pdfSuccess/stats.pdfTotal)*100) : 0) + '%');
  console.log('  DOCX text extraction:  ' + (stats.docxTotal > 0 ? Math.round((stats.docxSuccess/stats.docxTotal)*100) : 0) + '%');

  if (successRate >= 80 && stats.totalTransactions > 0) {
    console.log('\n  ✓ Parsers work well on real client data!');
  } else if (successRate >= 50) {
    console.log('\n  ~ Parsers work partially - improvements applied');
  } else {
    console.log('\n  ✗ Low stability - parser adaptation required');
  }

  console.log('\n' + '='.repeat(90));
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });