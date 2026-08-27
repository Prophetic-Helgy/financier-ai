#!/usr/bin/env tsx
/**
 * Тест парсинга реальных файлов из ref_data
 */
import * as fs from 'fs';
import * as path from 'path';

// --- Миксин parseBankStatement из parsers ---
function parseBankStatement(text: string) {
  const results = {
    organization: '',
    period: { start: '', end: '' },
    accounts: [] as any[],
    totalIncome: 0,
    totalExpense: 0,
    balance: { opening: 0, closing: 0 },
    operations: [] as any[],
  };

  const orgPatterns = [
    /(?:Организация|Заёмщик|Клиент|Наименование)[\s:]*([А-ЯA-Z][А-ЯЁA-Z0-9\s&.,-]{5,})/i,
  ];
  for (const p of orgPatterns) {
    const m = text.match(p);
    if (m) { results.organization = m[1].trim(); break; }
  }

  const datePattern = /(\d{2}\.\d{2}\.\d{4})/g;
  const dates: string[] = [];
  let dm: RegExpExecArray | null;
  while ((dm = datePattern.exec(text)) !== null) dates.push(dm[1]);
  if (dates.length >= 2) {
    results.period.start = dates[0];
    results.period.end = dates[dates.length - 1];
  } else if (dates.length === 1) {
    results.period.end = dates[0];
  }

  const accPattern = /(?:Счёт|Счет|Account)[\s:]*([\d-]{10,20})/gi;
  let am: RegExpExecArray | null;
  while ((am = accPattern.exec(text)) !== null) {
    results.accounts.push(am[1].trim());
  }

  const incomePattern = /(?:Поступ|Доход|Приход|Income|Кредит)[\s:]*([\d.,]+)/i;
  const expensePattern = /(?:Спис|Расх|Расход|Expense|Дебет)[\s:]*([\d.,]+)/i;

  const parseNum = (s: string) => parseFloat(s.replace(/\./g, '').replace(',', '.'));

  let im: RegExpExecArray | null;
  while ((im = incomePattern.exec(text)) !== null) {
    results.totalIncome += parseNum(im[1]);
  }
  let em: RegExpExecArray | null;
  while ((em = expensePattern.exec(text)) !== null) {
    results.totalExpense += parseNum(em[1]);
  }

  const balPattern = /(?:Остаток|Balance|Баланс)[\s:]*([\d.,]+)/gi;
  let bm: RegExpExecArray | null;
  let balCount = 0;
  while ((bm = balPattern.exec(text)) !== null && balCount < 2) {
    const val = parseNum(bm[1]);
    if (balCount === 0) results.balance.opening = val;
    else results.balance.closing = val;
    balCount++;
  }

  // Табличные операции
  const lines = text.split('\n');
  for (const line of lines) {
    const cols = line.split(/[|\t]+/).map((c: string) => c.trim());
    if (cols.length >= 4 && cols[0].match(/^\d{2}\.\d{2}\.\d{2}$/)) {
      results.operations.push({
        date: cols[0],
        description: cols[1] || '',
        amount: parseFloat(cols[2].replace(/[.\s]/g, '')) || 0,
      });
    }
  }

  return results;
}

