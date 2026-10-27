import { useEffect, useRef } from "react";
import { healthy } from "./api";

/** While `waiting`, checks the backend every few seconds and calls `onBack` once it answers again. */
export function useReconnect(waiting: boolean, onBack: () => void) {
  const callback = useRef(onBack);
  useEffect(() => {
    callback.current = onBack;
  });
  useEffect(() => {
    if (!waiting) return;
    let stopped = false;
    let timer = 0;
    const check = async () => {
      if (await healthy()) {
        if (!stopped) callback.current();
      } else if (!stopped) {
        timer = window.setTimeout(check, 3000);
      }
    };
    timer = window.setTimeout(check, 2000);
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [waiting]);
}
