/**
 * Экспорт финансовых отчетов в Excel, Word, PowerPoint и PNG
 */

import * as XLSX from 'xlsx';
import type { WorkSheet } from 'xlsx';
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat } from 'docx';
import Presentation from 'pptxgenjs';

function fmt(n: number): string { return n.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); document.body.removeChild(a); }, 100);
}

// ==================== EXCEL (.xlsx) ====================

export function exportToExcel(data: any[], filename: string = 'report.xlsx') {
  const ws: WorkSheet = { 
    '!cols': [{ wch: 40 }, { wch: 20 }],
    A1: 'Показатель', B1: 'Значение'
  };

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    const r = i + 2;
    if (typeof row === 'object') {
      ws['A' + r] = row.name || row.label || row.title || '';
      ws['B' + r] = typeof row.value === 'number' ? row.value : String(row.value || '');
    } else {
      ws['A' + r] = String(row);
    }
  }

  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  const wb: XLSX.WorkBook = { Sheets: { Sheet1: ws }, SheetNames: ['Sheet1'] };
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

export function exportFinancialReportsToExcel(reports: Record<string, any[]>, filename: string = 'financial_reports.xlsx') {
  const wb: XLSX.WorkBook = { SheetNames: [], Sheets: {} };

  for (const [name, data] of Object.entries(reports)) {
    const wsName = name.substring(0, 31);
    const ws: WorkSheet = { A1: 'Показатель', B1: 'Значение' };

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const r = i + 2;
      if (typeof row === 'object') {
        ws['A' + r] = (' '.repeat(row.level || 0) + (row.name || row.label || '')).trim();
        ws['B' + r] = typeof row.value === 'number' ? row.value : String(row.value || '');
      } else {
        ws['A' + r] = String(row);
      }
    }

    wb.Sheets[wsName] = ws;
    wb.SheetNames.push(wsName);
  }

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename);
}

// ==================== WORD (.docx) ====================

export function exportToWord(title: string, content: any[], filename: string = 'report.docx') {
  const children: any[] = [
    new Paragraph({
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true })]
    }),
    new Paragraph({})
  ];

  for (const item of content) {
    if (typeof item === 'string') {
      children.push(new Paragraph({ children: [new TextRun(item)] }));
    } else if (typeof item === 'object' && item !== null) {
      const name = item.name || item.label || '';
      const value = typeof item.value === 'number' ? fmt(item.value) : String(item.value || '');
      
      children.push(
        new Paragraph({
          children: [
            new TextRun({ text: ('  '.repeat(item.level || 0) + name + ':'), bold: true }),
            new TextRun(' ' + value),
          ],
          spacing: { after: 100 }
        })
      );
    }
  }

  const doc = new Document({ sections: [{ children }] });
  Packer.toBlob(doc).then(blob => downloadBlob(blob, filename));
}

export function exportMarkdownToWord(title: string, markdown: string, filename: string = 'report.docx') {
  const lines = markdown.split('\n').filter(l => l.trim());
  const children: any[] = [];

  for (const line of lines) {
    if (line.startsWith('# ')) {
      children.push(new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun({ text: line.substring(2), bold: true })] }));
    } else if (line.startsWith('## ')) {
      children.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun({ text: line.substring(3), bold: true })] }));
    } else if (line.startsWith('> ')) {
      children.push(new Paragraph({ children: [new TextRun({ text: line.substring(2), italics: true, color: '666666' })] }));
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      const bt = line.replace(/^[-*] /, '');
      children.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun(bt)] }));
    } else if (/^\d+\./.test(line)) {
      const nt = line.replace(/^\d+\. /, '');
      children.push(new Paragraph({ numbering: { reference: 'myNumbering', level: 0 }, children: [new TextRun(nt)] }));
    } else {
      children.push(new Paragraph({ children: [new TextRun(line.trim())] }));
    }
  }

  const doc = new Document({
    numbering: {
      config: [{
        reference: 'myNumbering',
        levels: [{
          level: 0,
          format: LevelFormat.DECIMAL,
          text: '%1.',
          alignment: AlignmentType.START,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } },
        }],
      }],
    },
    sections: [{ children }],
  });
  Packer.toBlob(doc).then(blob => downloadBlob(blob, filename));
}

// ==================== POWERPOINT (.pptx) ====================

