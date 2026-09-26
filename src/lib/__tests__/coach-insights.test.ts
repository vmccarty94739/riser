import { describe, expect, it } from '@jest/globals';

import { insightsFor, pickInsight } from '@/lib/coach-insights';
import { addDays, parseDay } from '@/lib/habits';

import { challenge, doneFor, habit, TODAY } from './helpers';

/** Logs `h` on each of the last `days` complete days (not today) where `pick(daysAgo)` is true. */
function logWhere(h: ReturnType<typeof habit>, days: number, pick: (ago: number) => boolean) {
  for (let i = 1; i <= days; i++) if (pick(i)) h.log[addDays(TODAY, -i)] = h.target;
  return h;
}

const kinds = (list: { kind: string }[]) => list.map((i) => i.kind);

describe('insightsFor', () => {
  it('pairs a habit you are crushing with one that is slipping, with a habit-specific tip', () => {
    const walk = doneFor(habit({ id: 'walk', name: 'Go for a walk', emoji: '🚶' }), 14, {
      skipToday: true,
    });
    const read = logWhere(habit({ id: 'read', name: 'Read 10 pages' }), 14, (i) => i % 3 === 0);
    const [top] = insightsFor([walk, read], [], TODAY, 'Vaden');
    expect(top.kind).toBe('pair');
    expect(top.title).toContain('“Go for a walk”');
    expect(top.body).toContain('14 of the last 14 days');
    expect(top.tip).toContain('Do “Read 10 pages” right after “Go for a walk”');
    expect(top.tip).toMatch(/book|pillow/);
    expect(top.push).toMatch(
      /^Hey Vaden, I noticed you’ve been crushing “Go for a walk” lately \(14 of 14 days\), but have you considered giving “Read 10 pages” the same energy\? Here’s a quick and easy way: do/
    );
  });

  it('speaks without a name too', () => {
    const walk = doneFor(habit({ id: 'walk', name: 'Go for a walk' }), 14, { skipToday: true });
    const read = logWhere(habit({ id: 'read', name: 'Read 10 pages' }), 14, (i) => i % 3 === 0);
    expect(insightsFor([walk, read], [], TODAY)[0].push).toMatch(/^I noticed you’ve been/);
  });

  it('flags the weekday a habit keeps slipping on, when today is that day', () => {
    const weekday = parseDay(TODAY).getDay();
    const gym = logWhere(
      habit({ id: 'gym', name: 'Workout' }),
      28,
      (i) => parseDay(addDays(TODAY, -i)).getDay() !== weekday
    );
    const tip = insightsFor([gym], [], TODAY).find((i) => i.kind === 'weekday');
    expect(tip?.body).toMatch(/missed “Workout” on 4 of the last 4 \w+days/);
    // The overall rate is spelled out, not a bare count.
    expect(tip?.body).toMatch(/Across the last \d+ days you’ve done it on \d+ of them/);
  });

  it('spots a keystone habit that lifts another', () => {
    const a = logWhere(habit({ id: 'a', name: 'Meditate' }), 28, (i) => i % 2 === 0);
    const b = logWhere(habit({ id: 'b', name: 'Journal' }), 28, (i) => i % 2 === 0 || i % 7 === 0);
    const found = insightsFor([a, b], [], TODAY).find((i) => i.id === 'keystone:a:b');
    expect(found?.body).toMatch(/“Journal” done 100% of the time.*drops to \d+%/);
  });

  it('counts down to a trophy only while the challenge is alive', () => {
    const h = doneFor(habit({ id: 'h', name: 'Read' }), 5, { skipToday: true });
    const alive = challenge({ habitId: 'h', length: 7, startDate: addDays(TODAY, -5) });
    const t = insightsFor([h], [alive], TODAY).find((i) => i.kind === 'trophy');
    expect(t?.title).toBe('2 days from Week Warrior 🥈');

    delete h.log[addDays(TODAY, -2)];
    expect(kinds(insightsFor([h], [alive], TODAY))).not.toContain('trophy');
  });

  it('suggests a smaller goal when a multi-check-in habit keeps stalling', () => {
    const water = habit({ id: 'w', name: '8 waters', target: 8 });
    for (let i = 1; i <= 7; i++) water.log[addDays(TODAY, -i)] = 5;
    const goal = insightsFor([water], [], TODAY).find((i) => i.kind === 'goal');
    expect(goal?.tip).toMatch(/^Try a goal of 6 for a week/);
  });

  it('is one away from a perfect day', () => {
    const hs = ['A', 'B', 'C'].map((n) => habit({ id: n, name: `Habit ${n}` }));
    hs[0].log[TODAY] = 1;
    hs[1].log[TODAY] = 1;
    expect(insightsFor(hs, [], TODAY)[0].body).toContain('Just “Habit C” stands between you');
  });

  it('always has something to say', () => {
    const fresh = habit({ createdAt: TODAY });
    expect(insightsFor([fresh], [], TODAY).length).toBeGreaterThan(0);
  });
});

describe('pickInsight', () => {
  it('rotates through insights across visits, then recycles the oldest', () => {
    const walk = doneFor(habit({ id: 'walk', name: 'Go for a walk' }), 14, { skipToday: true });
    const read = logWhere(habit({ id: 'read', name: 'Read 10 pages' }), 14, (i) => i % 3 === 0);
    const all = insightsFor([walk, read], [], TODAY);
    const recent: string[] = [];
    for (let visit = 0; visit < all.length; visit++) {
      const next = pickInsight(all, recent, visit)!;
      expect(recent).not.toContain(next.id);
      recent.unshift(next.id);
    }
    expect(pickInsight(all, recent, 99)!.id).toBe(recent[recent.length - 1]);
  });
});
