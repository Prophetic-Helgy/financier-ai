import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, FileText, BrainCircuit, Calculator, Settings2, Loader2, FileSpreadsheet, Presentation, Wallet, Plus, Trash2, Search, DownloadCloud, X, RotateCcw, SlidersHorizontal, Hash, Type, Landmark, Store } from "lucide-react";
import { FileUploader, FileData } from "../components/FileUploader";
import { parseDocument, ParsedDocument } from "../lib/parsers/bankParsers";
import { expandArchives } from "../lib/parsers/archives";
import { generateHeuristicPresentation, runLocalLLMPresentation } from "../lib/analyticsEngine";
import { cn } from "../lib/utils";
import { PresentationView } from "../components/PresentationView";
import { ReportAvailability } from "../components/ReportAvailability";
import { ExportReports } from "../components/ExportReports";
import { getDefaultConfig, saveConfig, detectLocalLLM, LLMConfig } from "../lib/llmIntegration";
import { MockDashboardView } from "../components/MockDashboardView";
import { LogViewer } from "../components/LogViewer";
import { LedgerView } from "../components/LedgerView";
import { SellerView } from "../components/SellerView";
import { loadStore, saveStore, importDocumentToStore } from "../lib/store/store";
import { createId } from "../lib/store/schema";
import type { LedgerStore, BudgetGoal, Account, FxRate } from "../lib/store/schema";

// recharts (~400КБ) грузится лениво — только при открытии вкладки «Аналитика»
const RichAnalyticsReport = React.lazy(() =>
  import("../components/RichAnalyticsReport").then((m) => ({ default: m.RichAnalyticsReport }))
);

