#!/usr/bin/env tsx
/**
 * Тест парсинга данных из файлов клиентов v3
 * - XLS бинарный через xls package
 * - XLSX через fflate с парсингом всех листов
 * - DOCX через fflate
 * - iconv-lite для кодировок TXT
 * - Увеличенные лимиты
 */
import * as fs from 'fs';
import * as path from 'path';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const iconv = require('iconv-lite');

// ========================
// PDF
// ========================
function extractTextFromPdf(buffer: Buffer): string {
  try {
    const limit = Math.min(buffer.length, 20 * 1024 * 1024);
    const chunk = buffer.slice(0, limit);
    const textPages = chunk.toString('latin1').match(/(?=\x00)([\x00-\x7F]{10,})/g);
    if (textPages) {
      let result = textPages.slice(0, 2000).map((s: string) => s.replace('\x00', ' ').trim()).join('\n');
      return result.slice(0, 1000000);
    }
  } catch {}
  return '';
}

// ========================
// XLS бинарный
// ========================
function extractFromBinaryXls(buffer: Buffer): { text: string; rows: number } {
  try {
    const xls = require('xls');
    const sheets: any[][] = xls.parseXLS(buffer);
    let text = '';
    let rowCount = 0;
    for (const sheet of sheets) {
      for (const row of sheet) {
        if (Array.isArray(row) && row.length > 0) {
          const line = row.map(c => {
            const val = c?.v ?? c?.t ?? '';
            return typeof val === 'string' ? val : String(val);
          }).filter(s => s && s.trim()).join('\t');
          if (line) { text += line + '\n'; rowCount++; }
        }
      }
    }
    return { text: text.trim().slice(0, 1000000), rows: rowCount };
  } catch (e: any) {
    return { text: '', rows: 0 };
  }
}

// ========================
// XLSX через fflate
// ========================
function extractFromXlsx(buffer: Buffer): { text: string; rows: number } {
  try {
    const zip = require('fflate');
    const unzipped = zip.unzipSync(buffer);
    const sharedStrings: string[] = [];
    if (unzipped['xl/sharedStrings.xml']) {
      const ss = unzipped['xl/sharedStrings.xml'].toString('utf8');
      const matches = ss.match(/<t[^>]*>([^<]*)<\/t>/g);
      if (matches) matches.forEach((m: string) => sharedStrings.push(m.replace(/<[^>]+>/g, '')));
    }
    let text = '';
    let rows = 0;
    const sheetKeys = Object.keys(unzipped).filter(k => k.startsWith('xl/worksheets/sheet') && k.endsWith('.xml'));
    for (const sheetKey of sheetKeys.slice(0, 10)) {
      const sheet = unzipped[sheetKey]?.toString('utf8');
      if (!sheet) continue;
      const inlineVals = sheet.match(/<v[^>]*>([^<]*)<\/v>/g) || [];
      const siRefs = sheet.match(/<c [^>]*?r="[^"]*"[^>]*?>\s*<v[^>]*>(\d+)<\/v>/g) || [];
      rows += inlineVals.length;
      siRefs.forEach((m: string) => {
        const si = parseInt(m.match(/\d+$/)?.[0] || '0');
        if (sharedStrings[si]) { rows++; text += sharedStrings[si] + '\n'; }
      });
      text += inlineVals.map((v: string) => v.replace(/<[^>]+>/g, '')).join('\n') + '\n';
    }
    return { 
      text: text.replace(/[^\x20-\x7E\u0400-\u04FF\u00C0-\u017F\d\s]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000000), 
      rows 
    };
  } catch {
    return { text: '', rows: 0 };
  }
}

// ========================
// Unified Excel extractor
// ========================
function extractFromExcel(buffer: Buffer, ext: string): { text: string; rows: number } {
  if (ext === 'XLS') {
    // Try binary XLS first, then fallback to XLSX (some .xls are actually zipped)
    const binResult = extractFromBinaryXls(buffer);
    if (binResult.rows > 0 || binResult.text.length > 50) return binResult;
    return extractFromXlsx(buffer);
  }
  return extractFromXlsx(buffer);
}

