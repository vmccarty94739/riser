/**
 * The app's notion of "now". In development the dev tools can shift it by whole days, through
 * `globalThis.__riserClockOffset`, to test challenges and streaks without waiting. Every read of it
 * sits behind `__DEV__`, so release builds contain no trace of it and "now" is always the real date.
 */
declare global {
  var __riserClockOffset: number | undefined;
}

/** Days the dev tools have shifted "now" by. Always 0 in release builds. */
export function clockOffset() {
  return __DEV__ ? (globalThis.__riserClockOffset ?? 0) : 0;
}

export function now() {
  const date = new Date();
  const offset = clockOffset();
  if (offset) date.setDate(date.getDate() + offset);
  return date;
}