function downloadBlob(_format: string, blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

interface DashboardProps {
  mode: string;
  onBack: () => void;
}

export function Dashboard({ mode, onBack }: DashboardProps) {
  const [documents, setDocuments] = useState<ParsedDocument[]>([]);
  const [activeTab, setActiveTab] = useState<'table' | 'analytics' | 'presentation' | 'reportavail' | 'manual' | 'ledger' | 'export' | 'seller'>('analytics');
  const [presentationResult, setPresentationResult] = useState<string | null>(null);
  const [presentationError, setPresentationError] = useState<string | null>(null);
  const [isGeneratingPres, setIsGeneratingPres] = useState(false);
  // Slide configuration
  const [slideCount, setSlideCount] = useState(5);
  const [slideTopics, setSlideTopics] = useState<string[]>([
    "Финансовая сводка и ключевые метрики",
    "Анализ доходов и расходов",
    "Денежные потоки и ликвидность",
    "Риски и точки роста",
    "Стратегические рекомендации"
  ]);
  const [showSlideConfig, setShowSlideConfig] = useState(false);
  // Ref to trigger file upload from anywhere in the app
  const fileUploaderRef = useRef<{ triggerUpload: () => void } | null>(null);

  const handleTriggerUpload = useCallback(() => {
    if (fileUploaderRef.current) {
      fileUploaderRef.current.triggerUpload();
    }
  }, []);

  // LLM config (auto-detect + cache like Cline)
  const [llmConfig, setLlmConfig] = useState<LLMConfig>(() => getDefaultConfig());
  const [llmModels, setLlmModels] = useState<string[]>([]);
  const [isDetectingLLM, setIsDetectingLLM] = useState(false);

  // --- Manual Entries State (синхронизируются с хранилищем, Фаза 1) ---
  const [activeExportDoc, setActiveExportDoc] = useState<ParsedDocument | null>(null);
  const [manualIncomes, setManualIncomes] = useState<{id: string, name: string, amount: number, freq: string}[]>([]);
  const [manualCredits, setManualCredits] = useState<{id: string, name: string, amount: number, rate: number, scheme: string}[]>([]);
  const [manualAssets, setManualAssets] = useState<{id: string, name: string, value: number, type: string, yieldRate: number}[]>([]);

  // --- Учёт (хранилище, Фаза 1) ---
  const [ledger, setLedger] = useState<LedgerStore | null>(null);
  const [ledgerBusy, setLedgerBusy] = useState(false);
  const [ledgerMsg, setLedgerMsg] = useState<string | null>(null);
  const [importAccountId, setImportAccountId] = useState<string>(''); // Фаза 3.3: счёт назначения при импорте
  const ledgerRef = useRef<LedgerStore | null>(null);

  // Input states
  const [incName, setIncName] = useState(""); const [incAmt, setIncAmt] = useState(""); const [incFreq, setIncFreq] = useState("В месяц");
  const [credName, setCredName] = useState(""); const [credAmt, setCredAmt] = useState(""); const [credRate, setCredRate] = useState(""); const [credScheme, setCredScheme] = useState("Аннуитетный");
  const [assName, setAssName] = useState(""); const [assVal, setAssVal] = useState(""); const [assType, setAssType] = useState("Акции / ЦБ"); const [assYield, setAssYield] = useState("");

  // Сохранить ручные записи в хранилище (после каждого изменения)
  const persistManual = useCallback(async (
    incomes: { id: string; name: string; amount: number; freq: string }[],
    credits: { id: string; name: string; amount: number; rate: number; scheme: string }[],
    assets: { id: string; name: string; value: number; type: string; yieldRate: number }[],
  ) => {
    try {
      const base = ledgerRef.current || (await loadStore());
      const next = structuredClone(base);
      next.manual = { incomes, credits, assets };
      const saved = await saveStore(next);
      ledgerRef.current = saved;
      setLedger(saved);
    } catch (e) {
      console.error('[ledger] Ошибка сохранения ручных записей:', e);
    }
  }, []);

  // Сохранить бюджеты (Фаза 3.4) — тот же паттерн, что и ручные записи
  const persistBudgets = useCallback(async (budgets: BudgetGoal[]) => {
    try {
      const base = ledgerRef.current || (await loadStore());
      const next = structuredClone(base);
      next.budgets = budgets;
      const saved = await saveStore(next);
      ledgerRef.current = saved;
      setLedger(saved);
    } catch (e) {
      console.error('[ledger] Ошибка сохранения бюджетов:', e);
    }
  }, []);

  // Сохранить счета / курсы валют (Фаза 3.3)
  const persistAccounts = useCallback(async (accounts: Account[]) => {
    try {
      const base = ledgerRef.current || (await loadStore());
      const next = structuredClone(base);
      next.accounts = accounts;
      const saved = await saveStore(next);
      ledgerRef.current = saved;
      setLedger(saved);
    } catch (e) {
      console.error('[ledger] Ошибка сохранения счетов:', e);
    }
  }, []);

  const persistFxRates = useCallback(async (fxRates: FxRate[]) => {
    try {
      const base = ledgerRef.current || (await loadStore());
      const next = structuredClone(base);
      next.fxRates = fxRates;
      const saved = await saveStore(next);
      ledgerRef.current = saved;
      setLedger(saved);
    } catch (e) {
      console.error('[ledger] Ошибка сохранения курсов валют:', e);
    }
  }, []);

  const addIncome = () => {
     if(!incName || !incAmt) return;
     const next = [...manualIncomes, { id: createId(), name: incName, amount: Number(incAmt), freq: incFreq }];
     setManualIncomes(next);
     setIncName(""); setIncAmt("");
     void persistManual(next, manualCredits, manualAssets);
  };
  const addCredit = () => {
     if(!credName || !credAmt) return;
     const next = [...manualCredits, { id: createId(), name: credName, amount: Number(credAmt), rate: Number(credRate)||0, scheme: credScheme }];
     setManualCredits(next);
     setCredName(""); setCredAmt(""); setCredRate("");
     void persistManual(manualIncomes, next, manualAssets);
  };
  const addAsset = () => {
     if(!assName || !assVal) return;
     const next = [...manualAssets, { id: createId(), name: assName, value: Number(assVal), type: assType, yieldRate: Number(assYield)||0 }];
     setManualAssets(next);
     setAssName(""); setAssVal(""); setAssYield("");
     void persistManual(manualIncomes, manualCredits, next);
  };
  const deleteIncome = (id: string) => {
     const next = manualIncomes.filter(x => x.id !== id);
     setManualIncomes(next);
     void persistManual(next, manualCredits, manualAssets);
  };
  const deleteCredit = (id: string) => {
     const next = manualCredits.filter(x => x.id !== id);
     setManualCredits(next);
     void persistManual(manualIncomes, next, manualAssets);
  };
  const deleteAsset = (id: string) => {
     const next = manualAssets.filter(x => x.id !== id);
     setManualAssets(next);
     void persistManual(manualIncomes, manualCredits, next);
  };

  // Загрузка хранилища при старте (+ восстановление ручных записей «Активы»)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await loadStore();
        if (cancelled) return;
        ledgerRef.current = s;
        setLedger(s);
        if (s.manual.incomes.length) setManualIncomes(s.manual.incomes);
        if (s.manual.credits.length) setManualCredits(s.manual.credits);
        if (s.manual.assets.length) setManualAssets(s.manual.assets);
      } catch (e) {
        console.error('[ledger] Не удалось загрузить хранилище:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Combined document
  const combinedDocument = useMemo(() => {
     if (documents.length === 0 && manualIncomes.length === 0 && manualCredits.length === 0 && manualAssets.length === 0) return null;
     
      const docType: 'transactions' | 'osv' | 'balance_sheet' | 'invoice' | 'contract' | 'unknown' = documents.length > 0 ? (documents.length > 1 ? 'transactions' : documents[0].docType) : 'unknown';
     const fileName = documents.length > 0 ? (documents.length > 1 ? `Пакет файлов (${documents.length} шт.)` : documents[0].fileName) : 'Учет капитала (Вручную)';

     const combined: ParsedDocument = {
       docType,
       fileName,
       transactions: [],
       rawText: '',
       extractedMetrics: {}
     };
     
     documents.forEach(doc => {
         combined.transactions.push(...doc.transactions);
         combined.rawText += `\n--- ДОКУМЕНТ [${doc.fileName}] ---\n` + doc.rawText;
         if (doc.extractedMetrics) {
            combined.extractedMetrics = { ...combined.extractedMetrics, ...doc.extractedMetrics };
         }
     });

     if (manualAssets.length > 0) {
         combined.extractedMetrics!['Стоимость Активов (вручную)'] = manualAssets.reduce((s, a) => s + a.value, 0);
     }
     
     return combined;
  }, [documents, manualIncomes, manualCredits, manualAssets]);

  const handleTemplatePresentation = () => {
    if (combinedDocument) {
      setPresentationResult(generateHeuristicPresentation(combinedDocument));
      setPresentationError(null);
    }
  };

  /** Reset presentation to generation screen */
  const handleResetPresentation = () => {
    setPresentationResult(null);
    setPresentationError(null);
  };

  // Check if result is an error message
  function isPresentationError(text: string): boolean {
    return text.startsWith('❌') || text.startsWith('⚠️') || (text.includes('Сбой генерации') && text.includes('ИИ'));
  }

  // Use llmConfig instead of lmEndpoint
  const handleLmPresentation = async () => {
    if (!combinedDocument) return;
    setIsGeneratingPres(true);
    setPresentationError(null);
    saveConfig(llmConfig); // Save config
    setPresentationResult("⌛ Генерация отчета-презентации через локальную LLM (LM Studio). Это займет некоторое время...");
    try {
      const res = await runLocalLLMPresentation(combinedDocument, llmConfig.endpoint, slideCount, slideTopics);
      if (isPresentationError(res)) {
        setPresentationError(res);
        setPresentationResult(null);
      } else {
        setPresentationResult(res);
        setPresentationError(null);
      }
    } catch (err: any) {
      setPresentationError(`❌ **Сбой генерации:** ${err.message}`);
      setPresentationResult(null);
    }
    setIsGeneratingPres(false);
  };

  // Auto-detect LM Studio
  const handleDetectLLM = async () => {
    setIsDetectingLLM(true);
    try {
      const result = await detectLocalLLM();
      if (result.available) {
        setLlmConfig(prev => ({ ...prev, endpoint: result.endpoint }));
        if (result.models && result.models.length > 0) {
          setLlmModels(result.models);
        }
      } else {
        alert("LM Studio не обнаружен. Убедитесь что запущен и CORS включён.");
      }
    } catch(e: any) {
      console.error('Detection error:', e);
    } finally {
      setIsDetectingLLM(false);
    }
  };

  const modeConfig: Record<string, { title: string; color: string; desc: string }> = {
    'personal': { title: 'Физлицо', color: 'text-emerald-500', desc: 'Анализ личных финансов и загрузка выписок из банков' },
    'family': { title: 'Семья', color: 'text-cyan-500', desc: 'Учет совместного бюджета и общих расходов' },
    'msb': { title: 'МСБ', color: 'text-indigo-400', desc: 'Аналитика ОСВ и бухгалтерской отчетности' },
    'holding': { title: 'Холдинг', color: 'text-rose-400', desc: 'Консолидация по МСФО и аудит' },
    'selfemployed': { title: 'Самозанятый / ИП', color: 'text-amber-500', desc: 'Аналитика доходов, расчет налогов НПД/УСН, рекомендации' },
    'seller': { title: 'Селлер маркетплейсов', color: 'text-violet-500', desc: 'Unit-экономика, калькулятор цен, ROI рекламы WB/Ozon' }
  };

  const config = modeConfig[mode] || modeConfig['personal'];

  const handleFilesLoaded = async (files: FileData[]) => {
    setPresentationResult(null);
    // DEBUG: log file data
    for (const f of files) {
      const len = f.content?.length || 0;
      const preview = typeof f.content === 'string' ? f.content.substring(0, 150) : '(non-string)';
      const isDataUrl = typeof f.content === 'string' && f.content.startsWith('data:');
      console.log(`[handleFilesLoaded] name=${f.name}, contentLength=${len}, isDataUrl=${isDataUrl}, preview=${preview}`);
    }
    // Фаза 3.1: архивы (ZIP/RAR) распаковываем во вложенные файлы
    const expanded = await expandArchives(files);
    const parsedPromises = expanded.map(f => parseDocument(f.content, f.name));
    const newDocs = await Promise.all(parsedPromises);
    for (const d of newDocs) {
      console.log(`[handleFilesLoaded] parsed: ${d.fileName}, rawTextLength=${d.rawText.length}, transactions=${d.transactions.length}`);
    }
    setDocuments(prev => [...prev, ...newDocs]);
    setActiveTab('analytics');
  };

  const clearDocuments = () => {
    setDocuments([]);
    setPresentationResult(null);
  };

  // --- «Импортировать в учёт» (Фаза 1): документы → хранилище ---
  const handleImportToLedger = useCallback(async () => {
    if (documents.length === 0 || ledgerBusy) return;
    setLedgerBusy(true);
    setLedgerMsg(null);
    try {
      const base = ledgerRef.current || (await loadStore());
      const next = structuredClone(base);
      let added = 0, skipped = 0;
      for (const doc of documents) {
        const r = importDocumentToStore(next, doc, importAccountId || undefined);
        added += r.added;
        skipped += r.skipped;
      }
      const saved = await saveStore(next);
      ledgerRef.current = saved;
      setLedger(saved);
      setLedgerMsg(added > 0
        ? `Импортировано: ${added} новых операций, пропущено ${skipped} (дубликаты / некорректные)`
        : `Новых операций нет (пропущено ${skipped}: дубликаты или некорректные суммы)`);
    } catch (e: any) {
      setLedgerMsg('Ошибка импорта в учёт: ' + (e?.message || e));
    } finally {
      setLedgerBusy(false);
    }
  }, [documents, ledgerBusy, importAccountId]);

  // Перечитать хранилище с диска (после восстановления) и синхронизировать state
  const reloadLedger = useCallback(async () => {
    const s = await loadStore(true);
    ledgerRef.current = s;
    setLedger(s);
    setManualIncomes(s.manual.incomes);
    setManualCredits(s.manual.credits);
    setManualAssets(s.manual.assets);
  }, []);

  const handleLedgerExportBackup = useCallback(async () => {
    const api = window.electronAPI?.store;
    if (!api) return;
    setLedgerMsg(null);
    const res = await api.export();
    if (res?.ok && res.path) setLedgerMsg(`Бэкап сохранён: ${res.path}`);
    else if (res?.error) setLedgerMsg('Ошибка экспорта бэкапа: ' + res.error);
  }, []);

  const handleLedgerRestoreFile = useCallback(async () => {
    const api = window.electronAPI?.store;
    if (!api) return;
    if (!window.confirm('Заменить текущие данные учёта содержимым выбранного файла бэкапа?')) return;
    setLedgerBusy(true);
    setLedgerMsg(null);
    const res = await api.importFile();
    if (res?.ok) {
      await reloadLedger();
      setLedgerMsg('Данные восстановлены из файла');
    } else if (res?.error) {
      setLedgerMsg('Ошибка восстановления: ' + res.error);
    }
    setLedgerBusy(false);
  }, [reloadLedger]);

  const handleLedgerRestoreLatestBackup = useCallback(async () => {
    const api = window.electronAPI?.store;
    if (!api) return;
    const backups = await api.backups();
    if (!backups.length) { setLedgerMsg('Автоматических бэкапов пока нет'); return; }
    if (!window.confirm('Восстановить последний автоматический бэкап? Текущие данные сохранятся как новый бэкап.')) return;
    setLedgerBusy(true);
    setLedgerMsg(null);
    const res = await api.restoreBackup(1);
    if (res?.ok) {
      await reloadLedger();
      setLedgerMsg('Восстановлен последний автоматический бэкап');
    } else if (res?.error) {
      setLedgerMsg('Ошибка восстановления: ' + res.error);
    }
    setLedgerBusy(false);
  }, [reloadLedger]);

  const totalIncome = combinedDocument?.transactions.filter(t => t.type === 'income').reduce((acc, curr) => acc + curr.amount, 0) || 0;
  const totalExpense = combinedDocument?.transactions.filter(t => t.type === 'expense').reduce((acc, curr) => acc + curr.amount, 0) || 0;
  
  const hasTransactions = combinedDocument && combinedDocument.transactions.length > 0;
  const hasAnyData = combinedDocument || manualIncomes.length > 0 || manualCredits.length > 0 || manualAssets.length > 0;

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden">
      {/* Debug Log Viewer */}
      <LogViewer />
      {/* Header */}
      <div className="px-6 lg:px-8 py-4 border-b border-[var(--border)] bg-[var(--surface)] shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="flex items-center text-sm text-[var(--text-muted)] hover:text-[var(--fg)] transition-colors p-2 -ml-2 rounded-lg hover:bg-[var(--surface-inner)]"
            >
              <ArrowLeft className="h-4 w-4 mr-1" /> Назад
            </button>
            <div>
              <h1 className="text-xl font-semibold text-[var(--fg)] tracking-tight">
                <span className={config.color}>{config.title}</span>
              </h1>
              <p className="text-[var(--text-muted)] text-xs mt-0.5">{config.desc}</p>
            </div>
          </div>
          
          {/* Quick Stats in Header */}
          {hasTransactions && (
            <div className="hidden lg:flex items-center gap-6 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-xs">Доходы:</span>
                <span className="text-emerald-500 font-mono font-medium">+{totalIncome.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-xs">Расходы:</span>
                <span className="text-rose-500 font-mono font-medium">-{totalExpense.toLocaleString('ru-RU')} ₽</span>
              </div>
              <div className={cn("px-3 py-1.5 rounded-lg font-mono font-medium text-sm", 
                (totalIncome - totalExpense) >= 0 ? "bg-emerald-500/10 text-emerald-500" : "bg-rose-500/10 text-rose-500")}>
                Итог: {(totalIncome - totalExpense).toLocaleString('ru-RU')} ₽
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0">
        {/* Left Sidebar - Compact */}
        <div className="w-72 shrink-0 border-r border-[var(--border)] bg-[var(--surface)]/50 overflow-y-auto p-4 space-y-4">
          {/* File Upload */}
          <div>
            <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">Импорт</h3>
            <FileUploader onFilesLoaded={handleFilesLoaded} modeColorClass={config.color} ref={fileUploaderRef} />
          </div>

          {/* Loaded Documents */}
          {documents.length > 0 && (
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">Файлы ({documents.length})</h3>
                <button onClick={clearDocuments} className="text-[10px] text-rose-500 hover:text-rose-400">Очистить</button>
              </div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                {documents.map((doc, i) => (
                  <div key={i} className="p-2 bg-[var(--surface-inner)] border border-[var(--border)] rounded-lg flex items-center gap-2">
                    <FileText className={cn("h-3.5 w-3.5 shrink-0", config.color)} />
                    <div className="overflow-hidden min-w-0">
                      <div className="text-xs font-medium text-[var(--fg)] truncate">{doc.fileName}</div>
                      <div className="text-[10px] text-[var(--text-muted)]">
                        {doc.transactions.length > 0 ? `${doc.transactions.length} оп.` : `~${Math.floor(doc.rawText.length/1000)}kb`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Импорт в учёт (Фаза 1) */}
          {documents.length > 0 && (
            <>
              {ledger && ledger.accounts.length > 1 && (
                <select
                  value={importAccountId || ledger.accounts[0].id}
                  onChange={e => setImportAccountId(e.target.value)}
                  className="w-full bg-[var(--surface-inner)] border border-[var(--border)] rounded-md text-[11px] text-[var(--fg)] px-2 py-1.5 mb-1.5"
                  title="Счёт, в который импортировать операции (валюта операций = валюта счёта)"
                >
                  {ledger.accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              )}
              <button
                onClick={handleImportToLedger}
                disabled={ledgerBusy}
                className="w-full flex items-center justify-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-3 py-2 rounded-md hover:bg-indigo-500/20 transition-colors text-[11px] font-medium disabled:opacity-50"
                title="Сохранить операции загруженных документов в локальном хранилище"
              >
                <Landmark className="w-3 h-3" />
                {ledgerBusy ? 'Импорт...' : 'Импортировать в учёт'}
              </button>
            </>
          )}
          {ledgerMsg && (
            <div className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-inner)] rounded p-1.5 leading-snug">{ledgerMsg}</div>
          )}

          {/* LM Studio - Collapsible */}
          <div className="border-t border-[var(--border)] pt-4">
            <details className="group">
              <summary className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] cursor-pointer flex items-center justify-between list-none">
                <span>🤖 LM Studio</span>
                <span className="group-open:rotate-90 transition-transform">▶</span>
              </summary>
              <div className="mt-3 space-y-2.5">
                <button 
                  onClick={handleDetectLLM}
                  disabled={isDetectingLLM}
                  className="w-full flex items-center justify-center gap-1.5 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 px-3 py-2 rounded-md hover:bg-indigo-500/20 transition-colors text-[11px] font-medium"
                >
                  <Search className="w-3 h-3" />
                  {isDetectingLLM ? 'Поиск...' : 'Автообнаружение'}
                </button>
                <div className="relative">
                  <Settings2 className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--text-muted)]" />
                  <input 
                    type="text" 
                    value={llmConfig.endpoint} 
                    onChange={(e) => setLlmConfig({ ...llmConfig, endpoint: e.target.value })}
                    onBlur={() => saveConfig(llmConfig)}
                    className="w-full bg-[var(--surface-inner)] border border-[var(--border)] rounded-md pl-8 pr-2 py-1.5 text-[11px] outline-none font-mono text-[var(--fg)] focus:border-indigo-500 transition-colors"
                    placeholder="endpoint url"
                  />
                </div>
                <input 
                  type="text" 
                  value={llmConfig.model || 'GLM 4.6v Flash'} 
                  onChange={(e) => setLlmConfig({ ...llmConfig, model: e.target.value })}
                  onBlur={() => saveConfig(llmConfig)}
                  className="w-full bg-[var(--surface-inner)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-[11px] outline-none font-mono text-[var(--fg)] focus:border-indigo-500 transition-colors"
                  placeholder="model name"
                />
                {llmModels.length > 0 && (
                  <div className="text-[10px] text-[var(--text-muted)] bg-[var(--surface-inner)] rounded p-1.5">
                    Модели: <span className="text-indigo-400">{llmModels.join(', ')}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-[10px] text-emerald-500">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                  Подключено
                </div>
              </div>
            </details>
          </div>
        </div>

        {/* Main Content Area (Right) */}
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--surface)]">
          {/* Tab Navigation - Compact Pills */}
          <div className="px-4 py-2.5 border-b border-[var(--border)] bg-[var(--surface-inner)]/30 shrink-0 flex items-center gap-1">
            {([
              { key: 'analytics', icon: BrainCircuit, label: 'Аналитика' },
              { key: 'table', icon: FileSpreadsheet, label: 'Таблица' },
              { key: 'presentation', icon: Presentation, label: 'Презентация' },
            { key: 'reportavail', icon: Calculator, label: 'Отчеты' },
              { key: 'manual', icon: Wallet, label: 'Активы' },
              { key: 'ledger', icon: Landmark, label: 'Учёт' },
              { key: 'export', icon: DownloadCloud, label: 'Экспорт' },
              ...(mode === 'seller' ? [{ key: 'seller', icon: Store, label: 'Селлер' }] : []),
            ] as const).map(tab => (
              <button 
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1.5 shrink-0",
                  activeTab === tab.key
                    ? cn("bg-[var(--bg)] shadow-sm border border-[var(--border)]", config.color)
                    : "text-[var(--text-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-inner)]"
                )}
              >
                <tab.icon className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden relative">
            {activeTab === 'reportavail' ? (
              <ReportAvailability documents={documents} profile={mode as any} />
            ) : !hasAnyData && activeTab === 'analytics' ? (
              <MockDashboardView mode={mode} onUploadClick={handleTriggerUpload} />
            ) : !hasAnyData && activeTab !== 'manual' && activeTab !== 'analytics' && activeTab !== 'ledger' && activeTab !== 'seller' ? (
              <div className="h-full flex flex-col items-center justify-center text-[var(--text-muted)] p-8 text-center">
                <FileText className="w-12 h-12 mb-4 opacity-20" />
                <span className="text-base font-medium">Данные для аналитики отсутствуют</span>
                <span className="text-sm mt-2">Загрузите файлы выписок или добавьте доходы вручную</span>
                <span className="text-xs mt-2 text-[var(--text-muted)]/60">Перейдите на вкладку «Аналитика» для демонстрации функционала</span>
              </div>
            ) : (
              <>
                {/* Table View */}
                {activeTab === 'table' && combinedDocument && (
                  <div className="h-full overflow-auto bg-[var(--surface-inner)]/20">
                     {hasTransactions ? (
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="bg-[var(--surface-inner)] text-[10px] uppercase tracking-wider text-[var(--text-muted)] sticky top-0 shadow-sm z-10">
                              <th className="px-4 py-3 font-medium border-b border-[var(--border)]">Дата</th>
                              <th className="px-4 py-3 font-medium border-b border-[var(--border)]">Тип</th>
                              <th className="px-4 py-3 font-medium border-b border-[var(--border)]">Контрагент / Назначение</th>
                              <th className="px-4 py-3 font-medium text-right border-b border-[var(--border)]">Сумма</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-[var(--border)]">
                            {combinedDocument.transactions.map((tx, idx) => (
                              <tr key={idx} className="hover:bg-[var(--surface-inner)]/50 transition-colors">
                                <td className="px-4 py-2.5 text-sm text-[var(--fg)] font-mono whitespace-nowrap">{tx.date}</td>
                                <td className="px-4 py-2.5 text-sm">
                                  {tx.type === "income" 
                                    ? <span className="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs">Доход</span>
                                    : <span className="px-2 py-0.5 rounded bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs">Расход</span>
                                  }
                                </td>
                                <td className="px-4 py-2.5">
                                  <div className="text-sm font-medium text-[var(--fg)]">{tx.type === 'expense' ? tx.payee : tx.payer}</div>
                                  <div className="text-xs text-[var(--text-muted)] truncate max-w-sm" title={tx.purpose}>{tx.purpose}</div>
                                </td>
                                <td className={cn(
                                    "px-4 py-2.5 text-sm font-mono text-right whitespace-nowrap",
                                    tx.type === "income" ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--fg)]"
                                  )}>
                                  {tx.type === 'income' ? '+' : '-'}{tx.amount.toLocaleString('ru-RU')} ₽
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                     ) : (
                        <div className="h-full p-6 flex flex-col">
                           <div className="flex items-center text-[var(--fg)] mb-4 shrink-0">
                              <FileSpreadsheet className="w-8 h-8 mr-4 text-indigo-500" />
                              <div>
                                 <h3 className="font-semibold">{combinedDocument.docType === 'osv' ? "ОСВ" : combinedDocument.docType === 'balance_sheet' ? "Баланс" : "Документы"}</h3>
                                 <p className="text-xs text-[var(--text-muted)] mt-1">Транзакций не найдено. Используйте вкладку Аналитики для анализа.</p>
                              </div>
                           </div>
                           <div className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded p-4 overflow-auto min-h-0">
                               <pre className="text-xs font-mono text-[var(--text-muted)] whitespace-pre-wrap">{combinedDocument.rawText}</pre>
                           </div>
                        </div>
                     )}
                  </div>
                )}

                {/* Analytics View */}
                {activeTab === 'analytics' && combinedDocument && (
                  <div className="h-full overflow-y-auto p-6">
                    <React.Suspense fallback={<div className="flex justify-center p-10 text-[var(--text-muted)]"><Loader2 className="animate-spin" /></div>}>
                      <RichAnalyticsReport document={combinedDocument} themeColor={config.color} />
                    </React.Suspense>
                  </div>
                )}

                {/* Presentation View */}
                {activeTab === 'presentation' && combinedDocument && (
                   <div className="h-full flex flex-col overflow-hidden">
                      {/* Error state */}
                      {presentationError ? (
                        <div className="flex-1 flex flex-col justify-center items-center p-8">
                          <div className="max-w-lg w-full">
                            <div className="flex items-center justify-between mb-4">
                              <h2 className="text-lg font-semibold text-rose-500">Ошибка генерации</h2>
                              <button onClick={handleResetPresentation} className="p-2 hover:bg-[var(--surface-inner)] rounded-lg transition-colors" title="Закрыть ошибку">
                                <X className="w-4 h-4 text-[var(--text-muted)]" />
                              </button>
                            </div>
                            <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 mb-6">
                              <pre className="text-sm text-rose-400 whitespace-pre-wrap font-sans">{presentationError}</pre>
                            </div>
                            <div className="flex gap-3">
                              <button 
                                onClick={handleResetPresentation}
                                className="flex items-center gap-2 px-4 py-2.5 bg-[var(--surface-inner)] border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] hover:bg-[var(--surface)] transition-colors"
                              >
                                <RotateCcw className="w-4 h-4" /> Попробовать снова
                              </button>
                              <button 
                                onClick={handleTemplatePresentation}
                                className="flex items-center gap-2 px-4 py-2.5 bg-sky-500/10 border border-sky-500/30 rounded-lg text-sm text-sky-400 hover:bg-sky-500/20 transition-colors"
                              >
                                <Calculator className="w-4 h-4" /> Офлайн формат
                              </button>
                            </div>
                          </div>
                        </div>
                      ) : !presentationResult ? (
                          <div className="flex-1 flex flex-col justify-center items-center p-8">
                             <div className="text-center mb-8">
                                <h2 className="text-xl font-semibold text-[var(--fg)] mb-1">Конструктор Презентаций</h2>
                                <p className="text-[var(--text-muted)] text-sm">Выберите механизм генерации:</p>
                             </div>

                             {/* Slide Configuration Toggle */}
                             <button 
                               onClick={() => setShowSlideConfig(!showSlideConfig)}
                               className="flex items-center gap-2 mb-6 px-4 py-2 text-sm text-[var(--text-muted)] hover:text-[var(--fg)] hover:bg-[var(--surface-inner)] rounded-lg transition-colors"
                             >
                               <SlidersHorizontal className="w-4 h-4" />
                               {showSlideConfig ? 'Скрыть' : 'Настройки'} слайдов
                             </button>

                             {/* Slide Configuration Panel */}
                             {showSlideConfig && (
                               <div className="max-w-lg w-full mb-6 bg-[var(--surface-inner)]/50 border border-[var(--border)] rounded-xl p-4 space-y-4">
                                 {/* Slide Count */}
                                 <div>
                                   <label className="flex items-center gap-2 text-xs font-medium text-[var(--fg)] mb-2">
                                     <Hash className="w-3.5 h-3.5" /> Количество слайдов
                                   </label>
                                   <div className="flex items-center gap-3">
                                     <input 
                                       type="range" min={3} max={15} value={slideCount} 
                                       onChange={(e) => {
                                         const newCount = parseInt(e.target.value);
                                         setSlideCount(newCount);
                                         // Adjust topics array to match new count
                                         const newTopics = [...slideTopics];
                                         while (newTopics.length < newCount) {
                                           newTopics.push(`Слайд ${newTopics.length + 1}`);
                                         }
                                         setSlideTopics(newTopics.slice(0, newCount));
                                       }}
                                       className="flex-1 accent-indigo-500"
                                     />
                                     <span className="text-sm font-mono text-[var(--fg)] w-6 text-center">{slideCount}</span>
                                   </div>
                                 </div>
                                 {/* Slide Topics */}
                                 <div>
                                   <label className="flex items-center gap-2 text-xs font-medium text-[var(--fg)] mb-2">
                                     <Type className="w-3.5 h-3.5" /> Темы слайдов
                                   </label>
                                   <div className="space-y-2 max-h-48 overflow-y-auto">
                                     {slideTopics.map((topic, i) => (
                                       <div key={i} className="flex items-center gap-2">
                                         <span className="text-xs text-[var(--text-muted)] w-5 text-right">{i + 1}.</span>
                                         <input 
                                           type="text" 
                                           value={topic} 
                                           onChange={(e) => {
                                             const newTopics = [...slideTopics];
                                             newTopics[i] = e.target.value;
                                             setSlideTopics(newTopics);
                                           }}
                                           className="flex-1 bg-[var(--bg)] border border-[var(--border)] rounded-md px-2.5 py-1.5 text-xs outline-none text-[var(--fg)] focus:border-indigo-500 transition-colors"
                                           placeholder={`Тема слайда ${i + 1}`}
                                         />
                                       </div>
                                     ))}
                                   </div>
                                 </div>
                               </div>
                             )}

                             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-lg">
                                <button 
                                   onClick={handleTemplatePresentation}
                                   className="flex flex-col items-center justify-center border border-[var(--border)] p-6 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-all hover:scale-[1.02] shadow-sm"
                                >
                                   <Calculator className="w-8 h-8 mb-3 text-sky-500" />
                                   <span className="font-medium text-[var(--fg)] text-sm">Офлайн Формат</span>
                                   <span className="text-[11px] text-[var(--text-muted)] mt-1">Генерация из шаблона</span>
                                </button>
                                <button 
                                   onClick={handleLmPresentation}
                                   disabled={isGeneratingPres}
                                   className="flex flex-col items-center justify-center border border-[var(--border)] p-6 rounded-xl bg-[var(--surface)] hover:bg-[var(--surface-inner)] transition-all hover:scale-[1.02] shadow-sm"
                                >
                                   {isGeneratingPres ? <Loader2 className="w-8 h-8 mb-3 text-indigo-500 animate-spin" /> : <Presentation className="w-8 h-8 mb-3 text-indigo-500" />}
                                   <span className="font-medium text-[var(--fg)] text-sm">ИИ-Отчет</span>
                                   <span className="text-[11px] text-[var(--text-muted)] mt-1">Через LLM (LM Studio)</span>
                                </button>
                             </div>
                          </div>
                      ) : (
                         <div className="flex-1 flex flex-col overflow-hidden">
                           {/* Back button */}
                           <div className="flex items-center justify-between px-4 py-2 border-b border-[var(--border)] shrink-0">
                             <button 
                               onClick={handleResetPresentation}
                               className="flex items-center gap-2 text-xs text-[var(--text-muted)] hover:text-[var(--fg)] transition-colors"
                             >
                               <RotateCcw className="w-3.5 h-3.5" /> Вернуться к генерации
                             </button>
                           </div>
                           {/* Scrollable presentation content */}
                           <div className="flex-1 overflow-y-auto overflow-x-auto">
                             <div className="min-w-[800px] py-4 px-4">
                               <PresentationView markdown={presentationResult} />
                             </div>
                           </div>
                         </div>
                      )}
                   </div>
                )}

                {/* Ledger View */}
                {activeTab === 'ledger' && (ledger ? (
                  <LedgerView
                    store={ledger}
                    busy={ledgerBusy}
                    onExportBackup={handleLedgerExportBackup}
                    onRestoreFile={handleLedgerRestoreFile}
                    onRestoreLatestBackup={handleLedgerRestoreLatestBackup}
                    onBudgetsChange={(b) => void persistBudgets(b)}
                    onAccountsChange={(a) => void persistAccounts(a)}
                    onFxRatesChange={(r) => void persistFxRates(r)}
                  />
                ) : (
                  <div className="h-full flex items-center justify-center text-[var(--text-muted)] text-sm">
                    Загрузка хранилища...
                  </div>
                ))}

                {/* Export View */}
                {activeTab === 'export' && combinedDocument && (
                  <div className="h-full overflow-y-auto p-6">
                    <ExportReports document={combinedDocument} onExport={downloadBlob} />
                  </div>
                )}

                {/* Seller View (только профиль «Селлер маркетплейсов») */}
                {activeTab === 'seller' && (
                  <SellerView document={combinedDocument} />
                )}

                {/* Manual View */}
                {activeTab === 'manual' && (
                   <div className="h-full overflow-y-auto p-6 lg:p-8">
                      <div className="max-w-3xl mx-auto">
                          <h2 className="text-xl font-semibold text-[var(--fg)] mb-6">Учет Активов и Доходов</h2>

                          <div className="space-y-4">
                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                                  <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center">
                                      <ArrowUpRight className="w-4 h-4 mr-2 text-emerald-500" />
                                      <h3 className="font-semibold text-sm text-[var(--fg)]">Постоянные доходы</h3>
                                  </div>
                                  <div className="p-4">
                                      <div className="flex flex-wrap gap-2">
                                          <input type="text" placeholder="Название (Зарплата)" className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs flex-1 min-w-[160px] outline-none text-[var(--fg)]" value={incName} onChange={e => setIncName(e.target.value)} />
                                          <input type="number" placeholder="Сумма ₽" className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs w-28 outline-none text-[var(--fg)]" value={incAmt} onChange={e => setIncAmt(e.target.value)} />
                                          <select className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs outline-none text-[var(--fg)]" value={incFreq} onChange={e => setIncFreq(e.target.value)}>
                                              <option>В месяц</option>
                                              <option>В неделю</option>
                                              <option>Разово</option>
                                          </select>
                                          <button className="bg-emerald-500 text-white rounded-md px-4 py-2 text-xs font-medium hover:bg-emerald-600 transition-colors" onClick={addIncome}>+ Добавить</button>
                                      </div>
                                      {manualIncomes.length > 0 && (
                                        <div className="mt-3 space-y-1.5">
                                          {manualIncomes.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between bg-[var(--surface-inner)] rounded-md px-3 py-2 text-xs">
                                              <span className="text-[var(--fg)]">{item.name}</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-emerald-500 font-mono">{item.amount.toLocaleString('ru-RU')} ₽ / {item.freq}</span>
                                                <button className="text-[var(--text-muted)] hover:text-rose-500 transition-colors" title="Удалить" onClick={() => deleteIncome(item.id)}>×</button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                              </div>

                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                                  <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center">
                                      <ArrowDownRight className="w-4 h-4 mr-2 text-rose-500" />
                                      <h3 className="font-semibold text-sm text-[var(--fg)]">Расходы и кредиты</h3>
                                  </div>
                                  <div className="p-4">
                                      <div className="flex flex-wrap gap-2">
                                          <input type="text" placeholder="Название (Аренда)" className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs flex-1 min-w-[160px] outline-none text-[var(--fg)]" value={credName} onChange={e => setCredName(e.target.value)} />
                                          <input type="number" placeholder="Сумма ₽" className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs w-28 outline-none text-[var(--fg)]" value={credAmt} onChange={e => setCredAmt(e.target.value)} />
                                          <select className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs outline-none text-[var(--fg)]" value={credScheme} onChange={e => setCredScheme(e.target.value)}>
                                              <option>Аннуитетный</option>
                                              <option>Дифференцированный</option>
                                          </select>
                                          <button className="bg-rose-500 text-white rounded-md px-4 py-2 text-xs font-medium hover:bg-rose-600 transition-colors" onClick={addCredit}>+ Добавить</button>
                                      </div>
                                      {manualCredits.length > 0 && (
                                        <div className="mt-3 space-y-1.5">
                                          {manualCredits.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between bg-[var(--surface-inner)] rounded-md px-3 py-2 text-xs">
                                              <span className="text-[var(--fg)]">{item.name}</span>
                                              <div className="flex items-center gap-2">
                                                <span className="text-rose-500 font-mono">{item.amount.toLocaleString('ru-RU')} ₽ · {item.scheme}</span>
                                                <button className="text-[var(--text-muted)] hover:text-rose-500 transition-colors" title="Удалить" onClick={() => deleteCredit(item.id)}>×</button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                              </div>

                              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden shadow-sm">
                                  <div className="px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-inner)]/50 flex items-center">
                                      <Wallet className="w-4 h-4 mr-2 text-amber-500" />
                                      <h3 className="font-semibold text-sm text-[var(--fg)]">Активы</h3>
                                  </div>
                                  <div className="p-4">
                                      <div className="flex flex-wrap gap-2">
                                          <input type="text" placeholder="Объект (Квартира)" className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs flex-1 min-w-[160px] outline-none text-[var(--fg)]" value={assName} onChange={e => setAssName(e.target.value)} />
                                          <input type="number" placeholder="Стоимость ₽" className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs w-32 outline-none text-[var(--fg)]" value={assVal} onChange={e => setAssVal(e.target.value)} />
                                          <select className="bg-[var(--bg)] border border-[var(--border)] rounded-md px-3 py-2 text-xs outline-none text-[var(--fg)]" value={assType} onChange={e => setAssType(e.target.value)}>
                                              <option>Недвижимость</option>
                                              <option>Акции / ЦБ</option>
                                              <option>Транспорт</option>
                                              <option>Бизнес</option>
                                          </select>
                                          <button className="bg-amber-500 text-white rounded-md px-4 py-2 text-xs font-medium hover:bg-amber-600 transition-colors" onClick={addAsset}>+ Добавить</button>
                                      </div>
                                      {manualAssets.length > 0 && (
                                        <div className="mt-3 space-y-1.5">
                                          {manualAssets.map((item, i) => (
                                            <div key={i} className="flex items-center justify-between bg-[var(--surface-inner)] rounded-md px-3 py-2 text-xs">
                                              <div>
                                                <span className="text-[var(--fg)]">{item.name}</span>
                                                <span className="text-[var(--text-muted)] ml-2">({item.type})</span>
                                              </div>
                                              <div className="flex items-center gap-2">
                                                <span className="text-amber-500 font-mono">{item.value.toLocaleString('ru-RU')} ₽</span>
                                                <button className="text-[var(--text-muted)] hover:text-rose-500 transition-colors" title="Удалить" onClick={() => deleteAsset(item.id)}>×</button>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                  </div>
                              </div>
                          </div>
                      </div>
                   </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
