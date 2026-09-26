import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DEFAULT_SETTINGS } from '@/hooks/use-habits';
import { addDays } from '@/lib/habits';
import { planReminders } from '@/lib/reminders';

import { challenge, freezeToday, habit, TODAY } from './helpers';

beforeEach(freezeToday); // noon
afterEach(() => {
  jest.useRealTimers();
});

const settings = {
  ...DEFAULT_SETTINGS,
  reminders: true,
  morning: '08:00',
  evening: '20:00',
  coachPushOn: false,
};

describe('reminder planning', () => {
  it('never schedules in the past and stays under the iOS pending limit', () => {
    const habits = Array.from({ length: 12 }, (_, i) =>
      habit({ id: `h${i}`, target: 4, reminders: ['09:00', '12:30', '15:00', '18:00'] })
    );
    const plan = planReminders(habits, [], settings);
    expect(plan.length).toBeLessThanOrEqual(60);
    plan.forEach((p) => expect(p.date.getTime()).toBeGreaterThan(Date.now()));
    expect(plan.map((p) => p.date.getTime())).toEqual(
      [...plan].map((p) => p.date.getTime()).sort((a, b) => a - b)
    );
  });

  it('skips today entirely once everything is done', () => {
    const h = habit({ reminders: ['18:00'] });
    h.log[TODAY] = 1;
    const today = planReminders([h], [], settings).filter(
      (p) => p.date.getDate() === new Date().getDate()
    );
    expect(today).toHaveLength(0);
  });

  it('names the streak at risk in tonight’s nudge', () => {
    const h = habit({ name: 'Read' });
    for (let i = 1; i <= 5; i++) h.log[addDays(TODAY, -i)] = 1;
    const tonight = planReminders([h], [], settings)[0];
    expect(tonight.title).toMatch(/5-day streak/);
  });

  it('talks about the challenge on challenge days', () => {
    const h = habit({ id: 'h', name: 'Read' });
    const c = challenge({ habitId: 'h', startDate: addDays(TODAY, -1), length: 3 });
    h.log[addDays(TODAY, -1)] = 1;
    const tonight = planReminders([h], [c], settings)[0];
    expect(tonight.title).toMatch(/Challenge day 2/);
  });

  it('respects the morning and evening switches', () => {
    const plan = planReminders([habit()], [], { ...settings, morningOn: false, eveningOn: false });
    expect(plan).toHaveLength(0);
  });

  it('delivers the AI coach nudge as the next morning notification, once', () => {
    const coach = { day: TODAY, title: 'Protect the streak', body: 'Water is at 50% this week.' };
    const mornings = planReminders([habit()], [], settings, coach).filter(
      (p) => p.date.getHours() === 8
    );
    // It's noon, so today's 08:00 has passed: tomorrow morning carries the coach's message.
    expect(mornings[0].title).toBe('🧑‍🏫 Protect the streak');
    expect(mornings[0].body).toBe('Water is at 50% this week.');
    expect(mornings.filter((p) => p.title.startsWith('🧑‍🏫'))).toHaveLength(1);
  });

  it('ignores a stale coach nudge', () => {
    const coach = { day: addDays(TODAY, -3), title: 'Old news', body: '…' };
    const plan = planReminders([habit()], [], settings, coach);
    expect(plan.some((p) => p.title.includes('Old news'))).toBe(false);
  });
});

describe('afternoon coach tip', () => {
  const coachOn = { ...settings, coachPushOn: true, coachPush: '15:00', name: 'Vaden' };
  const tips = (plan: ReturnType<typeof planReminders>) =>
    plan.filter((p) => p.date.getHours() === 15);

  it('sends a personal insight at the chosen time today and tomorrow only', () => {
    const walk = habit({ id: 'walk', name: 'Go for a walk' });
    const read = habit({ id: 'read', name: 'Read 10 pages' });
    for (let i = 1; i <= 14; i++) {
      walk.log[addDays(TODAY, -i)] = 1;
      if (i % 3 === 0) read.log[addDays(TODAY, -i)] = 1;
    }
    const [today, tomorrow, ...rest] = tips(planReminders([walk, read], [], coachOn));
    expect(rest).toHaveLength(0);
    expect(today.title).toContain('“Go for a walk”');
    expect(today.body).toMatch(
      /^Hey Vaden, I noticed you’ve been crushing “Go for a walk” lately .* have you considered giving “Read 10 pages” the same energy\?/
    );
    // A different insight tomorrow.
    expect(tomorrow.body).not.toBe(today.body);
  });

  it('skips advice about a habit that is already done today', () => {
    const walk = habit({ id: 'walk', name: 'Go for a walk' });
    const read = habit({ id: 'read', name: 'Read 10 pages' });
    for (let i = 1; i <= 14; i++) {
      walk.log[addDays(TODAY, -i)] = 1;
      if (i % 3 === 0) read.log[addDays(TODAY, -i)] = 1;
    }
    read.log[TODAY] = 1;
    const [today] = tips(planReminders([walk, read], [], coachOn));
    expect(today.body).not.toContain('have you considered giving “Read 10 pages”');
  });

  it('respects its switch and the coach switch', () => {
    expect(tips(planReminders([habit()], [], { ...coachOn, coachPushOn: false }))).toHaveLength(0);
    expect(tips(planReminders([habit()], [], { ...coachOn, coachOff: true }))).toHaveLength(0);
  });
});
