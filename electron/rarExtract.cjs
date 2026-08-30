// Фаза 3.1: распаковка RAR в MAIN-процессе (node-unrar-js v2).
// Рендерер работает с sandbox:true (без Node API), поэтому архивы RAR
// распаковываются здесь; результат уходит в рендерер через IPC.
// Модуль вынесен отдельно от main.cjs, чтобы логику можно было
// проверять node-скриптом без запуска Electron.
const path = require('path');

let Unrar = null;
function getUnrar() {
  if (!Unrar) Unrar = require('node-unrar-js');
  return Unrar;
}

const TEXT_EXTS = ['txt', 'csv', 'json', 'xml', 'log', 'html', 'htm', 'tsv', 'rtf', 'sql'];
const MAX_ENTRIES = 50;
// Бюджеты против rar-бомб (пентест 2026-08-30, находка #6) — те же, что в
// renderer-архиваторе src/lib/parsers/archives.ts (там они же и тестируются).
const MAX_ENTRY_BYTES = 10 * 1024 * 1024; // 10 МБ на запись
const MAX_TOTAL_BYTES = 50 * 1024 * 1024; // 50 МБ на весь архив

/** Имя записи → безопасный basename (см. sanitizeEntryName в archives.ts). */
function sanitizeEntryName(name) {
  const base = String(name ?? '').split(/[\\/]/).pop() || '';
  return base.length > 0 && base.length <= 128 ? base : '';
}

/**
 * Распаковать RAR-архив (base64) в память и вернуть содержимое:
 * [{name, content (текст UTF-8 или base64), isText, size}].
 * node-unrar-js v2: createExtractorFromData → extract() → генератор файлов.
 * Бюджет проверяется ДО распаковки по заголовку списка (list()), раздутые
 * записи отсекаются и по фактическому размеру.
 */
async function extractRarBase64(base64) {
  const buf = Buffer.from(base64, 'base64');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const extractor = await getUnrar().createExtractorFromData({ data: ab });

  // Пред-проверка по заголовкам (без распаковки содержимого)
  let declaredTotal = 0;
  let declaredEntries = 0;
  try {
    const listed = extractor.list();
    const headers = (listed && (listed.fileHeaders || listed.files || listed)) || [];
    for (const fh of headers) {
      const dir = (fh.flags && fh.flags.directory) || fh.directory || fh.folder;
      if (dir) continue;
      declaredEntries += 1;
      if (declaredEntries > MAX_ENTRIES) throw new Error(`в архиве слишком много файлов (максимум ${MAX_ENTRIES})`);
      const size = Number(fh.fileSize ?? fh.size ?? 0) || 0;
      if (size > MAX_ENTRY_BYTES) {
        throw new Error(`файл «${sanitizeEntryName(fh.name) || 'RAR-entry'}» слишком большой (${Math.round(size / 1024 / 1024)} МБ; максимум 10 МБ)`);
      }
      declaredTotal += size;
      if (declaredTotal > MAX_TOTAL_BYTES) {
        throw new Error('архив слишком большой после распаковки (лимит 50 МБ) — похоже на zip/rar-bomb');
      }
    }
  } catch (err) {
    // Реальные ошибки бюджета пробрасываем; кривой list() — нет (тогда
    // сработает фактическая проверка размеров ниже, после extract()).
    if (/максимум|слишком большой|бомб/i.test(err.message || '')) throw err;
    console.warn('[rarExtract] list() недоступен, проверю только фактические размеры:', err.message);
  }

  const { files } = extractor.extract();

  const results = [];
  let totalBytes = 0;
  for (const arc of files) {
    if (results.length >= MAX_ENTRIES) break;
    const { name: rawName, flags } = arc.fileHeader;
    if (flags.directory || !arc.extraction) continue;
    const name = sanitizeEntryName(rawName);
    if (!name) continue; // кривое/слишком длинное имя — выбрасываем запись
    const b = Buffer.from(arc.extraction);
    if (b.length > MAX_ENTRY_BYTES) {
      throw new Error(`файл «${name}» в архиве слишком большой (${Math.round(b.length / 1024 / 1024)} МБ; максимум 10 МБ)`);
    }
    totalBytes += b.length;
    if (totalBytes > MAX_TOTAL_BYTES) {
      throw new Error('архив слишком большой после распаковки (лимит 50 МБ) — похоже на zip/rar-bomb');
    }
    const ext = path.extname(name).toLowerCase().replace('.', '');
    const isText = TEXT_EXTS.includes(ext);
    results.push({
      name,
      content: isText ? b.toString('utf-8') : b.toString('base64'),
      isText,
      size: b.length,
    });
  }
  return results;
}

module.exports = { extractRarBase64, sanitizeEntryName, TEXT_EXTS, MAX_ENTRIES, MAX_ENTRY_BYTES, MAX_TOTAL_BYTES };