// ========================
// DOCX
// ========================
function extractTextFromDocx(buffer: Buffer): string {
  try {
    const zip = require('fflate');
    const unzipped = zip.unzipSync(buffer);
    if (unzipped['word/document.xml']) {
      const doc = unzipped['word/document.xml'].toString('utf8');
      const texts = doc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      return texts.map((t: string) => t.replace(/<[^>]+>/g, '')).join(' ').slice(0, 1000000);
    }
  } catch {}
  return '';
}

// ========================
// DOC (binary Word) - simple text extraction
// ========================
function extractTextFromDoc(buffer: Buffer): string {
  try {
    // Try to extract readable text from binary DOC
    const txt = buffer.toString('utf8', 0, Math.min(buffer.length, 500000));
    const lines = txt.split('\r\n').filter(l => /[\u0400-\u04FFa-zA-Z]/.test(l) && l.trim().length > 3);
    return lines.join(' ').slice(0, 500000);
  } catch {
    return '';
  }
}

// ========================
// TXT / XML с iconv-lite
// ========================
function extractTextFromText(buffer: Buffer): string {
  const limit = Math.min(buffer.length, 10 * 1024 * 1024);
  const chunk = buffer.slice(0, limit);
  
  if (chunk[0] === 0xEF && chunk[1] === 0xBB && chunk[2] === 0xBF) {
    const text = iconv.decode(chunk.slice(3), 'UTF-8');
    if (text.trim().length > 10) return text.slice(0, 1000000);
  }
  
  const encodings = ['windows-1251', 'UTF-8', 'windows-1252', 'KOI8-R', 'latin1'];
  for (const enc of encodings) {
    try {
      const text = iconv.decode(chunk, enc);
      if (/[\u0400-\u04FFa-zA-Z]/.test(text) && text.trim().length > 10) {
        return text.slice(0, 1000000);
      }
    } catch {}
  }
  
  return chunk.toString('latin1').slice(0, 1000000);
}

// ========================
// RTF
// ========================
function extractTextFromRtf(buffer: Buffer): string {
  try {
    const text = extractTextFromText(buffer);
    const cleaned = text.replace(/\\[a-z]+\d*\s?/gi, ' ').replace(/\\[{}\\@]/g, ' ').replace(/\{\\[^}]*\}/g, ' ').replace(/\s+/g, ' ').trim();
    return cleaned.slice(0, 500000);
  } catch {
    return '';
  }
}

// ========================
// MXL (legacy Excel)
// ========================
function extractFromMxl(buffer: Buffer): { text: string; rows: number } {
  // MXL is similar to XLS binary format
  return extractFromBinaryXls(buffer);
}

// ========================
// Определение типа документа
// ========================
function detectDocumentType(text: string, filename: string): string {
  const t = text.toLowerCase();
  const n = filename.toLowerCase();
  if (/(выписк|extract|statement)/i.test(n) || /(сальдо|остаток)/i.test(t)) return 'BANK_STATEMENT';
  if (/(договор|contract|аренд)/i.test(n)) return 'CONTRACT';
  if (/(баланс|balance|bilan)/i.test(n)) return 'BALANCE_SHEET';
  if (/(деклар|decl|report|отчет)/i.test(n)) return 'TAX_DECLARATION';
  if (/(акт|invoice|счет|счёт|tn|тн)/i.test(n)) return 'INVOICE';
  if (/(осв|account)/i.test(n)) return 'ACCOUNT_STATEMENT';
  if (/(справк|certificate|info)/i.test(n)) return 'CERTIFICATE';
  if (/(карточ|card|catalog)/i.test(n)) return 'CARD';
  if (/(остатк|склад|inventory|тмц)/i.test(n)) return 'INVENTORY';
  if (/(реестр|registry|list)/i.test(n)) return 'REGISTRY';
  return 'OTHER';
}

// ========================
// Подсчет транзакций
// ========================
function countTransactions(text: string): number {
  const amountPattern = /(?:сумм|сумма|amount|дебет|кредит|debit|credit|приход|расход|операция|поступление|выплата)\s*[:\s]*\s*[\d\s]{3,15}[₽\s]?/gi;
  const amounts = text.match(amountPattern);
  if (amounts) return Math.min(amounts.length, 500);
  const linePattern = /(\d{2}\.\d{2}\.\d{4})[\s\S]{0,200}?([\d\s]{3,10})\s*₽?/g;
  let count = 0;
  let m;
  while ((m = linePattern.exec(text)) !== null && count < 500) count++;
  return count;
}

