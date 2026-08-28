/// <reference types="vite/client" />

declare module 'xls';

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

declare module '*.jpeg' {
  const src: string;
  export default src;
}

declare module '*.gif' {
  const src: string;
  export default src;
}

declare module '*.svg' {
  import React = require('react');
  export const ReactComponent: React.FC<React.SVGProps<SVGSVGElement>>;
  const src: string;
  export default src;
}

interface OpenFileDialogResult {
  canceled: boolean;
  filePaths?: string[];
}

interface ReadFileResult {
  name: string;
  content: string;
  isText: boolean;
  error?: string;
}

interface StoreBackupInfo {
  index: number;
  size: number;
  mtime: number;
}

interface StoreOpResult {
  ok: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
}

interface ElectronAPI {
  minimize: () => Promise<void>;
  maximize: () => Promise<void>;
  close: () => Promise<void>;
  isMaximized: () => Promise<boolean>;
  openFileDialog: () => Promise<OpenFileDialogResult>;
  readFiles: (filePaths: string[]) => Promise<ReadFileResult[]>;
  // RAR-архив (Фаза 3.1): base64 → содержимое (main-процесс, node-unrar-js)
  unrar?: (base64: string) => Promise<ReadFileResult[] | { error?: string }>;
  onFilesDropped: (callback: (files: ReadFileResult[]) => void) => (() => void);
  onFilesDroppedError: (callback: (errorMsg: string) => void) => void;
  store?: {
    load: () => Promise<unknown>;
    save: (data: unknown) => Promise<StoreOpResult>;
    backups: () => Promise<StoreBackupInfo[]>;
    restoreBackup: (index: number) => Promise<StoreOpResult>;
    export: () => Promise<StoreOpResult>;
    importFile: () => Promise<StoreOpResult>;
  };
}

interface Window {
  electronAPI?: ElectronAPI;
}
