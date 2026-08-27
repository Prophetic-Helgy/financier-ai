import React, { useCallback, useRef, useState, useEffect, forwardRef, useImperativeHandle } from "react";
import { UploadCloud, File, AlertCircle } from "lucide-react";
import { cn } from "../lib/utils";

export interface FileData {
  content: string;
  name: string;
}

export interface FileUploaderHandle {
  triggerUpload: () => void;
}

interface FileUploaderProps {
  onFilesLoaded: (files: FileData[]) => void;
  accept?: string;
  modeColorClass?: string;
}

// Расширенный список accept-форматов для диалога выбора файлов
const ACCEPTED_FORMATS = ".txt,.csv,.json,.xml,.pdf,.xls,.xlsx,.xlsm,.xlsb,.ods,.odt,.doc,.docx,.rtf,.msg,.eml,.log,.html,.htm,.tsv,.rar,.zip,.7z,.tar,.gz,.sql,.db,.sqlite,.dat,.prn,.cbr,.cbz,.mxl";

// Поддерживаемые расширения
const SUPPORTED_EXTS = [
  'txt', 'csv', 'json', 'xml', 'pdf',
  'xls', 'xlsx', 'xlsm', 'xlsb', 'ods',
  'doc', 'docx', 'rtf', 'odt',
  'log', 'html', 'htm', 'tsv',
  'rar', 'zip', '7z', 'tar', 'gz',
  'sql', 'db', 'sqlite',
  'dat', 'prn',
  'msg', 'eml', 'cbr', 'cbz', 'mxl',
];

// Текстовые форматы
const TEXT_EXTS = ['txt', 'csv', 'json', 'xml', 'log', 'html', 'htm', 'tsv', 'rtf', 'sql'];

// Check if running in Electron
function isElectron(): boolean {
  return typeof window !== 'undefined' && (window as any).electronAPI !== undefined;
}