// ========================
// Извлечение метрик
// ========================
function extractMetrics(text: string): Record<string, string> {
  const metrics: Record<string, string> = {};
  const orgPattern = /(?:ооо|ип|зao|ao|зао|пao|пао)\s+["']?([а-яёa-z\s]{2,50})["']?/gi;
  const org = orgPattern.exec(text);
  if (org) metrics['organization'] = org[1].trim();
  const innPattern = /(?:inn|инн)\s*[\s:]*\s*(\d{10}|\d{12})/gi;
  const inn = innPattern.exec(text);
  if (inn) metrics['inn'] = inn[1];
  const datePattern = /(\d{2}\.\d{2}\.\d{4})/g;
  const dates: string[] = [];
  let dm;
  while ((dm = datePattern.exec(text)) !== null) dates.push(dm[1]);
  if (dates.length > 0) {
    metrics['earliest_date'] = dates[0];
    metrics['latest_date'] = dates[dates.length - 1];
  }
  const totalPattern = /(?:итого|всего|total|сумма)\s*[:\s]*\s*([\d\s]{3,15})/gi;
  const total = totalPattern.exec(text);
  if (total) metrics['total_amount'] = total[1].replace(/\s/g, '');
  return metrics;
}

// ========================
// Обработка одного файла
// ========================
function processOneFile(filePath: string): {
  success: boolean; file: string; ext: string; type: string;
  docType: string; transactions: number; textLength: number;
  duration: number; error?: string; metrics: Record<string, string>; client: string;
} {
  const start = Date.now();
  const filename = path.basename(filePath);
  const ext = path.extname(filename).toUpperCase().replace('.', '') || 'NO_EXT';
  const parts = filePath.split(path.sep);
  const client = parts.length > 3 ? parts[parts.length - 2] : 'unknown';
  
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (e: any) {
    return { success: false, file: filename, ext, type: ext, docType: 'UNKNOWN', transactions: 0, textLength: 0, duration: Date.now() - start, error: e.message, metrics: {}, client };
  }
  
  const skipExts = ['JPG', 'JPEG', 'PNG', 'GIF', 'BMP', 'TIFF', 'TIF', 'ICO', 'WEBP', 'HEIC', 'MP4', 'MOV', 'EMF', 'SVG'];
  if (skipExts.includes(ext)) {
    return { success: false, file: filename, ext, type: ext, docType: 'IMAGE', transactions: 0, textLength: 0, duration: Date.now() - start, error: 'пропущено', metrics: {}, client };
  }
  
  try {
    let text = '';
    let rows = 0;
    
    switch (ext) {
      case 'PDF': 
        text = extractTextFromPdf(buffer); 
        break;
      case 'XLS': case 'XLSX': case 'XLSM': case 'XLSB':
        const xlsResult = extractFromExcel(buffer, ext);
        text = xlsResult.text; rows = xlsResult.rows;
        break;
      case 'MXL':
        const mxlResult = extractFromMxl(buffer);
        text = mxlResult.text; rows = mxlResult.rows;
        break;
      case 'DOCX': 
        text = extractTextFromDocx(buffer); 
        break;
      case 'DOC': 
        text = extractTextFromDoc(buffer); 
        break;
      case 'RTF': 
        text = extractTextFromRtf(buffer); 
        break;
      default:
        text = extractTextFromText(buffer);
    }
    
    if (text.length < 10 && rows === 0) {
      return { success: false, file: filename, ext, type: ext, docType: 'UNKNOWN', transactions: 0, textLength: 0, duration: Date.now() - start, error: 'нет данных', metrics: {}, client };
    }
    
    const docType = detectDocumentType(text, filename);
    const transactions = countTransactions(text) + rows;
    const metrics = extractMetrics(text);
    
    return { success: true, file: filename, ext, type: ext, docType, transactions, textLength: text.length, duration: Date.now() - start, metrics, client };
  } catch (e: any) {
    return { success: false, file: filename, ext, type: ext, docType: 'UNKNOWN', transactions: 0, textLength: 0, duration: Date.now() - start, error: e.message?.slice(0, 100), metrics: {}, client };
  }
}

// ========================
// Рекурсивный сбор файлов
// ========================
function collectFiles(dir: string, results: string[] = [], depth = 0): string[] {
  if (depth > 10) return results;
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) collectFiles(fullPath, results, depth + 1);
      else results.push(fullPath);
    }
  } catch {}
  return results;
}

