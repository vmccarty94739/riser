import { describe, expect, it } from '@jest/globals';

import {
  buildDigest,
  type CheckinRow,
  type HabitRow,
} from '../../../supabase/functions/coach/stats';
import { dailyByRules, reflectionByRules, tipFor } from '@/lib/coach-rules';
import { addDays, parseDay } from '@/lib/habits';

import { TODAY } from './helpers';

const habit = (over: Partial<HabitRow>): HabitRow => ({
  id: 'h',
  name: 'Read 10 pages',
  emoji: '📚',
  kind: 'build',
  target: 1,
  created_on: addDays(TODAY, -40),
  ...over,
});
/** Check-ins for the last `from` days (not today) where `pick(daysAgo)` gives the count. */
const log = (id: string, from: number, pick: (n: number) => number): CheckinRow[] =>
  Array.from({ length: from }, (_, i) => i + 1)
    .map((n) => ({ habit_id: id, day: addDays(TODAY, -n), count: pick(n) }))
    .filter((c) => c.count > 0);

const daily = (habits: HabitRow[], checkins: CheckinRow[]) =>
  dailyByRules(
    buildDigest({ kind: 'daily', today: TODAY, habits, checkins, challenges: [] }),
    parseDay(TODAY).getDay()
  );

describe('rule-based coach: daily nudge', () => {
  it('protects a streak that is still open today', () => {
    const out = daily(
      [habit({ id: 'r' })],
      log('r', 6, () => 1)
    );
    expect(out.title).toBe('Protect your 6-day streak');
    expect(out.body).toContain('Read 10 pages is on a 6-day run');
    expect(out.tip).toMatch(/book/);
  });

  it('suggests a smaller goal when a multi-check-in habit keeps stalling', () => {
    const water = habit({ id: 'w', name: 'Drink water', emoji: '💧', target: 8 });
    const out = daily(
      [water],
      log('w', 13, () => 3)
    );
    expect(out.title).toBe('Make Drink water easier to win');
    expect(out.tip).toBe('Try a goal of 5 instead of 8 for a week, then build back up.');
  });

  it('encourages getting back on track after a relapse', () => {
    const smoke = habit({ id: 's', name: 'No smoking', emoji: '🚬', kind: 'quit' });
    const out = daily(
      [smoke],
      log('s', 13, (n) => (n === 1 ? 0 : 1))
    );
    expect(out.title).toBe('Back on track with No smoking');
    expect(out.tip).toMatch(/craving/);
  });

  it('names the weekday a slipping habit usually misses', () => {
    const walk = habit({ id: 'k', name: 'Go for a walk', emoji: '🚶' });
    // Missed on the same weekday as today (1, 7 days ago…) plus others: well under 60%.
    const out = daily(
      [walk],
      log('k', 13, (n) => (n % 7 === 0 || n % 2 === 0 ? 0 : 1))
    );
    expect(out.title).toBe('Go for a walk needs some love');
    expect(out.body).toMatch(/Go for a walk is at \d+%/);
  });

  it('gives new users a fresh-start nudge instead of fake trends', () => {
    const fresh = habit({ id: 'm', name: 'Meditate', created_on: addDays(TODAY, -1) });
    const out = daily([fresh], [{ habit_id: 'm', day: addDays(TODAY, -1), count: 1 }]);
    expect(out.title).toBe('Fresh start 🌱');
  });
});

describe('rule-based coach: tips and reflections', () => {
  it('tells quitting a drink apart from drinking water', () => {
    expect(tipFor({ name: 'No drinking', kind: 'quit' })).toMatch(/isn’t alcohol/);
    expect(tipFor({ name: 'Drink water', kind: 'build' })).toMatch(/bottle/);
    expect(tipFor({ name: 'Go for a walk', kind: 'build' }, 'Tue')).toMatch(/^Tuesdays are when/);
  });

  it('leads a weekly reflection with the most consistent habit, then what slipped', () => {
    const read = habit({ id: 'r' });
    const walk = habit({ id: 'k', name: 'Go for a walk', emoji: '🚶' });
    const out = reflectionByRules(
      buildDigest({
        kind: 'weekly',
        today: TODAY,
        habits: [read, walk],
        checkins: [
          ...log('r', 14, () => 1),
          ...log('k', 14, (n) => (n <= 7 && n % 2 ? 1 : n > 7 ? 1 : 0)),
        ],
        challenges: [],
      }),
      'week'
    );
    expect(out.title).toBe('Read 10 pages led the week at 100%');
    expect(out.body).toMatch(/Go for a walk slipped to \d+%/);
    expect(out.highlights[0].text).toBe('Read 10 pages: 7 of 7 days (100%), same as before');
  });
});

describe('on-device coach', () => {
  it('uses reply schemas the on-device library accepts', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { validateSchema } = require('expo-local-llm/build/validateSchema');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { DAILY_SCHEMA, REFLECTION_SCHEMA } = require('@/lib/coach-device');
    expect(validateSchema(DAILY_SCHEMA)).toEqual(expect.objectContaining({ ok: true }));
    expect(validateSchema(REFLECTION_SCHEMA)).toEqual(expect.objectContaining({ ok: true }));
  });

  it('falls back (returns null) when the phone has no on-device model, as in Expo Go', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { writeOnDevice } = require('@/lib/coach-device');
    const digest = buildDigest({
      kind: 'daily',
      today: TODAY,
      habits: [habit({})],
      checkins: [],
      challenges: [],
    });
    await expect(writeOnDevice('daily', digest)).resolves.toBeNull();
  });
});
