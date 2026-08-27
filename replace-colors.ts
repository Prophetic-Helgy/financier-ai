import * as fs from 'fs';
import * as path from 'path';

function walkDir(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walkDir(file));
        } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
            results.push(file);
        }
    });
    return results;
}

const files = walkDir('./src');
files.forEach(file => {
   let content = fs.readFileSync(file, 'utf8');
   let newContent = content.replace(/text-slate-400/g, 'text-[var(--text-muted)]');
   newContent = newContent.replace(/text-slate-500/g, 'text-[var(--text-muted)]');
   // also fix any remaining text-white to text-[var(--fg)] which shouldn't be white
   newContent = newContent.replace(/text-slate-300/g, 'text-[var(--fg)]');
   
   if (content !== newContent) {
      fs.writeFileSync(file, newContent, 'utf8');
      console.log(`Updated ${file}`);
   }
});
