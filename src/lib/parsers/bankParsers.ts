import { parseBankStatement } from "./bankProfiles";
import { looksLikeScan, canOcr, ocrPdfScanPages } from "../ocr/ocr";

// Тяжёлые библиотеки (xlsx ~450КБ, pdfjs-dist, mammoth, tesseract.js) грузим лениво —
// они вынесены из основного чанка и загружаются при первом парсинге документа.
let pdfjsPromise: Promise<typeof import("pdfjs-dist")> | null = null;
function getPdfjs() {
  if (!pdfjsPromise) {
    // ?url-импорт внутри: вне Vite (tsx-тесты) модуль не трогаем без PDF
    pdfjsPromise = Promise.all([
      import("pdfjs-dist"),
      import("../pdf.worker.min.js?url").then((m) => m.default),
    ]).then(([pdfjsLib, pdfWorker]) => {
      // Setup PDF worker using local file (works in Electron)
      if (pdfjsLib.GlobalWorkerOptions) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
      }
      return pdfjsLib;
    });
  }
  return pdfjsPromise;
}

export interface ParsedTransaction {
  date: string;
  amount: number;
  payer: string;
  payee: string;
  purpose: string;
  type: "income" | "expense";
  account: string; 
}

export interface ParsedDocument {
  docType: "transactions" | "osv" | "balance_sheet" | "invoice" | "contract" | "unknown";
  transactions: ParsedTransaction[];
  rawText: string;
  fileName: string;
  extractedMetrics?: Record<string, number>;
  /** Фаза 3.2: документ — скан, текст извлечён OCR (tesseract.js, rus) */
  ocrUsed?: boolean;
}

function extractMetricsFromText(text: string): Record<string, number> {
  const metrics: Record<string, number> = {};
  
  // Specific Balance Sheet rules
  if (text.toLowerCase().includes('баланс') || text.includes('1600') || text.includes('1700')) {
     const patterns = [
        { key: 'Внеоборотные активы', regex: /Внеоборотные\s*активы[^\d\n]*?([\d\s]{3,})/i },
        { key: 'Оборотные активы', regex: /Оборотные\s*активы[^\d\n]*?([\d\s]{3,})/i },
        { key: 'Капитал и резервы', regex: /Капитал\s*и\s*резервы[^\d\n]*?([\d\s]{3,})/i },
        { key: 'Долгосрочные обязательства', regex: /Долгосрочные\s*обязательства[^\d\n]*?([\d\s]{3,})/i },
        { key: 'Краткосрочные обязательства', regex: /Краткосрочные\s*обязательства[^\d\n]*?([\d\s]{3,})/i }
     ];
     patterns.forEach(p => {
       const m = text.match(p.regex);
       if (m && m[1]) {
           const val = parseInt(m[1].replace(/\s/g, ''), 10);
           if (!isNaN(val) && val > 0) metrics[p.key] = val;
       }
     });
  }

  // Generic extraction for keywords in lines
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
     const line = lines[i].trim();
     if (line.length > 80 || line.length < 5) continue;
     
     const m = line.match(/(Итого|Всего|Сумма|К оплате|Сальдо|Сальдо на конец|Сальдо на начало|Прибыль|Убыток|Обороты).+?([\d\s]+[,|\.]?\d{0,2})\s*(руб|₽|USD|EUR|$)/i);
     if (m && m[1] && m[2]) {
        let key = line.replace(m[2], '').replace(m[3] || '', '').trim();
        key = key.replace(/[\.:]$/, '').trim();
        key = key.length > 30 ? m[1] : key;
        
        const val = parseFloat(m[2].replace(/\s/g, '').replace(',', '.'));
        if (!isNaN(val) && val > 0 && !metrics[key]) {
            metrics[key] = val;
        }
     }
  }

  return metrics;
}

