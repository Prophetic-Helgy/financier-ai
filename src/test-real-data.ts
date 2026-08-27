/**
 * Тестирование financier.ai на реальных данных клиентов
 * Папка: D:\ГД\!!№3 Клиенты\ЗАЯВКИ ОПУБЛИКОВАННЫЕ
 */

import { parseDocument, ParsedDocument } from './lib/parsers/bankParsers';
import { generateIncomeStatement, generateBalanceSheet, generateCashFlow, calculateFinancialRatios, generateFullManagementReport } from './lib/financialReports';
import { generateBudgetVsActual, calculateProductCosting, runWhatIfScenarios, forecastCashFlow, generateKPIDashboard, generateRecommendations } from './lib/competitorFeatures';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.argv[2] || 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ОПУБЛИКОВАННЫЕ';

interface TestResult {
  fileName: string;
  docType: string;
  transactionsCount: number;
  metricsKeys: number;
  rawTextLen: number;
  error?: string;
}

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('ТЕСТИРОВАНИЕ FINANCIER.AI НА РЕАЛЬНЫХ ДАННЫХ КЛИЕНТОВ');
  console.log('Папка:', DATA_DIR);
  console.log('='.repeat(80) + '\n');

  // Собираем все файлы
  const allFiles: string[] = [];
  
  function walk(dir: string) {
    if (!fs.existsSync(dir)) {
      console.error(`❌ Папка не найдена: ${dir}`);
      process.exit(1);
    }
    
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Проверяем что это не системная папка
        if (!['node_modules', '.git'].includes(entry.name)) {
          walk(fullPath);
        }
      } else {
        const ext = path.extname(entry.name).toLowerCase();
        if (['.txt', '.xls', '.xlsx', '.csv', '.pdf', '.docx', '.json'].includes(ext)) {
          allFiles.push(fullPath);
        }
      }
    }
  }

  walk(DATA_DIR);

  console.log(`📂 Найдено файлов: ${allFiles.length}\n`);

  // Группируем по расширению
  const byExt: Record<string, string[]> = {};
  for (const f of allFiles) {
    const ext = path.extname(f).toLowerCase();
    if (!byExt[ext]) byExt[ext] = [];
    byExt[ext].push(f);
  }

  console.log('📊 Распределение по типам файлов:');
  for (const [ext, files] of Object.entries(byExt)) {
    const totalSize = files.reduce((sum, f) => sum + fs.statSync(f).size, 0);
    const sizeStr = totalSize > 1e6 ? `${(totalSize/1e6).toFixed(1)}MB` : `${(totalSize/1e3).toFixed(0)}KB`;
    console.log(`   ${ext.toUpperCase()}: ${files.length} файлов (${sizeStr})`);
  }

  // Парсим документы
  const supported = allFiles.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.txt', '.xls', '.xlsx', '.csv', '.pdf'].includes(ext);
  });

  console.log(`\n🔍 Парсинг ${supported.length} поддерживаемых файлов...\n`);

  const results: TestResult[] = [];
  let successCount = 0;
  let errorCount = 0;
  let totalTransactions = 0;
  let documentsWithMetrics = 0;

  // Парсим все файлы параллельно (по 10 за раз)
  const batchSize = 10;
  for (let i = 0; i < supported.length; i += batchSize) {
    const batch = supported.slice(i, Math.min(i + batchSize, supported.length));
    
    await Promise.all(batch.map(async (filePath) => {
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content || content.length < 50) return; // Слишком маленький файл
        
        const parsed: ParsedDocument = await parseDocument(content, path.basename(filePath));
        
        const result: TestResult = {
          fileName: path.basename(filePath),
          docType: parsed.docType,
          transactionsCount: parsed.transactions.length,
          metricsKeys: Object.keys(parsed.extractedMetrics || {}).length,
          rawTextLen: parsed.rawText.length,
        };

        if (parsed.transactions.length > 0) {
          totalTransactions += parsed.transactions.length;
        }
        if (result.metricsKeys > 0) {
          documentsWithMetrics++;
        }

        // Тестируем финансовые отчёты если есть транзакции или метрики
        if (parsed.docType === 'osv' || parsed.docType === 'balance_sheet') {
          try {
            const bs = generateBalanceSheet(parsed);
            result.error = undefined;
          } catch (e: any) {
            result.error = e.message?.substring(0, 100);
          }
        }

        if (parsed.transactions.length > 0 || parsed.docType === 'osv') {
          try {
            const pnl = generateIncomeStatement(parsed);
            const ratios = calculateFinancialRatios(parsed);
            const cf = generateCashFlow(parsed);
            successCount++;
          } catch (e: any) {
            result.error = e.message?.substring(0, 100);
            errorCount++;
          }
        }

        results.push(result);
      } catch (e: any) {
        // Парсинг не удался — возможно бинарный формат (PDF/Excel)
        const result: TestResult = {
          fileName: path.basename(filePath),
          docType: 'parse_error',
          transactionsCount: 0,
          metricsKeys: 0,
          rawTextLen: 0,
          error: e.message?.substring(0, 150) || 'Unknown parse error'
        };
        results.push(result);
      }
    }));

    const progress = Math.min(i + batchSize, supported.length);
    process.stdout.write(`\r   ⏳ Обработано: ${progress}/${supported.length}`);
  }

  console.log('\n\n');

  // Статистика
  const parsedOk = results.filter(r => r.docType !== 'parse_error');
  const withTransactions = results.filter(r => r.transactionsCount > 0);
  const osvDocs = results.filter(r => r.docType === 'osv');
  const balanceDocs = results.filter(r => r.docType === 'balance_sheet');

  console.log('📈 ИТОГИ ТЕСТИРОВАНИЯ'.padEnd(80, '='));
  console.log(`   Всего файлов:          ${allFiles.length}`);
  console.log(`   Поддерживаемых:        ${supported.length}`);
  console.log(`   Успешно распарсено:    ${parsedOk.length}`);
  console.log(`   С транзакциями:        ${withTransactions.length} (${totalTransactions.toLocaleString('ru-RU')} операций)`);
  console.log(`   ОСВ (обор. ведомости): ${osvDocs.length}`);
  console.log(`   Балансы:               ${balanceDocs.length}`);
  console.log(`   С метриками:           ${documentsWithMetrics}`);
  
  // Лучшие клиенты по количеству данных
  const topClients = results
    .filter(r => r.transactionsCount > 0 || r.metricsKeys > 0)
    .sort((a, b) => (b.transactionsCount + b.metricsKeys * 10) - (a.transactionsCount + a.metricsKeys * 10))
    .slice(0, 20);

  console.log(`\n🏆 ЛУЧШИЕ КЛИЕНТЫ ПО КОЛИЧЕСТВУ ДАННЫХ:`);
  console.log('   '.padEnd(5) + 'Файл'.padEnd(50) + 'Тип'.padEnd(12) + 'Операций'.padEnd(10) + 'Метрики');
  console.log('   ' + '-'.repeat(90));
  
  for (const r of topClients) {
    const name = r.fileName.length > 48 ? r.fileName.substring(0, 45) + '...' : r.fileName;
    console.log(`   ${name.padEnd(50)}${r.docType.padEnd(12)}${String(r.transactionsCount).padEnd(10)}${r.metricsKeys}`);
  }

  // Тестируем финансовые отчёты на лучших документах
  const bestDocs = results
    .filter(r => r.transactionsCount > 0 || r.metricsKeys > 0)
    .slice(0, 3);

  if (bestDocs.length > 0) {
    console.log(`\n📊 ДЕТАЛЬНЫЙ АНАЛИЗ ТОП-КЛИЕНТОВ:\n`);
    
    for (const best of bestDocs) {
      const filePath = path.join(DATA_DIR, best.fileName);
      try {
        const content = fs.readFileSync(filePath, 'utf-8');
        if (!content || content.length < 50) continue;

        const doc: ParsedDocument = await parseDocument(content, best.fileName);
        
        console.log(`\n   📄 ${best.fileName}`);
        console.log(`      Тип: ${doc.docType} | Операций: ${doc.transactions.length} | Метрик: ${Object.keys(doc.extractedMetrics || {}).length}`);

        if (doc.transactions.length > 0) {
          const pnl = generateIncomeStatement(doc);
          const ratios = calculateFinancialRatios(doc);
          const cf = generateCashFlow(doc);
          
          console.log(`      ОПиУ строк: ${pnl.length} | Коэффициентов: ${ratios.length} | ДДС строк: ${cf.length}`);

          // Показываем ключевые показатели
          const totalRevenue = pnl.find(l => l.name.toLowerCase().includes('выручка') || l.isTotal && l.level === 0);
          const netProfit = pnl.find(l => l.name.toLowerCase().includes('прибыль'));
          
          if (totalRevenue) console.log(`      Выручка: ${totalRevenue.value.toLocaleString('ru-RU')} ₽`);
          if (netProfit) console.log(`      Чистая прибыль: ${netProfit.value.toLocaleString('ru-RU')} ₽`);

          // Конкурентные фичи
          const budget = generateBudgetVsActual(doc);
          const costing = calculateProductCosting(doc);
          const scenarios = runWhatIfScenarios(doc);
          const forecast = forecastCashFlow(doc, 6);
          const kpi = generateKPIDashboard(doc);
          const recs = generateRecommendations(doc);

          console.log(`      Бюджет vs Факт: ${budget.length} строк`);
          console.log(`      What-If Сценарии: ${scenarios.length}`);
          console.log(`      Прогноз ДДС: ${forecast.length} месяцев`);
          console.log(`      KPI показатели: ${kpi.length}`);
          console.log(`      AI Рекомендации: ${recs.length}`);

          if (ratios.length > 0) {
            const currentRatio = ratios.find(r => r.name.toLowerCase().includes('текущ'));
            const roe = ratios.find(r => r.label.toLowerCase().includes('рентабельн'));
            console.log(`      Current Ratio: ${currentRatio?.value.toFixed(2)} (${currentRatio?.status === 'good' ? '✅' : currentRatio?.status === 'warning' ? '⚠️' : '🔴'})`);
          }
        }

        if (doc.extractedMetrics && Object.keys(doc.extractedMetrics).length > 0) {
          console.log(`      Извлеченные метрики:`);
          for (const [key, val] of Object.entries(doc.extractedMetrics)) {
            if (typeof val === 'number') {
              console.log(`        ${key}: ${val.toLocaleString('ru-RU')} ₽`);
            } else {
              console.log(`        ${key}: ${val}`);
            }
          }
        }

      } catch (e: any) {
        console.log(`   ⚠️ Ошибка анализа: ${e.message?.substring(0, 100)}`);
      }
    }
  }

  // Статистика ошибок парсинга
  const parseErrors = results.filter(r => r.docType === 'parse_error');
  if (parseErrors.length > 0) {
    console.log(`\n⚠️ ОШИБКИ ПАРСИНГА (${parseErrors.length} файлов):`);
    for (const e of parseErrors.slice(0, 10)) {
      const errShort = e.error?.substring(0, 80) || 'Unknown';
      console.log(`   ${e.fileName}: ${errShort}`);
    }
    if (parseErrors.length > 10) {
      console.log(`   ... и ещё ${parseErrors.length - 10} ошибок`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ ТЕСТИРОВАНИЕ ЗАВЕРШЕНО');
  console.log('='.repeat(80) + '\n');
}

main().catch(err => {
  console.error('❌ Критическая ошибка:', err);
  process.exit(1);
});
