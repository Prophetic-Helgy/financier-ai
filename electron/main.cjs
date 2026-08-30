const { app, BrowserWindow, ipcMain, dialog, session, shell } = require('electron');
const path = require('path');
const fs = require('fs');
// Политики безопасности (пентест 2026-08-30) — чистые функции, tsx-тесты:
const { classifyNavigation, isSafeExternalUrl } = require('./securityPolicy.cjs');
const { validateBackupShape } = require('./storeShape.cjs');

let mainWindow;

// TEXT_EXTS for drop handler (same as read-files handler)
const TEXT_EXTS_DROP = ['txt', 'csv', 'json', 'xml', 'log', 'html', 'htm', 'tsv', 'rtf', 'sql'];

// ============================================================
// ПРОЧТЕНИЕ ФАЙЛОВ: provenance + лимит размера (пентест, находка #2).
// read-files обслуживает только пути, выданные системным диалогом или
// полученные через drop; каждый путь — на одно чтение, 10 минут.
// ============================================================
const READ_FILE_MAX_BYTES = 64 * 1024 * 1024; // 64 МБ на файл
const GRANT_TTL_MS = 10 * 60 * 1000;
const grantedReadPaths = new Map(); // resolvedPath -> expiryMs

function grantReadPath(filePath) {
  const resolved = process.platform === 'win32' ? `\\\\?\\${filePath}` : filePath;
  // чистим протухшие заодно
  const now = Date.now();
  for (const [p, exp] of grantedReadPaths) if (exp < now) grantedReadPaths.delete(p);
  grantedReadPaths.set(resolved, now + GRANT_TTL_MS);
  return resolved;
}

function consumeReadGrant(resolvedPath) {
  const exp = grantedReadPaths.get(resolvedPath);
  if (exp === undefined) return false;
  if (exp < Date.now()) { grantedReadPaths.delete(resolvedPath); return false; }
  grantedReadPaths.delete(resolvedPath); // одноразово
  return true;
}