export async function parseDocument(fileUrl: string, fileName: string): Promise<ParsedDocument> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  
  // DEBUG: log content info
  const contentPreview = typeof fileUrl === 'string' ? fileUrl.substring(0, 200) : '(non-string)';
  const contentLength = typeof fileUrl === 'string' ? fileUrl.length : 0;
  const isDataUrl = typeof fileUrl === 'string' && fileUrl.startsWith('data:');
  console.log(`[parseDocument] fileName=${fileName}, ext=${ext}, contentLength=${contentLength}, isDataUrl=${isDataUrl}, preview=${contentPreview}`);
  
  const result: ParsedDocument = {
    docType: "unknown",
    transactions: [],
    rawText: "",
    fileName,
    extractedMetrics: {}
  };

  try {
    // If content is empty, fail early with a clear message
    if (contentLength === 0) {
      result.rawText = `[ERROR] Файл "${fileName}" пуст (0 байт) при загрузке!`;
      console.error(`[parseDocument] EMPTY CONTENT for ${fileName}`);
      return result;
    }

    if (ext === 'pdf') {
      const pdf = await extractPdfText(fileUrl);
      result.rawText = pdf.text;
      result.ocrUsed = pdf.ocrUsed;
      // Try to parse OSV/Карточка счета from PDF text (включая OCR-текст сканов)
      const osvTransactions = parseOSVFromPDF(result.rawText);
      if (osvTransactions.length > 0) {
        result.transactions = osvTransactions;
      }
    } else if (ext === 'xls' || ext === 'xlsx') {
      const { text, transactions, excelMetrics } = await extractExcelData(fileUrl, ext, fileName);
      result.rawText = text;
      result.transactions = transactions;
      if (excelMetrics) {
        result.extractedMetrics = { ...excelMetrics };
      }
    } else if (ext === 'docx') {
      const docxText = await extractDocxText(fileUrl);
      result.rawText = docxText;
    } else if (ext === 'doc') {
      const docText = await extractDocText(fileUrl);
      result.rawText = docText;
    } else {
      let text = fileUrl;
      if (fileUrl.startsWith('data:')) {
         const base64str = fileUrl.split(',')[1];
         text = atob(base64str);
         try { text = decodeURIComponent(escape(text)); } catch(e){}
      }
      result.rawText = text.substring(0, 150000);
      if (ext === 'txt' || ext === 'csv' || ext === 'tsv') {
        // Фаза 3.1: выписки банков РФ (Сбер, Т-Банк, Альфа, ВТБ) — по строке
        // заголовков; если похожих транзакций мало, пробуем формат 1С-экспорта.
        const bs = parseBankStatement(text, fileName);
        if (bs.transactions.length >= 3) {
          result.transactions = bs.transactions;
        } else if (ext === 'txt' || ext === 'csv') {
          result.transactions = parse1CClientBank(result.rawText);
        }
      }
    }

    const lowerText = result.rawText.toLowerCase();
    
    if (result.transactions.length > 5) {
       result.docType = "transactions";
    } else if (lowerText.includes('оборотно-сальдовая') || lowerText.includes('сальдо на начало')) {
       result.docType = "osv";
    } else if (lowerText.includes('бухгалтерский баланс') || lowerText.includes('расшифровки баланса') || lowerText.includes('форма по окуд 0710001')) {
       result.docType = "balance_sheet";
    } else if (lowerText.includes('декларация') || lowerText.includes('усн') || lowerText.includes('налог')) {
       result.docType = "invoice";
    } else if (lowerText.includes('договор') && !lowerText.includes('декларация') && !lowerText.includes('баланс')) {
       result.docType = "contract";
    } else if (lowerText.includes('счет на оплату') || lowerText.includes('инвойс') || lowerText.includes('invoice')) {
       result.docType = "invoice";
    } else if (result.transactions.length > 0) {
       result.docType = "transactions";
    }
    
    if (result.transactions.length < 5) {
        const textMetrics = extractMetricsFromText(result.rawText);
        result.extractedMetrics = { ...result.extractedMetrics, ...textMetrics };
    }

    return result;
  } catch (err) {
    console.error("Parse error:", err);
    result.rawText = `Error parsing document: ${fileName}`;
    return result;
  }
}

