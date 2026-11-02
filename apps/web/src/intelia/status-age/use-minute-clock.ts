import { useSyncExternalStore } from "react";

// Design 23 §5: chips advance on their own, recomputed every minute from the
// entry date without asking the API again. One interval serves every chip on
// screen and stops when the last one unmounts.
const listeners = new Set<() => void>();
let now = Date.now();
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    now = Date.now();
    timer = setInterval(() => {
      now = Date.now();
      for (const notify of listeners) notify();
    }, 60_000);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const getSnapshot = () => now;

export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
