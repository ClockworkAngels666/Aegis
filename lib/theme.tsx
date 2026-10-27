"use client";

import { createContext, useContext, useLayoutEffect, type ReactNode } from "react";
import { usePersisted } from "./persisted";

export type Theme = "light" | "dark";
const ThemeContext = createContext<{ theme: Theme; setTheme: (t: Theme) => void } | null>(null);

/** Runs before first paint (in <head>) so a saved dark theme never flashes light. */
export const THEME_SCRIPT =
  "try{if(localStorage.getItem('aegis-theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}";

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = usePersisted<Theme>("aegis-theme", "light", ["light", "dark"]);
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