async function extractPdfText(dataUrl: string): Promise<{ text: string; ocrUsed: boolean }> {
  try {
    let buffer: Uint8Array | ArrayBuffer;

    if (typeof window !== 'undefined' && dataUrl.startsWith('data:')) {
      const base64str = dataUrl.split(',')[1] || '';
      const byteChars = atob(base64str);
      const byteArr = new Uint8Array(byteChars.length);
      for (let i = 0; i < byteChars.length; i++) byteArr[i] = byteChars.charCodeAt(i);
      buffer = byteArr.buffer as ArrayBuffer;
    } else if (typeof Buffer !== 'undefined' && dataUrl.startsWith('data:')) {
      const base64str = dataUrl.split(',')[1] || '';
      buffer = Buffer.from(base64str, 'base64');
    } else {
      try {
        const response = await fetch(dataUrl);
        buffer = await response.arrayBuffer();
      } catch {
        return { text: "Error reading PDF", ocrUsed: false };
      }
    }

    const pdfjsLib = await getPdfjs();
    const doc = await pdfjsLib.getDocument({ data: buffer }).promise;

    // Фаза 3.2: собираем текст послойно — страницы без текстового слоя
    // помечаем как сканы, чтобы потом прогнать их через OCR
    const pageTexts: string[] = [];
    const scanPages: number[] = [];
    for (let i = 1; i <= Math.min(doc.numPages, 50); i++) {
      try {
        const page = await doc.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item: any) => item.str).filter(s => s && s.trim());
        const pageText = strings.join(" ");
        if (looksLikeScan(pageText)) scanPages.push(i);
        pageTexts.push(pageText);
      } catch {
        pageTexts.push("");
      }
    }

    let ocrUsed = false;
    if (scanPages.length > 0) {
      if (canOcr()) {
        try {
          console.log(`[OCR] ${scanPages.length} стр. без текстового слоя → OCR (рус)`);
          const ocrTexts = await ocrPdfScanPages(doc, scanPages, m => console.log(`[OCR] ${m}`));
          ocrUsed = ocrTexts.size > 0;
          for (const [n, text] of ocrTexts) pageTexts[n - 1] = text;
        } catch (e: any) {
          console.error('[OCR] Ошибка распознавания скана:', e?.message || e);
        }
      } else {
        console.warn('[parseDocument] Скан-PDF: OCR недоступен в этом окружении (нет DOM)');
      }
    }

    return { text: pageTexts.join("\n").substring(0, 150000), ocrUsed };
  } catch(e: any) {
    console.error('PDF extract error:', e?.message || e);
    return { text: "Error reading PDF (binary format not supported in this environment)", ocrUsed: false };
  }
}

