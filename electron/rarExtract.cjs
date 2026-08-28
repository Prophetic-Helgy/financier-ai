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

/**
 * Распаковать RAR-архив (base64) в память и вернуть содержимое:
 * [{name, content (текст UTF-8 или base64), isText, size}].
 * node-unrar-js v2: createExtractorFromData → extract() → генератор файлов.
 */
async function extractRarBase64(base64) {
  const buf = Buffer.from(base64, 'base64');
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const extractor = await getUnrar().createExtractorFromData({ data: ab });
  const { files } = extractor.extract();

  const results = [];
  for (const arc of files) {
    if (results.length >= MAX_ENTRIES) break;
    const { name, flags } = arc.fileHeader;
    if (flags.directory || !arc.extraction) continue;
    const b = Buffer.from(arc.extraction);
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

module.exports = { extractRarBase64, TEXT_EXTS, MAX_ENTRIES };
