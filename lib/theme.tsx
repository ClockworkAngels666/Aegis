"use client";

import { createContext, useContext, useLayoutEffect, useSyncExternalStore, type ReactNode } from "react";
import { usePersisted } from "./persisted";

export type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

/** Runs before first paint (in <head>) so a dark theme never flashes light. Without a saved choice, follow the system. */
export const THEME_SCRIPT =
  "try{var t=localStorage.getItem('aegis-theme');if(t==='dark'||(t!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}";

const DARK_QUERY = "(prefers-color-scheme: dark)";
function subscribeSystem(cb: () => void) {
  const m = window.matchMedia(DARK_QUERY);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [saved, setTheme] = usePersisted<Theme | "system">("aegis-theme", "system", ["light", "dark", "system"]);
  const systemDark = useSyncExternalStore(subscribeSystem, () => window.matchMedia(DARK_QUERY).matches, () => false);
  const theme: Theme = saved === "system" ? (systemDark ? "dark" : "light") : saved;
  // Layout effect: the class must be on <html> before child effects (the 3D views) read theme colours.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