async function extractExcelData(dataUrl: string, ext?: string, fileName?: string): Promise<{text: string, transactions: ParsedTransaction[], excelMetrics: Record<string, number>}> {
    const XLSX = await import("xlsx");
    const base64str = dataUrl.split(',')[1] || dataUrl;
    
    // Для старых бинарных xls используем библиотеку xls как fallback
    let workbook: any;
    if (ext === 'xls') {
      // Use SheetJS (xlsx) for binary .xls files — it supports BIFF format
      try {
        const binaryBuffer = base64ToBuffer(base64str) as Buffer;
        workbook = XLSX.read(binaryBuffer, { type: 'buffer', cellStyles: true });
        console.log(`[extractExcelData] SheetJS parsed .xls: ${workbook.SheetNames.length} sheets`);
      } catch (err) {
        console.warn('[extractExcelData] SheetJS buffer failed, trying base64:', err);
        workbook = XLSX.read(base64str, { type: 'base64', cellStyles: true });
      }
    } else {
      workbook = XLSX.read(base64str, { type: 'base64' });
    }
    
    let fullText = "";
    const transactions: ParsedTransaction[] = [];
    const excelMetrics: Record<string, number> = {};
    let bankTx: ParsedTransaction[] | null = null;

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        fullText += `\n--- Вкладка: ${sheetName} ---\n`;
        const csv = XLSX.utils.sheet_to_csv(worksheet);
        fullText += csv;

        // Фаза 3.1: выписка банка со строкой заголовков — приоритет над
        // универсальной эвристикой «дата + сумма»
        if (!bankTx) {
          const bs = parseBankStatement(csv, fileName);
          if (bs.transactions.length >= 3) bankTx = bs.transactions;
        }

        const rawJson = XLSX.utils.sheet_to_json<any>(worksheet, { header: 1 });
        for (const row of rawJson) {
            if (!Array.isArray(row) || row.length === 0) continue;
            
            if (sheetName === workbook.SheetNames[0] && row.length >= 2) {
               const dateStr = String(row[0] || '').trim();
               if (dateStr.match(/^\d{2}\.\d{2}\.\d{4}$/) || dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
                 let amount = 0;
                 let type: 'income' | 'expense' = 'expense';
                 const val1 = parseFloat(String(row[1]).replace(/\s/g,'').replace(',','.'));
                 if (!isNaN(val1) && val1 !== 0) {
                   amount = Math.abs(val1);
                   type = val1 > 0 ? 'income' : 'expense';
                 }
                 
                 if (amount === 0) {
                     const val2 = parseFloat(String(row[2]).replace(/\s/g,'').replace(',','.'));
                     if (!isNaN(val2) && val2 !== 0) {
                         amount = Math.abs(val2);
                         type = val2 > 0 ? 'income' : 'expense';
                     }
                 }

                 if (amount > 0) {
                     transactions.push({
                       date: dateStr,
                       amount: amount,
                       purpose: String(row.length >= 4 ? row.slice(2).join(' ') : 'Транзакция из Excel').trim().substring(0, 100),
                       type,
                       payer: 'Из файла',
                       payee: 'Из файла',
                       account: 'Default'
                     });
                     continue;
                 }
               }
            }
            
            let label = "";
            let val = 0;
            
            for (let i = 0; i < row.length; i++) {
                if (typeof row[i] === 'string') {
                   const cellStr = row[i].trim();
                   if (cellStr.length >= 3 && isNaN(parseFloat(cellStr.replace(/\s/g, '').replace(',','.')))) {
                       label = cellStr;
                       
                       for (let j = row.length - 1; j > i; j--) {
                           if (row[j] !== undefined && row[j] !== null && row[j] !== '') {
                               const numStr = String(row[j]).replace(/\s/g, '').replace(',', '.');
                               const parsedNum = parseFloat(numStr);
                               if (!isNaN(parsedNum) && parsedNum !== 0) {
                                   val = Math.abs(parsedNum);
                                   break;
                               }
                           }
                       }
                       break;
                   }
                }
            }
            
            if (label && val > 0) {
                if (/^(Итого|Всего|Сумма|Сальдо|Прибыль|Убыток|Обороты|Налог|Доход|Расход|Задолженность|Остаток|Актив|Пассив|Выручка|Поступлен|Списани|База|Взносы|Код|Строка|Запасы|Капитал|Резервы)/i.test(label) || (label.length > 5 && label.length < 50)) {
                    if (!label.match(/^\d{2}\.\d{2}\.\d{4}$/) && !label.match(/^[0-9\.\-\s]+$/)) {
                        excelMetrics[label] = val;
                    }
                }
            }
        }
    }

    return { text: fullText.substring(0, 150000), transactions: bankTx ?? transactions, excelMetrics };
}

