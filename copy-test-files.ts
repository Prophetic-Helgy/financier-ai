import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Get files using PowerShell with proper encoding
const sourceDir = 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ВЫДАННЫЕ\\';
const targetDir = 'test-data/office-files';

fs.mkdirSync(targetDir, { recursive: true });

// Use PowerShell to get file list with proper encoding
const psScript = `
Get-ChildItem -Path '${sourceDir.replace(/\\/g, '\\\\')}' -Recurse -Include '*.xls','*.xlsx','*.doc','*.docx' | Select-Object -First 20 FullName
`;

try {
  const output = execSync(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript}"`, { 
    encoding: 'buffer' 
  }).toString('utf16le').trim();
  
  const files = output.split('\n')
    .map(line => {
      const match = line.match(/(?<=FullName\s+)\s*(.+)$/m) || line.match(/^(D:.+)$/m);
      return match ? match[1].trim() : line.trim();
    })
    .filter(f => f.startsWith('D:'));

  console.log(`Found ${files.length} files`);
  
  let copied = 0;
  let nameCounter: Record<string, number> = {};
  
  for (const src of files) {
    if (copied >= 20) break;
    try {
      if (!fs.existsSync(src)) continue;
      
      const ext = path.extname(src).toLowerCase();
      const baseName = path.basename(src, ext);
      const extKey = ext.replace('.', '');
      
      if (!nameCounter[extKey]) nameCounter[extKey] = 0;
      nameCounter[extKey]++;
      
      const destName = `test_${extKey}_${nameCounter[extKey]}${ext}`;
      const dest = path.join(targetDir, destName);
      
      fs.copyFileSync(src, dest);
      const stat = fs.statSync(dest);
      console.log(`Copied: ${destName} (${stat.size} bytes) from ${src}`);
      copied++;
    } catch (err: any) {
      console.error(`Skip ${src}: ${err.message}`);
    }
  }
  
  console.log(`\nCopied ${copied} files to ${targetDir}`);
  
} catch (err: any) {
  console.error('Error:', err.message);
  console.error(err.stdout?.toString?.() || err.toString());
}