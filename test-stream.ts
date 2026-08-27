#!/usr/bin/env tsx
/**
 * Оптимизированный тест парсинга данных из файлов клиентов
 * Пропускает изображения (JPG/PNG), использует параллельную обработку
 */
import * as fs from 'fs';
import * as path from 'path';
import { Worker, isMainThread, workerData } from 'worker_threads';

// ========================
// PDF текст извлечение
// ========================
function extractTextFromPdf(buffer: Buffer): string {
  try {
    const textPages = buffer.toString('latin1').match(/(?=\x00)([\x00-\x7F]{10,})/g);
    if (textPages) return textPages.map((s: string) => s.replace('\x00', ' ').trim()).join('\n').split('').filter((c: string) => c === c).join('');
  } catch {}
  return '';
}

// ========================
// XLS/XLSX данные
// ========================
function extractFromExcel(buffer: Buffer): { text: string; rows: number } {
  let text = '';
  let rows = 0;
  try {
    const zip = require('fflate');
    const unzipped = zip.unzipSync(buffer);
    const sharedStrings: string[] = [];
    if (unzipped['xl/sharedStrings.xml']) {
      const ss = unzipped['xl/sharedStrings.xml'].toString('utf8');
      const matches = ss.match(/<t[^>]*>([^<]*)<\/t>/g);
      if (matches) matches.forEach((m: string) => sharedStrings.push(m.replace(/<[^>]+>/g, '')));
    }
    if (unzipped['xl/worksheet/sheet1.xml']) {
      const sheet = unzipped['xl/worksheet/sheet1.xml'].toString('utf8');
      const inlineVals = sheet.match(/<c [^>]*?r="([^"]+)"[^>]*?>\s*<v[^>]*>([^<]*)<\/v>/g) || [];
      const siRefs = sheet.match(/<c [^>]*?r="([^"]+)"[^>]*?>\s*<v[^>]*>(\d+)<\/v>/g) || [];
      let extracted = 0;
      inlineVals.forEach((m: string) => { extracted++; rows++; });
      siRefs.forEach((m: string) => { 
        const si = parseInt(m.match(/\d+$/)?.[0] || '0');
        if (sharedStrings[si]) { extracted++; rows++; text += sharedStrings[si] + '\n'; }
      });
      text += sheet.match(/<v[^>]*>([^<]*)<\/v>/g)?.map((v: string) => v.replace(/<[^>]+>/g, '')).join('\n') || '';
    }
  } catch {
    try {
      const txt = buffer.toString('utf8', 0, Math.min(500000, buffer.length));
      const rows_arr = txt.match(/<Row[^>]*>([\s\S]*?)<\/Row>/g) || [];
      rows = rows_arr.length;
      text = rows_arr.map(r => r.match(/<Data[^>]*>([^<]*)<\/Data>/g)?.map(d => d.replace(/<[^>]+>/g, '')).join('\t') || '').join('\n');
    } catch {}
  }
  return { text: text.replace(/[^\x20-\x7E\u0400-\u04FF\u00C0-\u017F\d\s]/g, ' ').replace(/\s+/g, ' ').trim(), rows };
}

// ========================
// DOCX текст
// ========================
function extractTextFromDocx(buffer: Buffer): string {
  try {
    const zip = require('fflate');
    const unzipped = zip.unzipSync(buffer);
    if (unzipped['word/document.xml']) {
      const doc = unzipped['word/document.xml'].toString('utf8');
      const texts = doc.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
      return texts.map((t: string) => t.replace(/<[^>]+>/g, '')).join(' ');
    }
  } catch {}
  return '';
}

// ========================
// TXT / XML
// ========================
function extractTextFromText(buffer: Buffer): string {
  const encodings = ['utf8', 'windows-1251', 'latin1'];
  for (const enc of encodings) {
    const text = buffer.toString(enc as any);
    if (/[\u0400-\u04FFa-zA-Z]/.test(text)) return text;
  }
  return buffer.toString('utf8', 0, Math.min(500000, buffer.length));
}

