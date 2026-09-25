import { jest } from '@jest/globals';
import { addDays, type Challenge, type Habit } from '@/lib/habits';

export const TODAY = '2026-09-24';

/** Freezes "now" at noon on TODAY (local time). */
export function freezeToday() {
  jest.useFakeTimers({ now: new Date(`${TODAY}T12:00:00`) });
}

export function habit(overrides: Partial<Habit> = {}): Habit {
  return {
    id: overrides.id ?? `h-${Math.random().toString(36).slice(2)}`,
    name: 'Read 10 pages',
    emoji: '📚',
    note: '',
    kind: 'build',
    createdAt: addDays(TODAY, -30),
    target: 1,
    reminders: [],
    log: {},
    proofs: {},
    ...overrides,
  };
}

/** Marks `h` fully done on each of the last `days` days (ending today unless `skipToday`). */
export function doneFor(h: Habit, days: number, { skipToday = false } = {}) {
  for (let i = skipToday ? 1 : 0; i < days + (skipToday ? 1 : 0); i++)
    h.log[addDays(TODAY, -i)] = h.target;
  return h;
}

export function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: `c-${Math.random().toString(36).slice(2)}`,
    habitId: 'h',
    habitName: 'Read',
    habitEmoji: '📚',
    habitKind: 'build',
    custom: false,
    title: null,
    length: 3,
    startDate: TODAY,
    completedAt: null,
    dismissed: false,
    ...overrides,
  };
}
