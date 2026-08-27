/**
 * Полный тест парсинга всех видов документов из файлов клиентов
 * Standalone версия (без импорта из Vite-модулей)
 * Директория: D:\ГД\!!№3 Клиенты\ЗАЯВКИ ВЫДАННЫЕ\
 */

import * as fs from 'fs';
import * as path from 'path';
import * as pdfjs from 'pdfjs-dist';
import Excel from 'exceljs';
import mammoth from 'mammoth';
// @ts-ignore
pdfjs.GlobalWorkerOptions.workerSrc = '//cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.js';

// ========================
// Утилиты
// ========================
function getAllFiles(dir: string, depth = 0, maxDepth = 3): string[] {
  if (depth > maxDepth) return [];
  const files: string[] = [];
  try {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) files.push(...getAllFiles(fullPath, depth + 1, maxDepth));
      else files.push(fullPath);
    }
  } catch (e) { console.error(`Cannot read ${dir}:`, e); }
  return files;
}

function getFileType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const map: Record<string, string> = {
    '.pdf':'PDF', '.xls':'XLS', '.xlsx':'XLSX', '.doc':'DOC', '.docx':'DOCX',
    '.jpg':'JPG', '.jpeg':'JPG', '.png':'PNG', '.txt':'TXT', '.json':'JSON', '.xml':'XML'
  };
  return map[ext] || 'OTHER';
}

// ========================
// Парсеры
// ========================
async function parsePDF(data: Buffer): Promise<{text: string, transactions: any[]}> {
  try {
    const pdf = await pdfjs.getDocument({ data }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      text += (await page.getTextContent()).items.map((i: any) => i.str).join(' ');
    }
    return extractFromText(text);
  } catch(e: any) { return { text: `PDF_ERROR: ${e.message}`, transactions: [] }; }
}

async function parseExcel(data: Buffer): Promise<{text: string, transactions: any[]}> {
  try {
    const wb = new Excel.Workbook();
    await wb.xlsx.read(data);
    let text = '';
    const allRows: string[][] = [];
    wb.eachSheet((ws: any) => {
      const rows: string[][] = [];
      ws.eachRow({ includeEmpty: true }, (row: any) => {
        const r = row.values.map((v: any) => String(v ?? '')).slice(1);
        rows.push(r);
      });
      allRows.push(...rows);
    });
    text = allRows.map(r => r.join('\t')).join('\n');
    return extractFromText(text);
  } catch(e: any) { return { text: `EXCEL_ERROR: ${e.message}`, transactions: [] }; }
}

async function parseDocx(data: Buffer): Promise<{text: string, transactions: any[]}> {
  try {
    const result = await mammoth.extractRawText({ buffer: data });
    return extractFromText(result.value);
  } catch(e: any) { return { text: `DOCX_ERROR: ${e.message}`, transactions: [] }; }
}

function parseText(data: Buffer): {text: string, transactions: any[]} {
  const text = data.toString('utf-8');
  return extractFromText(text);
}

// ========================
// Извлечение транзакций из текста
// ========================
function extractFromText(text: string): {text: string, transactions: any[]} {
  const transactions: any[] = [];
  
  // Паттерн: дата + сумма (русский формат)
  const linePattern = /(\d{2}\.\d{2}\.\d{4})[\s\S]*?([ֿֿ\d\s]{3,10})\s*₽?/g;
  let m;
  while ((m = linePattern.exec(text)) !== null) {
    const amountStr = m[2].replace(/\s/g, '').replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (!isNaN(amount) && amount > 0) {
      transactions.push({ date: m[1], amount, type: 'unknown' });
    }
  }
  
  // Паттерн: сумма с знаком + или -
  const signPattern = /([+-])\s*([ֿֿ\d\s]{3,10})\s*₽?/g;
  while ((m = signPattern.exec(text)) !== null) {
    const amountStr = m[2].replace(/\s/g, '').replace(/,/g, '');
    const amount = parseFloat(amountStr);
    if (!isNaN(amount) && amount > 0) {
      transactions.push({ date: '?', amount, type: m[1] === '+' ? 'income' : 'expense' });
    }
  }
  
  // Уникальные транзакции
  const unique = transactions.filter((t, i, arr) => 
    i === 0 || arr.findIndex(a => a.date === t.date && a.amount === t.amount) === i
  );
  
  return { text, transactions: unique.slice(0, 500) };
}

