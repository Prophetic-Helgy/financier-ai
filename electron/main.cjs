const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// TEXT_EXTS for drop handler (same as read-files handler)
const TEXT_EXTS_DROP = ['txt', 'csv', 'json', 'xml', 'log', 'html', 'htm', 'tsv', 'rtf', 'sql'];

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.ico')
    : path.join(__dirname, '..', 'build', 'icon.ico');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      // sandbox: true совместим: preload использует только contextBridge/ipcRenderer,
      // рендерер не обращается к Node API (проверено)
      sandbox: true,
    },
  });

  // ============================================================
  // HANDLE FILE DRAG-DROP IN ELECTRON
  // ============================================================
  // PRIMARY: 'drop-files' event on BrowserWindow (reliable in Electron 28.x+)
  // FALLBACK: 'will-navigate' on webContents (for navigation-based drops)
  // ============================================================
  
  // PRIMARY: Use 'drop-files' event - collects ALL files and sends as one batch
  mainWindow.on('drop-files', (event, paths) => {
    event.preventDefault(); // Prevent default navigation behavior
    
    console.log(`[main] drop-files event: ${paths.length} file(s)`);
    
    // Collect all files into a single batch
    const fileData = [];
    for (const filePath of paths) {
      try {
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        const fileName = path.basename(filePath);
        
        // Support long paths on Windows by prefixing with \\?\
        const resolvedPath = process.platform === 'win32'
          ? `\\\\?\\${filePath}`
          : filePath;
        
        const stats = fs.statSync(resolvedPath);
        console.log(`[main] ${fileName}: size=${stats.size} bytes`);
        
        const buffer = fs.readFileSync(resolvedPath);
        console.log(`[main] Read ${buffer.length} bytes from ${fileName}`);
        
        if (TEXT_EXTS_DROP.includes(ext)) {
          fileData.push({
            name: fileName,
            content: buffer.toString('utf-8'),
            isText: true,
            size: buffer.length
          });
        } else {
          fileData.push({
            name: fileName,
            content: buffer.toString('base64'),
            isText: false,
            size: buffer.length
          });
        }
      } catch (err) {
        console.error(`[main] Error reading dropped file ${filePath}:`, err.message);
      }
    }
    
    // Send ALL files in ONE message
    if (fileData.length > 0) {
      console.log(`[main] Sending ${fileData.length} files to renderer via files-dropped`);
      mainWindow.webContents.send('files-dropped', fileData);
    }
  });
  
  // FALLBACK: will-navigate for older Electron versions
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    // Only intercept file:// URLs (dropped files)
    if (!navigationUrl.startsWith('file://')) return;
    
    // Prevent the navigation
    event.preventDefault();
    
    // Decode the file path from URL
    let filePath = navigationUrl.slice(7); // remove 'file://'
    // On Windows, URLs like file:///C:/path become /C:/path
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    filePath = decodeURIComponent(filePath);
    
    console.log(`[main] will-navigate fallback: ${filePath}`);
    
    try {
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const fileName = path.basename(filePath);
      
      // Support long paths on Windows by prefixing with \\?\
      const resolvedPath = process.platform === 'win32'
        ? `\\\\?\\${filePath}`
        : filePath;
      
      const stats = fs.statSync(resolvedPath);
      console.log(`[main] ${fileName}: size=${stats.size} bytes`);
      
      const buffer = fs.readFileSync(resolvedPath);
      console.log(`[main] Read ${buffer.length} bytes from ${fileName}`);
      
      // Send file data to renderer
      if (TEXT_EXTS_DROP.includes(ext)) {
        mainWindow.webContents.send('files-dropped', [{
          name: fileName,
          content: buffer.toString('utf-8'),
          isText: true,
          size: buffer.length
        }]);
      } else {
        mainWindow.webContents.send('files-dropped', [{
          name: fileName,
          content: buffer.toString('base64'),
          isText: false,
          size: buffer.length
        }]);
      }
    } catch (err) {
      console.error(`[main] Error reading dropped file ${filePath}:`, err.message);
      mainWindow.webContents.send('files-dropped-error', err.message);
    }
  });

  // Load the app
  if (app.isPackaged) {
    // In packaged app, dist is inside ASAR at the root level
    // __dirname is app.asar/electron/, so .. goes to app.asar/
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    console.log('[main] isPackaged=true, __dirname=', __dirname);
    console.log('[main] Loading index.html from:', indexPath);
    
    // Try loadFile first (works with ASAR paths in Electron 28+)
    try {
      mainWindow.loadFile(indexPath);
    } catch (err) {
      console.error('[main] loadFile failed:', err.message);
      // Fallback: use app.getPath to find the correct path
      const fallbackPath = path.join(app.getAppPath(), 'dist', 'index.html');
      console.log('[main] Fallback path:', fallbackPath);
      mainWindow.loadFile(fallbackPath);
    }
  } else {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  }
  
  // Listen for load failures
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('[main] did-fail-load:', errorCode, errorDescription);
  });
  
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[renderer] ${level}: ${message}`);
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ============================================================
// IPC handlers for frameless window controls
// ============================================================
ipcMain.handle('minimize', () => {
  if (mainWindow) mainWindow.minimize();
});
ipcMain.handle('maximize', () => {
  if (mainWindow) {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  }
});
ipcMain.handle('close', () => {
  if (mainWindow) mainWindow.close();
});
ipcMain.handle('isMaximized', () => {
  return mainWindow ? mainWindow.isMaximized() : false;
});

// ============================================================
// IPC handler for file open dialog
// ============================================================
ipcMain.handle('open-file-dialog', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Все поддерживаемые файлы',
        extensions: [
          'txt', 'csv', 'json', 'xml', 'pdf',
          'xls', 'xlsx', 'xlsm', 'xlsb', 'ods', 'odt',
          'doc', 'docx', 'rtf',
          'log', 'html', 'htm', 'tsv',
          'rar', 'zip', '7z', 'tar', 'gz',
          'sql', 'db', 'sqlite',
          'dat', 'prn',
          'msg', 'eml', 'cbr', 'cbz', 'mxl'
        ]
      },
      {
        name: 'Текстовые файлы',
        extensions: ['txt', 'csv', 'json', 'xml', 'log', 'html', 'htm', 'tsv', 'rtf']
      },
      {
        name: 'Excel файлы',
        extensions: ['xls', 'xlsx', 'xlsm', 'xlsb', 'ods']
      },
      {
        name: 'PDF файлы',
        extensions: ['pdf']
      },
      {
        name: 'Word файлы',
        extensions: ['doc', 'docx', 'odt', 'rtf']
      },
      {
        name: 'Архивы',
        extensions: ['rar', 'zip', '7z', 'tar', 'gz', 'cbr', 'cbz']
      },
      {
        name: 'Все файлы',
        extensions: ['*']
      }
    ]
  });
  return result;
});

// ============================================================
// IPC handler for reading files (returns base64 or text)
// ============================================================
const TEXT_EXTS = ['txt', 'csv', 'json', 'xml', 'log', 'html', 'htm', 'tsv', 'rtf', 'sql'];

ipcMain.handle('read-files', async (_event, filePaths) => {
  console.log('[main] read-files called with:', filePaths);
  
  if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
    console.error('[main] read-files: INVALID filePaths!', filePaths);
    return [{ name: 'ERROR', content: '', error: 'filePaths is invalid: ' + JSON.stringify(filePaths), isText: false, size: 0 }];
  }
  
  const results = [];
  for (const filePath of filePaths) {
    try {
      console.log(`[main] Reading file: ${filePath}`);
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      const fileName = path.basename(filePath);
      
      // Support long paths on Windows by prefixing with \\?\
      const resolvedPath = process.platform === 'win32'
        ? `\\\\?\\${filePath}`
        : filePath;
      
      const stats = fs.statSync(resolvedPath);
      console.log(`[main] ${fileName}: size=${stats.size} bytes`);
      
      const buffer = fs.readFileSync(resolvedPath);
      console.log(`[main] Read ${buffer.length} bytes from ${fileName}`);
      
      if (TEXT_EXTS.includes(ext)) {
        const text = buffer.toString('utf-8');
        console.log(`[main] ${fileName} as text: ${text.length} chars`);
        results.push({
          name: fileName,
          content: text,
          isText: true,
          size: buffer.length
        });
      } else {
        const b64 = buffer.toString('base64');
        console.log(`[main] ${fileName} as base64: ${b64.length} chars`);
        results.push({
          name: fileName,
          content: b64,
          isText: false,
          size: buffer.length
        });
      }
    } catch (err) {
      console.error(`[main] Error reading ${filePath}:`, err.message);
      results.push({
        name: path.basename(filePath),
        content: '',
        error: `Ошибка чтения: ${err.message}`,
        size: 0
      });
    }
  }
  console.log(`[main] read-files returning ${results.length} results`);
  return results;
});

// ============================================================
// IPC: распаковка RAR (Фаза 3.1) — рендерер sandbox:true,
// поэтому node-unrar-js работает в main-процессе
// ============================================================
const { extractRarBase64 } = require('./rarExtract.cjs');

ipcMain.handle('archive:unrar', (_event, base64) => {
  try {
    if (typeof base64 !== 'string' || !base64) return { error: 'не переданы данные RAR-архива' };
    return extractRarBase64(base64);
  } catch (err) {
    console.error('[main] archive:unrar failed:', err.message);
    return { error: err.message };
  }
});

// ============================================================
// IPC handlers for ledger store (Фаза 1)
// JSON-файл в userData, атомарная запись (tmp+rename),
// автоматические бэкапы (.bak.1 = самый свежий, до 5 поколений)
// ============================================================
const STORE_FILENAME = 'financier-store.json';
const MAX_BACKUPS = 5;

function storePath() {
  return path.join(app.getPath('userData'), STORE_FILENAME);
}

function atomicWriteJson(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmp, filePath);
}

// Сдвигаем старые бэкапы: .bak.N -> .bak.N+1 (сверху вниз, чтобы не затирать)
function rotateBackups() {
  const base = storePath();
  for (let i = MAX_BACKUPS - 1; i >= 1; i--) {
    const from = base + '.bak.' + i;
    if (fs.existsSync(from)) fs.renameSync(from, base + '.bak.' + (i + 1));
  }
  if (fs.existsSync(base)) fs.renameSync(base, base + '.bak.1');
}

ipcMain.handle('store:load', () => {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, 'utf-8').trim();
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    // Основной файл повреждён — пробываем откатиться на бэкапы (свежие первыми)
    for (let i = 1; i <= MAX_BACKUPS; i++) {
      const bp = storePath() + '.bak.' + i;
      if (!fs.existsSync(bp)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(bp, 'utf-8'));
        console.warn(`[main] store: основной файл повреждён, восстановлен из бэкапа #${i}`);
        return data;
      } catch (_) { /* пробуем следующий бэкап */ }
    }
    console.error('[main] store:load failed:', err.message);
    return null;
  }
});

