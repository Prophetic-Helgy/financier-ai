import React, { useState, useEffect, useMemo } from 'react';
import { ParsedDocument } from '../lib/parsers/bankParsers';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area, ComposedChart, Line
} from 'recharts';
import { 
  TrendingUp, TrendingDown, AlertTriangle, ShieldCheck, BrainCircuit, Loader2, Sparkles, AlertCircle, LayoutDashboard, LineChart, Briefcase, HandCoins, FileSpreadsheet, Calculator, TrendingUpDown
} from 'lucide-react';
import { generateHeuristicPresentation, runLocalLLMAnalysis } from '../lib/analyticsEngine';
import ReactMarkdown from 'react-markdown';
import { cn } from '../lib/utils';
import { PresentationViewer } from './PresentationViewer';
import { 
  generateIncomeStatement, generateBalanceSheet, generateCashFlow, 
  calculateFinancialRatios, generateFullManagementReport, generateMarkdownTables,
  IncomeStatementLine, BalanceSheetLine, CashFlowLine, FinancialRatio, ReportSlide
} from '../lib/financialReports';
import { 
  generateBudgetVsActual, BudgetLine,
  calculateProductCosting, ProductCosting, CostItem,
  calculateCurrencyPositions, CurrencyPosition,
  runWhatIfScenarios, ScenarioResult,
  forecastCashFlow, CashFlowForecast,
  generateKPIDashboard, KPIData,
  comparePeriods, PeriodComparison,
  generateRecommendations, Recommendation
} from '../lib/competitorFeatures';
import { getTopThreats, getPrioritizedTasks, GAP_ANALYSIS } from '../lib/competitorAnalysis';

interface RichAnalyticsReportProps {
  document: ParsedDocument;
  themeColor: string;
}

const COLORS = ['#6366f1', '#10b981', '#f43f5e', '#f59e0b', '#0ea5e9'];
const OPEX_KEYWORDS = ['аренда', 'маркетинг', 'реклам', 'услуг', 'связь', 'комисси', 'банк', 'офис', 'интернет', 'зарплата', 'зп', 'фонд'];
const COGS_KEYWORDS = ['постав', 'материал', 'товар', 'закупка', 'логист', 'достав'];
const TAX_KEYWORDS = ['налог', 'ндс', 'усн', 'фнс', 'страхов', 'взнос', 'пошлин', 'пенс'];
const CAPEX_KEYWORDS = ['оборудован', 'техник', 'инвест', 'акции', 'брокер', 'мебель'];
const FINANCING_INCOME_KEYWORDS = ['кредит', 'займ'];
const FINANCING_EXPENSE_KEYWORDS = ['гашение', 'погашение кредита', 'дивиденд'];

type ReportTabType = 'summary' | 'pnl' | 'cashflow' | 'balance' | 'ratios' | 'fullReport' | 'slides' | 'budget' | 'costing' | 'kpi' | 'scenarios' | 'forecast' | 'recommendations' | 'periods' | 'competition';

