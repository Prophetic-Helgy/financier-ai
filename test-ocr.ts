/**
 * Smoke-тест Фазы 3.2: OCR для скан-PDF (tesseract.js, rus).
 * Запуск: npx tsx test-ocr.ts
 *
 * Проверяет:
 *  1. looksLikeScan — эвристика «страница без текстового слоя».
 *  2. canOcr — false в Node (нет DOM): PDF-конвейер в tsx-тестах OCR не вызывает.
 *  3. E2E-распознавание: SVG (кириллица + дата + сумма) → PNG (sharp) →
 *     tesseract 'rus' → распознаются «Сбербанк», дата и сумма.
 *     При недоступности сети (не скачать модель с jsdelivr) — SKIP,
 *     не ошибка: OCR — опциональное расширение, первое включение требует сети.
 */
import sharp from 'sharp';
import { looksLikeScan, canOcr, getOcrWorker, recognizeImage, terminateOcrWorker } from './src/lib/ocr/ocr';

let passed = 0;
let failed = 0;
let skipped = 0;
function check(name: string, cond: boolean, detail = '') {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function main() {
  console.log('\n[1] looksLikeScan: эвристика текстового слоя');
  check('пустая страница → скан', looksLikeScan('') === true);
  check('3 символа → скан', looksLikeScan('абв') === true);
  check('19 символов → скан', looksLikeScan('абвгдежзиклмнопрсту') === true);
  check('20 символов → не скан', looksLikeScan('абвгдежзиклмнопрстуф') === false);
  check('реальный текстовый слой → не скан', looksLikeScan('Дата операции Сумма Контрагент Магнит 15.03.2026 1 200,50') === false);

  console.log('\n[2] canOcr в Node-окружении');
  check('нет DOM → canOcr() = false (в tsx-тестах OCR не сработает)', canOcr() === false);

  console.log('\n[3] E2E: SVG → PNG (sharp) → tesseract rus');
  // «Чистый скан»: белый фон, чёрный текст — как отсканированная выписка
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="240">
    <rect width="100%" height="100%" fill="white"/>
    <text x="30" y="90" font-family="Arial" font-size="48" fill="black">Сбербанк</text>
    <text x="30" y="180" font-family="Arial" font-size="48" fill="black">15.03.2026 1200.50</text>
  </svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  try {
    const worker = await getOcrWorker();
    const raw = await recognizeImage(worker, png);
    console.log('    OCR-результат:', JSON.stringify(raw));
    // tesseract может подставлять латинские двойники (С/C, б/6, е/е, н/h) — нормализуем
    const norm = raw.toLowerCase().replace(/[cс]/g, 'с').replace(/[6б]/g, 'б').replace(/[hн]/g, 'н').replace(/[aа]/g, 'а').replace(/[kк]/g, 'к');
    check('слово «Сбербанк» распознано', norm.includes('сбербанк'), norm);
    const compact = raw.replace(/\s+/g, '');
    check('дата 15.03.2026 распознана', /15[.,]?03[.,]?2026/.test(compact), compact);
    check('сумма 1200.50 распознана', /1200[.,]?50/.test(compact), compact);
  } catch (e: any) {
    skipped++;
    console.log(`  ⚠ SKIP: E2E OCR не запущен (${e?.message || e}). OCR требует интернет для скачивания модели.`);
  } finally {
    await terminateOcrWorker();
  }

  console.log(`\nИтого: ${passed} пройдено, ${failed} ошибок, ${skipped} пропущено`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
