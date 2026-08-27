import React, { useCallback } from 'react';
import { Download, FileSpreadsheet, FileText, Code, DownloadCloud, Presentation } from 'lucide-react';
import { ParsedDocument } from '../lib/parsers/bankParsers';
import { cn } from '../lib/utils';
import { 
  generateIncomeStatement, generateBalanceSheet, generateCashFlow, 
  calculateFinancialRatios, generateFullManagementReport,
  IncomeStatementLine, BalanceSheetLine, CashFlowLine, FinancialRatio
} from '../lib/financialReports';

interface ExportReportsProps {
  document: ParsedDocument;
  onExport: (format: string, blob: Blob, filename: string) => void;
}

// Делим длинный список на части, чтобы слайд PPTX не переполнялся (линии идут с шагом 0.6" от y=2")
function splitPptxSlide(
  title: string,
  content: Array<{ name: string; value: number | string }>,
  max = 7
): Array<{ title: string; content: Array<{ name: string; value: number | string }> }> {
  if (!content.length) return [];
  if (content.length <= max) return [{ title, content }];
  const parts = Math.ceil(content.length / max);
  const out: Array<{ title: string; content: Array<{ name: string; value: number | string }> }> = [];
  for (let i = 0; i < content.length; i += max) {
    out.push({ title: `${title} (${Math.floor(i / max) + 1}/${parts})`, content: content.slice(i, i + max) });
  }
  return out;
}

