/**
 * The app's notion of "now". Developer tools can shift it by whole days to test
 * challenges and streaks without waiting. Always 0 outside development.
 */
let offsetDays = 0;

export function now() {
  const date = new Date();
  if (offsetDays) date.setDate(date.getDate() + offsetDays);
  return date;
}

export function clockOffset() {
  return offsetDays;
}

export function setClockOffset(days: number) {
  offsetDays = __DEV__ ? days : 0;
}
