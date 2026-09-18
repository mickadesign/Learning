"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { DECK } from "@/data";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = `${DECK.slug}-theme`;

// Runs before hydration to set the initial `.dark` class and avoid a flash.
// An explicit stored choice wins; otherwise follow the browser's color scheme.
export const themeInitScript = `
(function () {
  try {
    var t = localStorage.getItem("${STORAGE_KEY}");
    var dark = t
      ? t === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (dark) document.documentElement.classList.add("dark");
  } catch (e) {}
})();
`;

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light");
  const [mounted, setMounted] = useState(false);
  // Only an explicit toggle (or a previously stored choice) is persisted —
  // until then the theme keeps following the browser's color scheme.
  const hasExplicitChoice = useRef(false);

  // Sync from the class the init script already applied.
  useEffect(() => {
    setTheme(
      document.documentElement.classList.contains("dark") ? "dark" : "light"
    );
    try {
      hasExplicitChoice.current = localStorage.getItem(STORAGE_KEY) !== null;
    } catch {}
    setMounted(true);
  }, []);

  // Follow live system-theme changes while no explicit choice exists.
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      if (!hasExplicitChoice.current) setTheme(e.matches ? "dark" : "light");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Apply the class as a pure effect of `theme` — never inside the state
  // updater, which React Strict Mode double-invokes (cancelling the toggle).
  useEffect(() => {
    if (!mounted) return;
    document.documentElement.classList.toggle("dark", theme === "dark");
    if (hasExplicitChoice.current) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {}
    }
  }, [theme, mounted]);

  const toggle = useCallback(() => {
    hasExplicitChoice.current = true;
    setTheme((prev) => (prev === "dark" ? "light" : "dark"));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