// Parser for OSV (Оборотно-сальдовая ведомость) and Карточка счета from PDF text
export function parseOSVFromPDF(content: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];
  
  // Clean up content - remove excessive whitespace
  const cleaned = content.replace(/\s+/g, ' ').trim();
  
  // Parse OSV format: account_number open_balance debit_turnover credit_turnover close_balance
  // Accounts: 01, 10, 19, 20, 41, 43, 50, 51, 52, 55, 57, 58, 60, 62, 66, 67, 68, 69, 70, 71, 73, 76, 80, 81, 82, 83, 84, 86, 90, 91, 97, 98, 99
  const accountPattern = /(0[1-9]|[1-9]\d{1,2})/g;
  const numberPattern = /(\d[\d\s]*[.,]\d{2}|\d[\d\s]*)/g;
  
  // Try to find OSV rows: account + 4-5 numeric values
  const osvRowPattern = /((?:0[1-9]|[1-9]\d{1,2}))\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})/g;
  let match;
  
  while ((match = osvRowPattern.exec(cleaned)) !== null) {
    const account = match[1].trim();
    const parseNum = (s: string) => parseFloat(s.replace(/\s/g, '').replace(',', '.'));
    
    const openBalance = parseNum(match[2]);
    const debitTurnover = parseNum(match[3]);
    const creditTurnover = parseNum(match[4]);
    const closeBalance = parseNum(match[5]);
    
    // Validate: balances and turnovers should be reasonable
    if (!isNaN(debitTurnover) && debitTurnover > 0 && debitTurnover < 1e15) {
      transactions.push({
        date: 'Период',
        amount: debitTurnover,
        payer: `Счет ${account}`,
        payee: 'Обороты Дебет',
        purpose: `Ост.нач: ${openBalance.toLocaleString('ru-RU')}, Ост.кон: ${closeBalance.toLocaleString('ru-RU')}`,
        type: 'income',
        account: account
      });
    }
    
    if (!isNaN(creditTurnover) && creditTurnover > 0 && creditTurnover < 1e15) {
      transactions.push({
        date: 'Период',
        amount: creditTurnover,
        payer: 'Обороты Кредит',
        payee: `Счет ${account}`,
        purpose: `Ост.нач: ${openBalance.toLocaleString('ru-RU')}, Ост.кон: ${closeBalance.toLocaleString('ru-RU')}`,
        type: 'expense',
        account: account
      });
    }
  }
  
  // Parse Карточка счета format - individual transactions with dates
  // Format: DD.MM.YYYY Дт/Кт amount description
  const cardPattern = /(\d{2}\.\d{2}\.\d{4})\s+(Дт|Кт|Дебет|Кредит)\s+([\d\s,.]+)/g;
  while ((match = cardPattern.exec(cleaned)) !== null) {
    const date = match[1];
    const side = match[2];
    const amount = parseFloat(match[3].replace(/\s/g, '').replace(',', '.'));
    
    if (!isNaN(amount) && amount > 0 && amount < 1e15) {
      transactions.push({
        date: date,
        amount: amount,
        payer: side === 'Дт' || side === 'Дебет' ? 'Дебет' : 'Кредит',
        payee: side === 'Дт' || side === 'Дебет' ? 'Кредит' : 'Дебет',
        purpose: 'Карточка счета',
        type: (side === 'Дт' || side === 'Дебет') ? 'income' : 'expense',
        account: 'Unknown'
      });
    }
  }
  
  // If no OSV rows found, try to extract any numeric data that looks like financial metrics
  if (transactions.length === 0) {
    // Try to find lines with dates and amounts (Карточка счета style)
    const dateAmountPattern = /(\d{2}\.\d{2}\.\d{4})\s+([\d\s,.]{3,})\s+([\d\s,.]{3,})/g;
    while ((match = dateAmountPattern.exec(cleaned)) !== null) {
      const date = match[1];
      const amount1 = parseFloat(match[2].replace(/\s/g, '').replace(',', '.'));
      const amount2 = parseFloat(match[3].replace(/\s/g, '').replace(',', '.'));
      
      if (!isNaN(amount1) && amount1 > 0 && amount1 < 1e15) {
        transactions.push({
          date: date,
          amount: amount1,
          payer: 'Дебет',
          payee: 'Кредит',
          purpose: 'Извлечено из документа',
          type: 'income',
          account: 'Unknown'
        });
      }
      
      if (!isNaN(amount2) && amount2 > 0 && amount2 < 1e15) {
        transactions.push({
          date: date,
          amount: amount2,
          payer: 'Кредит',
          payee: 'Дебет',
          purpose: 'Извлечено из документа',
          type: 'expense',
          account: 'Unknown'
        });
      }
    }
  }
  
  console.log(`[parseOSVFromPDF] Found ${transactions.length} transactions from ${cleaned.length} chars`);
  return transactions;
}

// Helper: convert base64 string to ArrayBuffer/Buffer
function base64ToBuffer(base64str: string): Buffer | Uint8Array {
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    return Buffer.from(base64str, 'base64');
  }
  // Fallback for browser
  const byteChars = atob(base64str);
  const bytes = new Uint8Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) bytes[i] = byteChars.charCodeAt(i);
  return bytes;
}

