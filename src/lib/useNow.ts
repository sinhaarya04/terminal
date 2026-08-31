import { useSyncExternalStore } from 'react';

// One clock for the whole app. Market phase is derived from `Date.now()` rather
// than stored, which is what keeps it right across reloads and sleeping
// laptops — but it also means nothing re-renders on its own when a close
// passes. This is the nudge: a single interval that ticks a shared value, so
// countdowns update and a market flips to `closed` on its own within one tick.
//
// One interval, not one per component: a board of twenty markets should not own
// twenty timers. The interval only runs while something is actually subscribed.

const TICK_MS = 30_000;

let now = Date.now();
let timer: ReturnType<typeof setInterval> | null = null;
const listeners = new Set<() => void>();

function start() {
  if (timer) return;
  timer = setInterval(() => {
    now = Date.now();
    listeners.forEach((l) => l());
  }, TICK_MS);
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  start();
  return () => {
    listeners.delete(cb);
    if (listeners.size === 0 && timer) { clearInterval(timer); timer = null; }
  };
}

/** Current epoch ms, refreshed every 30s. Read it wherever a render depends on
 *  the clock — a countdown, or whether a market has closed. */
export function useNow(): number {
  // getSnapshot has to be referentially stable between ticks or React re-runs
  // the render forever, so the module-level `now` is returned rather than a
  // fresh Date.now() on every call.
  return useSyncExternalStore(subscribe, () => now, () => now);
}