// Единый читатель файлов для обеих drop-цепочек (drop-files и will-navigate):
// нормализация \\?\ + лимит READ_FILE_MAX_BYTES (пентест, находки #2/#6-кап).
function readDroppedFileData(filePath) {
  const ext = path.extname(filePath).toLowerCase().replace('.', '');
  const fileName = path.basename(filePath);
  const resolvedPath = process.platform === 'win32' ? `\\\\?\\${filePath}` : filePath;
  const stats = fs.statSync(resolvedPath);
  if (stats.size > READ_FILE_MAX_BYTES) {
    throw new Error(`файл слишком большой (${Math.round(stats.size / 1024 / 1024)} МБ; максимум 64 МБ)`);
  }
  const buffer = fs.readFileSync(resolvedPath);
  console.log(`[main] dropped ${fileName}: ${buffer.length} bytes`);
  if (TEXT_EXTS_DROP.includes(ext)) {
    return { name: fileName, content: buffer.toString('utf-8'), isText: true, size: buffer.length };
  }
  return { name: fileName, content: buffer.toString('base64'), isText: false, size: buffer.length };
}


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
        fileData.push(readDroppedFileData(filePath));
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

  // ============================================================
  // LOCKDOWN НАВИГАЦИИ (пентест 2026-08-30, находка #1 — критично):
  // в окно приложения не пускаем НИКАКОЙ внешний контент — удалённая
  // страница получила бы доступ к preload-мосту (readFiles, store:*).
  // http(s)/mailto-ссылки (в т.ч. markdown из LLM-отчётов) уходят
  // в системный браузер через shell.openExternal.
  // ============================================================
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const decision = classifyNavigation(url, { isPackaged: app.isPackaged });
    if (decision === 'external' && isSafeExternalUrl(url)) shell.openExternal(url);
    return { action: 'deny' }; // new-window всегда запрещён
  });

  // Подфреймы/iframe в приложении не используются — блокируем любые
  mainWindow.webContents.on('will-frame-navigate', (event) => {
    event.preventDefault();
  });

  // FALLBACK: will-navigate — заодно единственный обработчик навигации
  mainWindow.webContents.on('will-navigate', (event, navigationUrl) => {
    const decision = classifyNavigation(navigationUrl, { isPackaged: app.isPackaged });
    if (decision === 'allow') return; // dev-сервер (vite) в dev-режиме
    event.preventDefault();
    if (decision === 'external') {
      if (isSafeExternalUrl(navigationUrl)) shell.openExternal(navigationUrl);
      return;
    }
    if (decision !== 'read-drop') return; // 'block'

    // file:// навигация = файл, брошенный в окно (поведение Chromium) — импорт
    let filePath = navigationUrl.slice(7); // remove 'file://'
    // On Windows, URLs like file:///C:/path become /C:/path
    if (process.platform === 'win32' && filePath.startsWith('/')) {
      filePath = filePath.slice(1);
    }
    filePath = decodeURIComponent(filePath);
    console.log(`[main] will-navigate drop fallback: ${filePath}`);
    try {
      mainWindow.webContents.send('files-dropped', [readDroppedFileData(filePath)]);
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
  
  // Listen for load failures (Electron 30+: события отдают details-объект)
  mainWindow.webContents.on('did-fail-load', (_event, details) => {
    console.error('[main] did-fail-load:', details.errorCode, details.errorDescription);
  });

  mainWindow.webContents.on('console-message', (_event, details) => {
    console.log(`[renderer] ${details.level}: ${details.message}`);
  });
}

app.whenReady().then(() => {
  // Ни одна permission-запись (камера, микрофон, геолокация, уведомления…)
  // приложению не нужна — отказываем централизованно (оборона в глубину).
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
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
  // Провенанс (пентест, находка #2): read-files обслужит только пути,
  // которые пользователь сам выбрал в системном диалоге.
  if (result && !result.canceled && Array.isArray(result.filePaths)) {
    for (const p of result.filePaths) grantReadPath(p);
  }
  return result;
});

// ============================================================
// IPC handler for reading files (returns base64 or text)
// ============================================================

ipcMain.handle('read-files', async (_event, filePaths) => {
  console.log('[main] read-files called with:', filePaths);
  
  if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
    console.error('[main] read-files: INVALID filePaths!', filePaths);
    return [{ name: 'ERROR', content: '', error: 'filePaths is invalid: ' + JSON.stringify(filePaths), isText: false, size: 0 }];
  }
  
  const results = [];
  for (const filePath of filePaths) {
    try {
      // Провенанс (пентест, находка #2): читаем только пути, выданные диалогом;
      // grant одноразовый, кап 64 МБ — внутри readDroppedFileData.
      const resolvedPath = process.platform === 'win32' ? `\\\\?\\${filePath}` : filePath;
      if (!consumeReadGrant(resolvedPath)) {
        console.error(`[main] read-files DENIED (no provenance): ${filePath}`);
        results.push({
          name: path.basename(filePath),
          content: '',
          error: 'файл не был выбран в диалоге — чтение запрещено политикой безопасности',
          size: 0
        });
        continue;
      }
      const fileData = readDroppedFileData(filePath);
      console.log(`[main] read-files: ${fileData.name}, ${fileData.size} bytes, isText=${fileData.isText}`);
      results.push(fileData);
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
// IPC: курсы ЦБ РФ на дату (Фаза 3.3) — официальный XML-справочник.
// Запрос из main: у cbr.ru нет CORS-заголовков для рендерера
// (см. cbrService.ts), а Node-fetch в main их не ограничен.
// ============================================================
ipcMain.handle('fx:cbr', async (_event, dateIso) => {
  try {
    if (typeof dateIso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateIso)) {
      return { error: 'некорректная дата (нужно ГГГГ-ММ-ДД)' };
    }
    const dmy = dateIso.split('-').reverse().join('/');
    const res = await fetch(`https://www.cbr.ru/scripts/XML_daily.asp?date_req=${dmy}`);
    if (!res.ok) return { error: 'ЦБ вернул HTTP ' + res.status };
    const xml = await res.text();
    const rates = [];
    for (const m of xml.matchAll(/<Valute ID="[^"]*">([\s\S]*?)<\/Valute>/g)) {
      const block = m[1];
      const code = (block.match(/<CharCode>(.*?)<\/CharCode>/) || [])[1];
      const nominal = parseInt((block.match(/<Nominal>(.*?)<\/Nominal>/) || [])[1] || '1', 10) || 1;
      const value = parseFloat(((block.match(/<Value>(.*?)<\/Value>/) || [])[1] || '').replace(',', '.'));
      if (code && Number.isFinite(value) && value > 0) {
        rates.push({ code: code.trim(), rate: value / nominal });
      }
    }
    if (!rates.length) return { error: 'в ответе ЦБ нет валют (возможно, не рабочий день)' };
    return { date: dateIso, rates };
  } catch (err) {
    console.error('[main] fx:cbr failed:', err.message);
    return { error: err.message || 'нет соединения' };
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

// Читаем + разбираем + ПРОВЕРЯЕМ ФОРМУ (пентест, находка #3): файл на диске
// мог быть подменён (поддельная роль admin, __proto__, мусорный schemaVersion).
function readValidatedStoreJson(p) {
  const raw = fs.readFileSync(p, 'utf-8').trim();
  if (!raw) return null;
  const data = JSON.parse(raw);
  const v = validateBackupShape(data, { jsonLen: raw.length });
  if (!v.ok) throw new Error(`некорректная форма хранилища: ${v.error}`);
  return data;
}

ipcMain.handle('store:load', () => {
  try {
    const p = storePath();
    if (!fs.existsSync(p)) return null;
    return readValidatedStoreJson(p);
  } catch (err) {
    // Основной файл повреждён/подменён — пробываем откатиться на бэкапы (свежие первыми)
    for (let i = 1; i <= MAX_BACKUPS; i++) {
      const bp = storePath() + '.bak.' + i;
      if (!fs.existsSync(bp)) continue;
      try {
        const data = readValidatedStoreJson(bp);
        console.warn(`[main] store: основной файл повреждён, восстановлен из бэкапа #${i}`);
        return data;
      } catch (_) { /* пробуем следующий бэкап */ }
    }
    console.error('[main] store:load failed:', err.message);
    return null;
  }
});

ipcMain.handle('store:save', (_event, data) => {
  // Валидация и перед записью (пентест, находка #3): скомпрометированный
  // рендерер не должен иметь возможности положить на диск поддельные роли
  // или __proto__-нагрузки, которые переживут перезапуск.
  const v = validateBackupShape(data, { jsonLen: (() => { try { return JSON.stringify(data).length; } catch { return Infinity; } })() });
  if (!v.ok) {
    console.error('[main] store:save rejected:', v.error);
    return { ok: false, error: v.error };
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
    // Проверяем валидность И ФОРМУ бэкапа ПЕРЕД тем, как трогать текущие данные
    readValidatedStoreJson(bp);
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
    // Полная проверка формы бэкапа (пентест, находка #3): роль/структура/__proto__/размер
    const data = readValidatedStoreJson(res.filePaths[0]);
    if (!data) return { ok: false, error: 'файл пуст' };
    rotateBackups();
    atomicWriteJson(storePath(), data);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});