/**
 * Тест парсеров бинарных форматов офиса (xls, xlsx, doc, docx)
 * Тестирует файлы из test-data/client-requests/
 */
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// We need to run this in Node.js environment, not browser
// Import the parser logic directly (Node-compatible version)

interface TestResult {
  file: string;
  ext: string;
  size: number;
  success: boolean;
  textLength: number;
  transactions: number;
  metrics: number;
  error?: string;
  preview: string;
}

function fileToDataUrl(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const buffer = fs.readFileSync(filePath);
  const base64 = buffer.toString('base64');
  
  const mimeTypes: Record<string, string> = {
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'pdf': 'application/pdf',
    'txt': 'text/plain',
  };
  
  const mime = mimeTypes[ext] || 'application/octet-stream';
  return `data:${mime};base64,${base64}`;
}

async function runTests() {
  const testDir = path.join(__dirname, 'test-data', 'office-files');
  
  if (!fs.existsSync(testDir)) {
    console.error(`Test directory not found: ${testDir}`);
    process.exit(1);
  }
  
  const files = fs.readdirSync(testDir)
    .filter(f => {
      const ext = path.extname(f).toLowerCase().slice(1);
      return ['xls', 'xlsx', 'doc', 'docx'].includes(ext) && !f.startsWith('~$');
    });
  
  console.log(`\n=== Office Format Parser Test ===`);
  console.log(`Test directory: ${testDir}`);
  console.log(`Found ${files.length} office files to test\n`);
  
  const results: TestResult[] = [];
  
  for (const fileName of files) {
    const filePath = path.join(testDir, fileName);
    const stat = fs.statSync(filePath);
    const ext = path.extname(fileName).toLowerCase().slice(1);
    
    console.log(`\n[${results.length + 1}/${files.length}] Testing: ${fileName} (${(stat.size / 1024).toFixed(1)} KB, .${ext})`);
    
    const result: TestResult = {
      file: fileName,
      ext,
      size: stat.size,
      success: false,
      textLength: 0,
      transactions: 0,
      metrics: 0,
      preview: ''
    };
    
    try {
      const dataUrl = fileToDataUrl(filePath);
      
      // Dynamic import to use the parser in Node.js context
      // We'll test with a simplified approach since the full parser uses browser APIs
      if (ext === 'xlsx') {
        // Test XLSX parsing with node-xlsx or similar
        const XLSX = await import('xlsx');
        const buffer = fs.readFileSync(filePath);
        const workbook = XLSX.read(buffer);
        
        let fullText = '';
        for (const sheetName of workbook.SheetNames) {
          const worksheet = workbook.Sheets[sheetName];
          fullText += `\n--- ${sheetName} ---\n`;
          fullText += XLSX.utils.sheet_to_csv(worksheet);
        }
        
        result.textLength = fullText.length;
        result.success = fullText.length > 10;
        result.preview = fullText.substring(0, 300).replace(/\n/g, ' | ');
        console.log(`  ✓ XLSX parsed: ${fullText.length} chars, ${workbook.SheetNames.length} sheets`);
      } 
      else if (ext === 'xls') {
        // Test binary XLS parsing with SheetJS (xlsx library supports BIFF format)
        const XLSX = await import('xlsx');
        const buffer = fs.readFileSync(filePath);
        
        // Check signature
        const sig = buffer.readUInt32LE(0);
        const isBinaryBIFF = (sig === 0x00001000 || sig === 0x00002000 || buffer[0] === 0x80 || buffer[0] === 0x60);
        console.log(`  Binary signature: 0x${sig.toString(16).padStart(8, '0')}, isBinaryBIFF=${isBinaryBIFF}`);
        
        let text = '';
        let parser = 'xlsx-sheetjs';
        
        // Try SheetJS (xlsx) — it supports BIFF .xls format
        try {
          const workbook = XLSX.read(buffer, { type: 'buffer', cellStyles: true });
          console.log(`  Sheets: ${workbook.SheetNames.join(', ')}`);
          for (const sheetName of workbook.SheetNames) {
            const worksheet = workbook.Sheets[sheetName];
            text += `\n--- ${sheetName} ---\n`;
            text += XLSX.utils.sheet_to_csv(worksheet);
          }
          console.log(`  ✓ SheetJS XLS parser: ${text.length} chars, ${workbook.SheetNames.length} sheets`);
        } catch (e: any) {
          console.log(`  ✗ SheetJS failed: ${e.message}, trying binary extraction...`);
          
          // Fallback: binary UTF-16LE text extraction (same as DOC approach)
          const segments: string[] = [];
          let current = '';
          let count = 0;
          
          for (let i = 0; i < buffer.length - 1; i += 2) {
            const charCode = buffer.readUInt16LE(i);
            const isPrintable = (
              (charCode >= 32 && charCode <= 126) ||
              (charCode >= 1024 && charCode <= 1103) ||
              (charCode === 10 || charCode === 13 || charCode === 9)
            );
            
            if (isPrintable) {
              current += String.fromCharCode(charCode);
              count++;
            } else {
              if (count >= 10) segments.push(current.trim());
              current = '';
              count = 0;
            }
          }
          if (count >= 10) segments.push(current.trim());
          
          const cleaned = segments
            .filter(s => s.length >= 10)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(s => s.length > 0);
          const unique = [...new Set(cleaned)];
          text = unique.join('\n');
          parser = 'binary-extract';
          
          console.log(`  ✓ Binary XLS extraction: ${text.length} chars, ${unique.length} segments`);
        }
        
        result.textLength = text.length;
        result.success = text.length > 10;
        result.preview = text.substring(0, 300).replace(/\n/g, ' | ');
        console.log(`  Parser used: ${parser}`);
      }
      else if (ext === 'docx') {
        // Test DOCX parsing with mammoth - use path-based API for Node.js
        const mammoth = await import('mammoth');
        const result_mammoth = await mammoth.extractRawText({ path: filePath });
        
        result.textLength = result_mammoth.value.length;
        result.success = result_mammoth.value.length > 10;
        result.preview = result_mammoth.value.substring(0, 300).replace(/\n/g, ' | ');
        console.log(`  ✓ DOCX parsed: ${result_mammoth.value.length} chars`);
        if (result_mammoth.messages.length > 0) {
          console.log(`  Messages: ${result_mammoth.messages.slice(0, 3).map(m => m.message).join(', ')}`);
        }
      }
      else if (ext === 'doc') {
        // Test binary DOC parsing
        const buffer = fs.readFileSync(filePath);
        
        // Try mammoth first
        let text = '';
        let parser = 'binary-extract';
        try {
          const mammoth = await import('mammoth');
          const result_mammoth = await mammoth.extractRawText({ arrayBuffer: buffer as any });
          if (result_mammoth.value && result_mammoth.value.trim().length > 10) {
            text = result_mammoth.value;
            parser = 'mammoth';
            console.log(`  ✓ Mammoth DOC: ${text.length} chars`);
          }
        } catch (e: any) {
          console.log(`  Mammoth DOC failed: ${e.message}, using binary extraction...`);
        }
        
        if (text.length === 0) {
          // Binary UTF-16LE text extraction
          const segments: string[] = [];
          let current = '';
          let count = 0;
          
          for (let i = 0; i < buffer.length - 1; i += 2) {
            const charCode = buffer.readUInt16LE(i);
            const isPrintable = (
              (charCode >= 32 && charCode <= 126) ||
              (charCode >= 1024 && charCode <= 1103) ||
              (charCode === 10 || charCode === 13 || charCode === 9)
            );
            
            if (isPrintable) {
              current += String.fromCharCode(charCode);
              count++;
            } else {
              if (count >= 10) segments.push(current.trim());
              current = '';
              count = 0;
            }
          }
          if (count >= 10) segments.push(current.trim());
          
          const cleaned = segments
            .filter(s => s.length >= 10)
            .map(s => s.replace(/\s+/g, ' ').trim())
            .filter(s => s.length > 0);
          const unique = [...new Set(cleaned)];
          text = unique.join('\n');
          
          console.log(`  ✓ Binary DOC extraction: ${text.length} chars, ${unique.length} segments`);
        }
        
        result.textLength = text.length;
        result.success = text.length > 10;
        result.preview = text.substring(0, 300).replace(/\n/g, ' | ');
        console.log(`  Parser: ${parser}`);
      }
    } catch (err: any) {
      result.error = err.message || String(err);
      console.log(`  ✗ ERROR: ${result.error}`);
    }
    
    results.push(result);
  }
  
  // Summary
  console.log(`\n\n=== TEST SUMMARY ===`);
  console.log(`Total files: ${results.length}`);
  console.log(`Success: ${results.filter(r => r.success).length}`);
  console.log(`Failed: ${results.filter(r => !r.success).length}`);
  
  console.log(`\nBy format:`);
  const formats = ['xls', 'xlsx', 'doc', 'docx'];
  for (const fmt of formats) {
    const fmtResults = results.filter(r => r.ext === fmt);
    const success = fmtResults.filter(r => r.success).length;
    const total = fmtResults.length;
    const avgText = total > 0 
      ? Math.round(fmtResults.reduce((s, r) => s + r.textLength, 0) / total) 
      : 0;
    console.log(`  .${fmt}: ${success}/${total} success, avg text: ${avgText.toLocaleString()} chars`);
  }
  
  console.log(`\nDetailed results:`);
  for (const r of results) {
    const status = r.success ? '✓' : '✗';
    console.log(`  ${status} ${r.file.padEnd(50)} ${r.textLength.toLocaleString().padStart(8)} chars | ${r.preview.substring(0, 80)}...`);
  }
  
  // Generate HTML report
  const html = generateReport(results);
  fs.writeFileSync(path.join(__dirname, 'test-office-formats-report.html'), html, 'utf-8');
  console.log(`\nReport saved to: test-office-formats-report.html`);
}

