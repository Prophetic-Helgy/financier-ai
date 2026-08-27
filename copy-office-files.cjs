const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const targetDir = path.join(__dirname, 'test-data', 'office-files');
fs.mkdirSync(targetDir, { recursive: true });

// Use PowerShell with base64 encoded script to avoid encoding issues
const psScript = Buffer.from(`
$sourceDir = 'D:\\ГД\\!!№3 Клиенты\\ЗАЯВКИ ВЫДАННЫЕ\\'
$files = Get-ChildItem -Path $sourceDir -Recurse -Include '*.xls','*.xlsx','*.doc','*.docx' -ErrorAction SilentlyContinue | Select-Object -First 20 FullName
foreach ($f in $files) { Write-Output $f.FullName }
`).toString('base64');

try {
  const output = execSync(
    `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${psScript}`,
    { encoding: 'buffer' }
  );
  
  // Try different encodings
  let lines = [];
  for (const enc of ['utf8', 'utf16le', 'cp1251']) {
    try {
      const decoded = output.toString(enc).trim();
      if (decoded && decoded.includes('D:')) {
        lines = decoded.split('\n').filter(l => l.trim().startsWith('D:'));
        break;
      }
    } catch {}
  }
  
  // If still empty, try to read raw bytes and find paths
  if (lines.length === 0) {
    const raw = output.toString('latin1');
    lines = raw.split(/\r?\n/).filter(l => l.trim().length > 10 && l.trim()[0] === 'D');
  }
  
  console.log(`Found ${lines.length} files`);
  
  const counter = { xls: 0, xlsx: 0, doc: 0, docx: 0 };
  let copied = 0;
  
  for (const src of lines) {
    if (copied >= 20) break;
    try {
      const srcPath = src.trim();
      if (!fs.existsSync(srcPath)) {
        console.log(`Not found: ${srcPath}`);
        continue;
      }
      
      const ext = path.extname(srcPath).toLowerCase().replace('.', '');
      counter[ext]++;
      const destName = `test_${ext}_${counter[ext]}.${ext}`;
      const dest = path.join(targetDir, destName);
      
      fs.copyFileSync(srcPath, dest);
      const stat = fs.statSync(dest);
      console.log(`Copied: ${destName} (${stat.size} bytes)`);
      copied++;
    } catch (err) {
      console.error(`Error: ${err.message}`);
    }
  }
  
  console.log(`\nTotal copied: ${copied} files to ${targetDir}`);
  
} catch (err) {
  console.error('PowerShell error:', err.message);
  
  // Fallback: try using existing ref_data files
  console.log('\nFalling back to ref_data files...');
  const refData = path.join(__dirname, 'ref_data');
  if (fs.existsSync(refData)) {
    const files = fs.readdirSync(refData)
      .filter(f => /\.(xls|xlsx|doc|docx)$/i.test(f))
      .slice(0, 20);
    
    const counter = { xls: 0, xlsx: 0, doc: 0, docx: 0 };
    for (const f of files) {
      const ext = path.extname(f).toLowerCase().replace('.', '');
      counter[ext]++;
      const destName = `ref_${ext}_${counter[ext]}.${ext}`;
      fs.copyFileSync(path.join(refData, f), path.join(targetDir, destName));
      console.log(`Copied from ref_data: ${destName}`);
    }
    console.log(`Copied ${files.length} files from ref_data`);
  }
}