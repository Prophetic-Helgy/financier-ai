import { useState } from "react";
import { TitleBar } from "./components/TitleBar";
import { Footer } from "./components/Footer";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { Home } from "./pages/Home";
import { Dashboard } from "./pages/Dashboard";

export default function App() {
  const [view, setView] = useState<'home' | 'dashboard'>('home');
  const [mode, setMode] = useState<string>('');

  const handleSelectMode = (selectedMode: string) => {
    setMode(selectedMode);
    setView('dashboard');
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[var(--bg)]">
      <TitleBar />
      <div className="flex-1 overflow-y-auto">
        <ErrorBoundary>
          {view === 'home' && <Home onSelectMode={handleSelectMode} />}
          {view === 'dashboard' && <Dashboard mode={mode} onBack={() => setView('home')} />}
        </ErrorBoundary>
      </div>
      <Footer />
    </div>
  );
}