// --- Миксин parseInvoice из parsers ---
function parseInvoice(text: string) {
  const results = {
    invoiceNumber: '',
    invoiceDate: '',
    supplier: '',
    client: '',
    items: [] as any[],
    totalAmount: 0,
    vat: 0,
    totalWithVat: 0,
    paymentDetails: { bank: '', account: '', bik: '' },
  };

  const invNum = text.match(/(?:Счёт|Invoice|Счет)[\s#№]*([\d-]+)/i);
  if (invNum) results.invoiceNumber = invNum[1].trim();

  const invDate = text.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (invDate) results.invoiceDate = invDate[1];

  const supplier = text.match(/(?:Поставщик|Seller|Supplier|От)[\s:]*([А-ЯA-Z][А-ЯЁA-Z0-9\s&.,-]{5,})/i);
  if (supplier) results.supplier = supplier[1].trim();

  const client = text.match(/(?:Покупатель|Buyer|Клиент|Для|Наименование)[\s:]*([А-ЯA-Z][А-ЯЁA-Z0-9\s&.,-]{5,})/i);
  if (client) results.client = client[1].trim();

  const total = text.match(/(?:Итого|Total|Сумма)[\s:]*([\d.,]+)/i);
  if (total) results.totalAmount = parseFloat(total[1].replace(/\./g, '').replace(',', '.'));

  const vat = text.match(/(?:НДС|VAT|Tax)[\s:]*([\d.,]+)/i);
  if (vat) results.vat = parseFloat(vat[1].replace(/\./g, '').replace(',', '.'));

  const bank = text.match(/(?:Банк|Bank)[\s:]*([А-ЯA-Z][А-ЯЁA-Za-z0-9\s&.,-]{5,})/i);
  if (bank) results.paymentDetails.bank = bank[1].trim();

  const acc = text.match(/(?:Счёт|Счет|Account)[\s:]*([\d-]{10,20})/i);
  if (acc) results.paymentDetails.account = acc[1].trim();

  const bik = text.match(/(?:БИК|BIC)[\s:]*([\d]{9})/i);
  if (bik) results.paymentDetails.bik = bik[1].trim();

  return results;
}

// --- Миксин parseContract из parsers ---
function parseContract(text: string) {
  const results = {
    contractNumber: '',
    contractDate: '',
    parties: [] as string[],
    subject: '',
    amount: 0,
    terms: [] as string[],
  };

  const num = text.match(/(?:Договор|Contract)[\s#№]*([\d-]+)/i);
  if (num) results.contractNumber = num[1].trim();

  const date = text.match(/(\d{2}\.\d{2}\.\d{4})/);
  if (date) results.contractDate = date[1];

  const party = text.match(/(?:Сторона|Party|Заказчик|Исполнитель)[\s:]*([А-ЯA-Z][А-ЯЁA-Z0-9\s&.,-]{5,})/gi);
  if (party) {
    for (const m of party) {
      const name = m.match(/([А-ЯA-Z][А-ЯЁA-Z0-9\s&.,-]{5,})/i);
      if (name) results.parties.push(name[1].trim());
    }
  }

  const amount = text.match(/(?:Сумма|Amount|Стоимость)[\s:]*([\d.,]+)/i);
  if (amount) results.amount = parseFloat(amount[1].replace(/\./g, '').replace(',', '.'));

  return results;
}

// --- Main ---
async function main() {
  const refDir = path.join(process.cwd(), 'ref_data');

  if (!fs.existsSync(refDir)) {
    console.error('❌ ref_data не найден');
    process.exit(1);
  }

  const files = fs.readdirSync(refDir).filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.xls', '.xlsx', '.pdf', '.txt', '.docx'].includes(ext);
  }).slice(0, 10); // лимит 10 файлов

  console.log(`\n📊 Тест парсинга ${files.length} файлов из ref_data:\n`);
  console.log('═'.repeat(90));

  let totalScore = 0;
  let totalTests = 0;

  for (const file of files) {
    const filePath = path.join(refDir, file);
    const ext = path.extname(file).toLowerCase();
    const stats = fs.statSync(filePath);
    const sizeKB = (stats.size / 1024).toFixed(1);

    console.log(`\n📄 ${file} (${sizeKB} KB)`);
    console.log('─'.repeat(70));

    let text = '';
    let parseFn: any = null;
    let parseName = '';

    try {
      if (ext === '.txt') {
        text = fs.readFileSync(filePath, 'utf-8');
        parseFn = parseBankStatement;
        parseName = 'parseBankStatement';
      } else if (ext === '.xls' || ext === '.xlsx') {
        // Для xlsx используем библиотеку (как в реальном приложении)
        const XLSX = await import('xlsx');
        const base64 = fs.readFileSync(filePath).toString('base64');
        const wb = XLSX.read(base64, { type: 'base64' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        text = XLSX.utils.sheet_to_txt(sheet);
        // Определяем тип по имени файла
        if (file.match(/ОСВ|остаток|баланс|выписка|банк/i)) {
          parseFn = parseBankStatement;
          parseName = 'parseBankStatement';
        } else {
          parseFn = parseInvoice;
          parseName = 'parseInvoice';
        }
      } else if (ext === '.pdf') {
        // Простое извлечение текста через pdfjs-dist
        try {
          const pdfjs = await import('pdfjs-dist');
          // Для Node.js нужно настроить worker
          const pdf = await pdfjs.getDocument({
            url: filePath,
            useWorkerFetch: false,
            isEvalSupported: false,
          }).promise;
          
          for (let i = 1; i <= Math.min(pdf.numPages, 3); i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            const items = content.items as any[];
            text += items.map((item: any) => item.str).join(' ') + '\n';
          }

          if (file.match(/счет|invoice|груз/i)) {
            parseFn = parseInvoice;
            parseName = 'parseInvoice';
          } else if (file.match(/договор|contract/i)) {
            parseFn = parseContract;
            parseName = 'parseContract';
          } else {
            parseFn = parseBankStatement;
            parseName = 'parseBankStatement';
          }
        } catch (e: any) {
          console.log(`   ⚠️ PDF parsing error: ${e.message}`);
          continue;
        }
      } else if (ext === '.docx') {
        // Простой парсинг docx через читатель zip
        const { readFileSync } = fs;
        const buf = readFileSync(filePath);
        // Пытаемся извлечь текст из word/document.xml
        const txt = buf.toString('utf-8');
        const wMatches = txt.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
        if (wMatches) {
          text = wMatches.map((m: string) => m.replace(/<[^>]+>/g, '')).join(' ');
        }
        parseFn = parseContract;
        parseName = 'parseContract';
      }

      if (!parseFn || !text.trim()) {
        console.log(`   ⚠️ Нет текста или парсера`);
        continue;
      }

      const startTime = Date.now();
      const result = parseFn(text);
      const elapsed = Date.now() - startTime;

      // Оценка результата
      let score = 0;
      let maxScore = 0;
      const details: string[] = [];

      if (parseName === 'parseBankStatement') {
        maxScore = 6;
        if (result.organization) { score++; details.push(`✅ Организация: ${result.organization}`); }
        else details.push('❌ Организация не найдена');
        
        if (result.period.start || result.period.end) { score++; details.push(`✅ Период: ${result.period.start || '?'} → ${result.period.end || '?'}`); }
        else details.push('❌ Период не найден');
        
        if (result.accounts.length > 0) { score++; details.push(`✅ Счетов: ${result.accounts.length}`); }
        else details.push('❌ Счета не найдены');
        
        if (result.totalIncome > 0) { score++; details.push(`✅ Поступления: ${result.totalIncome.toLocaleString()}`); }
        else details.push('❌ Поступления не найдены');
        
        if (result.totalExpense > 0) { score++; details.push(`✅ Списания: ${result.totalExpense.toLocaleString()}`); }
        else details.push('❌ Списания не найдены');
        
        if (result.balance.opening > 0 || result.balance.closing > 0) { score++; details.push(`✅ Баланс: ${result.balance.opening.toLocaleString()} → ${result.balance.closing.toLocaleString()}`); }
        else details.push('❌ Баланс не найден');
      } else if (parseName === 'parseInvoice') {
        maxScore = 5;
        if (result.invoiceNumber) { score++; details.push(`✅ № Счета: ${result.invoiceNumber}`); }
        else details.push('❌ № Счета не найден');
        
        if (result.invoiceDate) { score++; details.push(`✅ Дата: ${result.invoiceDate}`); }
        else details.push('❌ Дата не найдена');
        
        if (result.supplier) { score++; details.push(`✅ Поставщик: ${result.supplier}`); }
        else details.push('❌ Поставщик не найден');
        
        if (result.client) { score++; details.push(`✅ Клиент: ${result.client}`); }
        else details.push('❌ Клиент не найден');
        
        if (result.totalAmount > 0) { score++; details.push(`✅ Сумма: ${result.totalAmount.toLocaleString()}`); }
        else details.push('❌ Сумма не найдена');
      } else if (parseName === 'parseContract') {
        maxScore = 4;
        if (result.contractNumber) { score++; details.push(`✅ № Договора: ${result.contractNumber}`); }
        else details.push('❌ № Договора не найден');
        
        if (result.contractDate) { score++; details.push(`✅ Дата: ${result.contractDate}`); }
        else details.push('❌ Дата не найдена');
        
        if (result.parties.length > 0) { score++; details.push(`✅ Сторон: ${result.parties.join(', ')}`); }
        else details.push('❌ Стороны не найдены');
        
        if (result.amount > 0) { score++; details.push(`✅ Сумма: ${result.amount.toLocaleString()}`); }
        else details.push('❌ Сумма не найдена');
      }

      const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      const bar = '█'.repeat(Math.floor(pct / 5)) + '░'.repeat(20 - Math.floor(pct / 5));

      console.log(`   📊 ${parseName} за ${elapsed}мс`);
      console.log(`   [${bar}] ${pct}% (${score}/${maxScore})`);
      for (const d of details) console.log(`     ${d}`);

      totalScore += score;
      totalTests += maxScore;

    } catch (e: any) {
      console.log(`   ❌ Ошибка: ${e.message}`);
    }
  }

  console.log('\n' + '═'.repeat(90));
  const totalPct = totalTests > 0 ? Math.round((totalScore / totalTests) * 100) : 0;
  console.log(`\n📊 ИТОГО: ${totalScore}/${totalTests} полей извлечено (${totalPct}%)\n`);

  if (totalPct >= 60) {
    console.log('✅ Парсеры работают хорошо на реальных данных!');
  } else if (totalPct >= 30) {
    console.log('⚠️  Парсеры находят часть данных - нужно улучшить паттерны');
  } else {
    console.log('❌ Низкая точность - требуется адаптация под реальные форматы');
  }
}

main().catch(console.error);