// Extract text from .docx files using mammoth library
async function extractDocxText(dataUrl: string): Promise<string> {
  try {
    const buffer = base64ToBuffer(dataUrl.split(',')[1] || '');
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer: buffer as any });
    return result.value.substring(0, 150000);
  } catch (e: any) {
    console.error('[extractDocxText] Error:', e?.message || e);
    return `Error reading DOCX: ${e?.message || 'unknown error'}`;
  }
}

// Extract text from legacy .doc (Word 97-2003 binary) files
// Uses simple OTF/Word binary text extraction as a fallback
async function extractDocText(dataUrl: string): Promise<string> {
  try {
    const buffer = base64ToBuffer(dataUrl.split(',')[1] || '');
    // Try mammoth first (it can sometimes read .doc)
    try {
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ arrayBuffer: buffer as any });
      if (result && result.value && result.value.trim().length > 10) {
        return result.value.substring(0, 150000);
      }
    } catch {}
    
    // Fallback: extract readable text from Word binary format
    // Word .doc files store text in Unicode (UTF-16LE) streams
    // We'll try to extract printable text sequences
    const text = extractTextFromBinaryDoc(buffer);
    return text.substring(0, 150000);
  } catch (e: any) {
    console.error('[extractDocText] Error:', e?.message || e);
    return `Error reading DOC: ${e?.message || 'unknown error'}`;
  }
}

// Simple text extractor for Word 97-2003 binary format (.doc)
function extractTextFromBinaryDoc(buffer: Buffer | Uint8Array): string {
  const textSegments: string[] = [];
  let currentSegment = '';
  let consecutiveTextBytes = 0;
  // Ensure we work with Buffer for readUInt16LE
  const buf = Buffer.from(buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength));
  
  // Word .doc uses UTF-16LE for text in most cases
  // Look for sequences of printable characters
  for (let i = 0; i < buf.length - 1; i += 2) {
    const charCode = buf.readUInt16LE(i);
    
    // Check if this is a printable character (ASCII range or common Cyrillic range)
    const isPrintable = (
      (charCode >= 32 && charCode <= 126) ||          // ASCII printable
      (charCode >= 1024 && charCode <= 1103) ||        // Cyrillic range
      (charCode === 10 || charCode === 13 || charCode === 9) // newline, CR, tab
    );
    
    if (isPrintable) {
      currentSegment += String.fromCharCode(charCode);
      consecutiveTextBytes++;
    } else {
      // If we had a long enough text segment, save it
      if (consecutiveTextBytes >= 10) {
        textSegments.push(currentSegment.trim());
      }
      currentSegment = '';
      consecutiveTextBytes = 0;
    }
  }
  
  // Don't forget the last segment
  if (consecutiveTextBytes >= 10) {
    textSegments.push(currentSegment.trim());
  }
  
  // Clean up: remove very short segments, join with newlines
  const cleaned = textSegments
    .filter(s => s.length >= 10)
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(s => s.length > 0);
  
  // Remove duplicates (Word .doc often has text repeated)
  const unique = [...new Set(cleaned)];
  
  return unique.join('\n');
}

export function parse1CClientBank(content: string): ParsedTransaction[] {
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
      inDocSection = true;
      currentTx = {};
      continue;
    }
    
    if (line === "КонецДокумента" && currentTx && inDocSection) {
      if (currentTx.amount && currentTx.payer && currentTx.payee) {
         const type = currentTx.account === currentSessionAccount ? "expense" : "income";
         transactions.push({
           date: currentTx.date || "",
           amount: currentTx.amount || 0,
           payer: currentTx.payer || "",
           payee: currentTx.payee || "",
           purpose: currentTx.purpose || "",
           type,
           account: currentTx.account || ""
         });
      }
      inDocSection = false;
      currentTx = null;
      continue;
    }

    if (inDocSection && currentTx) {
      const [key, ...valueParts] = line.split("=");
      const val = valueParts.join("=").trim();
      
      switch(key) {
        case "Дата": currentTx.date = val; break;
        case "Сумма": currentTx.amount = parseFloat(val); break;
        case "Плательщик": currentTx.payer = val; break;
        case "Получатель": currentTx.payee = val; break;
        case "НазначениеПлатежа": currentTx.purpose = val; break;
        case "ПлательщикСчет":
          if (!currentTx.account) currentTx.account = val;
          break;
      }
    }
  }

  return transactions;
}