function generateReport(results: TestResult[]): string {
  const success = results.filter(r => r.success).length;
  const total = results.length;
  
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="UTF-8">
<title>Office Formats Parser Test Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 40px; background: #f5f5f5; }
  .container { max-width: 1200px; margin: 0 auto; background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
  h1 { color: #333; border-bottom: 2px solid #007bff; padding-bottom: 10px; }
  .summary { display: flex; gap: 20px; margin: 20px 0; }
  .summary-card { flex: 1; padding: 20px; border-radius: 8px; text-align: center; color: white; }
  .success { background: #28a745; }
  .failed { background: #dc3545; }
  .total { background: #007bff; }
  .result { border: 1px solid #ddd; border-radius: 4px; padding: 15px; margin: 10px 0; }
  .result.success { border-left: 4px solid #28a745; }
  .result.failed { border-left: 4px solid #dc3545; }
  .file-name { font-weight: bold; color: #333; }
  .preview { background: #f8f9fa; padding: 10px; border-radius: 4px; margin-top: 10px; font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 100px; overflow: hidden; }
  .stats { color: #666; font-size: 14px; }
</style>
</head>
<body>
<div class="container">
  <h1>📊 Office Formats Parser Test Report</h1>
  <div class="summary">
    <div class="summary-card total"><div style="font-size:36px">${total}</div><div>Total Files</div></div>
    <div class="summary-card success"><div style="font-size:36px">${success}</div><div>Success</div></div>
    <div class="summary-card failed"><div style="font-size:36px">${total - success}</div><div>Failed</div></div>
  </div>
  
  ${results.map(r => `
  <div class="result ${r.success ? 'success' : 'failed'}">
    <div class="file-name">${r.success ? '✅' : '❌'} ${r.file}</div>
    <div class="stats">Format: .${r.ext} | Size: ${(r.size / 1024).toFixed(1)} KB | Extracted: ${r.textLength.toLocaleString()} chars</div>
    ${r.error ? `<div style="color:red">Error: ${r.error}</div>` : ''}
    <div class="preview">${r.preview.replace(/</g, '<').replace(/>/g, '>')}</div>
  </div>`).join('')}
</div>
</body>
</html>`;
}

runTests().catch(err => {
  console.error('Test runner failed:', err);
  process.exit(1);
});