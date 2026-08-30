/**
 * OCR для скан-PDF (Фаза 3.2): tesseract.js, язык — русский.
 *
 * Как это работает:
 *  - Тяжёлое (tesseract.js + wasm-ядро + языковая модель) грузится ЛЕНИВО —
 *    при первом обращении, worker живёт до перезагрузки страницы.
 *  - Языковая модель и wasm скачиваются с CDN (jsdelivr) при первом запуске,
 *    дальше работает кэш браузера. Без интернета OCR недоступен — PDF с
 *    текстовым слоем это не затрагивает (OCR вызывается только для сканов).
 *  - В Node-окружении (tsx-тесты) растеризации нет (canOcr() = false) —
 *    E2E-распознавание проверяется буфером PNG (см. test-ocr.ts).
 */

// tesseract.js — CJS-пакет: интероп в Vite/tsx отдаёт default или namespace
let tesseractPromise: Promise<any> | null = null;
function loadTesseract(): Promise<any> {
  if (!tesseractPromise) {
    tesseractPromise = import('tesseract.js').then((mod: any) => mod.default ?? mod);
  }
  return tesseractPromise;
}

let workerPromise: Promise<any> | null = null;

/**
 * Синглтон OCR-worker (один язык — 'rus', одна оэма — LSTM).
 * onLog — уведомления о смене статуса загрузки/распознавания.
 */
export async function getOcrWorker(onLog?: (msg: string) => void): Promise<any> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const T = await loadTesseract();
      let lastStatus = '';
      // Пути worker/core/lang НЕ переопределяем: дефолты tesseract.js выводятся
      // из версии УСТАНОВЛЕННОГО пакета (точное закрепление, пентест находка #8),
      // ручной пин здесь рассинхронизировал бы worker с lib при апгрейде.
      // CDN (jsdelivr) закрыт allowlist'ом CSP; локализация ассетов — follow-up.
      return T.createWorker('rus', T.OEM?.LSTM_ONLY ?? 1, {
        logger: (m: any) => {
          if (onLog && m.status && m.status !== lastStatus) {
            lastStatus = m.status;
            onLog(m.status);
          }
        },
      });
    })();
    // После сбоя (нет сети) сбрасываем, чтобы можно было повторить
    workerPromise.catch(() => { workerPromise = null; });
  }
  return workerPromise;
}

/** Завершить worker (для тестов; в приложении worker живёт до перезагрузки). */
export async function terminateOcrWorker(): Promise<void> {
  if (workerPromise) {
    const w = await workerPromise.catch(() => null);
    if (w?.terminate) await w.terminate().catch(() => {});
    workerPromise = null;
  }
}

/** Страница (почти) без текстового слоя — это скан. */
export function looksLikeScan(text: string): boolean {
  return (text || '').replace(/\s/g, '').length < 20;
}

/** Доступна ли OCR в текущем окружении (нужен DOM-канвас для растеризации). */
export function canOcr(): boolean {
  return typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';
}

/** Распознать изображение (canvas / PNG-буфер / File) → текст. */
export async function recognizeImage(worker: any, source: any): Promise<string> {
  const res = await worker.recognize(source);
  return ((res?.data?.text as string) || '').trim();
}

/** Сколько страниц скана максимум распознаём за документ (выписки короче). */
export const MAX_OCR_PAGES = 10;

/**
 * Растеризовать страницы-сканы pdfjs-документа и распознать текст.
 * Возвращает карту: номер страницы → текст (проблемные страницы — без записи).
 * doc — PDFDocumentProxy pdfjs (duck-typing, зависимость на pdfjs не создаём).
 */
export async function ocrPdfScanPages(
  doc: any,
  pageNumbers: number[],
  onLog?: (msg: string) => void,
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const worker = await getOcrWorker(onLog);
  const toOcr = pageNumbers.slice(0, MAX_OCR_PAGES);
  if (pageNumbers.length > MAX_OCR_PAGES) {
    onLog?.(`OCR первых ${MAX_OCR_PAGES} из ${pageNumbers.length} страниц-сканов`);
  }
  for (const n of toOcr) {
    try {
      const page = await doc.getPage(n);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const text = await recognizeImage(worker, canvas);
      if (text) out.set(n, text);
      canvas.width = 0;
      canvas.height = 0;
    } catch (e: any) {
      onLog?.(`стр. ${n}: ${e?.message || e}`);
    }
  }
  return out;
}