ipcMain.handle('store:save', (_event, data) => {
  if (!data || typeof data !== 'object') {
    return { ok: false, error: 'некорректные данные хранилища' };
  }
  try {
    const p = storePath();
    fs.mkdirSync(path.dirname(p), { recursive: true });
    rotateBackups();
    atomicWriteJson(p, data);
    return { ok: true };
  } catch (err) {
    console.error('[main] store:save failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('store:backups', () => {
  const out = [];
  for (let i = 1; i <= MAX_BACKUPS; i++) {
    const bp = storePath() + '.bak.' + i;
    if (fs.existsSync(bp)) {
      const st = fs.statSync(bp);
      out.push({ index: i, size: st.size, mtime: st.mtimeMs });
    }
  }
  return out;
});

ipcMain.handle('store:restoreBackup', (_event, index) => {
  const i = Number(index);
  if (!Number.isInteger(i) || i < 1 || i > MAX_BACKUPS) {
    return { ok: false, error: 'некорректный индекс бэкапа' };
  }
  try {
    const bp = storePath() + '.bak.' + i;
    if (!fs.existsSync(bp)) return { ok: false, error: 'бэкап не найден' };
    // Проверяем валидность бэкапа ПЕРЕД тем, как трогать текущие данные
    JSON.parse(fs.readFileSync(bp, 'utf-8'));
    rotateBackups();
    fs.renameSync(bp, storePath());
    return { ok: true };
  } catch (err) {
    console.error('[main] store:restoreBackup failed:', err.message);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('store:export', async () => {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return { ok: false, error: 'данные учёта пока пусты' };
    const res = await dialog.showSaveDialog(mainWindow, {
      title: 'Экспорт бэкапа учёта',
      defaultPath: `financier-backup-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'Бэкап Финансист.AI', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };
    fs.copyFileSync(p, res.filePath);
    return { ok: true, path: res.filePath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('store:import', async () => {
  try {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Восстановление из файла бэкапа',
      properties: ['openFile'],
      filters: [{ name: 'Бэкап Финансист.AI', extensions: ['json'] }],
    });
    if (res.canceled || !res.filePaths || !res.filePaths.length) return { ok: false, canceled: true };
    const data = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf-8'));
    if (typeof data !== 'object' || data === null || typeof data.schemaVersion !== 'number') {
      return { ok: false, error: 'файл не является бэкапом Финансист.AI' };
    }
    rotateBackups();
    atomicWriteJson(storePath(), data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});