export function exportToPowerPoint(title: string, slides: Array<{ title: string; content: any[] }>, filename: string = 'presentation.pptx') {
  const pres = new Presentation();
  
  // Title slide
  let slide = pres.addSlide();
  slide.background = { fill: '1A1A2E' };
  slide.addText(title, { x: 0.5, y: 3, w: 9, h: 1, fontSize: 44, bold: true, color: 'FFFFFF', align: 'center' });

  // Content slides
  for (const sd of slides) {
    const contentLines = sd.content.map(item => {
      if (typeof item === 'object') {
        const n = item.name || item.label || '';
        const v = typeof item.value === 'number' ? fmt(item.value) : String(item.value);
        return n + ': ' + v;
      }
      return String(item);
    });

    slide = pres.addSlide();
    slide.background = { fill: 'FAFAFA' };
    slide.addText(sd.title, { x: 0.5, y: 0.3, w: 9, fontSize: 32, bold: true, color: '1A1A2E' });
    
    contentLines.forEach((line, i) => {
      slide.addText('\u2022 ' + line, { x: 0.5, y: 2 + i * 0.6, w: 9, fontSize: 18, color: '333333' });
    });
  }

  pres.writeFile().then((data: string) => {
    const byteCharacters = atob(data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
    downloadBlob(new Blob([new Uint8Array(byteNumbers)], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }), filename);
  });
}

export function exportMarkdownToPowerPoint(title: string, markdown: string, slidesCount: number = 5, filename: string = 'presentation.pptx') {
  const lines = markdown.split('\n').filter(l => l.trim());
  
  const slideGroups: Array<{ title: string; content: any[] }> = [];
  let currentSlide: typeof slideGroups[0] | null = null;

  for (const line of lines) {
    if (line.startsWith('# ') && !line.startsWith('## ')) {
      if (currentSlide) slideGroups.push(currentSlide);
      currentSlide = { title: line.substring(2).trim(), content: [] };
    } else if (line.startsWith('## ')) {
      if (!currentSlide) currentSlide = { title: '', content: [] };
      currentSlide.content.push({ name: line.substring(3), value: '' });
    } else if (line.startsWith('|')) continue;
    else if (line.trim()) {
      if (!currentSlide) currentSlide = { title, content: [] };
      const cl = line.replace(/^[#\-\*\|> ]+/, '').trim();
      if (cl) currentSlide.content.push({ name: '', value: cl });
    }
  }

  if (currentSlide && currentSlide.content.length > 0) slideGroups.push(currentSlide);

  while (slideGroups.length < slidesCount && slideGroups.length > 0) {
    const last = slideGroups[slideGroups.length - 1];
    if (last) slideGroups.push({ ...last, content: [...last.content] });
  }

  exportToPowerPoint(title, slideGroups);
}

// ==================== PNG CHARTS ====================

export function renderChartToImage(canvasId: string, filename: string = 'chart.png') {
  const canvas = document.getElementById(canvasId) as HTMLCanvasElement;
  if (!canvas) return;
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, filename);
  }, 'image/png');
}

export function exportAllChartsToPNG(charts: Array<{ id: string; name: string }>) {
  for (const chart of charts) renderChartToImage(chart.id, chart.name + '.png');
}

// ==================== COMBO EXPORT ====================

export interface ExportableReport {
  title: string;
  type: 'table' | 'text' | 'presentation';
  data?: any[];
  markdown?: string;
}

export async function exportAllFormats(reports: ExportableReport[], baseFilename: string = 'report') {
  for (const rpt of reports) {
    const prefix = baseFilename + '_' + rpt.title.replace(/[^a-zA-Zа-яА-Я0-9]/g, '_').substring(0, 20);

    if (rpt.type === 'table' && rpt.data) {
      exportToExcel(rpt.data, prefix + '.xlsx');
      exportToWord(rpt.title, rpt.data, prefix + '.docx');
    } else if (rpt.markdown) {
      exportMarkdownToWord(rpt.title, rpt.markdown, prefix + '.docx');
      const slideCount = Math.max(3, rpt.markdown.split('\n').filter(l => l.startsWith('#')).length || 3);
      exportMarkdownToPowerPoint(rpt.title, rpt.markdown, slideCount, prefix + '.pptx');
    }
  }

  const totalFormats = reports.reduce((sum: number, r) => sum + (r.type === 'table' && r.data ? 2 : (r.markdown ? 2 : 0)), 0);
  alert('Export done! Total formats: ' + totalFormats);
}

