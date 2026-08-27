import fs from 'fs';
import path from 'path';
import { parseDocument } from './src/lib/parsers/bankParsers.ts';

// Simple polyfill to make pdf.js load in Node for testing
// In Node, we suppress the worker warning.

const dir = 'src/components/ref_data_extracted/';

async function testFile(filename: string) {
    try {
        const filePath = path.join(dir, filename);
        const data = fs.readFileSync(filePath);
        const ext = path.extname(filename).toLowerCase();
        
        let dataUrl = '';
        if (ext === '.pdf') {
             // For PDF we just pass base64
             dataUrl = `data:application/pdf;base64,${data.toString('base64')}`;
        } else if (ext === '.xls' || ext === '.xlsx') {
             dataUrl = `data:application/vnd.ms-excel;base64,${data.toString('base64')}`;
        } else {
             // Text files
             dataUrl = data.toString('utf-8'); // Not true dataUrl, but parser handles it if it doesn't start with data:
        }

        console.log(`\n===========================================`);
        console.log(`Testing: ${filename}`);
        const result = await parseDocument(dataUrl, filename);
        
        console.log(`- Type identified as: ${result.docType}`);
        console.log(`- Transactions found: ${result.transactions.length}`);
        if (result.transactions.length > 0) {
           console.log(`  > Example Tx:`, result.transactions[0]);
        }
        console.log(`- Raw Text length gathered: ${result.rawText.length} characters`);
        
        if (result.transactions.length === 0 && result.rawText.length > 0) {
           console.log(`  > Preview Raw:`, result.rawText.substring(0, 200).replace(/\n/g, ' '));
        }

    } catch(e) {
        console.error(`Failed to test ${filename}`, e);
    }
}

async function run() {
   console.log("Starting automated parser integration tests...");
   await testFile('выписка по р сч январь 2015  -  май 2015 Альфа Банк.xls');
   await testFile('ОСВ Счет 62 1.xls');
   await testFile('Склад 2015 ЯД.xls');
   await testFile('Баланс 1кв 2015- 2 кв.2015.pdf');
   await testFile('Счёт за груз № 34181.pdf');
}

run();
