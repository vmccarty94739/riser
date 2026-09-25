// Run: deno test supabase/functions/coach
import assert from 'node:assert/strict';

import { buildDigest, coverage, periodStart, type CheckinRow, type HabitRow } from './stats.ts';

const TODAY = '2026-09-25'; // a Friday

const habit = (over: Partial<HabitRow>): HabitRow => ({
  id: 'h',
  name: 'Meditate',
  emoji: '🧘',
  kind: 'build',
  target: 1,
  created_on: '2026-08-01',
  ...over,
});

const done = (habitId: string, days: string[], count = 1): CheckinRow[] =>
  days.map((day) => ({ habit_id: habitId, day, count }));

Deno.test('periods: day, Monday of the week, first of the month', () => {
  assert.equal(periodStart('daily', TODAY), '2026-09-25');
  assert.equal(periodStart('weekly', TODAY), '2026-09-21');
  assert.equal(periodStart('weekly', '2026-09-21'), '2026-09-21'); // a Monday
  assert.equal(periodStart('weekly', '2026-09-27'), '2026-09-21'); // a Sunday
  assert.equal(periodStart('monthly', TODAY), '2026-09-01');
});

Deno.test('reflections cover complete days only; the nudge includes today', () => {
  assert.deepEqual(coverage('weekly', TODAY), { start: '2026-09-18', end: '2026-09-24' });
  assert.deepEqual(coverage('monthly', TODAY), { start: '2026-08-26', end: '2026-09-24' });
  assert.deepEqual(coverage('daily', TODAY), { start: '2026-09-12', end: '2026-09-25' });
});

Deno.test('weekly digest: rates, comparison, streaks, weekday pattern', () => {
  const meditate = habit({ id: 'm' });
  // Done every day of the week except Tue/Wed; the week before, every day.
  const week = ['2026-09-18', '2026-09-19', '2026-09-20', '2026-09-21', '2026-09-24'];
  const before = ['11', '12', '13', '14', '15', '16', '17'].map((d) => `2026-09-${d}`);
  const { text } = buildDigest({
    kind: 'weekly',
    today: TODAY,
    habits: [meditate],
    checkins: done('m', [...before, ...week]),
    challenges: [],
  });
  assert.match(text, /Done 5\/7 \(71%\)/);
  assert.match(text, /previous 7 days: 7\/7 \(100%\)/);
  assert.match(text, /Current streak: 1 day/);
  assert.match(text, /Best streak \(last 120 days\): 11/);
  assert.match(text, /Tue ✗ {2}Wed ✗/);
});

Deno.test('quit habits read as clean days; partial multi-check-ins show as ◐', () => {
  const smoke = habit({ id: 's', name: 'Smoking', emoji: '🚬', kind: 'quit' });
  const water = habit({ id: 'w', name: 'Water', emoji: '💧', target: 8 });
  const { text } = buildDigest({
    kind: 'daily',
    today: TODAY,
    habits: [smoke, water],
    checkins: [...done('s', ['2026-09-24']), ...done('w', ['2026-09-24'], 3), ...done('w', [TODAY], 5)],
    challenges: [],
  });
  assert.match(text, /Smoking — BAD habit the user is quitting \(✓ = a clean day/);
  assert.match(text, /Thu ◐/);
  assert.match(text, /Today so far: 5\/8/);
});

Deno.test('new habits are not counted before they existed', () => {
  const fresh = habit({ id: 'f', created_on: '2026-09-23' });
  const { text } = buildDigest({
    kind: 'weekly',
    today: TODAY,
    habits: [fresh],
    checkins: done('f', ['2026-09-23', '2026-09-24']),
    challenges: [],
  });
  assert.match(text, /Done 2\/2 \(100%\)/);
  assert.match(text, /previous 7 days: not tracked yet/);
  assert.match(text, /Fri –/);
});

Deno.test('active challenges and trophies are listed', () => {
  const { text } = buildDigest({
    kind: 'weekly',
    today: TODAY,
    habits: [habit({ id: 'm' })],
    checkins: [],
    challenges: [
      { habit_id: 'm', habit_name: 'Meditate', custom: false, title: null, length: 7, start_date: '2026-09-23', completed_at: null, dismissed: false },
      { habit_id: 'm', habit_name: 'Meditate', custom: false, title: null, length: 3, start_date: '2026-09-19', completed_at: '2026-09-21', dismissed: false },
    ],
  });
  assert.match(text, /Active challenge: Meditate, day 3 of 7/);
  assert.match(text, /Trophy earned in this window: 3-day challenge for Meditate/);
});
