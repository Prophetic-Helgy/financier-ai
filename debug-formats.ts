#!/usr/bin/env tsx
/**
 * Debug: тест парсеров на реальных файлах
 */
import * as fs from 'fs';
import * as path from 'path';

const baseDir = 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ВЫДАННЫЕ';

// Найти по 3 файла каждого типа для тестирования
function findSamples(dir: string, ext: string, max: number = 3): string[] {
  const results: string[] = [];
  const walk = (d: string, depth: number) => {
    if (depth > 15 || results.length >= max) return;
    try {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const fp = path.join(d, e.name);
        if (e.isDirectory()) walk(fp, depth + 1);
        else if (e.name.toUpperCase().endsWith(ext) && !e.name.startsWith('~$') && !e.name.startsWith('~')) 
          results.push(fp);
      }
    } catch {}
  };
  walk(dir, 0);
  return results.slice(0, max);
}

async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  DEBUG: Тест парсеров на реальных файлах');
  console.log('═══════════════════════════════════════════════════════\n');

  const formats = ['XLS', 'XLSX', 'DOCX', 'PDF'];
  
  for (const ext of formats) {
    console.log(`\n--- Поиск файлов *.${ext.toLowerCase()} ---`);
    const samples = findSamples(baseDir, ext);
    console.log(`Найдено: ${samples.length}`);
    
    for (const fp of samples) {
      const stat = fs.statSync(fp);
      const buf = fs.readFileSync(fp);
      console.log(`\n  Файл: ${path.basename(fp)}`);
      console.log(`  Размер: ${(stat.size/1024).toFixed(1)} KB, буфер: ${buf.length} байт`);
      console.log(`  Первые 16 байт: ${buf.slice(0, 16).toString('hex')}`);
      
      // Проверить magic bytes
      const magic = buf.slice(0, 8);
      const hex = magic.toString('hex');
      
      if (ext === 'XLS' || ext === 'XLSX') {
        if (hex.startsWith('d0cf11e0')) {
          console.log('  Magic: BINARY XLS (d0cf11e0) ✓');
        } else if (hex.startsWith('504b0304')) {
          console.log('  Magic: ZIPPED XLSX (504b0304) — файл .xls но реально ZIP! ✓');
        } else {
          console.log(`  Magic: НЕИЗВЕСТНО ${hex}`);
        }
      }
      
      if (ext === 'DOCX') {
        if (hex.startsWith('504b0304')) {
          console.log('  Magic: ZIPPED DOCX (504b0304) ✓');
        } else if (hex.startsWith('d0cf11e0')) {
          console.log('  Magic: BINARY DOC (d0cf11e0) — файл .docx но реально DOC!');
        } else {
          console.log(`  Magic: НЕИЗВЕСТНО ${hex}`);
        }
      }
      
      if (ext === 'PDF') {
        const header = buf.slice(0, 5).toString('ascii');
        console.log(`  Header: "${header}" ${header === '%PDF-' ? '✓' : 'НЕ PDF!'}`);
      }
      
      // Попытка парсинга через динамический import
      if (ext === 'XLSX' || (ext === 'XLS' && hex.startsWith('504b0304'))) {
        try {
          const fflate = await import('fflate');
          const unzipped = fflate.unzipSync(buf);
          const keys = Object.keys(unzipped);
          console.log(`  fflate.unzipSync: ${keys.length} файлов`);
          console.log(`  Ключи: ${keys.slice(0, 5).join(', ')}...`);
          
          const sharedStrings = unzipped['xl/sharedStrings.xml'];
          const sheets = keys.filter(k => k.startsWith('xl/worksheets/sheet'));
          console.log(`  sharedStrings: ${sharedStrings ? sharedStrings.length : 'НЕТ'}`);
          console.log(`  worksheets: ${sheets.length}`);
          
          if (sheets.length > 0 && unzipped[sheets[0]]) {
            const sheetXml = unzipped[sheets[0]].toString('utf8');
            const vals = sheetXml.match(/<v[^>]*>([^<]*)<\/v>/g) || [];
            const sis = sheetXml.match(/<v[^>]*?>(\d+)<\/v>/g) || [];
            console.log(`  inline vals: ${vals.length}, s refs: ${sis.length}`);
          }
        } catch (e: any) {
          console.log(`  fflate ERROR: ${e.message}`);
        }
      }
      
      if (ext === 'XLS' && hex.startsWith('d0cf11e0')) {
        try {
          const fflate = await import('fflate');
          // Попытка как ZIP (некоторые .xls это ZIP)
          try {
            const unzipped = fflate.unzipSync(buf);
            console.log(`  fflate как ZIP: ${Object.keys(unzipped).length} файлов`);
          } catch {
            console.log('  fflate как ZIP: НЕ РАЗАРХИВЫВАЕТСЯ (бинарный XLS)');
          }
        } catch (e: any) {
          console.log(`  fflate: ${e.message}`);
        }
      }
      
      if (ext === 'DOCX' && hex.startsWith('504b0304')) {
        try {
          const fflate = await import('fflate');
          const unzipped = fflate.unzipSync(buf);
          const keys = Object.keys(unzipped);
          console.log(`  fflate.unzipSync: ${keys.length} файлов`);
          console.log(`  Ключи: ${keys.slice(0, 5).join(', ')}...`);
          
          const doc = unzipped['word/document.xml'];
          if (doc) {
            const docText = doc.toString('utf8');
            const texts = docText.match(/<w:t[^>]*>([^<]*)<\/w:t>/g) || [];
            console.log(`  w:t tags: ${texts.length}`);
            if (texts.length > 0) {
              const sample = texts.slice(0, 3).map((t: string) => t.replace(/<[^>]+>/g, '')).join(' | ');
              console.log(`  Sample: "${sample.slice(0, 200)}"`);
            }
          } else {
            console.log('  word/document.xml: НЕ НАЙДЕН');
          }
        } catch (e: any) {
          console.log(`  fflate DOCX ERROR: ${e.message}`);
        }
      }
    }
  }
  
  console.log('\n\n✅ Debug завершён');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });