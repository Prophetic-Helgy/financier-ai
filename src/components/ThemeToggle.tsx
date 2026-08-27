import { Moon, Sun, Monitor } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";

type Theme = "light" | "dark" | "system";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    return (localStorage.getItem("theme") as Theme) || "system";
  });

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("light", "dark");
    
    if (theme === "system") {
      const systemTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
      root.classList.add(systemTheme);
    } else {
      root.classList.add(theme);
    }
    
    localStorage.setItem("theme", theme);
  }, [theme]);

  // Listen for system theme changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;
    
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const root = window.document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(mql.matches ? "dark" : "light");
    };
    
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [theme]);

  const btnBase = "p-1.5 rounded-full transition-colors cursor-pointer";
  const btnActive = "bg-[var(--bg)] text-[var(--fg)] shadow-sm";
  const btnInactive = "text-[var(--text-muted)] hover:text-[var(--fg)]";

  return (
    <div className="flex items-center space-x-1 rounded-full bg-[var(--surface)] p-1 border border-[var(--border)] shadow-sm">
      <button
        onClick={() => setTheme("light")}
        className={cn(btnBase, theme === "light" ? btnActive : btnInactive)}
        title="Светлая тема"
        type="button"
      >
        <Sun className="h-4 w-4" />
      </button>
      <button
        onClick={() => setTheme("system")}
        className={cn(btnBase, theme === "system" ? btnActive : btnInactive)}
        title="Системная тема"
        type="button"
      >
        <Monitor className="h-4 w-4" />
      </button>
      <button
        onClick={() => setTheme("dark")}
        className={cn(btnBase, theme === "dark" ? btnActive : btnInactive)}
        title="Тёмная тема"
        type="button"
      >
        <Moon className="h-4 w-4" />
      </button>
    </div>
  );
}