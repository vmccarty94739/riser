import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';

// A fake of the phone's notification scheduler: remembers what's mockScheduled, like iOS does.
const mockScheduled = new Map<string, { title: string; date: Date }>();
const mockPhone = { granted: true };
const mockCalls = { schedule: 0, cancel: 0 };

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  setNotificationChannelAsync: jest.fn(async () => null),
  getPermissionsAsync: jest.fn(async () => ({ granted: mockPhone.granted, canAskAgain: true })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: mockPhone.granted })),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date', TIME_INTERVAL: 'timeInterval' },
  getAllScheduledNotificationsAsync: jest.fn(async () =>
    [...mockScheduled].map(([identifier, n]) => ({
      identifier,
      content: { title: n.title, body: '' },
      trigger: { type: 'date', value: n.date.getTime() },
    }))
  ),
  cancelScheduledNotificationAsync: jest.fn(async (id: string) => {
    mockCalls.cancel++;
    mockScheduled.delete(id);
  }),
  scheduleNotificationAsync: jest.fn(
    async (req: { identifier?: string; content: { title: string }; trigger: { date?: Date } }) => {
      mockCalls.schedule++;
      const id = req.identifier ?? `rnd-${mockCalls.schedule}`;
      mockScheduled.set(id, { title: req.content.title, date: req.trigger.date ?? new Date() });
      return id;
    }
  ),
}));

/* eslint-disable import/first */
import { DEFAULT_SETTINGS } from '@/hooks/use-habits';
import { sendTestReminder, syncReminders } from '@/lib/reminders';

import { freezeToday, habit, TODAY } from './helpers';
/* eslint-enable import/first */

beforeEach(() => {
  freezeToday(); // noon
  mockScheduled.clear();
  mockPhone.granted = true;
  mockCalls.schedule = 0;
  mockCalls.cancel = 0;
});
afterEach(() => {
  jest.useRealTimers();
});

const on = { ...DEFAULT_SETTINGS, reminders: true };
const veggies = () => habit({ id: 'veg', name: 'Eat veggies', emoji: '🥦', reminders: ['21:51'] });
const at = (n: { date: Date }) =>
  `${n.date.getFullYear()}-${String(n.date.getMonth() + 1).padStart(2, '0')}-${String(
    n.date.getDate()
  ).padStart(2, '0')} ${n.date.getHours()}:${String(n.date.getMinutes()).padStart(2, '0')}`;

describe('scheduling reminders on the phone', () => {
  it('schedules a habit’s reminder at exactly its time today and on the following days', async () => {
    await syncReminders([veggies()], [], on);
    const times = [...mockScheduled.values()].filter((n) => n.title === '🥦 Eat veggies').map(at);
    expect(times[0]).toBe(`${TODAY} 21:51`);
    expect(times).toHaveLength(7);
  });

  it('schedules nothing while the main switch is off, and clears what was there', async () => {
    await syncReminders([veggies()], [], on);
    expect(mockScheduled.size).toBeGreaterThan(0);
    await syncReminders([veggies()], [], { ...on, reminders: false });
    expect(mockScheduled.size).toBe(0);
  });

  it('schedules nothing when the phone blocks notifications', async () => {
    mockPhone.granted = false;
    await syncReminders([veggies()], [], on);
    expect(mockScheduled.size).toBe(0);
  });

  it('leaves unchanged reminders alone instead of clearing and re-adding everything', async () => {
    await syncReminders([veggies()], [], on);
    const before = new Set(mockScheduled.keys());
    mockCalls.schedule = 0;
    mockCalls.cancel = 0;
    await syncReminders([veggies()], [], on);
    expect(mockCalls).toEqual({ schedule: 0, cancel: 0 });
    expect(new Set(mockScheduled.keys())).toEqual(before);
  });

  it('moves a reminder when its time changes, and drops today’s once the habit is done', async () => {
    await syncReminders([veggies()], [], on);
    const moved = { ...veggies(), reminders: ['21:55'] };
    await syncReminders([moved], [], on);
    const times = [...mockScheduled.values()].filter((n) => n.title === '🥦 Eat veggies').map(at);
    expect(times).toContain(`${TODAY} 21:55`);
    expect(times).not.toContain(`${TODAY} 21:51`);

    const done = { ...moved, log: { [TODAY]: 1 } };
    await syncReminders([done], [], on);
    const after = [...mockScheduled.values()].filter((n) => n.title === '🥦 Eat veggies').map(at);
    expect(after).not.toContain(`${TODAY} 21:55`);
    expect(after).toHaveLength(6);
  });

  it('clears reminders left over from older versions of the app', async () => {
    mockScheduled.set('old-random-id', { title: 'stale', date: new Date(Date.now() + 3_600_000) });
    await syncReminders([veggies()], [], on);
    expect(mockScheduled.has('old-random-id')).toBe(false);
  });

  it('keeps a "send me a test nudge" that is on its way', async () => {
    await sendTestReminder([veggies()], [], on);
    await syncReminders([veggies()], [], on);
    expect([...mockScheduled.keys()].some((id) => id.startsWith('riser-test-'))).toBe(true);
  });

  it('only the newest of overlapping syncs wins, with no duplicates', async () => {
    const a = syncReminders([veggies()], [], on);
    const b = syncReminders([{ ...veggies(), reminders: ['21:55'] }], [], on);
    await Promise.all([a, b]);
    const times = [...mockScheduled.values()].filter((n) => n.title === '🥦 Eat veggies').map(at);
    expect(times.filter((t) => t === `${TODAY} 21:55`)).toHaveLength(1);
    expect(times).not.toContain(`${TODAY} 21:51`);
  });
});
