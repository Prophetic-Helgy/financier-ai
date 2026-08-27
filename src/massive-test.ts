/**
 * Масштабное тестирование financier.ai — все 4 профиля, все типы отчетов
 */

import { ParsedDocument } from './lib/parsers/bankParsers';
import { generateIncomeStatement, generateBalanceSheet, generateCashFlow, calculateFinancialRatios } from './lib/financialReports';
import { generateBudgetVsActual, generateKPIDashboard, generateRecommendations } from './lib/competitorFeatures';
import { generatePersonalAnalytics, generateFamilyAnalytics, generateMSBAnalytics, generateHoldingAnalytics, ProfileType } from './lib/profileAnalytics';
import { getDefaultConfig, chatWithLocalLLM, getFinancialAnalysisPrompt } from './lib/llmIntegration';
import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = process.argv[2] || 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ОПУБЛИКОВАННЫЕ';
const OUT_DIR = process.argv[3] || 'E:\\MySOFT\\financier.ai\\out';

interface TestResult { profile: string; reportId: string; success: boolean; error?: string; durationMs: number }

function mkdir(dir: string) { if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); }
function wf(file: string, content: string) { const d = path.dirname(file); mkdir(d); try { fs.writeFileSync(file, content, 'utf8'); } catch(e:any) { fs.writeFileSync(file, Buffer.from(content, 'ucs2')); } }
function fmt(n: number): string { return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Тестовые данные для всех профилей
function makeDoc(profile: ProfileType): ParsedDocument {
  const metrics: Record<string, number> = {};
  if (profile === 'msb' || profile === 'holding') {
    Object.assign(metrics, { Выручка: 1500000, Прибыль: 340000, Активы: 8900000, Оборотные_активы: 2300000, Внеоборотные_активы: 6600000, Капитал: 4100000 });
  } else {
    Object.assign(metrics, { Доход: 150000, Расход: 80000 });
  }

  return {
    docType: (profile === 'msb' ? 'osv' : profile === 'holding' ? 'balance_sheet' : 'transactions') as any,
    transactions: [
      { date: '01.01.2024', amount: 150000, payer: 'Работодатель ООО', payee: '', purpose: 'Зарплата за январь', type: 'income' as const, account: '' },
      { date: '05.01.2024', amount: 30000, payer: '', payee: 'Арендодатель ИП Иванов', purpose: 'Оплата аренды офиса', type: 'expense' as const, account: '' },
      { date: '10.01.2024', amount: 50000, payer: 'Клиент ООО Ромашка', payee: '', purpose: 'Оплата за услуги консалтинга', type: 'income' as const, account: '' },
      { date: '15.01.2024', amount: 8000, payer: '', payee: 'Поставщик ООО Канцтовары', purpose: 'Канцелярские товары', type: 'expense' as const, account: '' },
      { date: '20.01.2024', amount: 25000, payer: '', payee: 'Банк ВТБ', purpose: 'Платеж по кредиту', type: 'expense' as const, account: '' },
    ],
    rawText: `Данные клиента ${profile}: тестовые данные`,
    fileName: `test_${profile}_01`,
    extractedMetrics: metrics
  };
}

// ==================== Красивый Markdown форматировщик финансовых отчетов ====================

function fmtPnL(rows: any[]): string {
  let md = '# ОПиУ (Отчет о прибылях и убытках)\n\n';
  md += '> Сформирован автоматически системой FINANCIER.AI\n\n';
  md += '| Статья | Значение (₽) |\n|---|---|\n';
  for (const r of rows) { const indent = '  '.repeat(r.level || 0); md += `|${indent} **${r.name}** | ${fmt(r.value)} |\n`; }
  return md;
}

function fmtBS(rows: any[]): string {
  let md = '# Бухгалтерский баланс\n\n';
  md += '> Форма по ОКУД 0710001\n\n';
  md += '| Статья | Сумма (₽) |\n|---|---|\n';
  for (const r of rows) { md += `| **${r.name}** | ${fmt(r.value)} |\n`; }
  return md;
}

function fmtCF(rows: any[]): string {
  let md = '# ДДС (Отчет о движении денежных средств)\n\n';
  md += '| Категория | Поток (₽) |\n|---|---|\n';
  for (const r of rows) { md += `| ${r.name} | ${fmt(r.value)} |\n`; }
  return md;
}

function fmtRatios(rows: any[]): string {
  let md = '# Финансовые коэффициенты\n\n';
  md += '| Показатель | Значение | Оценка | Описание |\n|---|---|---|---|\n';
  for (const r of rows) { md += `| ${r.label} | ${fmt(r.value)}${r.unit || ''} | **${r.status}** | ${r.description || '-'} |\n`; }
  return md;
}

function fmtBudget(rows: any[]): string {
  let md = '# Бюджет vs Факт\n\n';
  md += '| Статья | План (₽) | Факт (₽) | Отклонение |\n|---|---|---|---|\n';
  for (const r of rows as any[]) { const diff = ((r.fact||0)-(r.plan||0)); md += `| ${r.label || 'Статья'} | ${fmt(r.plan||0)} | ${fmt(r.fact||0)} | **${diff > 0 ? '+' : ''}${fmt(diff)}** |\n`; }
  return md;
}

function fmtKPI(rows: any[]): string {
  let md = '# KPI Дашборд\n\n';
  md += '| Метрика | Значение | Статус |\n|---|---|---|\n';
  for (const r of rows) { md += `| ${r.label} | ${fmt(r.value)}${r.unit || ''} | **${r.status}** |\n`; }
  return md;
}

function fmtRecs(rows: any[]): string {
  let md = '# AI Рекомендации\n\n';
  for (const r of rows as any[]) { md += `### ${r.category || 'Рекомендация'}\n${(r.advice || r.text || JSON.stringify(r).substring(0,200)).replace(/\n/g,' ')}\n\n`; }
  return md;
}

// ==================== Генерация отчетов по профилям ====================

function genReports(profile: ProfileType, doc: ParsedDocument): TestResult[] {
  const results: TestResult[] = [];
  const profDir = path.join(OUT_DIR, profile);
  mkdir(profDir);

  switch (profile) {
    case 'personal': {
      for (const rpt of generatePersonalAnalytics(doc)) {
        try {
          let md = `# ${rpt.title}\n\n`;
          if (typeof rpt.data === 'object') {
            for (const [k, v] of Object.entries(rpt.data)) {
              md += `- **${k}**: ${typeof v === 'number' ? fmt(v) : String(v)}\n`;
            }
          }
          wf(path.join(profDir, `${rpt.title.replace(/[^a-zA-Zа-яА-Я0-9 ]/g,'').trim()}.md`), md);
          results.push({ profile, reportId: rpt.title, success: true, durationMs: 0 });
        } catch(e: any) { results.push({ profile, reportId: rpt.title, success: false, error: e.message, durationMs: 0 }); }
      }
      break;
    }
    case 'family': {
      for (const rpt of generateFamilyAnalytics(doc)) {
        try {
          let md = `# ${rpt.title}\n\n`;
          if (typeof rpt.data === 'object') {
            for (const [k, v] of Object.entries(rpt.data)) {
              md += `- **${k}**: ${typeof v === 'number' ? fmt(v) : String(v).substring(0,100)}\n`;
            }
          }
          wf(path.join(profDir, `${rpt.title.replace(/[^a-zA-Zа-яА-Я0-9 ]/g,'').trim()}.md`), md);
          results.push({ profile, reportId: rpt.title, success: true, durationMs: 0 });
        } catch(e: any) { results.push({ profile, reportId: rpt.title, success: false, error: e.message, durationMs: 0 }); }
      }
      break;
    }
    case 'msb': {
      for (const rpt of generateMSBAnalytics(doc)) {
        try {
          let md = `# ${rpt.title}\n\n`;
          if (typeof rpt.data === 'object') {
            for (const [k, v] of Object.entries(rpt.data)) {
              md += `- **${k}**: ${typeof v === 'number' ? fmt(v) : String(v).substring(0,150)}\n`;
            }
          }
          wf(path.join(profDir, `${rpt.title.replace(/[^a-zA-Zа-яА-Я0-9 ]/g,'').trim()}.md`), md);
          results.push({ profile, reportId: rpt.title, success: true, durationMs: 0 });
        } catch(e: any) { results.push({ profile, reportId: rpt.title, success: false, error: e.message, durationMs: 0 }); }
      }

      // Финансовые отчеты — красивый Markdown формат уровня CFO
      try { wf(path.join(profDir, 'ОПиУ.md'), fmtPnL(generateIncomeStatement(doc))); results.push({ profile, reportId:'ОПиУ', success:true, durationMs:0 }); } catch(e:any){ results.push({ profile, reportId:'ОПиУ', success:false, error:e.message, durationMs:0 }); }
      try { wf(path.join(profDir, 'ДДС.md'), fmtCF(generateCashFlow(doc))); results.push({ profile, reportId:'ДДС', success:true, durationMs:0 }); } catch(e:any){ results.push({ profile, reportId:'ДДС', success:false, error:e.message, durationMs:0 }); }
      try { wf(path.join(profDir, 'Коэффициенты.md'), fmtRatios(calculateFinancialRatios(doc))); results.push({ profile, reportId:'Коэффициенты', success:true, durationMs:0 }); } catch(e:any){ results.push({ profile, reportId:'Коэффициенты', success:false, error:e.message, durationMs:0 }); }
      try { wf(path.join(profDir, 'Бюджет_Факт.md'), fmtBudget(generateBudgetVsActual(doc))); results.push({ profile, reportId:'Бюджет_Факт', success:true, durationMs:0 }); } catch(e:any){ results.push({ profile, reportId:'Бюджет_Факт', success:false, error:e.message, durationMs:0 }); }
      try { wf(path.join(profDir, 'KPI.md'), fmtKPI(generateKPIDashboard(doc))); results.push({ profile, reportId:'KPI', success:true, durationMs:0 }); } catch(e:any){ results.push({ profile, reportId:'KPI', success:false, error:e.message, durationMs:0 }); }
      try { wf(path.join(profDir, 'AI_Рекомендации.md'), fmtRecs(generateRecommendations(doc))); results.push({ profile, reportId:'AI_Рекомендации', success:true, durationMs:0 }); } catch(e:any){ results.push({ profile, reportId:'AI_Рекомендации', success:false, error:e.message, durationMs:0 }); }
      break;
    }
    case 'holding': {
      for (const rpt of generateHoldingAnalytics(doc)) {
        try {
          let md = `# ${rpt.title}\n\n`;
          if (typeof rpt.data === 'object') {
            for (const [k, v] of Object.entries(rpt.data)) {
              md += `- **${k}**: ${typeof v === 'number' ? fmt(v) : String(v).substring(0,150)}\n`;
            }
          }
          wf(path.join(profDir, `${rpt.title.replace(/[^a-zA-Zа-яА-Я0-9 ]/g,'').trim()}.md`), md);
          results.push({ profile, reportId: rpt.title, success: true, durationMs: 0 });
        } catch(e: any) { results.push({ profile, reportId: rpt.title, success: false, error: e.message, durationMs: 0 }); }
      }

      try { wf(path.join(profDir, 'Баланс.md'), fmtBS(generateBalanceSheet(doc))); results.push({ profile, reportId:'Баланс', success:true, durationMs:0 }); } catch(e:any){ results.push({ profile, reportId:'Баланс', success:false, error:e.message, durationMs:0 }); }
      break;
    }
  }

  return results;
}

// ==================== Главная функция тестирования ====================

async function main() {
  console.log('\n' + '='.repeat(80));
  console.log('МАСШТАБНОЕ ТЕСТИРОВАНИЕ FINANCIER.AI');
  console.log(`Данные: ${DATA_DIR}`);
  console.log(`Выход: ${OUT_DIR}`);
  console.log('='.repeat(80) + '\n');

  const allResults: TestResult[] = [];

  for (const profile of ['personal', 'family', 'msb', 'holding'] as ProfileType[]) {
    mkdir(path.join(OUT_DIR, profile));
    console.log(`\n📁 Профиль: ${profile.toUpperCase()}`);

    for (let ci = 0; ci < 2; ci++) {
      const doc = makeDoc(profile);
      if (ci === 1 && (profile === 'msb' || profile === 'holding')) {
        doc.docType = profile === 'msb' ? 'balance_sheet' : 'osv';
        doc.transactions = [];
        doc.extractedMetrics = { Выручка: 5000000, Прибыль: 1200000 };
      }

      console.log(`  Клиент ${ci+1}: генерация отчетов...`);
      const reports = genReports(profile, doc);
      allResults.push(...reports);

      // Шаблонная презентация (без LLM)
      try {
        let md = `# Управленческий Отчет\n## ${profile} клиент ${ci+1}\n---\n`;
        const inc = doc.transactions.filter(t => t.type==='income').reduce((s,t)=>s+t.amount,0);
        const exp = doc.transactions.filter(t => t.type==='expense').reduce((s,t)=>s+t.amount,0);
        md += `- **Доходы**: ${fmt(inc)} ₽\n- **Расходы**: ${fmt(exp)} ₽\n- **Чистый поток**: ${fmt(inc-exp)} ₽\n`;
        mkdir(path.join(OUT_DIR, 'presentations'));
        wf(path.join(OUT_DIR, 'presentations', `${profile}_template_${ci}.md`), md);
        allResults.push({ profile, reportId: `Шаблон_Презентация`, success: true, durationMs: 0 });
      } catch(e: any) { allResults.push({ profile, reportId: 'Шаблон_Презентация', success: false, error: e.message, durationMs: 0 }); }

      // AI презентация (с LLM если доступен)
      try {
        const config = getDefaultConfig();
        const response = await fetch(config.endpoint + '?models', { method:'GET' });
        
        if (response.ok) {
          console.log(`    ✅ LM Studio доступен!`);
          
          for (const p of ['personal','family','msb','holding'] as ProfileType[]) {
            try {
              const aiDoc = makeDoc(p);
              const messages = getFinancialAnalysisPrompt(aiDoc.docType, aiDoc.rawText);
              const llmResponse = await chatWithLocalLLM(config, messages, { maxTokens: 2000 });
              
              if (llmResponse.text && !llmResponse.error) {
                mkdir(path.join(OUT_DIR, 'presentations'));
                wf(path.join(OUT_DIR, 'presentations', `${p}_AI_${Date.now()}.md`), llmResponse.text);
                allResults.push({ profile: p, reportId: 'AI_Презентация', success: true, durationMs: 0 });
              } else {
                allResults.push({ profile: p, reportId: 'AI_Презентация', success: false, error: llmResponse.error || 'Нет ответа', durationMs: 0 });
              }
            } catch(e: any) { allResults.push({ profile: p, reportId: 'AI_Презентация', success: false, error: e.message, durationMs: 0 }); }
          }
        } else {
          console.log(`    ⚠️ LM Studio недоступен (HTTP ${response.status})`);
          for (const p of ['personal','family','msb','holding'] as ProfileType[]) {
            allResults.push({ profile: p, reportId: 'AI_Презентация', success: false, error: `LM Studio HTTP ${response.status}`, durationMs: 0 });
          }
        }
      } catch(e: any) {
        console.log(`    ⚠️ LM Studio недоступен: ${e.message}`);
        for (const p of ['personal','family','msb','holding'] as ProfileType[]) {
          allResults.push({ profile: p, reportId: 'AI_Презентация', success: false, error: e.message, durationMs: 0 });
        }
      }

      console.log(`    ✅ Готово! (${reports.length + 2} отчетов)`);
    }
  }

  // Итоги
  const total = allResults.length;
  const successCount = allResults.filter(r => r.success).length;
  const failCount = allResults.filter(r => !r.success).length;

  console.log('\n\n' + '='.repeat(80));
  console.log('ИТОГИ ТЕСТИРОВАНИЯ');
  console.log('='.repeat(80) + '\n');
  
  console.log(`📊 Всего отчетов:       ${total}`);
  console.log(`✅ Успешно:             ${successCount} (${((successCount/total)*100).toFixed(1)}%)`);
  console.log(`❌ Ошибок:              ${failCount}\n`);

  for (const profile of ['personal','family','msb','holding']) {
    const pr = allResults.filter(r => r.profile === profile);
    const sc = pr.filter(r => r.success).length;
    console.log(`📁 ${profile.toUpperCase()}: ${pr.length} отчетов | ✅${sc}`);
  }

  if (failCount > 0) {
    console.log('\n⚠️ ОШИБКИ:');
    for (const r of allResults.filter(r => !r.success).slice(0,15)) {
      console.log(`   [${r.profile}] ${r.reportId}: ${(r.error||'unknown').substring(0,80)}`);
    }
  }

  let summary = `# Тестирование FINANCIER.AI\n\n**Дата:** ${new Date().toISOString()}\n**Папка данных:** ${DATA_DIR}\n\n## Итоги\n\n- Всего: ${total} | Успешно: ${successCount} (${((successCount/total)*100).toFixed(1)}%) | Ошибок: ${failCount}\n\n`;
  for (const profile of ['personal','family','msb','holding']) {
    const pr = allResults.filter(r => r.profile === profile);
    summary += `### ${profile.toUpperCase()}: ${pr.length} отчетов, ✅${pr.filter(r=>r.success).length}\n\n`;
  }

  wf(path.join(OUT_DIR, 'TESTING_SUMMARY.md'), summary);
  console.log(`\n📁 Отчет: ${path.join(OUT_DIR, 'TESTING_SUMMARY.md')}`);
  console.log('='.repeat(80) + '\n');
}

main().catch(err => { console.error('❌ Критическая ошибка:', err); process.exit(1); });