// ========================
// Main
// ========================
async function main() {
  const baseDir = 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ВЫДАННЫЕ';
  
  console.log('═══════════════════════════════════════════════════════');
  console.log('  ТЕСТ ПАРСИНГА ДАННЫХ ИЗ ФАЙЛОВ КЛИЕНТОВ');
  console.log('═══════════════════════════════════════════════════════\n');
  console.log(`Базовая директория: ${baseDir}\n`);

  const allFiles = getAllFiles(baseDir);
  console.log(`Всего файлов найдено: ${allFiles.length}\n`);

  // Группировка по типам
  const typeMap: Record<string, string[]> = {};
  for (const f of allFiles) {
    const t = getFileType(f);
    if (!typeMap[t]) typeMap[t] = [];
    typeMap[t].push(f);
  }

  console.log('Распределение по типам:');
  for (const [type, files] of Object.entries(typeMap).sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  ${type}: ${files.length} шт.`);
  }
  console.log();

  interface ParseResult {
    file: string; client: string; type: string; success: boolean;
    docType: string; transactions: number; textLength: number;
    metrics: Record<string, number>; error?: string; duration: number;
  }

  const results: ParseResult[] = [];
  const totalFiles = allFiles.length;
  let processed = 0;

  for (const filePath of allFiles) {
    processed++;
    const ext = path.extname(filePath).toLowerCase();
    const fileType = getFileType(filePath);
    const fileName = path.basename(filePath);
    const relPath = path.relative(baseDir, filePath);
    const client = relPath.split(path.sep)[0] || 'root';

    if (fileName.startsWith('.') || fileName.endsWith('.lnk') || fileName.endsWith('.ds_store')) continue;

    if (processed % 50 === 0 || processed === totalFiles)
      process.stdout.write(`\r  Обработано: ${processed}/${totalFiles} (${Math.round(processed/totalFiles*100)}%)`);

    try {
      const content = fs.readFileSync(filePath);
      const supported = ['.pdf', '.xls', '.xlsx', '.doc', '.docx', '.txt', '.json', '.xml'];
      
      if (!supported.includes(ext)) {
        results.push({ file: fileName, client, type: fileType, success: false, docType: 'unsupported',
          transactions: 0, textLength: 0, metrics: {}, error: `Тип ${ext} не поддерживается`, duration: 0 });
        continue;
      }

      const start = Date.now();
      let parsed: {text: string, transactions: any[]};
      
      try {
        if (ext === '.pdf') parsed = await parsePDF(content);
        else if (['.xls', '.xlsx'].includes(ext)) parsed = await parseExcel(content);
        else if (ext === '.docx') parsed = await parseDocx(content);
        else parsed = parseText(content);
      } catch (parseErr: any) {
        results.push({ file: fileName, client, type: fileType, success: false, docType: 'error',
          transactions: 0, textLength: 0, metrics: {}, error: parseErr.message, duration: Date.now() - start });
        continue;
      }

      const duration = Date.now() - start;
      
      // Определим тип документа по содержимому
      let docType = 'unknown';
      const lower = parsed.text.toLowerCase();
      if (lower.includes('операционная сводка') || lower.includes('осв') || lower.includes('сальдо')) docType = 'osv';
      else if (lower.includes('выписк') && lower.includes('банк')) docType = 'bank_statement';
      else if (lower.includes('баланс')) docType = 'balance_sheet';
      else if (lower.includes('договор')) docType = 'contract';
      else if (lower.includes('счёт') || lower.includes('инвойс')) docType = 'invoice';
      else if (lower.includes('декларация') || lower.includes('ндфл')) docType = 'tax_declaration';
      else if (lower.includes('тн') || lower.includes('товарна')) docType = 'delivery_note';
      else if (lower.includes('акт')) docType = 'act';

      // Метрики
      const metrics: Record<string, number> = {};
      const totalIncome = parsed.transactions.filter(t => t.type === 'income').reduce((s: number, t: any) => s + t.amount, 0);
      const totalExpense = parsed.transactions.filter(t => t.type === 'expense').reduce((s: number, t: any) => s + t.amount, 0);
      if (totalIncome > 0) metrics['Доходы'] = totalIncome;
      if (totalExpense > 0) metrics['Расходы'] = totalExpense;

      results.push({ file: fileName, client, type: fileType, success: true, docType,
        transactions: parsed.transactions.length, textLength: parsed.text.length, metrics, duration });

    } catch (readErr: any) {
      results.push({ file: fileName, client, type: fileType, success: false, docType: 'error',
        transactions: 0, textLength: 0, metrics: {}, error: `Ошибка чтения: ${readErr.message}`, duration: 0 });
    }
  }

  console.log('\n\n');

  // ========================
  // Статистика
  // ========================
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  const totalTransactions = successful.reduce((s, r) => s + r.transactions, 0);
  const totalTextLength = successful.reduce((s, r) => s + r.textLength, 0);
  const avgDuration = successful.length > 0 
    ? successful.reduce((s, r) => s + r.duration, 0) / successful.length : 0;

  console.log('═══════════════════════════════════════════════════════');
  console.log('  РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ');
  console.log('═══════════════════════════════════════════════════════\n');

  console.log(`Всего файлов обработано:  ${results.length}`);
  console.log(`Успешно распаршено:       ${successful.length} (${results.length > 0 ? Math.round(successful.length/results.length*100) : 0}%)`);
  console.log(`Не удалось распарсить:    ${failed.length}`);
  console.log(`Всего транзакций:         ${totalTransactions}`);
  console.log(`Всего извлечено текста:     ${(totalTextLength / 1024).toFixed(1)} KB`);
  console.log(`Среднее время парсинга:    ${avgDuration.toFixed(0)} мс\n`);

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
<html lang="ru"><head><meta charset="UTF-8"><title>Тест парсинга - ЗАЯВКИ ВЫДАННЫЕ</title>
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
<h1>📊 Тест парсинга данных из файлов клиентов</h1>
<p>Директория: <code>${baseDir}</code></p>
<p>Дата: ${new Date().toLocaleString('ru-RU')}</p>
<h2>📈 Общая статистика</h2><div>
  <div class="stat"><div class="val">${results.length}</div><div class="lbl">Всего файлов</div></div>
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

  fs.writeFileSync('test-client-requests-report.html', html, 'utf-8');
  console.log('\n\n✅ HTML отчет сохранен: test-client-requests-report.html');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });