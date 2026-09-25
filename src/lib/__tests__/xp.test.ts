import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { THEME_SWATCHES } from '@/constants/theme';
import { addDays } from '@/lib/habits';
import {
  CHIMES,
  checkinXp,
  challengeXp,
  levelFor,
  LEVEL_UNLOCKS,
  nextUnlock,
  unlocksBetween,
  xpBreakdown,
  xpForNext,
} from '@/lib/xp';

import { challenge, freezeToday, habit, TODAY } from './helpers';

beforeEach(freezeToday);
afterEach(() => {
  jest.useRealTimers();
});

/** A user with `n` habits who does all of them every day for 30 days, each climbing its ladder. */
function perfectMonth(n: number) {
  const start = addDays(TODAY, -29);
  const habits = Array.from({ length: n }, (_, i) => habit({ id: `h${i}`, createdAt: start }));
  for (let d = 0; d < 30; d++) habits.forEach((h) => (h.log[addDays(start, d)] = 1));
  const challenges = habits.flatMap((h) => {
    let s = start;
    return [3, 7, 14].map((length) => {
      const end = addDays(s, length - 1);
      const c = challenge({ habitId: h.id, length, startDate: s, completedAt: end });
      s = addDays(end, 1);
      return c;
    });
  });
  return xpBreakdown(habits, challenges);
}

describe('XP is fair regardless of habit count', () => {
  it('gives 1, 5 and 15 habits the same XP for the same effort', () => {
    const [one, five, fifteen] = [1, 5, 15].map(perfectMonth);
    expect(five.total).toBe(one.total);
    expect(fifteen.total).toBe(one.total);
  });

  it('splits a day and a trophy across habits', () => {
    expect(checkinXp(5)).toBe(12);
    expect(checkinXp(15)).toBe(4);
    expect(challengeXp({ length: 7, custom: false }, 1)).toBe(80);
    expect(challengeXp({ length: 7, custom: false }, 4)).toBe(20);
    expect(challengeXp({ length: 10, custom: true }, 2)).toBe(40);
  });

  it('pays partial credit for a partly done day and nothing for undone check-ins', () => {
    const a = habit({ createdAt: TODAY });
    const b = habit({ createdAt: TODAY });
    a.log[TODAY] = 1;
    expect(xpBreakdown([a, b], []).checkins).toBe(30);
    expect(xpBreakdown([a, b], []).perfectDays).toBe(0);
    b.log[TODAY] = 1;
    expect(xpBreakdown([a, b], []).total).toBe(80);
  });
});

describe('levels', () => {
  it('uses the 80 + 20 per level curve', () => {
    expect(xpForNext(1)).toBe(80);
    expect(xpForNext(2)).toBe(100);
    expect(levelFor(0).level).toBe(1);
    expect(levelFor(79).level).toBe(1);
    expect(levelFor(80)).toMatchObject({ level: 2, into: 0, needed: 100 });
  });

  it('spreads unlocks out instead of one per level', () => {
    const levels = LEVEL_UNLOCKS.map((u) => u.level);
    expect(new Set(levels).size).toBe(levels.length);
    expect(levels).toEqual([...levels].sort((a, b) => a - b));
    expect(THEME_SWATCHES.filter((s) => s.unlockedBy === 0)).toHaveLength(2);
    expect(CHIMES.filter((c) => c.level === 0).length).toBeGreaterThanOrEqual(4);
  });

  it('reports what a jump of several levels unlocks and what comes next', () => {
    expect(unlocksBetween(1, 7).map((u) => u.id)).toEqual(['teal', 'indigo']);
    expect(nextUnlock(7)?.id).toBe('harp');
    expect(nextUnlock(999)).toBeNull();
  });
});