export function RichAnalyticsReport({ document, themeColor }: RichAnalyticsReportProps) {
  const [reportTab, setReportTab] = useState<ReportTabType>('summary');
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [lmEndpoint, setLmEndpoint] = useState(() => localStorage.getItem("lmEndpoint") || "http://127.0.0.1:1234/v1/chat/completions");
  // State для вкладки «What-If Сценарии» — должен быть на верхнем уровне (Rules of Hooks)
  const [customRev, setCustomRev] = useState(0);
  const [customExp, setCustomExp] = useState(0);

  useEffect(() => { localStorage.setItem("lmEndpoint", lmEndpoint); }, [lmEndpoint]);

  const runAI = async () => {
    setIsAiLoading(true);
    const res = await runLocalLLMAnalysis(document, lmEndpoint);
    setAiResult(res);
    setIsAiLoading(false);
  };

  const hasTx = document.transactions.length > 0;
  const hasExtractedMetrics = document.extractedMetrics && Object.keys(document.extractedMetrics).length > 0;
  const manualAssetsTotal = (document.extractedMetrics?.['Стоимость Активов (вручную)']) || 0;

  // Вычисляем новые данные из financialReports модуля
  const pnlData = useMemo(() => generateIncomeStatement(document), [document]);
  const bsData = useMemo(() => generateBalanceSheet(document), [document]);
  const cfData = useMemo(() => generateCashFlow(document), [document]);
  const ratiosData = useMemo(() => calculateFinancialRatios(document), [document]);
  const fullReport = useMemo(() => generateFullManagementReport(document), [document]);
  const slidesData = useMemo(() => {
    // Генерируем слайды из financialReports
    return generatePresentationSlides(document);
  }, [document]);

  function generatePresentationSlides(doc: ParsedDocument): ReportSlide[] {
    const slides: ReportSlide[] = [];
    const pnl = generateIncomeStatement(doc);
    const ratios = calculateFinancialRatios(doc);
    
    slides.push({ title: 'Финансовый отчет', subtitle: `На основе анализа: ${doc.fileName}`, content: `Автоматически сгенерированный управленческий отчет.\n\nПрофиль: **${doc.docType.toUpperCase()}**` });

    let keyMetrics = '';
    for (const line of pnl) { if (line.isTotal && line.level === 0) keyMetrics += `- **${line.name}:** ${formatMoney(line.value)}\n`; }
    slides.push({ title: 'Ключевые Показатели', content: `## Структура финансовых результатов\n\n${keyMetrics}` });

    if (ratios.length > 0) {
      let rc = '';
      for (const r of ratios) {
        const icon = r.status === 'good' ? '🟢' : r.status === 'warning' ? '🟡' : '🔴';
        rc += `- ${icon} **${r.label}:** ${r.value.toFixed(1)}${r.unit === '%' ? '%' : ''}\n  _${r.description}_\n\n`;
      }
      slides.push({ title: 'Финансовые Коэффициенты', content: `## Анализ финансовой устойчивости\n\n${rc}` });
    }

    const cf = generateCashFlow(doc);
    let cashflowContent = '';
    for (const line of cf) { if (line.name && !line.name.includes('Нет данных')) cashflowContent += `- ${line.name}: ${formatMoney(line.value)}\n`; }
    slides.push({ title: 'Движение Денежных Средств', content: `## Cash Flow\n\n${cashflowContent || 'Нет достаточных данных.'}` });

    const bs = generateBalanceSheet(doc);
    let balanceContent = '';
    for (const line of bs) { if (line.isTotal && line.level === 0) balanceContent += `**${line.name}:** ${formatMoney(line.value)}\n\n`; }
    slides.push({ title: 'Баланс (Форма 1)', content: `## Отчет о финансовом положении\n\n${balanceContent || 'Нет данных.'}` });

    const warnings = ratios.filter(r => r.status === 'critical').map(r => `⚠️ **${r.label}:** ${r.description}`);
    slides.push({ title: 'Риски и Рекомендации', content: `## Анализ уязвимостей\n\n${warnings.length > 0 ? warnings.join('\n\n') : '🟢 Критических рисков не выявлено.'}` });

    return slides;
  }

  function formatMoney(val: number): string {
    if (Math.abs(val) >= 1e9) return `${(val / 1e9).toFixed(1)} млрд ₽`;
    if (Math.abs(val) >= 1e6) return `${(val / 1e6).toFixed(1)} млн ₽`;
    return val.toLocaleString('ru-RU') + ' ₽';
  }

  // Старые переменные для обратной совместимости с вкладками P&L и CashFlow
  let totalIncome = 0, totalExpense = 0, netFlow = 0;
  let revenue = 0, cogs = 0, opex = 0, taxes = 0;
  let capexVal = 0, financingIn = 0, financingOut = 0;
  let grossProfit = 0, ebitda = 0, netProfit = 0;

  if (hasTx) {
    document.transactions.forEach(tx => {
      const text = ((tx.purpose || '') + ' ' + (tx.payee || tx.payer || '')).toLowerCase();
      if (tx.type === 'income') {
        totalIncome += tx.amount;
        if (FINANCING_INCOME_KEYWORDS.some(k => text.includes(k))) financingIn += tx.amount;
        else revenue += tx.amount;
      } else {
        totalExpense += tx.amount;
        if (TAX_KEYWORDS.some(k => text.includes(k))) taxes += tx.amount;
        else if (COGS_KEYWORDS.some(k => text.includes(k))) cogs += tx.amount;
        else if (CAPEX_KEYWORDS.some(k => text.includes(k))) capexVal += tx.amount;
        else if (FINANCING_EXPENSE_KEYWORDS.some(k => text.includes(k))) financingOut += tx.amount;
        else opex += tx.amount;
      }
    });
    netFlow = totalIncome - totalExpense;
    grossProfit = revenue - cogs;
    ebitda = grossProfit - opex;
    netProfit = ebitda - taxes;
  }

  let chartData: any[] = [];
  let pieData: any[] = [];
  let recommendations: string[] = [];
  let healthStatus = 'neutral';

  if (hasTx) {
    const groupedDates: Record<string, { income: number, expense: number }> = {};
    document.transactions.forEach(tx => {
      if (!groupedDates[tx.date]) groupedDates[tx.date] = { income: 0, expense: 0 };
      if (tx.type === 'income') groupedDates[tx.date].income += tx.amount;
      else groupedDates[tx.date].expense += tx.amount;
    });
    chartData = Object.keys(groupedDates).sort().map(date => ({
      date, 'Поступления': groupedDates[date].income, 'Списания': groupedDates[date].expense
    }));

    const payeeMap: Record<string, number> = {};
    document.transactions.filter(t => t.type === 'expense').forEach(tx => {
      const key = tx.payee || tx.purpose || 'Неизвестно';
      payeeMap[key] = (payeeMap[key] || 0) + tx.amount;
    });
    const sortedPayees = Object.keys(payeeMap).map(k => ({ name: k, value: payeeMap[k] })).sort((a,b) => b.value - a.value);
    pieData = sortedPayees.slice(0, 5);
    const others = sortedPayees.slice(5).reduce((acc, curr) => acc + curr.value, 0);
    if (others > 0) pieData.push({ name: 'Прочее', value: others });

    if (netProfit > 0) { healthStatus = 'good'; recommendations.push(`**Рентабельность положительная:** Чистая прибыль (оценочно) составляет ${netProfit.toLocaleString('ru-RU')} ₽.`); }
    else if (netProfit < 0) { healthStatus = 'bad'; recommendations.push(`**Операционный убыток:** Убыток: ${Math.abs(netProfit).toLocaleString('ru-RU')} ₽).`); }
  }

  // Конкурентные фичи — вычисляем при наличии данных
  const budgetData = useMemo(() => generateBudgetVsActual(document), [document]);
  const costingData = useMemo(() => calculateProductCosting(document), [document]);
  const currencyData = useMemo(() => calculateCurrencyPositions(document), [document]);
  const scenariosData = useMemo(() => runWhatIfScenarios(document), [document]);
  const forecastData = useMemo(() => forecastCashFlow(document, 6), [document]);
  const kpiData = useMemo(() => generateKPIDashboard(document), [document]);
  const periodData = useMemo(() => comparePeriods(document), [document]);
  const aiRecs = useMemo(() => generateRecommendations(document), [document]);

  // Tab navigation labels — расширенные
  const tabButtons: { key: ReportTabType; icon: React.ReactNode; label: string }[] = [
    { key: 'summary', icon: <LayoutDashboard className="w-4 h-4 mr-2" />, label: 'Сводка' },
    { key: 'pnl', icon: <LineChart className="w-4 h-4 mr-2" />, label: 'ОПиУ (P&L)' },
    { key: 'cashflow', icon: <HandCoins className="w-4 h-4 mr-2" />, label: 'ДДС' },
    { key: 'balance', icon: <Briefcase className="w-4 h-4 mr-2" />, label: 'Баланс' },
    { key: 'ratios', icon: <Calculator className="w-4 h-4 mr-2" />, label: 'Коэффициенты' },
    { key: 'fullReport', icon: <FileSpreadsheet className="w-4 h-4 mr-2" />, label: 'Полный отчёт' },
    { key: 'slides', icon: <Sparkles className="w-4 h-4 mr-2" />, label: 'Слайды' },
  ];

  // Новые вкладки конкурентных фич (отдельно)
  const advancedTabs = [
    { key: 'budget', icon: <FileSpreadsheet className="w-4 h-4 mr-2" />, label: 'Бюджетирование' },
    { key: 'costing', icon: <Calculator className="w-4 h-4 mr-2" />, label: 'Себестоимость' },
    { key: 'kpi', icon: <TrendingUpDown className="w-4 h-4 mr-2" />, label: 'KPI Дашборд' },
    { key: 'scenarios', icon: <AlertTriangle className="w-4 h-4 mr-2" />, label: 'What-If Сценарии' },
    { key: 'forecast', icon: <TrendingUp className="w-4 h-4 mr-2" />, label: 'Прогноз ДДС' },
    { key: 'recommendations', icon: <Sparkles className="w-4 h-4 mr-2" />, label: 'Рекомендации AI' },
    { key: 'periods', icon: <LineChart className="w-4 h-4 mr-2" />, label: 'Сравнение периодов' },
    { key: 'competition', icon: <Briefcase className="w-4 h-4 mr-2" />, label: 'Анализ конкурентов' },
  ];

  // Расширенный тип для вкладок
  type AllTabType = ReportTabType | typeof advancedTabs[number]['key'];

  // Helper to render balance sheet as table rows
  const renderBalanceTable = (lines: BalanceSheetLine[]) => (
    lines.map((line, i) => {
      if (!line.name && !line.value) return null;
      const indent = '  '.repeat(line.level);
      const bold = line.isTotal ? 'font-bold bg-[var(--surface-inner)]/50' : '';
      const prefix = line.side === 'asset' ? 'АКТИВ' : 'ПАССИВ';
      return (
        <tr key={i} className={cn("hover:bg-[var(--surface-inner)]/30", bold)}>
          <td className="p-3 text-sm pl-4">{indent}[{prefix}] {line.name}</td>
          <td className="p-3 font-mono text-right text-sm">{formatMoney(line.value)}</td>
        </tr>
      );
    }).filter(Boolean)
  );

  // Helper to render income statement as table rows
  const renderPnlTable = (lines: IncomeStatementLine[]) => (
    lines.map((line, i) => {
      if (!line.name && line.value === 0 && !line.name.includes('Нет данных')) return null;
      const indent = '  '.repeat(line.level);
      const bold = line.isTotal ? 'font-bold bg-[var(--surface-inner)]/50' : '';
      return (
        <tr key={i} className={cn("hover:bg-[var(--surface-inner)]/30", bold)}>
          <td className="p-3 text-sm pl-4">{indent}{line.name}</td>
          <td className="p-3 font-mono text-right text-sm">{formatMoney(line.value)}</td>
        </tr>
      );
    }).filter(Boolean)
  );

  return (
    <div className="flex-1 overflow-y-auto bg-[var(--bg)] space-y-6 scroll-smooth h-full">
      
      {/* Header & Subtabs */}
      <div className="sticky top-0 z-20 bg-[var(--bg)]/95 backdrop-blur border-b border-[var(--border)] px-6 pt-6 pb-2">
        <h2 className="text-3xl font-light text-[var(--fg)] tracking-tight mb-1">CFO Дашборд</h2>
        <p className="text-[var(--text-muted)] text-sm mb-4">Управленческая аналитика • {document.docType.toUpperCase()}</p>
        
        <div className="flex space-x-2 overflow-x-auto hide-scrollbar pb-1">
          {[...tabButtons, ...advancedTabs].map(tab => (
            <button key={tab.key} onClick={() => setReportTab(tab.key as ReportTabType)}
              className={cn("pb-2 text-sm font-medium transition-colors border-b-2 flex-shrink-0 flex items-center", 
                reportTab === tab.key ? `border-indigo-500 text-indigo-500` : "border-transparent text-[var(--text-muted)] hover:text-[var(--fg)])")}>
              {tab.icon}{tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-6 pb-12 space-y-8">
        
        {/* Empty state */}
        {!hasTx && !hasExtractedMetrics && manualAssetsTotal === 0 ? (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 flex flex-col items-center justify-center text-center mt-6">
            <AlertCircle className="w-12 h-12 text-amber-500 mb-4" />
            <h3 className="text-xl font-medium text-[var(--fg)] mb-2">Невозможно построить отчеты</h3>
            <p className="text-[var(--text-muted)] max-w-xl text-sm mb-6">Загрузите выписки, ОСВ или баланс.</p>
          </div>
        ) : (

        <>
        
        {/* === SUMMARY === */}
        {reportTab === 'summary' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            {hasTx && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm">
                  <div className="text-[var(--text-muted)] text-[10px] font-semibold uppercase tracking-wider mb-2">Выручка</div>
                  <div className="text-2xl font-mono text-emerald-500">{revenue.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm">
                  <div className="text-[var(--text-muted)] text-[10px] font-semibold uppercase tracking-wider mb-2">EBITDA</div>
                  <div className={cn("text-2xl font-mono", ebitda >= 0 ? "text-emerald-500" : "text-rose-500")}>{ebitda.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className={cn("border rounded-2xl p-5 shadow-sm", healthStatus === 'good' ? "bg-emerald-500/10 border-emerald-500/20" : healthStatus === 'bad' ? "bg-rose-500/10 border-rose-500/20" : "bg-[var(--surface)] border-[var(--border)])")}>
                  <div className={cn("text-[10px] font-semibold uppercase tracking-wider mb-2", healthStatus === 'good' ? "text-emerald-600" : healthStatus === 'bad' ? "text-rose-600" : "text-[var(--text-muted)]")}>Чистый поток</div>
                  <div className={cn("text-2xl font-mono", netFlow >= 0 ? "text-emerald-500" : "text-rose-500")}>{netFlow > 0 ? '+' : ''}{netFlow.toLocaleString('ru-RU')} ₽</div>
                </div>
                <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-2xl p-5 shadow-sm">
                  <div className="text-indigo-600 text-[10px] font-semibold uppercase tracking-wider mb-2">Капитал</div>
                  <div className="text-2xl font-mono text-indigo-600">{manualAssetsTotal > 0 ? `${manualAssetsTotal.toLocaleString('ru-RU')} ₽` : '—'}</div>
                </div>
              </div>
            )}

            {/* Chart + Pie */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                <h3 className="text-sm font-semibold text-[var(--fg)] mb-4">{hasTx ? "Динамика Поступлений и Списаний" : "Извлеченные метрики"}</h3>
                <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }} layout={!hasTx ? "vertical" : "horizontal"}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={hasTx} vertical={!hasTx} />
                    {hasTx ? (
                      <>
                        <XAxis dataKey="date" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                        <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v/1000).toFixed(0)}k`} />
                        <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface-inner)', borderColor: 'var(--border)', color: 'var(--fg)', borderRadius: '8px' }} itemStyle={{ fontFamily: 'monospace' }} />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                        <Area type="monotone" dataKey="Поступления" fill="#10b981" fillOpacity={0.1} stroke="#10b981" />
                        <Bar dataKey="Списания" fill="#f43f5e" radius={[4, 4, 0, 0]} maxBarSize={40} />
                      </>
                    ) : (
                      <>
                        <XAxis type="number" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v/1e6).toFixed(1)}M`} />
                        <YAxis dataKey="name" type="category" width={120} stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                        <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface-inner)', borderColor: 'var(--border)', color: 'var(--fg)', borderRadius: '8px' }} itemStyle={{ fontFamily: 'monospace' }} formatter={(v: number) => `${v.toLocaleString('ru-RU')} ₽`} />
                        <Bar dataKey="Значение" fill="#6366f1" radius={[0, 4, 4, 0]} />
                      </>
                    )}
                  </ComposedChart>
                </ResponsiveContainer></div>
              </div>

              <div className="lg:col-span-1 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm flex flex-col">
                <h3 className="text-sm font-semibold text-[var(--fg)] mb-2">{hasTx ? "Структура расходов" : "Крупнейшие статьи"}</h3>
                <div className="flex-1 min-h-[200px]"><ResponsiveContainer width="100%" height="100%">
                  <PieChart><Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                    {pieData.map((entry, index) => (<Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />))}
                  </Pie><RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface-inner)', borderColor: 'var(--border)', color: 'var(--fg)', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ fontFamily: 'monospace' }} formatter={(v: number) => `${v.toLocaleString('ru-RU')} ₽`} /></PieChart>
                </ResponsiveContainer></div>
              </div>
            </div>

            {/* Плотность показателей */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-semibold text-[var(--fg)] mb-4 flex items-center"><TrendingUpDown className="w-5 h-5 mr-2 text-indigo-500" /> Плотность финансовых показателей</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {[
                  { label: 'Выручка', value: revenue, color: 'text-emerald-500' },
                  { label: 'Себест.', value: cogs, color: 'text-rose-500' },
                  { label: 'Опер. расходы', value: opex, color: 'text-amber-500' },
                  { label: 'EBITDA', value: ebitda, color: ebitda >= 0 ? 'text-emerald-500' : 'text-rose-500' },
                  { label: 'Налоги', value: taxes, color: 'text-orange-500' },
                  { label: 'Чистая прибыль', value: netProfit, color: netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500' },
                ].filter(d => d.value !== 0).map((d, i) => (
                  <div key={i} className="p-3 bg-[var(--surface-inner)] border border-[var(--border)] rounded-xl">
                    <div className="text-xs text-[var(--text-muted)]">{d.label}</div>
                    <div className={cn("text-lg font-mono mt-1", d.color)}>{d.value.toLocaleString('ru-RU')} ₽</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === P&L (ОПиУ) === */}
        {reportTab === 'pnl' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            {/* Водопад */}
            {hasTx && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[var(--fg)] mb-4">Водопад Прибыли / ОПиУ</h3>
                <div className="h-[350px]"><ResponsiveContainer width="100%" height="100%">
                  <BarChart data={[
                    { name: 'Выручка', value: revenue, type: 'income' },
                    { name: 'Себестоимость', value: -cogs, type: 'expense' },
                    { name: 'Вал. прибыль', value: grossProfit, type: 'total' },
                    { name: 'OPEX', value: -opex, type: 'expense' },
                    { name: 'EBITDA', value: ebitda, type: 'total' },
                    { name: 'Налоги', value: -taxes, type: 'expense' },
                    { name: 'Чистая прибыль', value: netProfit, type: 'total' }
                  ]} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={11} interval={0} tickLine={false} axisLine={false} angle={-20} textAnchor="end" height={60} />
                    <YAxis stroke="var(--text-muted)" fontSize={11} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v/1e3).toFixed(0)}k`} />
                    <RechartsTooltip cursor={{fill: 'var(--surface-inner)'}} contentStyle={{ backgroundColor: 'var(--surface-inner)', borderColor: 'var(--border)', color: 'var(--fg)', borderRadius: '8px' }} formatter={(v: number) => `${v.toLocaleString('ru-RU')} ₽`} />
                    <Bar dataKey="value" radius={4} maxBarSize={60}>
                      {([revenue, -cogs, grossProfit, -opex, ebitda, -taxes, netProfit] as number[]).map((v, i) => (
                        <Cell key={`cell-${i}`} fill={v >= 0 ? '#10b981' : '#f43f5e'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer></div>
              </div>
            )}

            {/* Полная таблица ОПиУ из financialReports */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm min-w-[500px]">
                <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="p-4 font-medium border-b">Статья ОПиУ</th>
                  <th className="p-4 font-medium text-right border-b">Сумма (₽)</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--border)]">{renderPnlTable(pnlData)}</tbody>
              </table>
            </div>

            {/* Если есть транзакции — расширенная таблица */}
            {hasTx && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm min-w-[600px]">
                  <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="p-4 font-medium border-b">Статья</th>
                    <th className="p-4 font-medium text-right border-b">Сумма (₽)</th>
                    <th className="p-4 font-medium text-right border-b">% от выручки</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    <tr><td className="p-4 font-medium">Выручка (Операционные поступления)</td><td className="p-4 font-mono text-emerald-500 text-right">+{revenue.toLocaleString('ru-RU')}</td><td className="p-4 text-right">100%</td></tr>
                    <tr><td className="p-4 pl-8 text-[var(--text-muted)]">Себестоимость (COGS)</td><td className="p-4 font-mono text-rose-500 text-right">-{cogs.toLocaleString('ru-RU')}</td><td className="p-4 text-right">{revenue>0 ? ((cogs/revenue)*100).toFixed(1) : 0}%</td></tr>
                    <tr className="font-semibold bg-[var(--surface-inner)]/30"><td className="p-4">Валовая прибыль (Gross Profit)</td><td className="p-4 font-mono text-right">{grossProfit.toLocaleString('ru-RU')}</td><td className="p-4 text-right">{revenue>0 ? ((grossProfit/revenue)*100).toFixed(1) : 0}%</td></tr>
                    <tr><td className="p-4 pl-8 text-[var(--text-muted)]">Операционные расходы (OPEX)</td><td className="p-4 font-mono text-rose-500 text-right">-{opex.toLocaleString('ru-RU')}</td><td className="p-4 text-right">{revenue>0 ? ((opex/revenue)*100).toFixed(1) : 0}%</td></tr>
                    <tr className="font-semibold bg-[var(--surface-inner)]/30"><td className="p-4">EBITDA</td><td className="p-4 font-mono text-right">{ebitda.toLocaleString('ru-RU')}</td><td className="p-4 text-right">{revenue>0 ? ((ebitda/revenue)*100).toFixed(1) : 0}%</td></tr>
                    <tr><td className="p-4 pl-8 text-[var(--text-muted)]">Налоги (оценочно)</td><td className="p-4 font-mono text-rose-500 text-right">-{taxes.toLocaleString('ru-RU')}</td><td className="p-4 text-right">{revenue>0 ? ((taxes/revenue)*100).toFixed(1) : 0}%</td></tr>
                    <tr className="font-bold bg-[var(--surface-inner)]/50"><td className="p-4 text-indigo-500">Чистая Прибыль / Убыток</td><td className="p-4 font-mono text-indigo-500 text-right">{netProfit.toLocaleString('ru-RU')}</td><td className="p-4 text-right">{revenue>0 ? ((netProfit/revenue)*100).toFixed(1) : 0}%</td></tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* === CASH FLOW (ДДС) === */}
        {reportTab === 'cashflow' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            {hasTx && (
              <>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                  <h3 className="text-lg font-semibold text-[var(--fg)] mb-4">Cash Flow по видам деятельности</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
                    <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--surface-inner)]/30">
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">CFO (Операционный)</div>
                      <div className={cn("text-xl font-mono", netFlow > 0 ? "text-emerald-500" : "text-rose-500")}>{(revenue - cogs - opex - taxes).toLocaleString('ru-RU')} ₽</div>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--surface-inner)]/30">
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">CFI (Инвестиционный)</div>
                      <div className="text-xl font-mono text-rose-500">-{capexVal.toLocaleString('ru-RU')} ₽</div>
                    </div>
                    <div className="p-4 border border-[var(--border)] rounded-xl bg-[var(--surface-inner)]/30">
                      <div className="text-xs text-[var(--text-muted)] uppercase tracking-wider mb-1">CFF (Финансовый)</div>
                      <div className={cn("text-xl font-mono", (financingIn - financingOut) > 0 ? "text-[var(--fg)]" : "text-rose-400")}>{(financingIn - financingOut).toLocaleString('ru-RU')} ₽</div>
                    </div>
                  </div>
                </div>

                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[500px]">
                    <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 font-medium border-b">Статья ДДС</th>
                      <th className="p-4 font-medium text-right border-b">Сумма (₽)</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--border)]">{renderPnlTable(cfData.map(l => ({ name: l.name, value: l.value, level: 0 } as IncomeStatementLine)))}</tbody>
                  </table>
                </div>
              </>
            )}

            {/* ДДС из financialReports */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm min-w-[500px]">
                <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                  <th className="p-4 font-medium border-b">Статья (financialReports)</th>
                  <th className="p-4 font-medium text-right border-b">Сумма (₽)</th>
                </tr></thead>
                <tbody className="divide-y divide-[var(--border)]">{renderPnlTable(cfData.map(l => ({ name: l.name, value: l.value, level: 0 } as IncomeStatementLine)))}</tbody>
              </table>
            </div>
          </div>
        )}

        {/* === BALANCE (Баланс) === */}
        {reportTab === 'balance' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            {bsData.some(l => l.side === 'asset') && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Актив */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm overflow-x-auto">
                  <h3 className="text-lg font-semibold text-emerald-500 mb-4 flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> АКТИВЫ</h3>
                  <table className="w-full text-left border-collapse text-sm min-w-[400px]">
                    <tbody className="divide-y divide-[var(--border)]">{bsData.filter(l => l.side === 'asset').map((l, i) => (
                      !l.name && !l.value ? null : (
                        <tr key={i} className={cn("hover:bg-[var(--surface-inner)]/30", l.isTotal ? "font-bold bg-[var(--surface-inner)]/50" : "")}>
                          <td className="p-2 text-sm pl-4">{'  '.repeat(l.level)}{l.name}</td>
                          <td className="p-2 font-mono text-right text-sm">{formatMoney(l.value)}</td>
                        </tr>
                      )
                    ))}</tbody>
                  </table>
                </div>

                {/* Пассив */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm overflow-x-auto">
                  <h3 className="text-lg font-semibold text-indigo-500 mb-4 flex items-center"><Briefcase className="w-5 h-5 mr-2" /> ПАССИВЫ</h3>
                  <table className="w-full text-left border-collapse text-sm min-w-[400px]">
                    <tbody className="divide-y divide-[var(--border)]">{bsData.filter(l => l.side === 'liability').map((l, i) => (
                      !l.name && !l.value ? null : (
                        <tr key={i} className={cn("hover:bg-[var(--surface-inner)]/30", l.isTotal ? "font-bold bg-[var(--surface-inner)]/50" : "")}>
                          <td className="p-2 text-sm pl-4">{'  '.repeat(l.level)}{l.name}</td>
                          <td className="p-2 font-mono text-right text-sm">{formatMoney(l.value)}</td>
                        </tr>
                      )
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Ручные активы */}
            {manualAssetsTotal > 0 && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[var(--fg)] mb-4">Структура Активов (Ручной Ввод)</h3>
                <div className="text-3xl font-mono text-indigo-500">{formatMoney(manualAssetsTotal)}</div>
              </div>
            )}

            {/* Метрики из ОСВ */}
            {hasExtractedMetrics && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold text-[var(--fg)] mb-4">Метрики из Бухгалтерии</h3>
                <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2">
                  {Object.keys(document.extractedMetrics || {}).filter(k => k !== 'Стоимость Активов (вручную)').map((k, i) => (
                    <div key={i} className="flex justify-between items-center text-sm border-b border-[var(--border)] pb-2">
                      <span className="text-[var(--text-muted)] truncate mr-4">{k}</span>
                      <span className="text-[var(--fg)] font-mono shrink-0">{formatMoney(document.extractedMetrics![k])}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* === FINANCIAL RATIOS (Финансовые коэффициенты) === */}
        {reportTab === 'ratios' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            {ratiosData.length > 0 ? (
              <>
                {/* Карточки коэффициентов */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {ratiosData.map((r, i) => {
                    const statusColor = r.status === 'good' ? 'border-emerald-500/30 bg-emerald-500/5' : r.status === 'warning' ? 'border-amber-500/30 bg-amber-500/5' : 'border-rose-500/30 bg-rose-500/5';
                    const statusIcon = r.status === 'good' ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : r.status === 'warning' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <AlertCircle className="w-4 h-4 text-rose-500" />;
                    const unitStr = r.unit === '%' ? '%' : r.unit === 'days' ? ' дн.' : '';
                    
                    return (
                      <div key={i} className={cn("border rounded-xl p-4", statusColor)}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{r.name}</span>
                          {statusIcon}
                        </div>
                        <div className={cn("text-3xl font-mono", r.status === 'good' ? 'text-emerald-500' : r.status === 'warning' ? 'text-amber-500' : 'text-rose-500')}>
                          {r.value.toFixed(2)}{unitStr}
                        </div>
                        <div className="text-sm font-medium text-[var(--fg)] mt-1">{r.label}</div>
                        <div className="text-xs text-[var(--text-muted)] mt-2 leading-relaxed">{r.description}</div>
                        {r.benchmark && (
                          <div className="mt-2 text-xs">Норма ≥ {r.benchmark}{unitStr === '%' ? '%' : ''}</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Таблица коэффициентов */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[600px]">
                    <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 font-medium border-b">Показатель</th>
                      <th className="p-4 font-medium text-right border-b">Значение</th>
                      <th className="p-4 font-medium text-center border-b">Статус</th>
                      <th className="p-4 font-medium border-b">Описание</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {ratiosData.map((r, i) => (
                        <tr key={i} className="hover:bg-[var(--surface-inner)]/30">
                          <td className="p-3 font-medium">{r.label}</td>
                          <td className="p-3 font-mono text-right">{r.value.toFixed(2)}{r.unit === '%' ? '%' : r.unit === 'days' ? ' дн.' : ''}</td>
                          <td className="p-3 text-center">
                            <span className={cn("px-2 py-1 rounded-full text-xs font-medium", 
                              r.status === 'good' ? 'bg-emerald-500/20 text-emerald-600' : 
                              r.status === 'warning' ? 'bg-amber-500/20 text-amber-600' : 
                              'bg-rose-500/20 text-rose-600')}>
                              {r.status === 'good' ? '✅ Норма' : r.status === 'warning' ? '⚠️ Внимание' : '🔴 Критично'}
                            </span>
                          </td>
                          <td className="p-3 text-xs text-[var(--text-muted)]">{r.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Визуализация коэффициентов */}
                {ratiosData.some(r => r.unit === '%') && (
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-[var(--fg)] mb-4">Визуализация маржинальности</h3>
                    <div className="space-y-3">
                      {ratiosData.filter(r => r.unit === '%').map((r, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm text-[var(--text-muted)] w-48 shrink-0 truncate">{r.label}</span>
                          <div className="flex-1 bg-[var(--surface-inner)] rounded-full h-6 overflow-hidden relative">
                            <div className={cn("h-full rounded-full transition-all", 
                              r.status === 'good' ? 'bg-emerald-500' : r.status === 'warning' ? 'bg-amber-500' : 'bg-rose-500')
                            } style={{ width: `${Math.min(100, Math.max(0, r.value))}%` }}>
                              <span className="text-xs text-white font-medium px-2">{r.value.toFixed(1)}%</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-[var(--fg)] mb-2">Недостаточно данных</h3>
                <p className="text-sm text-[var(--text-muted)]">Для расчета финансовых коэффициентов необходимы транзакции, ОСВ или балансовые данные.</p>
              </div>
            )}
          </div>
        )}

        {/* === FULL REPORT (Полный отчет) === */}
        {reportTab === 'fullReport' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            {!fullReport.hasData ? (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-[var(--fg)] mb-2">Недостаточно данных для полного отчета</h3>
                <p className="text-sm text-[var(--text-muted)]">Загрузите выписки, ОСВ или баланс.</p>
              </div>
            ) : (
              <>
                {/* Сводка */}
                {fullReport.summary && (
                  <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-[var(--fg)] mb-3 flex items-center"><LayoutDashboard className="w-5 h-5 mr-2" /> Сводка</h3>
                    <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed">
                      <ReactMarkdown>{fullReport.summary}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Markdown таблицы */}
                {fullReport.markdownTables && (
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-[var(--fg)] mb-4 flex items-center"><FileSpreadsheet className="w-5 h-5 mr-2" /> Управленческая отчетность</h3>
                    <div className="prose dark:prose-invert max-w-none text-sm">
                      <ReactMarkdown>{fullReport.markdownTables}</ReactMarkdown>
                    </div>
                  </div>
                )}

                {/* Коэффициенты */}
                {fullReport.ratios.length > 0 && (
                  <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                    <h3 className="text-lg font-semibold text-[var(--fg)] mb-4 flex items-center"><Calculator className="w-5 h-5 mr-2" /> Ключевые коэффициенты</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {fullReport.ratios.map((r, i) => (
                        <div key={i} className="p-3 bg-[var(--surface-inner)] border border-[var(--border)] rounded-xl">
                          <div className="text-xs text-[var(--text-muted)]">{r.label}</div>
                          <div className={cn("text-lg font-mono", r.status === 'good' ? 'text-emerald-500' : r.status === 'warning' ? 'text-amber-500' : 'text-rose-500')}>
                            {r.value.toFixed(2)}{r.unit === '%' ? '%' : ''}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* === SLIDES (Слайды презентации) === */}
        {reportTab === 'slides' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            {!fullReport.hasData ? (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 text-center">
                <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
                <h3 className="text-xl font-medium text-[var(--fg)] mb-2">Недостаточно данных для слайдов</h3>
              </div>
            ) : (
              slidesData.map((slide, i) => (
                <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-8 shadow-sm">
                  {/* Слайд номер */}
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-[var(--border)]">
                    <div>
                      {slide.subtitle && <p className="text-xs text-[var(--text-muted)]">{slide.subtitle}</p>}
                      <h3 className="text-2xl font-semibold text-[var(--fg)] mt-1">{slide.title}</h3>
                    </div>
                    <span className="text-sm text-[var(--text-muted)] bg-[var(--surface-inner)] px-3 py-1 rounded-full">Слайд {i + 1} / {slidesData.length}</span>
                  </div>
                  
                  {/* Контент слайда */}
                  <div className="prose dark:prose-invert max-w-none text-sm leading-relaxed min-h-[100px]">
                    <ReactMarkdown>{slide.content}</ReactMarkdown>
                  </div>

                  {/* Разделитель между слайдами */}
                  {i < slidesData.length - 1 && (
                    <div className="mt-8 pt-4 border-t border-dashed border-[var(--border)] flex justify-center">
                      <span className="text-xs text-[var(--text-muted)] uppercase tracking-widest">— --- —</span>
                    </div>
                  )}
                </div>
              ))
            )}

            {/* Кнопка экспорта */}
            {fullReport.hasData && (
              <div className="flex justify-center gap-4 pt-4">
                <button 
                  onClick={() => {
                    const text = fullReport.markdownTables;
                    navigator.clipboard.writeText(text).then(() => alert('Таблицы скопированы в буфер обмена!'));
                  }}
                  className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center shadow-lg">
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Копировать таблицы
                </button>
              </div>
            )}
          </div>
        )}

        {/* === BUDGET vs ACTUAL === */}
        {reportTab === 'budget' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><FileSpreadsheet className="w-5 h-5 mr-2" /> Бюджет vs Факт</h3>
            {budgetData.length > 0 ? (
              <>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[600px]">
                    <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 font-medium border-b">Категория</th>
                      <th className="p-4 font-medium text-right border-b">Бюджет (₽)</th>
                      <th className="p-4 font-medium text-right border-b">Факт (₽)</th>
                      <th className="p-4 font-medium text-right border-b">Отклонение</th>
                      <th className="p-4 font-medium text-center border-b">% откл.</th>
                      <th className="p-4 font-medium text-center border-b">Статус</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {budgetData.map((b, i) => (
                        <tr key={i} className="hover:bg-[var(--surface-inner)]/30">
                          <td className="p-4 font-medium">{b.category}</td>
                          <td className="p-4 font-mono text-right text-emerald-500">{b.planned.toLocaleString('ru-RU')}</td>
                          <td className="p-4 font-mono text-right">{b.actual.toLocaleString('ru-RU')}</td>
                          <td className={cn("p-4 font-mono text-right", b.variance > 0 ? "text-rose-500" : "text-emerald-500")}> {(b.variance > 0 ? '+' : '') + b.variance.toLocaleString('ru-RU')}</td>
                          <td className="p-4 font-mono text-right">{b.variancePercent.toFixed(1)}%</td>
                          <td className="p-4 text-center">
                            <span className={cn("px-2 py-1 rounded-full text-xs font-medium", b.status === 'ok' ? 'bg-emerald-500/20 text-emerald-600' : b.status === 'warning' ? 'bg-amber-500/20 text-amber-600' : 'bg-rose-500/20 text-rose-600')}> {b.status === 'ok' ? '✅ В бюджете' : b.status === 'warning' ? '⚠️ +10%' : '🔴 Перерасход'}</span>
                          </td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>
              </>)
            : <p className="text-[var(--text-muted)] text-center py-8">Нет данных для бюджетирования</p>}  
          </div>
        )}

        {/* === COSTING === */}
        {reportTab === 'costing' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><Calculator className="w-5 h-5 mr-2" /> Себестоимость продукции/услуг</h3>
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <h4 className="text-sm text-[var(--text-muted)] font-semibold uppercase tracking-wider mb-3">Прямые затраты</h4>
                  <table className="w-full text-left border-collapse text-sm">
                    <tbody className="divide-y divide-[var(--border)]">
                      {costingData.directMaterials.map((item, i) => (
                        <tr key={i}><td className="p-3">📦 Материалы и закупки</td><td className="p-3 font-mono text-right text-rose-500">{item.amount.toLocaleString('ru-RU')} ₽</td></tr>))}
                      {costingData.directLabor.map((item, i) => (
                        <tr key={i}><td className="p-3">👷 Прямая зарплата</td><td className="p-3 font-mono text-right text-orange-500">{item.amount.toLocaleString('ru-RU')} ₽</td></tr>))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h4 className="text-sm text-[var(--text-muted)] font-semibold uppercase tracking-wider mb-3">Накладные расходы и маржа</h4>
                  <table className="w-full text-left border-collapse text-sm">
                    <tbody className="divide-y divide-[var(--border)]">
                      <tr><td className="p-3">🏭 Накладные (25, 26)</td><td className="p-3 font-mono text-right text-amber-500">{costingData.overheadAllocation.toLocaleString('ru-RU')} ₽</td></tr>
                      <tr className="font-bold bg-[var(--surface-inner)]/50"><td className="p-4">💰 Итого себестоимость</td><td className="p-4 font-mono text-right text-indigo-500">{costingData.unitCost.toLocaleString('ru-RU')} ₽</td></tr>
                      <tr><td className="p-3">🏷️ Оценочная цена продажи (+30%)</td><td className="p-3 font-mono text-right text-emerald-500">{costingData.sellingPrice.toLocaleString('ru-RU')} ₽</td></tr>
                      <tr><td className="p-3">📊 Маржа</td><td className={cn("p-3 font-mono text-right", costingData.marginPercent > 25 ? "text-emerald-500" : "text-amber-500")}>{costingData.marginPercent.toFixed(1)}%</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === KPI DASHBOARD === */}
        {reportTab === 'kpi' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><TrendingUpDown className="w-5 h-5 mr-2" /> KPI Дашборд</h3>
            {kpiData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {kpiData.map((kpi, i) => {
                  const statusColor = kpi.status === 'green' ? 'border-emerald-500/30 bg-emerald-500/5' : kpi.status === 'yellow' ? 'border-amber-500/30 bg-amber-500/5' : 'border-rose-500/30 bg-rose-500/5';
                  const statusIcon = kpi.status === 'green' ? <ShieldCheck className="w-4 h-4 text-emerald-500" /> : kpi.status === 'yellow' ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <AlertCircle className="w-4 h-4 text-rose-500" />;
                  const unitStr = kpi.unit === '%' ? '%' : kpi.unit === 'days' ? ' дн.' : '';
                  return (
                    <div key={i} className={cn("border rounded-xl p-4", statusColor)}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">{kpi.label}</span>
                        {statusIcon}
                      </div>
                      <div className={cn("text-3xl font-mono", kpi.status === 'green' ? 'text-emerald-500' : kpi.status === 'yellow' ? 'text-amber-500' : 'text-rose-500')}> {kpi.value.toFixed(kpi.unit === 'ratio' ? 2 : (Math.abs(kpi.value) > 1000 ? 0 : 1))}{unitStr}</div>
                      <div className="flex justify-between mt-3 text-xs">
                        <span>Факт: {kpi.value.toFixed(1)}{unitStr}</span>
                        <span className="text-[var(--text-muted)]">Цель: {kpi.target}{unitStr}</span>
                      </div>
                    </div>);})}
              </div>)
            : <p className="text-[var(--text-muted)] text-center py-8">Нет данных для KPI</p>}  
          </div>
        )}

        {/* === WHAT-IF SCENARIOS === */}
        {reportTab === 'scenarios' && (() => {
          let _r = 0, _e = 0;
          for (const tx of document.transactions) {
            if (tx.type === 'income') _r += tx.amount;
            else _e += tx.amount;
          }
          const baseProfit = _r - _e;
          const customProfit = Math.round(_r * (1 + customRev / 100) - _e * (1 + customExp / 100));
          
          return (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><AlertTriangle className="w-5 h-5 mr-2" /> What-If Сценарии</h3>
            
            {/* Interactive Controls */}
            <div className="bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6">
              <h4 className="text-lg font-semibold text-[var(--fg)] mb-4">🎛️ Интерактивный сценарий</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="text-sm text-[var(--text-muted)] mb-2 block">
                    Изменение выручки: <span className="text-emerald-500 font-bold">{customRev > 0 ? '+' : ''}{customRev}%</span>
                  </label>
                  <input type="range" min="-50" max="50" value={customRev} onChange={e => setCustomRev(Number(e.target.value))}
                    className="w-full h-2 bg-[var(--surface-inner)] rounded-lg appearance-none cursor-pointer accent-emerald-500" />
                  <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1"><span>-50%</span><span>+50%</span></div>
                </div>
                <div>
                  <label className="text-sm text-[var(--text-muted)] mb-2 block">
                    Изменение расходов: <span className="text-rose-500 font-bold">{customExp > 0 ? '+' : ''}{customExp}%</span>
                  </label>
                  <input type="range" min="-50" max="50" value={customExp} onChange={e => setCustomExp(Number(e.target.value))}
                    className="w-full h-2 bg-[var(--surface-inner)] rounded-lg appearance-none cursor-pointer accent-rose-500" />
                  <div className="flex justify-between text-xs text-[var(--text-muted)] mt-1"><span>-50%</span><span>+50%</span></div>
                </div>
              </div>
              <div className={cn("mt-4 p-4 rounded-xl border", 
                customProfit > baseProfit ? 'bg-emerald-500/10 border-emerald-500/30' : 
                customProfit > baseProfit * 0.7 ? 'bg-amber-500/10 border-amber-500/30' : 
                'bg-rose-500/10 border-rose-500/30')}>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Прогноз прибыли</div>
                    <div className={cn("text-2xl font-mono font-bold", customProfit >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                      {customProfit.toLocaleString('ru-RU')} ₽
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">Базовая: {baseProfit.toLocaleString('ru-RU')} ₽</div>
                  </div>
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Δ от базы</div>
                    <div className={cn("text-2xl font-mono font-bold", (customProfit - baseProfit) >= 0 ? 'text-emerald-500' : 'text-rose-500')}>
                      {(customProfit - baseProfit > 0 ? '+' : '')}{(customProfit - baseProfit).toLocaleString('ru-RU')} ₽
                    </div>
                    <div className="text-xs text-[var(--text-muted)]">{((customProfit - baseProfit) / Math.max(1, Math.abs(baseProfit)) * 100).toFixed(1)}%</div>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-4 flex-wrap">
                {[{n:'🟢 Оптимистичный',r:30,e:10},{n:'🟡 Стабильный',r:5,e:3},{n:'🟠 Кризис',r:-30,e:15},{n:'🔴 Дефляция',r:-10,e:-20}].map(p => (
                  <button key={p.n} onClick={() => {setCustomRev(p.r); setCustomExp(p.e);}}
                    className="px-3 py-1.5 text-xs rounded-lg bg-[var(--surface-inner)] hover:bg-[var(--border)] text-[var(--text-muted)] hover:text-[var(--fg)] transition-all">
                    {p.n}
                  </button>
                ))}
              </div>
            </div>

            {/* Preset Scenarios */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {scenariosData.map((s, i) => {
                const bg = s.riskLevel === 'low' ? 'border-emerald-500/30 bg-emerald-500/5' : s.riskLevel === 'medium' ? 'border-amber-500/30 bg-amber-500/5' : 'border-rose-500/30 bg-rose-500/5';
                const profitColor = s.netProfit >= 0 ? 'text-emerald-500' : 'text-rose-500';
                return (
                  <div key={i} className={cn("border rounded-xl p-6", bg)}>
                    <h4 className="text-lg font-semibold text-[var(--fg)] mb-3">{s.name}</h4>
                    <div className="space-y-2 text-sm">
                      <div>Выручка: {s.revenueChange > 0 ? '+' : ''}{s.revenueChange}%</div>
                      <div>Расходы: {s.expenseChange > 0 ? '+' : ''}{s.expenseChange}%</div>
                      <div className={cn("text-xl font-mono mt-3 pt-3 border-t border-[var(--border)]", profitColor)}>Чистая прибыль: {s.netProfit.toLocaleString('ru-RU')} ₽</div>
                      <div>Денежный поток: {(s.cashFlow).toLocaleString('ru-RU')} ₽</div>
                    </div>
                  </div>);})}
            </div>
          </div>
          );
        })()}

        {/* === CASH FLOW FORECAST === */}
        {reportTab === 'forecast' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><TrendingUp className="w-5 h-5 mr-2" /> Прогноз ДДС (6 месяцев)</h3>
            {forecastData.length > 0 ? (
              <>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[700px]">
                    <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 font-medium border-b">Месяц</th>
                      <th className="p-4 font-medium text-right border-b">Нач. баланс</th>
                      <th className="p-4 font-medium text-right border-b">Поступления</th>
                      <th className="p-4 font-medium text-right border-b">Списания</th>
                      <th className="p-4 font-medium text-right border-b">Чистый поток</th>
                      <th className="p-4 font-medium text-right border-b">Кон. баланс</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {forecastData.map((f, i) => (
                        <tr key={i} className="hover:bg-[var(--surface-inner)]/30">
                          <td className="p-4 font-medium">{f.month}</td>
                          <td className="p-4 font-mono text-right">{f.openingBalance.toLocaleString('ru-RU')}</td>
                          <td className="p-4 font-mono text-right text-emerald-500">+{f.operatingInflow.toLocaleString('ru-RU')}</td>
                          <td className="p-4 font-mono text-right text-rose-500">-{f.operatingOutflow.toLocaleString('ru-RU')}</td>
                          <td className={cn("p-4 font-mono text-right", f.netCashFlow >= 0 ? "text-emerald-500" : "text-rose-500")}> {(f.netCashFlow > 0 ? '+' : '') + f.netCashFlow.toLocaleString('ru-RU')}</td>
                          <td className={cn("p-4 font-mono text-right font-bold", f.closingBalance >= 0 ? "text-emerald-500" : "text-rose-500")}> {f.closingBalance.toLocaleString('ru-RU')}</td>
                        </tr>))}
                    </tbody>
                  </table>
                </div>
              </>)
            : <p className="text-[var(--text-muted)] text-center py-8">Нет данных для прогноза</p>}  
          </div>
        )}

        {/* === PERIOD COMPARISON === */}
        {reportTab === 'periods' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><LineChart className="w-5 h-5 mr-2" /> Сравнение периодов (MoM)</h3>
            {periodData.length >= 2 ? (
              <>
                {/* Таблица периодов */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl shadow-sm overflow-x-auto">
                  <table className="w-full text-left border-collapse text-sm min-w-[700px]">
                    <thead><tr className="bg-[var(--surface-inner)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
                      <th className="p-4 font-medium border-b">Период</th>
                      <th className="p-4 font-medium text-right border-b">Выручка</th>
                      <th className="p-4 font-medium text-right border-b">Расходы</th>
                      <th className="p-4 font-medium text-right border-b">Прибыль</th>
                      <th className="p-4 font-medium text-right border-b">Маржа</th>
                      <th className="p-4 font-medium text-right border-b">Δ Выручка</th>
                      <th className="p-4 font-medium text-right border-b">Δ Расходы</th>
                    </tr></thead>
                    <tbody className="divide-y divide-[var(--border)]">
                      {periodData.map((p, i) => {
                        const prev = i > 0 ? periodData[i - 1] : null;
                        const revGrowth = prev ? ((p.revenue - prev.revenue) / Math.max(1, prev.revenue) * 100) : 0;
                        const expGrowth = prev ? ((p.expense - prev.expense) / Math.max(1, prev.expense) * 100) : 0;
                        return (
                          <tr key={i} className="hover:bg-[var(--surface-inner)]/30">
                            <td className="p-4 font-medium">{p.period}</td>
                            <td className="p-4 font-mono text-right text-emerald-500">{p.revenue.toLocaleString('ru-RU')}</td>
                            <td className="p-4 font-mono text-right text-rose-500">{p.expense.toLocaleString('ru-RU')}</td>
                            <td className={cn("p-4 font-mono text-right", p.profit >= 0 ? "text-emerald-500" : "text-rose-500")}>{p.profit.toLocaleString('ru-RU')}</td>
                            <td className="p-4 font-mono text-right">{p.marginPercent.toFixed(1)}%</td>
                            <td className={cn("p-4 font-mono text-right", revGrowth >= 0 ? "text-emerald-500" : "text-rose-500")}>{prev ? (revGrowth > 0 ? '+' : '') + revGrowth.toFixed(1) + '%' : '—'}</td>
                            <td className={cn("p-4 font-mono text-right", expGrowth <= 0 ? "text-emerald-500" : "text-rose-500")}>{prev ? (expGrowth > 0 ? '+' : '') + expGrowth.toFixed(1) + '%' : '—'}</td>
                          </tr>);
                      })}
                    </tbody>
                  </table>
                </div>

                {/* График сравнения */}
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
                  <h4 className="text-sm font-semibold text-[var(--fg)] mb-4">Динамика выручки и расходов</h4>
                  <div className="h-[300px]"><ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={periodData.map(p => ({ period: p.period, revenue: p.revenue, expense: p.expense, profit: p.profit }))} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="period" stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="var(--text-muted)" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(v: number) => `${(v/1e6).toFixed(1)}M`} />
                      <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface-inner)', borderColor: 'var(--border)', color: 'var(--fg)', borderRadius: '8px' }} formatter={(v) => `${Number(v).toLocaleString('ru-RU')} ₽`} />
                      <Legend />
                      <Area type="monotone" dataKey="revenue" fill="#10b981" fillOpacity={0.1} stroke="#10b981" name="Выручка" />
                      <Area type="monotone" dataKey="expense" fill="#f43f5e" fillOpacity={0.1} stroke="#f43f5e" name="Расходы" />
                      <Line type="monotone" dataKey="profit" stroke="#6366f1" strokeWidth={2} dot={{fill: '#6366f1'}} name="Прибыль" />
                    </ComposedChart>
                  </ResponsiveContainer></div>
                </div>

                {/* Аномалии */}
                {(() => {
                  const anomalies: string[] = [];
                  for (let i = 1; i < periodData.length; i++) {
                    const prev = periodData[i - 1];
                    const curr = periodData[i];
                    const expGrowth = prev.expense > 0 ? ((curr.expense - prev.expense) / prev.expense * 100) : 0;
                    const revGrowth = prev.revenue > 0 ? ((curr.revenue - prev.revenue) / prev.revenue * 100) : 0;
                    if (expGrowth > revGrowth && expGrowth > 10) {
                      anomalies.push(`⚠️ ${curr.period}: расходы растут быстрее выручки (+${expGrowth.toFixed(1)}% vs +${revGrowth.toFixed(1)}%)`);
                    }
                    if (curr.marginPercent < 5 && curr.marginPercent > 0) {
                      anomalies.push(`🟡 ${curr.period}: низкая маржа (${curr.marginPercent.toFixed(1)}%)`);
                    }
                    if (curr.profit < 0) {
                      anomalies.push(`🔴 ${curr.period}: убыток (${Math.abs(curr.profit).toLocaleString('ru-RU')} ₽)`);
                    }
                  }
                  if (anomalies.length === 0) return null;
                  return (
                    <div className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6">
                      <h4 className="text-sm font-semibold text-amber-500 mb-3 flex items-center"><AlertTriangle className="w-4 h-4 mr-2" /> Выявленные аномалии</h4>
                      <ul className="space-y-2 text-sm text-[var(--text-muted)]">
                        {anomalies.map((a, i) => <li key={i}>{a}</li>)}
                      </ul>
                    </div>);
                })()}
              </>
            ) : <p className="text-[var(--text-muted)] text-center py-8">Нужно минимум 2 периода для сравнения</p>}
          </div>
        )}

        {/* === COMPETITION ANALYSIS === */}
        {reportTab === 'competition' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><Briefcase className="w-5 h-5 mr-2" /> Анализ конкурентного ландшафта</h3>
            
            {/* Top Threats */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
              <h4 className="text-lg font-semibold text-[var(--fg)] mb-4">🔴 Основные конкуренты</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {getTopThreats().slice(0, 6).map((c, i) => (
                  <div key={i} className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface-inner)]/30">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-[var(--fg)]">{c.name}</span>
                      <span className={cn("px-2 py-1 rounded-full text-xs font-medium",
                        c.threatLevel === 'critical' ? 'bg-rose-500/20 text-rose-600' :
                        c.threatLevel === 'high' ? 'bg-orange-500/20 text-orange-600' :
                        'bg-amber-500/20 text-amber-600')}>{c.threatLevel.toUpperCase()}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mb-2">Сегменты: {c.segment.join(', ')}</div>
                    <div className="text-xs text-[var(--text-muted)] mb-2">Ценообразование: {c.pricing}</div>
                    <div className="space-y-1 text-xs">
                      <div className="text-emerald-500">✅ {c.strengths.slice(0, 2).join(', ')}</div>
                      <div className="text-rose-500">❌ {c.weaknesses.slice(0, 2).join(', ')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* GAP Analysis */}
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-6 shadow-sm">
              <h4 className="text-lg font-semibold text-emerald-500 mb-4">🏆 Уникальные преимущества financier.ai</h4>
              <div className="space-y-3">
                {GAP_ANALYSIS.无人满足.map((gap: any, i: number) => (
                  <div key={i} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                    <div className="font-medium text-[var(--fg)] mb-1">{gap.gap}</div>
                    <div className="text-sm text-[var(--text-muted)]">{gap.description}</div>
                    <div className="text-xs text-emerald-500 mt-2">💡 {gap.opportunity}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Roadmap */}
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm">
              <h4 className="text-lg font-semibold text-[var(--fg)] mb-4">📋 План развития (Roadmap)</h4>
              <div className="space-y-3">
                {getPrioritizedTasks().slice(0, 8).map((item, i) => (
                  <div key={i} className="border border-[var(--border)] rounded-xl p-4 bg-[var(--surface-inner)]/20">
                    <div className="flex items-start justify-between mb-1">
                      <span className="font-medium text-[var(--fg)] text-sm">{item.title}</span>
                      <span className={cn("px-2 py-0.5 rounded text-xs font-bold",
                        item.priority === 'P0' ? 'bg-rose-500/20 text-rose-600' :
                        item.priority === 'P1' ? 'bg-orange-500/20 text-orange-600' :
                        'bg-amber-500/20 text-amber-600')}>{item.priority}</span>
                    </div>
                    <div className="text-xs text-[var(--text-muted)] mb-2">{item.description}</div>
                    <div className="text-xs text-indigo-500">Вдохновлено: {item.competitorInspiration}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* === RECOMMENDATIONS === */}
        {reportTab === 'recommendations' && (
          <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6 mt-6">
            <h3 className="text-xl font-semibold text-[var(--fg)] flex items-center"><Sparkles className="w-5 h-5 mr-2" /> AI Рекомендации</h3>
            {aiRecs.length > 0 ? (
              <div className="space-y-4">
                {aiRecs.map((rec, i) => {
                  const borderClass = rec.priority === 'high' ? 'border-l-4 border-l-rose-500 bg-rose-500/5' : rec.priority === 'medium' ? 'border-l-4 border-l-amber-500 bg-amber-500/5' : 'border-l-4 border-l-emerald-500 bg-emerald-500/5';
                  const icon = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
                  return (
                    <div key={i} className={cn("bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5", borderClass)}>
                      <div className="flex items-start">
                        <span className="text-lg mr-3">{icon}</span>
                        <div className="flex-1">
                          <h4 className="font-semibold text-[var(--fg)] mb-1">{rec.title}</h4>
                          <p className="text-sm text-[var(--text-muted)] leading-relaxed">{rec.description}</p>
                          {rec.potentialImpact && <div className="mt-2 text-xs font-medium text-indigo-500">💡 {rec.potentialImpact}</div>}
                        </div>
                      </div>
                    </div>);})}
              </div>)
            : <p className="text-[var(--text-muted)] text-center py-8">Нет рекомендаций</p>}  
          </div>
        )}

        {/* Ключевые инсайты (всегда внизу) */}
        {(recommendations.length > 0 || ratiosData.some(r => r.status === 'critical')) && (
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-6 shadow-sm mt-8">
            <div className="flex items-center mb-4">
              {(healthStatus === 'bad' || ratiosData.some(r => r.status === 'critical')) ? <AlertTriangle className="w-5 h-5 text-rose-500 mr-2" /> : <ShieldCheck className="w-5 h-5 text-emerald-500 mr-2" />}
              <h3 className="text-lg font-semibold text-[var(--fg)]">Ключевые Инсайты</h3>
            </div>
            <ul className="space-y-3">
              {recommendations.length > 0 && recommendations.map((rec, idx) => (
                <li key={idx} className="flex items-start text-sm text-[var(--text-muted)]">
                  <span className="mr-3 text-2xl leading-none opacity-50">&bull;</span>
                  <span className="leading-relaxed"><ReactMarkdown>{rec}</ReactMarkdown></span>
                </li>
              ))}
              {ratiosData.filter(r => r.status === 'critical').map((r, idx) => (
                <li key={`crit-${idx}`} className="flex items-start text-sm">
                  <AlertCircle className="w-4 h-4 mr-2 mt-0.5 shrink-0 text-rose-500" />
                  <span className="leading-relaxed text-[var(--text-muted)]">{r.label}: {r.description}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* AI Section */}
        <div className="mt-12 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 rounded-2xl p-6 shadow-sm text-center lg:text-left">
          <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="flex items-center">
              <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center mr-4 shrink-0">
                <BrainCircuit className="w-7 h-7 text-indigo-400" />
              </div>
              <div className="text-left">
                <h3 className="text-lg font-semibold text-[var(--fg)]">Аудит через Финансового LLM Ассистента</h3>
                <p className="text-sm text-[var(--text-muted)] flex items-center mt-1">Языковая модель проанализирует данные, найдет аномалии и риски.</p>
              </div>
            </div>
            <button onClick={runAI} disabled={isAiLoading}
              className="bg-indigo-500 hover:bg-indigo-600 text-white text-sm px-6 py-3 rounded-xl font-medium transition-colors flex items-center shadow-lg shadow-indigo-500/20 whitespace-nowrap">
              {isAiLoading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Анализ...</> : <><Sparkles className="w-4 h-4 mr-2 text-amber-300" /> Сгенерировать Аудит</>}
            </button>
          </div>
          {aiResult && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 mt-6 text-left relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-3xl pointer-events-none rounded-full" />
              <div className="markdown-body prose dark:prose-invert max-w-none text-sm leading-relaxed relative z-10">
                <ReactMarkdown>{aiResult}</ReactMarkdown>
              </div>
            </div>
          )}
        </div>

        </>
        )}
      </div>
    </div>
  );
}
