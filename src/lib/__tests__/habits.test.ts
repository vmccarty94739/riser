import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  addDays,
  bestStreak,
  chartBuckets,
  challengeDays,
  challengeStatus,
  currentStreak,
  dayScore,
  daysBetween,
  daysDone,
  isDone,
  longestPerfectStreak,
  motivation,
  nextChallengeLength,
  perfectStreak,
  tally,
  tierFor,
  trophyOf,
} from '@/lib/habits';

import { challenge, doneFor, freezeToday, habit, TODAY } from './helpers';

beforeEach(freezeToday);
afterEach(() => {
  jest.useRealTimers();
});

describe('dates', () => {
  it('adds days across month ends and DST changes', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09');
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02');
    expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
  });
});

describe('streaks', () => {
  it('counts a streak through yesterday when today is still open', () => {
    const h = doneFor(habit(), 4, { skipToday: true });
    expect(currentStreak(h)).toBe(4);
    h.log[TODAY] = 1;
    expect(currentStreak(h)).toBe(5);
  });

  it('only counts days that hit a multi-rep target', () => {
    const h = habit({ target: 3 });
    h.log[TODAY] = 2;
    expect(isDone(h, TODAY)).toBe(false);
    expect(currentStreak(h)).toBe(0);
    h.log[TODAY] = 3;
    expect(currentStreak(h)).toBe(1);
  });

  it('finds the best streak anywhere in history', () => {
    const h = habit();
    for (const d of [10, 9, 8, 7, 3, 2]) h.log[addDays(TODAY, -d)] = 1;
    expect(bestStreak(h)).toBe(4);
  });

  it('perfect days need every habit done, including clean days for bad habits', () => {
    const good = doneFor(habit(), 3);
    const bad = doneFor(habit({ kind: 'quit', emoji: '🚬' }), 2);
    expect(dayScore([good, bad], TODAY)).toBe(1);
    expect(perfectStreak([good, bad])).toBe(2);
    expect(longestPerfectStreak([good, bad])).toBe(2);
  });

  it('ignores habits on days before they existed', () => {
    const older = doneFor(habit(), 5);
    const newer = habit({ createdAt: TODAY });
    newer.log[TODAY] = 1;
    expect(dayScore([older, newer], addDays(TODAY, -2))).toBe(1);
  });
});

describe('challenges', () => {
  it('is active while on track, won when every day is done, lost after a miss', () => {
    const h = habit({ id: 'h' });
    const c = challenge({ startDate: addDays(TODAY, -2) });
    h.log[addDays(TODAY, -2)] = 1;
    h.log[addDays(TODAY, -1)] = 1;
    expect(challengeStatus(c, h)).toBe('active');
    h.log[TODAY] = 1;
    expect(challengeStatus(c, h)).toBe('won');
    delete h.log[addDays(TODAY, -1)];
    expect(challengeStatus(c, h)).toBe('lost');
  });

  it('treats a challenge that starts tomorrow as upcoming, not lost', () => {
    const c = challenge({ startDate: addDays(TODAY, 1), length: 7 });
    expect(challengeDays(c, habit({ id: 'h' })).every((d) => d.state === 'upcoming')).toBe(true);
    expect(challengeStatus(c, habit({ id: 'h' }))).toBe('active');
  });

  it('climbs the ladder and repeats the top rung', () => {
    expect(nextChallengeLength(3)).toBe(7);
    expect(nextChallengeLength(30)).toBe(60);
    expect(nextChallengeLength(365)).toBe(365);
    expect(tierFor(10).name).toBe('Week Warrior');
  });

  it('uses the custom title for custom trophies', () => {
    expect(trophyOf(challenge({ custom: true, title: 'Dry July', length: 31 })).name).toBe(
      'Dry July'
    );
    expect(trophyOf(challenge({ length: 14 })).name).toBe('Fortnight Focus');
  });

  it('motivation always names the trophy', () => {
    const line = motivation(challenge({ length: 7 }), 4);
    expect(line).toMatch(/Week Warrior/);
  });
});

describe('charts', () => {
  it('buckets 7 days as days, 30 as weeks and 90 as whole months', () => {
    expect(chartBuckets(7)).toHaveLength(7);
    const weeks = chartBuckets(30);
    expect(weeks.reduce((n, b) => n + b.days.length, 0)).toBe(30);
    weeks.slice(1).forEach((b) => expect(new Date(`${b.days[0]}T00:00:00`).getDay()).toBe(1));
    const months = chartBuckets(90);
    expect(months.reduce((n, b) => n + b.days.length, 0)).toBe(90);
    expect(months[0].days.length).toBeGreaterThanOrEqual(7);
  });

  it('tallies only days each habit existed', () => {
    const h = habit({ createdAt: addDays(TODAY, -1) });
    h.log[TODAY] = 1;
    const days = [addDays(TODAY, -2), addDays(TODAY, -1), TODAY];
    expect(tally([h], days)).toEqual({ met: 1, possible: 2 });
    expect(daysDone(h, 7)).toEqual({ done: 1, possible: 2 });
  });
});