// ========================
// Badge CSS helper
// ========================
function badgeClass(ext: string): string {
  const m: Record<string, string> = {
    PDF: 'badge-pdf', XLS: 'badge-xls', XLSX: 'badge-xlsx', DOC: 'badge-doc', DOCX: 'badge-docx',
    TXT: 'badge-txt', XML: 'badge-xml', HTML: 'badge-html', HTM: 'badge-html', CSV: 'badge-csv',
    RTF: 'badge-rtf', ZIP: 'badge-zip', RAR: 'badge-rar', '7Z': 'badge-zip', MSG: 'badge-msg',
    MXL: 'badge-xls', XLSM: 'badge-xlsx', ODT: 'badge-doc', ODS: 'badge-xlsx',
  };
  return m[ext] || 'badge-other';
}

// ========================
// Main
// ========================
async function main() {
  const baseDir = 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ВЫДАННЫЕ';
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ТЕСТ ПАРСИНГА v3 - ЗАЯВКИ ВЫДАННЫЕ');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Базовая директория: ${baseDir}\n`);
  
  console.log('Сбор файлов...');
  const allFiles = collectFiles(baseDir);
  console.log(`Всего файлов: ${allFiles.length}\n`);
  
  const skipExts = ['JPG', 'JPEG', 'PNG', 'GIF', 'BMP', 'TIFF', 'TIF', 'ICO', 'WEBP', 'HEIC', 'MP4', 'MOV', 'EMF', 'SVG'];
  const extCount: Record<string, number> = {};
  for (const f of allFiles) {
    const ext = path.extname(f).toUpperCase().replace('.', '') || 'NO_EXT';
    extCount[ext] = (extCount[ext] || 0) + 1;
  }
  
  console.log('Распределение по типам:');
  for (const [ext, count] of Object.entries(extCount).sort((a, b) => b[1] - a[1])) {
    const skip = skipExts.includes(ext) ? ' [SKIP]' : '';
    console.log(`  ${ext}: ${count}${skip}`);
  }
  
  const parseableFiles = allFiles.filter(f => !skipExts.includes(path.extname(f).toUpperCase().replace('.', '')));
  console.log(`\nФайлов для обработки: ${parseableFiles.length} (пропущено: ${allFiles.length - parseableFiles.length})\n`);
  
  console.log('Обработка файлов (последовательно)...\n');
  
  const successful: any[] = [];
  const failures: any[] = [];
  const docTypeStats: Record<string, {count: number, tx: number, text: number}> = {};
  const fileTypeStats: Record<string, {total: number, success: number, tx: number}> = {};
  const clientStats: Record<string, {files: number, tx: number, text: number}> = {};
  
  const totalFiles = parseableFiles.length;
  
  for (let i = 0; i < totalFiles; i++) {
    const result = processOneFile(parseableFiles[i]);
    
    if (result.success) {
      successful.push(result);
      const dt = result.docType;
      if (!docTypeStats[dt]) docTypeStats[dt] = { count: 0, tx: 0, text: 0 };
      docTypeStats[dt].count++;
      docTypeStats[dt].tx += result.transactions;
      docTypeStats[dt].text += result.textLength;
      
      if (!clientStats[result.client]) clientStats[result.client] = { files: 0, tx: 0, text: 0 };
      clientStats[result.client].files++;
      clientStats[result.client].tx += result.transactions;
      clientStats[result.client].text += result.textLength;
    } else {
      failures.push(result);
    }
    
    const ft = result.type;
    if (!fileTypeStats[ft]) fileTypeStats[ft] = { total: 0, success: 0, tx: 0 };
    fileTypeStats[ft].total++;
    if (result.success) { fileTypeStats[ft].success++; fileTypeStats[ft].tx += result.transactions; }
    
    if ((i + 1) % 500 === 0 || i === totalFiles - 1) {
      const pct = Math.round((i + 1) / totalFiles * 100);
      const totalTx = successful.reduce((s: number, r: any) => s + r.transactions, 0);
      process.stdout.write(`\r  ${i + 1}/${totalFiles} (${pct}%) | OK: ${successful.length} | Err: ${failures.length} | Tx: ${totalTx}`);
      
      if (successful.length > 50000) {
        successful.sort((a, b) => b.transactions - a.transactions);
        successful.splice(5000, successful.length - 5000);
      }
    }
  }
  
  console.log('\n\n');
  
  const totalTransactions = successful.reduce((s: number, r: any) => s + r.transactions, 0);
  const totalTextLength = successful.reduce((s: number, r: any) => s + r.textLength, 0);
  const avgDuration = successful.length > 0 ? successful.reduce((s: number, r: any) => s + r.duration, 0) / successful.length : 0;
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  РЕЗУЛЬТАТЫ');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Всего файлов: ${parseableFiles.length}`);
  console.log(`  Пропущено (изображения): ${allFiles.length - parseableFiles.length}`);
  console.log(`  Успешно: ${successful.length}`);
  console.log(`  Ошибок: ${failures.length}`);
  console.log(`  Транзакций: ${totalTransactions}`);
  console.log(`  Текста: ${(totalTextLength/1024).toFixed(1)} KB`);
  console.log(`  Среднее время: ${avgDuration.toFixed(0)} мс\n`);
  
  console.log('--- По типам документов ---');
  for (const [dt, st] of Object.entries(docTypeStats).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${dt}: ${st.count} шт., ${st.tx} транз., ${(st.text/1024).toFixed(1)} KB текста`);
  }
  
  console.log('\n--- По типам файлов ---');
  for (const [ft, st] of Object.entries(fileTypeStats).sort((a, b) => b[1].total - a[1].total)) {
    const pct = Math.round(st.success / st.total * 100);
    console.log(`  ${ft}: ${st.success}/${st.total} (${pct}%), ${st.tx} транз.`);
  }
  
  console.log('\n--- Топ-20 файлов по транзакциям ---');
  const topTx = [...successful].sort((a, b) => b.transactions - a.transactions).slice(0, 20);
  for (const r of topTx) {
    console.log(`  ${r.file} (${r.client})`);
    console.log(`    Тип: ${r.type}, Док: ${r.docType}, Транз: ${r.transactions}, Текст: ${(r.textLength/1024).toFixed(1)}KB`);
  }
  
  if (failures.length > 0) {
    console.log(`\n--- Ошибки парсинга (первые 30 из ${failures.length}) ---`);
    for (const r of failures.slice(0, 30))
      console.log(`  ${r.file} (${r.type}): ${r.error || 'не поддерживается'}`);
  }
  
  console.log('\n--- Топ-20 клиентов ---');
  const topClients = Object.entries(clientStats)
    .sort((a, b) => (b[1].tx + b[1].text/1000) - (a[1].tx + a[1].text/1000)).slice(0, 20);
  for (const [client, st] of topClients)
    console.log(`  ${client}: ${st.files} файлов, ${st.tx} транз., ${(st.text/1024).toFixed(1)} KB`);
  
  // ========================
  // HTML отчет
  // ========================
  let html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><title>Тест парсинга v3 - ЗАЯВКИ ВЫДАННЫЕ</title>
<style>
  body{font-family:'Segoe UI',sans-serif;background:#0f172a;color:#e2e8f0;padding:20px}
  h1{color:#38bdf8}h2{color:#818cf8;margin-top:30px}
  .stat{display:inline-block;background:#1e293b;border:1px solid #334155;border-radius:8px;padding:15px 25px;margin:5px;text-align:center}
  .stat .val{font-size:2em;font-weight:bold;color:#38bdf8}
  .stat .lbl{font-size:.8em;color:#94a3b8}
  table{width:100%;border-collapse:collapse;margin:15px 0}
  th,td{padding:8px 12px;border:1px solid #334155;text-align:left;font-size:.85em}
  th{background:#1e293b;color:#38bdf8}
  tr:nth-child(even){background:#1e293b55}
  .ok{color:#4ade80}.err{color:#f87171}
  .badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:.8em;font-weight:bold}
  .badge-pdf{background:#dc2626;color:#fff}.badge-xls,.badge-xlsx,.badge-mxl{background:#16a34a;color:#fff}
  .badge-doc,.badge-docx,.badge-odt{background:#2563eb;color:#fff}.badge-txt,.badge-xml,.badge-html{background:#d97706;color:#fff}
  .badge-csv,.badge-rtf{background:#7c3aed;color:#fff}.badge-other{background:#6b7280;color:#fff}
</style></head><body>
<h1>📊 Тест парсинга v3 - ЗАЯВКИ ВЫДАННЫЕ</h1>
<p>Директория: <code>${baseDir}</code></p>
<p>Дата: ${new Date().toLocaleString('ru-RU')}</p>
<h2>📈 Общая статистика</h2><div>
  <div class="stat"><div class="val">${parseableFiles.length}</div><div class="lbl">Обработано файлов</div></div>
  <div class="stat"><div class="val">${allFiles.length - parseableFiles.length}</div><div class="lbl">Пропущено (изображения)</div></div>
  <div class="stat"><div class="val ok">${successful.length}</div><div class="lbl">Успешно</div></div>
  <div class="stat"><div class="val err">${failures.length}</div><div class="lbl">Ошибки</div></div>
  <div class="stat"><div class="val">${totalTransactions}</div><div class="lbl">Транзакций</div></div>
  <div class="stat"><div class="val">${(totalTextLength/1024).toFixed(0)} KB</div><div class="lbl">Текста</div></div>
  <div class="stat"><div class="val">${avgDuration.toFixed(0)} мс</div><div class="lbl">Среднее время</div></div>
</div>
<h2>📁 По типам файлов</h2><table><tr><th>Тип</th><th>Всего</th><th>Успешно</th><th>%</th><th>Транзакций</th></tr>`;
  
  for (const [ft, st] of Object.entries(fileTypeStats).sort((a, b) => b[1].total - a[1].total)) {
    const pct = Math.round(st.success / st.total * 100);
    html += `<tr><td><span class="badge ${badgeClass(ft)}">${ft}</span></td><td>${st.total}</td><td class="ok">${st.success}</td><td>${pct}%</td><td>${st.tx}</td></tr>`;
  }
  
  html += `</table><h2>📋 По типам документов</h2><table><tr><th>Тип</th><th>Кол-во</th><th>Транз.</th><th>Текст KB</th></tr>`;
  for (const [dt, st] of Object.entries(docTypeStats).sort((a, b) => b[1].count - a[1].count))
    html += `<tr><td>${dt}</td><td>${st.count}</td><td>${st.tx}</td><td>${(st.text/1024).toFixed(1)}</td></tr>`;
  
  html += `</table><h2>🏆 Топ-30 файлов по транзакциям</h2><table><tr><th>Файл</th><th>Клиент</th><th>Тип</th><th>Док.</th><th>Транз.</th><th>KB</th><th>Время</th></tr>`;
  for (const r of [...successful].sort((a, b) => b.transactions - a.transactions).slice(0, 30))
    html += `<tr><td>${r.file}</td><td>${r.client}</td><td>${r.type}</td><td>${r.docType}</td><td>${r.transactions}</td><td>${(r.textLength/1024).toFixed(1)}</td><td>${r.duration}мс</td></tr>`;
  
  html += `</table><h2>📊 Топ-30 клиентов</h2><table><tr><th>Клиент</th><th>Файлов</th><th>Транз.</th><th>Текст KB</th></tr>`;
  for (const [client, st] of Object.entries(clientStats).sort((a, b) => b[1].files - a[1].files).slice(0, 30))
    html += `<tr><td>${client}</td><td>${st.files}</td><td>${st.tx}</td><td>${(st.text/1024).toFixed(1)}</td></tr>`;
  
  html += `</table>`;
  if (failures.length > 0) {
    html += `<h2>❌ Ошибки (${failures.length})</h2><table><tr><th>Файл</th><th>Тип</th><th>Ошибка</th></tr>`;
    for (const r of failures.slice(0, 100))
      html += `<tr><td>${r.file}</td><td>${r.type}</td><td class="err">${r.error || 'не поддерживается'}</td></tr>`;
    html += `</table>`;
  }
  
  html += `<hr><p style="color:#64748b;font-size:.8em">Сгенерировано ${new Date().toLocaleString('ru-RU')}</p></body></html>`;
  
  fs.writeFileSync('test-client-requests-report-v3.html', html, 'utf-8');
  console.log('\n\n✅ HTML отчет сохранен: test-client-requests-report-v3.html');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });