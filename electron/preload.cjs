const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls for frameless window
  minimize: () => ipcRenderer.invoke('minimize'),
  maximize: () => ipcRenderer.invoke('maximize'),
  close: () => ipcRenderer.invoke('close'),
  isMaximized: () => ipcRenderer.invoke('isMaximized'),
  // File dialog
  openFileDialog: () => ipcRenderer.invoke('open-file-dialog'),
  // Read files from filesystem
  readFiles: (filePaths) => ipcRenderer.invoke('read-files', filePaths),
  // RAR-архив (Фаза 3.1): base64 → файлы архива (main-процесс)
  unrar: (base64) => ipcRenderer.invoke('archive:unrar', base64),
  // Listen for files dropped on the Electron window (IPC-based drag-drop)
  onFilesDropped: (callback) => {
    const handler = (_event, files) => callback(files);
    ipcRenderer.on('files-dropped', handler);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener('files-dropped', handler);
    };
  },
  onFilesDroppedError: (callback) => {
    ipcRenderer.on('files-dropped-error', (_event, errorMsg) => callback(errorMsg));
  },
  // Хранилище учёта (Фаза 1): JSON в userData, бэкапы
  store: {
    load: () => ipcRenderer.invoke('store:load'),
    save: (data) => ipcRenderer.invoke('store:save', data),
    backups: () => ipcRenderer.invoke('store:backups'),
    restoreBackup: (index) => ipcRenderer.invoke('store:restoreBackup', index),
    export: () => ipcRenderer.invoke('store:export'),
    importFile: () => ipcRenderer.invoke('store:import'),
  },
});
