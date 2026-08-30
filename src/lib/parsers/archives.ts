// Фаза 3.1: поддержка архивов. ZIP — прямо в рендерере (fflate, чистый JS);
// RAR — в main-процессе (node-unrar-js) через IPC: рендерер sandbox:true.
// На входе — FileData из FileUploader: текст как UTF-8, бинарник как data-URL.
// fflate грузим лениво — только при первом распаковывании ZIP (не в стартовый чанк).

const TEXT_EXTS = new Set(['txt', 'csv', 'json', 'xml', 'log', 'html', 'htm', 'tsv', 'rtf', 'sql']);
// Расширения, которые parseDocument реально умеет разобрать
const SUPPORTED_EXTS = new Set([
  'pdf', 'xls', 'xlsx', 'xlsm', 'ods', 'txt', 'csv', 'tsv', 'json', 'xml',
  'doc', 'docx', 'rtf', 'html', 'htm', 'log', 'sql', 'dat', 'prn', 'eml', 'msg',
]);
const MAX_ENTRIES = 50;
// Бюджеты против zip/rar-бомб (пентест 2026-08-30, находка #6):
// разжатые байты проверяются ДО и ВО ВРЕМЯ распаковки, не после.
const MAX_ENTRY_BYTES = 10 * 1024 * 1024; // 10 МБ на запись
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 МБ на весь архив

interface FileLike { name: string; content: string; }

/**
 * Имя записи архива → безопасный basename: любые разделители каталогов
 * режутся, «../» обесценивается, слишком длинные имена отбрасываются.
 */
export function sanitizeEntryName(name: string): string {
  const base = String(name ?? '').split(/[\\/]/).pop() || '';
  return base.length > 0 && base.length <= 128 ? base : '';
}

/** Бюджетный сторож архива: кумулятивный учёт разжатых байтов и записей. */
export function assertEntryBudget(name: string, declaredSize: number, totalSoFar: number, entriesSoFar: number): number {
  if (entriesSoFar + 1 > MAX_ENTRIES) throw new Error(`в архиве слишком много файлов (максимум ${MAX_ENTRIES})`);
  if (declaredSize > MAX_ENTRY_BYTES) {
    throw new Error(`файл «${name}» в архиве слишком большой (${Math.round(declaredSize / 1024 / 1024)} МБ; максимум ${MAX_ENTRY_BYTES / 1024 / 1024} МБ)`);
  }
  const next = totalSoFar + declaredSize;
  if (next > MAX_TOTAL_BYTES) {
    throw new Error('архив слишком большой после распаковки (лимит 50 МБ) — похоже на zip-bomb');
  }
  return next;
}

export function archiveKind(name: string): 'zip' | 'rar' | null {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (ext === 'zip' || ext === 'cbz') return 'zip';
  if (ext === 'rar' || ext === 'cbr') return 'rar';
  return null;
}

function dataUrlToU8(dataUrl: string): Uint8Array {
  const b64 = dataUrl.split(',')[1] || '';
  const bin = atob(b64);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return u8;
}

function u8ToDataUrl(u8: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < u8.length; i += 8192) {
    bin += String.fromCharCode.apply(null, Array.from(u8.subarray(i, i + 8192)) as any);
  }
  return 'data:application/octet-stream;base64,' + btoa(bin);
}

function toFileData(name: string, u8: Uint8Array, strFromU8: (u8: Uint8Array) => string): FileLike {
  const ext = (name.split('.').pop() || '').toLowerCase();
  if (TEXT_EXTS.has(ext)) return { name, content: strFromU8(u8) };
  return { name, content: u8ToDataUrl(u8) };
}

export async function extractZipArchive(file: FileLike): Promise<FileLike[]> {
  const fflate = await import("fflate");
  // Пентест, находка #6: filter проверяет ЗАЯВЛЕННЫЕ имена/размеры ДО разжатия
  // (неподдерживаемое и сверхбюджетное не разжимается вообще). Враньё в
  // заголовках ловит сам inflateSync: буфер предвыделен по заявленному размеру,
  // раздувшийся поток = ошибка inflate, а не OOM. Кумулятивный бюджет — 50 МБ.
  const data = dataUrlToU8(file.content);
  let totalBytes = 0;
  let entriesSeen = 0;
  let budgetError: string | null = null;
  const entriesMap = fflate.unzipSync(data, {
    filter: (f) => {
      if (budgetError) return false; // бюджет уже превышен — не разжимаем ничего лишнего
      const name = sanitizeEntryName(f.name);
      if (!name) return false; // папка, traversal-мусор, кривое имя
      const ext = (name.split('.').pop() || '').toLowerCase();
      if (!SUPPORTED_EXTS.has(ext)) return false; // не разжимаем неподдерживаемый хлам
      try {
        // В fflate у записи: originalSize — несжатый размер, size — сжатый
        totalBytes = assertEntryBudget(name, f.originalSize || 0, totalBytes, entriesSeen);
        entriesSeen += 1;
      } catch (e: any) {
        budgetError = e?.message || String(e);
        return false;
      }
      return true;
    },
  });
  if (budgetError) throw new Error(budgetError);
  const out: FileLike[] = [];
  for (const [entryName, u8] of Object.entries(entriesMap)) {
    const name = sanitizeEntryName(entryName) || entryName;
    out.push(toFileData(name, u8, fflate.strFromU8));
  }
  return out;
}

export async function extractRarArchive(file: FileLike): Promise<FileLike[]> {
  const unrar = typeof window !== 'undefined' ? window.electronAPI?.unrar : undefined;
  if (!unrar) throw new Error('RAR: недоступно вне приложения Electron');
  const b64 = file.content.split(',')[1] || '';
  const res = await unrar(b64);
  if (!Array.isArray(res)) {
    throw new Error((res as { error?: string })?.error || 'Не удалось распаковать RAR-архив');
  }
  return res.map((r) => ({
    name: r.name,
    content: r.isText ? r.content : `data:application/octet-stream;base64,${r.content}`,
  }));
}

/**
 * Распаковать ZIP/RAR-архивы в списке файлов во вложенные файлы.
 * Не-архивы и архивы, которые не удалось распаковать, остаются в списке
 * (дальше parseDocument мягко отработает и вернёт «неизвестный документ»).
 */
export async function expandArchives(files: FileLike[]): Promise<FileLike[]> {
  const out: FileLike[] = [];
  for (const f of files) {
    const kind = archiveKind(f.name);
    const isDataUrl = typeof f.content === 'string' && f.content.startsWith('data:');
    if (kind && isDataUrl) {
      try {
        const inner = kind === 'zip' ? await extractZipArchive(f) : await extractRarArchive(f);
        if (inner.length > 0) {
          console.log(`[archives] ${f.name}: распаковано ${inner.length} файл(ов)`);
          out.push(...inner);
          continue;
        }
        console.warn(`[archives] ${f.name}: в архиве нет поддерживаемых файлов`);
      } catch (e: any) {
        console.error(`[archives] не удалось распаковать ${f.name}:`, e?.message || e);
      }
    }
    out.push(f);
  }
  return out;
}
