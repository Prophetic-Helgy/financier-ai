import { Minus, Square, X } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import logoUrl from "../assets/logo.png";

export function TitleBar() {
  const handleMinimize = () => {
    window.electronAPI?.minimize().catch(() => {});
  };

  const handleMaximize = () => {
    window.electronAPI?.maximize().catch(() => {});
  };

  const handleClose = () => {
    window.electronAPI?.close().catch(() => {});
  };

  const isElectron = typeof window.electronAPI !== "undefined";

  return (
    <div
      className="h-12 border-b border-[var(--border)] bg-[var(--surface)] flex flex-shrink-0 items-center justify-between px-4 sticky top-0 z-50 select-none"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left side: Logo and Title */}
      <div className="flex items-center space-x-3">
        <img
          src={logoUrl}
          alt="Финансист.AI"
          className="w-8 h-8 object-contain"
          draggable={false}
        />
        <span className="font-bold text-sm tracking-tight text-[var(--fg)] uppercase">Финансист.AI</span>
      </div>

      {/* Middle: Theme Toggle — drag zone continues here */}
      <div
        className="hidden md:flex flex-1 justify-center opacity-80 hover:opacity-100 transition-opacity"
      >
         <ThemeToggle />
      </div>

      {/* Right side: Window Controls - no-drag for buttons only */}
      <div className="flex items-center space-x-2">
        <div className="md:hidden mr-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
           <ThemeToggle />
        </div>
        {isElectron && (
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties} className="flex space-x-1 text-[var(--text-muted)]">
            <button
              onClick={handleMinimize}
              className="w-10 h-full rounded-l flex items-center justify-center hover:bg-[var(--surface-inner)] hover:text-[var(--fg)] transition-colors"
              title="Свернуть"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleMaximize}
              className="w-10 h-full flex items-center justify-center hover:bg-[var(--surface-inner)] hover:text-[var(--fg)] transition-colors"
              title="Развернуть / Свернуть"
            >
              <Square className="w-3 h-3" />
            </button>
            <button
              onClick={handleClose}
              className="w-12 h-full rounded-r flex items-center justify-center hover:bg-rose-500 hover:text-white transition-colors"
              title="Закрыть"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}