export function ExportReports({ document, onExport }: ExportReportsProps) {
  const pnlData = React.useMemo(() => generateIncomeStatement(document), [document]);
  const bsData = React.useMemo(() => generateBalanceSheet(document), [document]);
  const cfData = React.useMemo(() => generateCashFlow(document), [document]);
  const ratiosData = React.useMemo(() => calculateFinancialRatios(document), [document]);
  const fullReport = React.useMemo(() => generateFullManagementReport(document), [document]);

  const formatMoney = (val: number): string => {
    if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)} млрд ₽`;
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)} млн ₽`;
    return val.toLocaleString('ru-RU') + ' ₽';
  };

  // === EXPORT TRANSACTIONS AS CSV ===
  const exportTransactionsCSV = useCallback(() => {
    const txs = document.transactions;
    if (txs.length === 0) { alert('Нет транзакций для экспорта'); return; }
    
    const header = 'Дата;Тип;Контрагент;Назначение;Сумма\n';
    const rows = txs.map(tx => 
      `${tx.date};${tx.type === 'income' ? 'Доход' : 'Расход'};${tx.payee || tx.payer || ''};${tx.purpose || ''};${tx.amount}`
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    onExport('csv', blob, `транзакции_${document.fileName}_${new Date().toISOString().slice(0,10)}.csv`);
  }, [document, onExport]);

  // === EXPORT P&L AS CSV ===
  const exportPnLCSV = useCallback(() => {
    if (pnlData.length === 0) { alert('Нет данных ОПиУ для экспорта'); return; }
    
    const header = 'Статья;Сумма;Уровень;Итого\n';
    const rows = pnlData.map(l => 
      `${'  '.repeat(l.level)}${l.name};${l.value};${l.level};${l.isTotal ? 'Да' : 'Нет'}`
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    onExport('csv', blob, `ОПиУ_${document.fileName}_${new Date().toISOString().slice(0,10)}.csv`);
  }, [pnlData, document.fileName, onExport]);

  // === EXPORT BALANCE SHEET AS CSV ===
  const exportBalanceCSV = useCallback(() => {
    const filtered = bsData.filter(l => l.name || l.value);
    if (filtered.length === 0) { alert('Нет данных баланса для экспорта'); return; }
    
    const header = 'Сторона;Статья;Сумма;Уровень;Итого\n';
    const rows = filtered.map(l => 
      `${l.side === 'asset' ? 'АКТИВ' : 'ПАССИВ'};${'  '.repeat(l.level)}${l.name};${l.value};${l.level};${l.isTotal ? 'Да' : 'Нет'}`
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    onExport('csv', blob, `Баланс_${document.fileName}_${new Date().toISOString().slice(0,10)}.csv`);
  }, [bsData, document.fileName, onExport]);

  // === EXPORT CASH FLOW AS CSV ===
  const exportCashFlowCSV = useCallback(() => {
    if (cfData.length === 0) { alert('Нет данных ДДС для экспорта'); return; }
    
    const header = 'Статья;Сумма\n';
    const rows = cfData.map(l => `${l.name};${l.value}`).join('\n');
    
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    onExport('csv', blob, `ДДС_${document.fileName}_${new Date().toISOString().slice(0,10)}.csv`);
  }, [cfData, document.fileName, onExport]);

  // === EXPORT RATIOS AS CSV ===
  const exportRatiosCSV = useCallback(() => {
    if (ratiosData.length === 0) { alert('Нет коэффициентов для экспорта'); return; }
    
    const header = 'Название;Метка;Значение;Ед.;Статус;Норма;Описание\n';
    const rows = ratiosData.map(r => 
      `${r.name};${r.label};${r.value.toFixed(2)};${r.unit};${r.status};${r.benchmark ?? ''};${r.description}`
    ).join('\n');
    
    const blob = new Blob(['\uFEFF' + header + rows], { type: 'text/csv;charset=utf-8;' });
    onExport('csv', blob, `Коэффициенты_${document.fileName}_${new Date().toISOString().slice(0,10)}.csv`);
  }, [ratiosData, document.fileName, onExport]);

  // === EXPORT FULL REPORT AS TEXT ===
  const exportFullReportText = useCallback(() => {
    if (!fullReport.hasData) { alert('Нет данных для полного отчета'); return; }
    
    let content = `УПРАВЛЕНЧЕСКИЙ ОТЧЕТ\n`;
    content += `Источник: ${document.fileName}\n`;
    content += `Дата: ${new Date().toLocaleDateString('ru-RU')}\n`;
    content += `${'='.repeat(60)}\n\n`;
    
    if (fullReport.summary) {
      content += `СВОДКА\n${fullReport.summary}\n\n`;
    }
    
    content += `ОТЧЕТ О ПРИБЫЛЯХ И УБЫТКАХ\n${'-'.repeat(40)}\n`;
    pnlData.forEach(l => {
      if (l.name) content += `${'  '.repeat(l.level)}${l.name}: ${formatMoney(l.value)}\n`;
    });
    content += '\n';
    
    content += `Баланс\n${'-'.repeat(40)}\n`;
    const assets = bsData.filter(l => l.side === 'asset' && l.name);
    const liabilities = bsData.filter(l => l.side === 'liability' && l.name);
    if (assets.length) {
      content += 'АКТИВ:\n';
      assets.forEach(l => { content += `${'  '.repeat(l.level)}${l.name}: ${formatMoney(l.value)}\n`; });
    }
    if (liabilities.length) {
      content += '\nПАССИВ:\n';
      liabilities.forEach(l => { content += `${'  '.repeat(l.level)}${l.name}: ${formatMoney(l.value)}\n`; });
    }
    content += '\n';
    
    content += `ДЕНЕЖНЫЙ ПОТОК\n${'-'.repeat(40)}\n`;
    cfData.forEach(l => { content += `${l.name}: ${formatMoney(l.value)}\n`; });
    content += '\n';
    
    if (ratiosData.length) {
      content += `ФИНАНСОВЫЕ КОЭФФИЦИЕНТЫ\n${'-'.repeat(40)}\n`;
      ratiosData.forEach(r => {
        const icon = r.status === 'good' ? '✅' : r.status === 'warning' ? '⚠️' : '🔴';
        content += `${icon} ${r.label}: ${r.value.toFixed(2)}${r.unit === '%' ? '%' : ''} — ${r.description}\n`;
      });
      content += '\n';
    }
    
    if (fullReport.markdownTables) {
      content += `\n${fullReport.markdownTables}\n`;
    }
    
    const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8;' });
    onExport('txt', blob, `ПолныйОтчет_${document.fileName}_${new Date().toISOString().slice(0,10)}.txt`);
  }, [fullReport, pnlData, bsData, cfData, ratiosData, document.fileName, onExport]);

  // === EXPORT FULL REPORT AS HTML ===
  const exportFullReportHTML = useCallback(() => {
    if (!fullReport.hasData) { alert('Нет данных для полного отчета'); return; }
    
    const isDark = window.document.documentElement.classList.contains('dark');
    const bg = isDark ? '#0A0A0B' : '#f8fafc';
    const fg = isDark ? '#e2e8f0' : '#0f172a';
    const border = isDark ? '#27272a' : '#e2e8f0';
    const surface = isDark ? '#141416' : '#ffffff';
    const muted = isDark ? '#94a3b8' : '#64748b';
    
    let tablesHTML = '';
    
    // P&L Table
    if (pnlData.length) {
      tablesHTML += `<h2 style="color:#6366f1">Отчет о прибылях и убытках</h2><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px">`;
      tablesHTML += `<tr style="background:${isDark ? '#1C1C1F' : '#f1f5f9'}"><th style="text-align:left">Статья</th><th style="text-align:right">Сумма (₽)</th></tr>`;
      pnlData.forEach(l => {
        if (!l.name) return;
        const bold = l.isTotal ? 'font-weight:bold' : '';
        tablesHTML += `<tr style="${bold}"><td style="padding:6px">${'  '.repeat(l.level)}${l.name}</td><td style="text-align:right;font-family:monospace">${formatMoney(l.value)}</td></tr>`;
      });
      tablesHTML += '</table>\n';
    }
    
    // Balance Table
    const bsFiltered = bsData.filter(l => l.name);
    if (bsFiltered.length) {
      tablesHTML += `<h2 style="color:#6366f1">Баланс</h2><div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">`;
      ['asset', 'liability'].forEach(side => {
        const label = side === 'asset' ? 'АКТИВ' : 'ПАССИВ';
        const items = bsFiltered.filter(l => l.side === side);
        tablesHTML += `<div><h3 style="color:${side === 'asset' ? '#10b981' : '#6366f1'}">${label}</h3><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%">`;
        items.forEach(l => {
          const bold = l.isTotal ? 'font-weight:bold' : '';
          tablesHTML += `<tr style="${bold}"><td>${'  '.repeat(l.level)}${l.name}</td><td style="text-align:right;font-family:monospace">${formatMoney(l.value)}</td></tr>`;
        });
        tablesHTML += '</table></div>\n';
      });
      tablesHTML += '</div>\n';
    }
    
    // Cash Flow Table
    if (cfData.length) {
      tablesHTML += `<h2 style="color:#6366f1">Денежный поток</h2><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px">`;
      tablesHTML += `<tr style="background:${isDark ? '#1C1C1F' : '#f1f5f9'}"><th style="text-align:left">Статья</th><th style="text-align:right">Сумма (₽)</th></tr>`;
      cfData.forEach(l => {
        tablesHTML += `<tr><td>${l.name}</td><td style="text-align:right;font-family:monospace">${formatMoney(l.value)}</td></tr>`;
      });
      tablesHTML += '</table>\n';
    }
    
    // Ratios
    if (ratiosData.length) {
      tablesHTML += `<h2 style="color:#6366f1">Финансовые коэффициенты</h2><table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;margin-bottom:20px">`;
      tablesHTML += `<tr style="background:${isDark ? '#1C1C1F' : '#f1f5f9'}"><th>Показатель</th><th style="text-align:right">Значение</th><th>Статус</th><th>Описание</th></tr>`;
      ratiosData.forEach(r => {
        const statusColor = r.status === 'good' ? '#10b981' : r.status === 'warning' ? '#f59e0b' : '#f43f5e';
        const statusText = r.status === 'good' ? 'Норма' : r.status === 'warning' ? 'Внимание' : 'Критично';
        tablesHTML += `<tr><td>${r.label}</td><td style="text-align:right;font-family:monospace">${r.value.toFixed(2)}${r.unit === '%' ? '%' : ''}</td><td style="color:${statusColor}">${statusText}</td><td style="font-size:12px">${r.description}</td></tr>`;
      });
      tablesHTML += '</table>\n';
    }
    
    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Отчет Финансист.AI — ${document.fileName}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 40px; background: ${bg}; color: ${fg}; line-height: 1.6; }
  h1 { color: #6366f1; } h2 { margin-top: 30px; }
  table { margin-bottom: 20px; } th, td { padding: 8px; border-color: ${border}; }
  .meta { color: ${muted}; font-size: 14px; }
  @media print { body { margin: 20px; } }
</style>
</head>
<body>
<h1>📊 Управленческий отчет</h1>
<p class="meta">Источник: ${document.fileName} | Дата: ${new Date().toLocaleDateString('ru-RU')} | Сгенерировано: Финансист.AI</p>
<hr style="border-color:${border};margin:20px 0">
${fullReport.summary ? `<div style="background:${surface};padding:20px;border-radius:8px;border:1px solid ${border}"><h2 style="margin-top:0">Сводка</h2><p>${fullReport.summary.replace(/\n/g, '<br>')}</p></div>` : ''}
${tablesHTML}
${fullReport.markdownTables ? `<div style="background:${surface};padding:20px;border-radius:8px;border:1px solid ${border}"><h2>Дополнительные таблицы</h2><pre style="white-space:pre-wrap;font-size:13px">${fullReport.markdownTables}</pre></div>` : ''}
</body>
</html>`;
    
    const blob = new Blob([html], { type: 'text/html;charset=utf-8;' });
    onExport('html', blob, `ОтчетHTML_${document.fileName}_${new Date().toISOString().slice(0,10)}.html`);
  }, [fullReport, pnlData, bsData, cfData, ratiosData, document.fileName, onExport]);

  // === EXPORT TRANSACTIONS AS JSON ===
  const exportTransactionsJSON = useCallback(() => {
    const txs = document.transactions;
    if (txs.length === 0) { alert('Нет транзакций для экспорта'); return; }
    
    const data = {
      source: document.fileName,
      docType: document.docType,
      exportDate: new Date().toISOString(),
      transactions: txs
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
    onExport('json', blob, `транзакции_${document.fileName}_${new Date().toISOString().slice(0,10)}.json`);
  }, [document, onExport]);

  // === EXPORT ALL AS JSON ===
  const exportAllJSON = useCallback(() => {
    const data = {
      source: document.fileName,
      docType: document.docType,
      exportDate: new Date().toISOString(),
      transactions: document.transactions,
      incomeStatement: pnlData,
      balanceSheet: bsData,
      cashFlow: cfData,
      financialRatios: ratiosData.map(r => ({ ...r, value: Math.round(r.value * 100) / 100 })),
      extractedMetrics: document.extractedMetrics,
      summary: fullReport.summary
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8;' });
    onExport('json', blob, `ПолныеДанные_${document.fileName}_${new Date().toISOString().slice(0,10)}.json`);
  }, [document, pnlData, bsData, cfData, ratiosData, fullReport, onExport]);

  // === OFFICE EXPORT (XLSX / DOCX / PPTX) — lib/export.ts грузится лениво (code splitting) ===

  const hasReportData = pnlData.length > 0 || bsData.some(l => l.name) || cfData.length > 0 || ratiosData.length > 0;
  const officeBaseName = `${document.fileName}_${new Date().toISOString().slice(0, 10)}`;
  const bsAssets = bsData.filter(l => l.side === 'asset' && l.name);
  const bsLiabilities = bsData.filter(l => l.side === 'liability' && l.name);

  // Markdown полного отчёта — единый источник для Word (позже может использоваться и для других форматов)
  const buildOfficeMarkdown = useCallback((): string => {
    let md = `# Управленческий отчет — ${document.fileName}\n\n`;
    md += `> Источник: ${document.fileName} | Дата: ${new Date().toLocaleDateString('ru-RU')} | Финансист.AI\n\n`;
    if (fullReport.summary) {
      md += `## Сводка\n\n${fullReport.summary.trim()}\n\n`;
    }
    if (pnlData.length) {
      md += `## Отчет о прибылях и убытках\n\n`;
      pnlData.filter(l => l.name).forEach(l => { md += `${'  '.repeat(l.level)}${l.name}: ${formatMoney(l.value)}\n`; });
      md += '\n';
    }
    if (bsAssets.length || bsLiabilities.length) {
      md += `## Баланс\n\n`;
      if (bsAssets.length) {
        md += `АКТИВ\n`;
        bsAssets.forEach(l => { md += `${'  '.repeat(l.level)}${l.name}: ${formatMoney(l.value)}\n`; });
        md += '\n';
      }
      if (bsLiabilities.length) {
        md += `ПАССИВ\n`;
        bsLiabilities.forEach(l => { md += `${'  '.repeat(l.level)}${l.name}: ${formatMoney(l.value)}\n`; });
        md += '\n';
      }
    }
    if (cfData.length) {
      md += `## Денежный поток\n\n`;
      cfData.forEach(l => { md += `${l.name}: ${formatMoney(l.value)}\n`; });
      md += '\n';
    }
    if (ratiosData.length) {
      md += `## Финансовые коэффициенты\n\n`;
      ratiosData.forEach(r => {
        const icon = r.status === 'good' ? '✅' : r.status === 'warning' ? '⚠️' : '🔴';
        md += `- ${icon} ${r.label}: ${r.value.toFixed(2)}${r.unit === '%' ? '%' : ''} — ${r.description}\n`;
      });
      md += '\n';
    }
    return md;
  }, [fullReport.summary, pnlData, bsAssets, bsLiabilities, cfData, ratiosData, document.fileName]);

  const exportOfficeExcel = useCallback(async () => {
    if (!hasReportData) { alert('Нет данных для экспорта в Excel'); return; }
    const reports: Record<string, any[]> = {};
    if (pnlData.length) reports['ОПиУ'] = pnlData;
    if (bsAssets.length) reports['Баланс АКТИВ'] = bsAssets;
    if (bsLiabilities.length) reports['Баланс ПАССИВ'] = bsLiabilities;
    if (cfData.length) reports['ДДС'] = cfData;
    if (ratiosData.length) reports['Коэффициенты'] = ratiosData.map(r => ({ name: `${r.label} (${r.unit})`, value: Math.round(r.value * 100) / 100 }));
    try {
      const { exportFinancialReportsToExcel } = await import('../lib/export');
      exportFinancialReportsToExcel(reports, `ОтчетExcel_${officeBaseName}.xlsx`);
    } catch (e: any) {
      alert('Ошибка экспорта в Excel: ' + (e?.message || e));
    }
  }, [hasReportData, pnlData, bsAssets, bsLiabilities, cfData, ratiosData, officeBaseName]);

  const exportOfficeWord = useCallback(async () => {
    if (!hasReportData && !fullReport.hasData) { alert('Нет данных для экспорта в Word'); return; }
    try {
      const { exportMarkdownToWord } = await import('../lib/export');
      exportMarkdownToWord('Управленческий отчет', buildOfficeMarkdown(), `ОтчетWord_${officeBaseName}.docx`);
    } catch (e: any) {
      alert('Ошибка экспорта в Word: ' + (e?.message || e));
    }
  }, [hasReportData, fullReport.hasData, buildOfficeMarkdown, officeBaseName]);

  const exportOfficePowerPoint = useCallback(async () => {
    if (!hasReportData && !fullReport.hasData) { alert('Нет данных для презентации'); return; }
    const slides: Array<{ title: string; content: any[] }> = [];
    if (fullReport.summary) slides.push({ title: 'Сводка', content: [fullReport.summary] });
    slides.push(...splitPptxSlide('Отчет о прибылях и убытках', pnlData.filter(l => l.name).map(l => ({ name: l.name, value: l.value }))));
    slides.push(...splitPptxSlide('Баланс: АКТИВ', bsAssets.map(l => ({ name: l.name, value: l.value }))));
    slides.push(...splitPptxSlide('Баланс: ПАССИВ', bsLiabilities.map(l => ({ name: l.name, value: l.value }))));
    slides.push(...splitPptxSlide('Денежный поток', cfData.map(l => ({ name: l.name, value: l.value }))));
    slides.push(...splitPptxSlide('Коэффициенты', ratiosData.map(r => ({ name: r.label, value: `${r.value.toFixed(2)}${r.unit === '%' ? '%' : ''}` }))));
    if (!slides.length) { alert('Нет данных для презентации'); return; }
    try {
      const { exportToPowerPoint } = await import('../lib/export');
      exportToPowerPoint(`Управленческий отчет — ${document.fileName}`, slides, `Презентация_${officeBaseName}.pptx`);
    } catch (e: any) {
      alert('Ошибка экспорта в PowerPoint: ' + (e?.message || e));
    }
  }, [hasReportData, fullReport.summary, fullReport.hasData, pnlData, bsAssets, bsLiabilities, cfData, ratiosData, document.fileName, officeBaseName]);

  const hasData = document.transactions.length > 0 || pnlData.length > 0 || bsData.filter(l => l.name).length > 0 || cfData.length > 0 || ratiosData.length > 0 || fullReport.hasData;

  if (!hasData) {
    return (
      <div className="text-center py-8 text-[var(--text-muted)]">
        <FileText className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="text-sm">Нет данных для экспорта</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <DownloadCloud className="w-5 h-5 text-indigo-500" />
        <h3 className="text-lg font-semibold text-[var(--fg)]">Экспорт отчетов</h3>
      </div>

      {/* Quick Export Buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* Transactions */}
        {document.transactions.length > 0 && (
          <>
            <button onClick={exportTransactionsCSV}
              className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
              <FileSpreadsheet className="w-8 h-8 text-emerald-500 shrink-0" />
              <div>
                <div className="font-medium text-sm text-[var(--fg)]">Транзакции (CSV)</div>
                <div className="text-xs text-[var(--text-muted)]">{document.transactions.length} записей</div>
              </div>
              <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
            </button>
            <button onClick={exportTransactionsJSON}
              className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
              <Code className="w-8 h-8 text-blue-500 shrink-0" />
              <div>
                <div className="font-medium text-sm text-[var(--fg)]">Транзакции (JSON)</div>
                <div className="text-xs text-[var(--text-muted)]">Структурированные данные</div>
              </div>
              <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
            </button>
          </>
        )}

        {/* P&L */}
        {pnlData.length > 0 && (
          <button onClick={exportPnLCSV}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <FileSpreadsheet className="w-8 h-8 text-amber-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">ОПиУ (CSV)</div>
              <div className="text-xs text-[var(--text-muted)]">{pnlData.length} статей</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* Balance */}
        {bsData.filter(l => l.name).length > 0 && (
          <button onClick={exportBalanceCSV}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <FileSpreadsheet className="w-8 h-8 text-indigo-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">Баланс (CSV)</div>
              <div className="text-xs text-[var(--text-muted)]">{bsData.filter(l => l.name).length} статей</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* Cash Flow */}
        {cfData.length > 0 && (
          <button onClick={exportCashFlowCSV}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <FileSpreadsheet className="w-8 h-8 text-cyan-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">ДДС (CSV)</div>
              <div className="text-xs text-[var(--text-muted)]">{cfData.length} статей</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* Ratios */}
        {ratiosData.length > 0 && (
          <button onClick={exportRatiosCSV}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <FileSpreadsheet className="w-8 h-8 text-purple-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">Коэффициенты (CSV)</div>
              <div className="text-xs text-[var(--text-muted)]">{ratiosData.length} показателей</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* Full Report TXT */}
        {fullReport.hasData && (
          <button onClick={exportFullReportText}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <FileText className="w-8 h-8 text-sky-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">Полный отчет (TXT)</div>
              <div className="text-xs text-[var(--text-muted)]">Текстовый формат</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* Full Report HTML */}
        {fullReport.hasData && (
          <button onClick={exportFullReportHTML}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-indigo-500/30 bg-indigo-500/5 hover:bg-indigo-500/10 transition-colors text-left")}>
            <FileText className="w-8 h-8 text-indigo-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-indigo-500">Полный отчет (HTML)</div>
              <div className="text-xs text-[var(--text-muted)]">Для печати и просмотра в браузере</div>
            </div>
            <Download className="w-4 h-4 text-indigo-500 ml-auto shrink-0" />
          </button>
        )}

        {/* Office: Excel */}
        {hasReportData && (
          <button onClick={exportOfficeExcel}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <FileSpreadsheet className="w-8 h-8 text-green-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">Сводка отчетов (Excel)</div>
              <div className="text-xs text-[var(--text-muted)]">.xlsx — ОПиУ, Баланс, ДДС, коэффициенты листами</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* Office: Word */}
        {(hasReportData || fullReport.hasData) && (
          <button onClick={exportOfficeWord}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <FileText className="w-8 h-8 text-blue-600 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">Полный отчет (Word)</div>
              <div className="text-xs text-[var(--text-muted)]">.docx — для печати и правки</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* Office: PowerPoint */}
        {(hasReportData || fullReport.hasData) && (
          <button onClick={exportOfficePowerPoint}
            className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
            <Presentation className="w-8 h-8 text-orange-500 shrink-0" />
            <div>
              <div className="font-medium text-sm text-[var(--fg)]">Презентация (PowerPoint)</div>
              <div className="text-xs text-[var(--text-muted)]">.pptx — слайды по разделам отчета</div>
            </div>
            <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
          </button>
        )}

        {/* All Data JSON */}
        <button onClick={exportAllJSON}
          className={cn("flex items-center gap-3 p-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-colors text-left")}>
          <Code className="w-8 h-8 text-emerald-500 shrink-0" />
          <div>
            <div className="font-medium text-sm text-[var(--fg)]">Все данные (JSON)</div>
            <div className="text-xs text-[var(--text-muted)]">Полный дамп всех отчетов</div>
          </div>
          <Download className="w-4 h-4 text-[var(--text-muted)] ml-auto shrink-0" />
        </button>
      </div>
    </div>
  );
}