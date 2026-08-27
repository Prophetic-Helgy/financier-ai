import { useState, useEffect, useRef } from 'react';

export function LogViewer() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: any) => {
      if (e.data && typeof e.data === 'object' && e.data.__log) {
        setLogs(prev => [...prev.slice(-200), e.data.__log]);
      }
    };
    window.addEventListener('message', handler);

    // Monkey-patch console — только в dev. В production не трогаем console:
    // риск искажения поведения библиотек и накрутки памяти (logs в state).
    if (!import.meta.env.DEV) {
      return () => {
        window.removeEventListener('message', handler);
      };
    }

    const origLog = console.log;
    const origError = console.error;
    const origWarn = console.warn;

    console.log = (...args: any[]) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      setLogs(prev => [...prev.slice(-200), '[log] ' + msg]);
      origLog.apply(console, args);
    };
    console.error = (...args: any[]) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      setLogs(prev => [...prev.slice(-200), '[error] ' + msg]);
      origError.apply(console, args);
    };
    console.warn = (...args: any[]) => {
      const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
      setLogs(prev => [...prev.slice(-200), '[warn] ' + msg]);
      origWarn.apply(console, args);
    };

    setLogs(['[System] Log viewer initialized at ' + new Date().toLocaleTimeString()]);

    return () => {
      window.removeEventListener('message', handler);
      console.log = origLog;
      console.error = origError;
      console.warn = origWarn;
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(logs.join('\n'));
  };

  const clearLogs = () => {
    setLogs(['[System] Logs cleared at ' + new Date().toLocaleTimeString()]);
  };

  return (
    <div className="mx-4 mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-gray-800 text-gray-400 hover:bg-gray-700 transition-colors"
      >
        <div className={"w-2 h-2 rounded-full " + (logs.length > 1 ? 'bg-yellow-500' : 'bg-green-500')} />
        Debug Logs ({logs.length})
        <svg className={"w-3 h-3 transition-transform " + (isOpen ? 'rotate-180' : '')} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="mt-2 rounded-lg border border-gray-700 bg-gray-950 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 bg-gray-900 border-b border-gray-700">
            <span className="text-xs text-gray-400 font-mono">Console Output</span>
            <div className="flex gap-2">
              <button onClick={copyToClipboard} className="text-xs text-blue-400 hover:text-blue-300">
                Copy
              </button>
              <button onClick={clearLogs} className="text-xs text-red-400 hover:text-red-300">
                Clear
              </button>
            </div>
          </div>
          <div className="max-h-64 overflow-y-auto p-3 font-mono text-xs space-y-0.5">
            {logs.map((log, i) => {
              let color = 'text-gray-300';
              if (log.includes('error') || log.includes('ERROR')) color = 'text-red-400';
              else if (log.includes('warn')) color = 'text-yellow-400';
              else if (log.includes('[main]')) color = 'text-cyan-400';
              else if (log.includes('[FileUploader]')) color = 'text-green-400';
              else if (log.includes('[handleFilesLoaded]')) color = 'text-purple-400';
              else if (log.includes('[parseDocument]')) color = 'text-orange-400';

              return (
                <div key={i} className={color + ' whitespace-pre-wrap break-all'}>
                  {log}
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}