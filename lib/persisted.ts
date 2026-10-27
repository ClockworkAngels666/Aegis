import { useCallback, useSyncExternalStore } from "react";

/**
 * A tiny persisted preference (localStorage, with an in-memory fallback when storage is
 * blocked). Server rendering always sees the fallback, so markup hydrates cleanly.
 */
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

function readRaw(key: string): string | null {
  if (memory.has(key)) return memory.get(key)!;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", cb);
  };
}

export function usePersisted<T extends string>(key: string, fallback: T, allowed: readonly T[]): [T, (v: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => {
      const raw = readRaw(key);
      return (allowed as readonly string[]).includes(raw ?? "") ? (raw as T) : fallback;
    },
    () => fallback,
  );
  const set = useCallback((v: T) => {
    memory.set(key, v);
    try {
      window.localStorage.setItem(key, v);
    } catch {
      /* storage blocked: keep the in-memory value */
    }
    listeners.forEach((l) => l());
  }, [key]);
  return [value, set];
}