export const FileUploader = forwardRef<FileUploaderHandle, FileUploaderProps>(function FileUploader({ onFilesLoaded, accept, modeColorClass = "text-emerald-500" }, ref) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const onFilesLoadedRef = useRef(onFilesLoaded);
  onFilesLoadedRef.current = onFilesLoaded;

  // processFiles as a ref so it can be called from global drop handler
  const processFilesRef = useRef<(files: FileList | File[]) => void>(() => {});

  const processFiles = useCallback((files: FileList | File[]) => {
    setError(null);
    if (!files || files.length === 0) return;

    const validFiles: File[] = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        let ext = file.name.split('.').pop()?.toLowerCase() || '';
        // For cbr/cbz which are renamed rar/zip
        if (ext === 'cbr') ext = 'rar';
        if (ext === 'cbz') ext = 'zip';
        if (SUPPORTED_EXTS.includes(ext)) {
            validFiles.push(file);
        }
    }

    if (validFiles.length === 0) {
      setError("Формат не поддерживается. Разрешены: TXT, CSV, JSON, XML, PDF, Excel (XLS/XLSX), архивы (RAR/ZIP/7Z) и др.");
      return;
    }

    const promises = validFiles.map((file, idx) => {
        return new Promise<FileData>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result;
               resolve({
                   content: result as string,
                   name: file.name
               });
            };
            reader.onerror = () => reject(new Error(`Ошибка чтения ${file.name}`));
            reader.onabort = () => reject(new Error(`Чтение прервано ${file.name}`));

            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            if (TEXT_EXTS.includes(ext)) {
               reader.readAsText(file, "UTF-8");
            } else {
               reader.readAsDataURL(file);
            }
        });
    });

    Promise.all(promises)
        .then(results => {
            onFilesLoadedRef.current(results);
        })
        .catch(err => {
            console.error('[FileUploader] Error:', err);
            setError("Ошибка при чтении файлов: " + err.message);
        });
  }, []);

  // Sync processFiles into ref
  useEffect(() => {
    processFilesRef.current = processFiles;
  }, [processFiles]);

  // Global drag-and-drop: files dropped anywhere on the page are processed
  useEffect(() => {
    let handleGlobalDragOver: ((e: DragEvent) => void) | null = null;
    let handleGlobalDragEnter: ((e: DragEvent) => void) | null = null;
    let handleGlobalDrop: ((e: DragEvent) => void) | null = null;

    // --- Global drag-drop ---
    // In Electron: process files via dataTransfer.files (same as browser)
    // Main process 'drop-files' event is unreliable when renderer calls preventDefault
    if (isElectron()) {
      handleGlobalDragOver = (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      };
      handleGlobalDragEnter = (e: DragEvent) => {
        e.preventDefault();
      };
      // Electron: DO NOT call preventDefault() on drop!
      // In Electron (especially portable/packaged), preventDefault() in renderer
      // blocks the 'drop-files' event in main process. Instead, rely on IPC
      // (files-dropped) from main process which reads files from disk directly.
      handleGlobalDrop = (e: DragEvent) => {
        // Do NOT call e.preventDefault() — it blocks main process 'drop-files' event
        e.stopPropagation();
        // In Electron packaged mode, dataTransfer.files always has size=0
        // So we skip processing here and wait for IPC 'files-dropped' from main process
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          const hasRealFiles = Array.from(files).some(f => f.size > 0);
          if (hasRealFiles) {
            // Unpacked dev mode: files have real size, process directly
            processFilesRef.current(files);
          } else {
            // Packaged/portable mode: files have size=0, skip and wait for IPC
          }
        }
      };
    } else {
      // Browser: process drop directly
      handleGlobalDragOver = (e: DragEvent) => {
        e.preventDefault();
        if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy';
      };
      handleGlobalDragEnter = (e: DragEvent) => {
        e.preventDefault();
      };
      handleGlobalDrop = (e: DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
          processFilesRef.current(e.dataTransfer.files);
        }
      };
    }

    if (handleGlobalDragOver) {
      window.addEventListener('dragover', handleGlobalDragOver, { capture: true });
    }
    if (handleGlobalDragEnter) {
      window.addEventListener('dragenter', handleGlobalDragEnter, { capture: true });
    }
    if (handleGlobalDrop) {
      window.addEventListener('drop', handleGlobalDrop, { capture: true });
    }

    // --- Electron IPC: files-dropped handler ---
    const handleElectronFilesDropped = (files: Array<{ name: string; content: string; isText: boolean }>) => {
      const validFiles: FileData[] = [];
      for (const f of files) {
        let ext = f.name.split('.').pop()?.toLowerCase() || '';
        if (ext === 'cbr') ext = 'rar';
        if (ext === 'cbz') ext = 'zip';
        if (!SUPPORTED_EXTS.includes(ext)) continue;

        if (!f.isText) {
          validFiles.push({ content: `data:application/octet-stream;base64,${f.content}`, name: f.name });
        } else {
          validFiles.push({ content: f.content, name: f.name });
        }
      }

      if (validFiles.length > 0) {
        onFilesLoadedRef.current(validFiles);
      } else {
        setError("Формат не поддерживается. Разрешены: TXT, CSV, JSON, XML, PDF, Excel (XLS/XLSX), архивы (RAR/ZIP/7Z) и др.");
      }
    };

    const handleElectronFilesDroppedError = (errorMsg: string) => {
      console.error('[FileUploader] Electron drop error:', errorMsg);
      setError("Ошибка при чтении файла: " + errorMsg);
    };

    let cleanupElectron: (() => void) | null = null;

    if (isElectron()) {
      cleanupElectron = window.electronAPI!.onFilesDropped(handleElectronFilesDropped);
      window.electronAPI!.onFilesDroppedError(handleElectronFilesDroppedError);
    }

    return () => {
      if (handleGlobalDragOver) window.removeEventListener('dragover', handleGlobalDragOver, { capture: true });
      if (handleGlobalDragEnter) window.removeEventListener('dragenter', handleGlobalDragEnter, { capture: true });
      if (handleGlobalDrop) window.removeEventListener('drop', handleGlobalDrop, { capture: true });
      if (cleanupElectron) cleanupElectron();
    };
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging false if we're actually leaving the element
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    // In Electron: do NOT process via dataTransfer.files (size=0 due to security)
    // Instead, let main process will-navigate handle it via IPC
    if (!isElectron() && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Open file dialog using Electron native dialog with IPC read-back
  const handleOpenDialog = useCallback(async () => {
    if (isElectron()) {
      try {
        const result = await window.electronAPI!.openFileDialog();

        if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
          // In Electron with contextIsolation, we cannot use fs directly.
          // Instead, we use the IPC readFiles to get the content.
          const readResults = await window.electronAPI!.readFiles(result.filePaths);

          const validFiles: FileData[] = [];
          for (let i = 0; i < readResults.length; i++) {
            const r = readResults[i];
            if (r.error) {
              console.error('[FileUploader] Error reading', r.name, ':', r.error);
              continue;
            }
            
            let ext = r.name.split('.').pop()?.toLowerCase() || '';
            if (ext === 'cbr') ext = 'rar';
            if (ext === 'cbz') ext = 'zip';
            if (!SUPPORTED_EXTS.includes(ext)) {
              continue;
            }
            
            if (!r.isText) {
              validFiles.push({ content: `data:application/octet-stream;base64,${r.content}`, name: r.name });
            } else {
              validFiles.push({ content: r.content, name: r.name });
            }
          }
          
          if (validFiles.length > 0) {
            onFilesLoadedRef.current(validFiles);
          } else {
            setError("Формат не поддерживается. Разрешены: TXT, CSV, JSON, XML, PDF, Excel (XLS/XLSX), архивы (RAR/ZIP/7Z) и др.");
          }
        }
      } catch (err) {
        console.error('[FileUploader] Error in openFileDialog flow:', err);
        setError("Ошибка при открытии файлов: " + (err as Error).message);
      }
    } else {
      // Browser: use hidden file input
      fileInputRef.current?.click();
    }
  }, []);

  // Expose triggerUpload via ref
  useImperativeHandle(ref, () => ({
    triggerUpload: handleOpenDialog,
  }), [handleOpenDialog]);

  return (
    <div className="w-full">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); }}
        onDrop={handleDrop}
        onClick={handleOpenDialog}
        className={cn(
          "w-full h-64 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center p-6 cursor-pointer transition-all duration-300",
          isDragging
            ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_20px_rgba(99,102,241,0.2)]"
            : "border-[var(--border)] bg-[var(--surface-inner)] hover:border-slate-500 hover:bg-[var(--surface)]"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          accept={accept ?? ACCEPTED_FORMATS}
          multiple
          onChange={handleFileChange}
        />

        <div className={cn("p-4 rounded-full mb-4 transition-colors", isDragging ? "bg-indigo-500/20" : "bg-[var(--surface)]")}>
          <UploadCloud className={cn("h-8 w-8", isDragging ? "text-indigo-400" : modeColorClass)} />
        </div>

        <h3 className="text-[var(--fg)] text-lg font-medium mb-2 w-full text-center">
          {isDragging ? "Отпустите файлы здесь" : "Загрузите выписки или отчеты (можно пакетно)"}
        </h3>
        <p className="text-sm text-[var(--text-muted)] text-center max-w-sm pointer-events-none">
          Перетащите файлы сюда или нажмите для выбора из папки. Поддерживаются форматы: TXT, CSV, JSON, PDF, Excel.
        </p>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg flex items-center text-rose-400 text-sm">
          <AlertCircle className="h-4 w-4 mr-2 flex-shrink-0" />
          {error}
        </div>
      )}
    </div>
  );
});