// ========================
// Определение типа документа
// ========================
function detectDocumentType(text: string, filename: string): string {
  const t = text.toLowerCase();
  const n = filename.toLowerCase();
  if (/(выписк|extract|statement)/i.test(n) || /(сальдо|сальдо|остаток)/i.test(t)) return 'BANK_STATEMENT';
  if (/(договор|contract|договор|аренд)/i.test(n)) return 'CONTRACT';
  if (/(баланс|balance|bilan)/i.test(n)) return 'BALANCE_SHEET';
  if (/(деклар|decl|report|отчет)/i.test(n)) return 'TAX_DECLARATION';
  if (/(акт|invoice|счет|счёт|tn|тн)/i.test(n)) return 'INVOICE';
  if (/(осв|account|счет)/i.test(n)) return 'ACCOUNT_STATEMENT';
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
function extractMetrics(text: string, docType: string): Record<string, string> {
  const metrics: Record<string, string> = {};
  const t = text.toLowerCase();
  
  const orgPattern = /(?:ооо|ип|зao|ao|зао|пao|пао|огpн|ооо)\s+[""]?([а-яёa-z\s]{2,50})[""]?/gi;
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
  
  const totalPattern = /(?:итого|всего|total|сумма|сумма\s+без\s+ндс)\s*[:\s]*\s*([\d\s]{3,15})/gi;
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
  const ext = path.extname(filename).toUpperCase().replace('.', '');
  const client = filePath.split(path.sep).filter((_, i, a) => i > 0 && i < a.length - 1)[0] || 'unknown';
  
  let buffer: Buffer;
  try {
    buffer = fs.readFileSync(filePath);
  } catch (e: any) {
    return { success: false, file: filename, ext, type: ext, docType: 'UNKNOWN', transactions: 0, textLength: 0, duration: Date.now() - start, error: e.message, metrics: {}, client };
  }
  
  // Skip images
  if (['JPG', 'JPEG', 'PNG', 'GIF', 'BMP', 'TIFF', 'ICO', 'WEBP'].includes(ext)) {
    return { success: false, file: filename, ext, type: ext, docType: 'IMAGE', transactions: 0, textLength: 0, duration: Date.now() - start, error: 'изображение', metrics: {}, client };
  }
  
  try {
    let text = '';
    let rows = 0;
    
    switch (ext) {
      case 'PDF':
        text = extractTextFromPdf(buffer);
        break;
      case 'XLS':
        const xlsResult = extractFromExcel(buffer);
        text = xlsResult.text;
        rows = xlsResult.rows;
        break;
      case 'XLSX':
        const xlsxResult = extractFromExcel(buffer);
        text = xlsxResult.text;
        rows = xlsxResult.rows;
        break;
      case 'DOCX':
      case 'DOC':
        text = extractTextFromDocx(buffer);
        break;
      case 'TXT':
      case 'XML':
      case 'JSON':
        text = extractTextFromText(buffer);
        break;
      default:
        text = extractTextFromText(buffer);
    }
    
    if (text.length < 10 && rows === 0) {
      return { success: false, file: filename, ext, type: ext, docType: 'UNKNOWN', transactions: 0, textLength: 0, duration: Date.now() - start, error: 'нет данных', metrics: {}, client };
    }
    
    const docType = detectDocumentType(text, filename);
    const transactions = countTransactions(text) + rows;
    const metrics = extractMetrics(text, docType);
    
    return { success: true, file: filename, ext, type: ext, docType, transactions, textLength: text.length, duration: Date.now() - start, metrics, client };
  } catch (e: any) {
    return { success: false, file: filename, ext, type: ext, docType: 'UNKNOWN', transactions: 0, textLength: 0, duration: Date.now() - start, error: e.message, metrics: {}, client };
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
// Main
// ========================
async function main() {
  const baseDir = 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ВЫДАННЫЕ';
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ОПТИМИЗИРОВАННЫЙ ТЕСТ ПАРСИНГА (без изображений)');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Базовая директория: ${baseDir}\n`);
  
  // Сбор файлов
  console.log('Сбор файлов...');
  const allFiles = collectFiles(baseDir);
  console.log(`Всего файлов: ${allFiles.length}\n`);
  
  // Статистика по типам
  const extCount: Record<string, number> = {};
  const skipExts = ['JPG', 'JPEG', 'PNG', 'GIF', 'BMP', 'TIFF', 'ICO', 'WEBP'];
  for (const f of allFiles) {
    const ext = path.extname(f).toUpperCase().replace('.', '') || 'NO_EXT';
    extCount[ext] = (extCount[ext] || 0) + 1;
  }
  
  console.log('Распределение по типам:');
  for (const [ext, count] of Object.entries(extCount).sort((a, b) => b[1] - a[1])) {
    const skip = skipExts.includes(ext) ? ' [SKIP]' : '';
    console.log(`  ${ext}: ${count}${skip}`);
  }
  
  // Фильтрация - только парсируемые файлы
  const parseableFiles = allFiles.filter(f => {
    const ext = path.extname(f).toUpperCase().replace('.', '');
    return !skipExts.includes(ext);
  });
  console.log(`\nФайлов для обработки: ${parseableFiles.length} (пропущено изображений: ${allFiles.length - parseableFiles.length})\n`);
  
  // Обработка
  console.log('Обработка файлов...\n');
  const results: any[] = [];
  const batchSize = 500;
  
  for (let i = 0; i < parseableFiles.length; i += batchSize) {
    const batch = parseableFiles.slice(i, i + batchSize);
    
    // Параллельная обработка в пределах батча
    const promises = batch.map(filePath => {
      return new Promise<any>(resolve => {
        // Используем setImmediate для асинхронной обработки
        setImmediate(() => {
          const result = processOneFile(filePath);
          resolve(result);
        });
      });
    });
    
    const batchResults = await Promise.all(promises);
    results.push(...batchResults);
    
    const pct = Math.round((i + batch.length) / parseableFiles.length * 100);
    const successful = results.filter(r => r.success).length;
    const tx = results.filter(r => r.success).reduce((s, r) => s + r.transactions, 0);
    process.stdout.write(`\r  Обработано: ${i + batch.length}/${parseableFiles.length} (${pct}%) | Успешно: ${successful} | Транз: ${tx}`);
  }
  
  console.log('\n\n');
  
  // Результаты
  const successful = results.filter((r: any) => r.success);
  const failed = results.filter((r: any) => !r.success);
  const totalTransactions = successful.reduce((s: number, r: any) => s + r.transactions, 0);
  const totalTextLength = successful.reduce((s: number, r: any) => s + r.textLength, 0);
  const avgDuration = successful.length > 0 ? successful.reduce((s: number, r: any) => s + r.duration, 0) / successful.length : 0;
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  РЕЗУЛЬТАТЫ');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`  Всего файлов: ${results.length}`);
  console.log(`  Пропущено (изображения): ${allFiles.length - parseableFiles.length}`);
  console.log(`  Успешно: ${successful.length}`);
  console.log(`  Ошибок: ${failed.length}`);
  console.log(`  Транзакций: ${totalTransactions}`);
  console.log(`  Текста: ${(totalTextLength/1024).toFixed(1)} KB`);
  console.log(`  Среднее время: ${avgDuration.toFixed(0)} мс\n`);
  
  // По типам документов
  console.log('--- По типам документов ---');
  const docTypeStats: Record<string, {count: number, tx: number, text: number}> = {};
  for (const r of successful) {
    if (!docTypeStats[r.docType]) docTypeStats[r.docType] = { count: 0, tx: 0, text: 0 };
    docTypeStats[r.docType].count++;
    docTypeStats[r.docType].tx += r.transactions;
    docTypeStats[r.docType].text += r.textLength;
  }
  for (const [dt, st] of Object.entries(docTypeStats).sort((a, b) => b[1].count - a[1].count)) {
    console.log(`  ${dt}: ${st.count} шт., ${st.tx} транз., ${(st.text/1024).toFixed(1)} KB текста`);
  }
  
  // По типам файлов
  console.log('\n--- По типам файлов ---');
  const fileTypeStats: Record<string, {total: number, success: number, tx: number}> = {};
  for (const r of results) {
    if (!fileTypeStats[r.type]) fileTypeStats[r.type] = { total: 0, success: 0, tx: 0 };
    fileTypeStats[r.type].total++;
    if (r.success) { fileTypeStats[r.type].success++; fileTypeStats[r.type].tx += r.transactions; }
  }
  for (const [ft, st] of Object.entries(fileTypeStats).sort((a, b) => b[1].total - a[1].total)) {
    const pct = Math.round(st.success / st.total * 100);
    console.log(`  ${ft}: ${st.success}/${st.total} (${pct}%), ${st.tx} транз.`);
  }
  
  // Топ-20 по транзакциям
  console.log('\n--- Топ-20 файлов по транзакциям ---');
  const topTx = [...successful].sort((a, b) => b.transactions - a.transactions).slice(0, 20);
  for (const r of topTx) {
    console.log(`  ${r.file} (${r.client})`);
    console.log(`    Тип: ${r.type}, Док: ${r.docType}, Транз: ${r.transactions}, Текст: ${(r.textLength/1024).toFixed(1)}KB, Время: ${r.duration}мс`);
  }
  
  // Топ-20 по метрикам
  console.log('\n--- Топ-20 файлов по метрикам ---');
  const topMetrics = [...successful]
    .map(r => ({ ...r, metricCount: Object.keys(r.metrics).length }))
    .sort((a, b) => b.metricCount - a.metricCount).slice(0, 20);
  for (const r of topMetrics) {
    if (r.metricCount > 0) {
      console.log(`  ${r.file} (${r.client})`);
      console.log(`    Метрик: ${r.metricCount}, Транз: ${r.transactions}`);
      for (const [k, v] of Object.entries(r.metrics).slice(0, 5)) console.log(`      ${k}: ${v}`);
    }
  }
  
  // Ошибки
  if (failed.length > 0) {
    console.log('\n--- Ошибки парсинга (первые 30) ---');
    for (const r of failed.slice(0, 30))
      console.log(`  ${r.file} (${r.type}): ${r.error || 'не поддерживается'}`);
  }
  
  // Топ-20 клиентов
  console.log('\n--- Топ-20 клиентов по объему данных ---');
  const clientStats: Record<string, {files: number, tx: number, text: number}> = {};
  for (const r of successful) {
    if (!clientStats[r.client]) clientStats[r.client] = { files: 0, tx: 0, text: 0 };
    clientStats[r.client].files++;
    clientStats[r.client].tx += r.transactions;
    clientStats[r.client].text += r.textLength;
  }
  const topClients = Object.entries(clientStats)
    .sort((a, b) => (b[1].tx + b[1].text/1000) - (a[1].tx + a[1].text/1000)).slice(0, 20);
  for (const [client, st] of topClients)
    console.log(`  ${client}: ${st.files} файлов, ${st.tx} транз., ${(st.text/1024).toFixed(1)} KB`);
  
  // ========================
  // HTML отчет
  // ========================
  let html = `<!DOCTYPE html>
<html lang="ru"><head><meta charset="UTF-8"><title>Тест парсинга - ЗАЯВКИ ВЫДАННЫЕ (Оптимизированный)</title>
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
  .badge-pdf{background:#dc2626;color:#fff}.badge-xls,.badge-xlsx{background:#16a34a;color:#fff}
  .badge-doc,.badge-docx{background:#2563eb;color:#fff}.badge-other{background:#6b7280;color:#fff}
</style></head><body>
<h1>📊 Тест парсинга данных из файлов клиентов (Оптимизированный)</h1>
<p>Директория: <code>${baseDir}</code></p>
<p>Дата: ${new Date().toLocaleString('ru-RU')}</p>
<h2>📈 Общая статистика</h2><div>
  <div class="stat"><div class="val">${results.length}</div><div class="lbl">Обработано файлов</div></div>
  <div class="stat"><div class="val">${allFiles.length - parseableFiles.length}</div><div class="lbl">Пропущено (изображения)</div></div>
  <div class="stat"><div class="val ok">${successful.length}</div><div class="lbl">Успешно</div></div>
  <div class="stat"><div class="val err">${failed.length}</div><div class="lbl">Ошибки</div></div>
  <div class="stat"><div class="val">${totalTransactions}</div><div class="lbl">Транзакций</div></div>
  <div class="stat"><div class="val">${(totalTextLength/1024).toFixed(0)} KB</div><div class="lbl">Текста</div></div>
  <div class="stat"><div class="val">${avgDuration.toFixed(0)} мс</div><div class="lbl">Среднее время</div></div>
</div>
<h2>📁 По типам файлов</h2><table><tr><th>Тип</th><th>Всего</th><th>Успешно</th><th>%</th><th>Транзакций</th></tr>`;
  
  for (const [ft, st] of Object.entries(fileTypeStats).sort((a, b) => b[1].total - a[1].total)) {
    const pct = Math.round(st.success / st.total * 100);
    html += `<tr><td><span class="badge badge-${ft.toLowerCase()}">${ft}</span></td><td>${st.total}</td><td class="ok">${st.success}</td><td>${pct}%</td><td>${st.tx}</td></tr>`;
  }
  
  html += `</table><h2>📋 По типам документов</h2><table><tr><th>Тип</th><th>Кол-во</th><th>Транз.</th><th>Текст KB</th></tr>`;
  for (const [dt, st] of Object.entries(docTypeStats).sort((a, b) => b[1].count - a[1].count))
    html += `<tr><td>${dt}</td><td>${st.count}</td><td>${st.tx}</td><td>${(st.text/1024).toFixed(1)}</td></tr>`;
  
  html += `</table><h2>🏆 Топ-30 файлов по транзакциям</h2><table><tr><th>Файл</th><th>Клиент</th><th>Тип</th><th>Док.</th><th>Транз.</th><th>KB</th><th>Время</th></tr>`;
  for (const r of topTx)
    html += `<tr><td>${r.file}</td><td>${r.client}</td><td>${r.type}</td><td>${r.docType}</td><td>${r.transactions}</td><td>${(r.textLength/1024).toFixed(1)}</td><td>${r.duration}мс</td></tr>`;
  
  html += `</table><h2>📊 Топ-30 клиентов</h2><table><tr><th>Клиент</th><th>Файлов</th><th>Транз.</th><th>Текст KB</th></tr>`;
  for (const [client, st] of topClients)
    html += `<tr><td>${client}</td><td>${st.files}</td><td>${st.tx}</td><td>${(st.text/1024).toFixed(1)}</td></tr>`;
  
  html += `</table>`;
  if (failed.length > 0) {
    html += `<h2>❌ Ошибки (${failed.length})</h2><table><tr><th>Файл</th><th>Тип</th><th>Ошибка</th></tr>`;
    for (const r of failed.slice(0, 100))
      html += `<tr><td>${r.file}</td><td>${r.type}</td><td class="err">${r.error || 'не поддерживается'}</td></tr>`;
    html += `</table>`;
  }
  
  html += `<hr><p style="color:#64748b;font-size:.8em">Сгенерировано ${new Date().toLocaleString('ru-RU')}</p></body></html>`;
  
  fs.writeFileSync('test-client-requests-fast-report.html', html, 'utf-8');
  console.log('\n\n✅ HTML отчет сохранен: test-client-requests-fast-report.html');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });