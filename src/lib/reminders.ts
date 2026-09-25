import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { clockOffset } from '@/lib/clock';
import { iconText } from '@/lib/icons';
import { checkinXp, habitCountOn } from '@/lib/xp';

import {
  addDays,
  challengeDays,
  challengeStatus,
  countOn,
  currentStreak,
  dayKey,
  isDone,
  minutesOf,
  parseDay,
  tierFor,
  type Challenge,
  type Habit,
  type Settings,
} from '@/lib/habits';

/** How far ahead to schedule. Rescheduled on every change and app foreground. */
const DAYS_AHEAD = 7;
/** iOS keeps at most 64 pending local notifications per app. */
const MAX_PENDING = 60;
const CHANNEL = 'reminders';

const supported = Platform.OS !== 'web';

if (supported) {
  Notifications.setNotificationHandler({
    // If the app is already open, the nudge has done its job — keep it quiet (except test sends).
    handleNotification: async (notification) => {
      const test = notification.request.content.data?.test === true;
      return {
        shouldPlaySound: test,
        shouldSetBadge: false,
        shouldShowBanner: test,
        shouldShowList: true,
      };
    },
  });
}

/** Returns whether notifications are allowed, prompting the user if `ask` is set. */
export async function ensurePermission(ask: boolean) {
  if (!supported) return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Habit reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!ask || !current.canAskAgain) return false;
  const next = await Notifications.requestPermissionsAsync();
  return next.granted;
}

type Planned = { date: Date; title: string; body: string };

function at(day: string, time: string) {
  const date = parseDay(day);
  const minutes = minutesOf(time);
  date.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return date;
}

const pick = <T>(list: T[], seed: number) => list[seed % list.length];

function listNames(habits: Habit[]) {
  if (habits.length === 1) return `${iconText(habits[0].emoji)} ${habits[0].name}`;
  return `${iconText(habits[0].emoji)} ${habits[0].name} and ${habits.length - 1} more`;
}

/** Builds the next week of nudges from the user's actual state. */
export function planReminders(habits: Habit[], challenges: Challenge[], settings: Settings) {
  const now = new Date();
  const today = dayKey();
  const planned: Planned[] = [];
  if (!habits.length) return planned;

  const live = challenges
    .filter((c) => !c.completedAt && !c.dismissed)
    .map((c) => ({ c, habit: habits.find((h) => h.id === c.habitId) }))
    .filter(({ c, habit }) => habit && challengeStatus(c, habit) === 'active');

  for (let offset = 0; offset < DAYS_AHEAD; offset++) {
    const day = addDays(today, offset);
    const isToday = offset === 0;
    const pending = habits.filter((h) => !isToday || !isDone(h, day));
    if (!pending.length) continue;

    const challengeToday = live
      .map(({ c, habit }) => ({
        c,
        habit: habit!,
        index: challengeDays(c, habit).findIndex((d) => d.day === day),
      }))
      .find(({ index, habit }) => index >= 0 && (!isToday || !isDone(habit, day)));

    // Morning: set the intention.
    if (settings.morningOn)
      planned.push({
        date: at(day, settings.morning),
        ...(challengeToday
          ? {
              title: `Day ${challengeToday.index + 1} of ${challengeToday.c.length} ${tierFor(challengeToday.c.length).icon}`,
              body:
                challengeToday.index + 1 === challengeToday.c.length
                  ? `Final day. ${iconText(challengeToday.habit.emoji)} ${challengeToday.habit.name} stands between you and ${tierFor(challengeToday.c.length).name}.`
                  : `Today’s mission: ${iconText(challengeToday.habit.emoji)} ${challengeToday.habit.name}. ${tierFor(challengeToday.c.length).name} is waiting.`,
            }
          : {
              title: pick(
                ['Good morning ☀️', 'New day, fresh start 🌱', 'Rise and build ☀️'],
                offset
              ),
              body: `${pending.length} habit${pending.length > 1 ? 's' : ''} on deck: ${pending
                .map((h) => iconText(h.emoji))
                .join(' ')}. Which one are you doing first?`,
            }),
      });

    // Per-habit reminders at each time the user chose (volume habits can have several).
    for (const habit of pending) {
      const count = isToday ? countOn(habit, day) : 0;
      habit.reminders.forEach((time, i) => {
        // Skip slots the user has already caught up on.
        if (habit.target > 1 && count > i) return;
        planned.push({
          date: at(day, time),
          title: `${iconText(habit.emoji)} ${habit.name}`,
          body:
            habit.kind === 'quit'
              ? pick(
                  [
                    'You’ve got this. Log today as clean when the day’s done.',
                    'Remember your why. One clean day at a time.',
                  ],
                  offset
                )
              : habit.target > 1
                ? `Check-in ${i + 1} of ${habit.target}. You’re at ${count}/${habit.target} today. Finish for +${checkinXp(habitCountOn(habits, day))} XP.`
                : pick(
                    [
                      `You set this intention for now. One tap to check it off (+${checkinXp(habitCountOn(habits, day))} XP).`,
                      `This is your moment. Go do it, then come log it for +${checkinXp(habitCountOn(habits, day))} XP.`,
                    ],
                    offset
                  ),
        });
      });
    }

    // Evening: don't let the day close with the loop open.
    const atRisk = pending
      .map((h) => ({ h, streak: currentStreak(h) + (isToday ? 0 : offset) }))
      .sort((a, b) => b.streak - a.streak)[0];
    if (settings.eveningOn)
      planned.push({
        date: at(day, settings.evening),
        ...(challengeToday
          ? {
              title: `Challenge day ${challengeToday.index + 1} is still open`,
              body: `Log ${iconText(challengeToday.habit.emoji)} ${challengeToday.habit.name} before midnight to stay in it.`,
            }
          : isToday && atRisk && atRisk.streak >= 2
            ? atRisk.h.kind === 'quit'
              ? {
                  title: `🔥 ${atRisk.streak} clean days and counting`,
                  body: `Log ${iconText(atRisk.h.emoji)} ${atRisk.h.name} for today to keep the streak alive.`,
                }
              : {
                  title: `🔥 Your ${atRisk.streak}-day streak is on the line`,
                  body: `${iconText(atRisk.h.emoji)} ${atRisk.h.name} isn’t done yet. There’s still time.`,
                }
            : isToday
              ? {
                  title: 'Don’t forget 🌙',
                  body: `${listNames(pending)} — you set the intention this morning. Close the loop.`,
                }
              : {
                  title: pick(
                    ['Evening check-in 🌙', 'How did today go?', 'Before bed ✨'],
                    offset
                  ),
                  body: 'Log today’s habits and keep your chain growing.',
                }),
      });
  }

  return planned
    .filter((p) => p.date > now)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, MAX_PENDING);
}

// Syncs run one at a time; a newer request makes any older, still-running sync stop early.
// Without this, two overlapping syncs could each cancel-then-schedule and leave duplicates.
let queue: Promise<void> = Promise.resolve();
let generation = 0;

/** Replaces all scheduled nudges with a fresh plan. No-ops without permission. */
export function syncReminders(habits: Habit[], challenges: Challenge[], settings: Settings) {
  if (!supported) return Promise.resolve();
  const mine = ++generation;
  const run = queue.then(() => runSync(mine, habits, challenges, settings));
  queue = run.catch(() => {});
  return run;
}

async function runSync(mine: number, habits: Habit[], challenges: Challenge[], settings: Settings) {
  if (mine !== generation) return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  // Time travel (developer tools) would schedule on the wrong real dates.
  if (clockOffset() !== 0) return;
  if (!settings.reminders || !(await ensurePermission(false))) return;
  for (const p of planReminders(habits, challenges, settings)) {
    if (mine !== generation) return;
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.date,
        channelId: CHANNEL,
      },
    });
  }
}

/** Sends a sample of tonight's nudge a few seconds from now. Returns false without permission. */
export async function sendTestReminder(
  habits: Habit[],
  challenges: Challenge[],
  settings: Settings
) {
  if (!(await ensurePermission(true))) return false;
  const sample = planReminders(habits, challenges, {
    ...settings,
    morningOn: true,
    eveningOn: true,
    morning: '00:00',
    evening: '23:59',
  })[0];
  await Notifications.scheduleNotificationAsync({
    content: {
      title: sample?.title ?? 'Riser 🌱',
      body: sample?.body ?? 'This is how your daily check-ins will look.',
      sound: 'default',
      data: { test: true },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 3,
      channelId: CHANNEL,
    },
  });
  return true;
}

/** Upcoming scheduled nudges, soonest first (developer tools). */
export async function listScheduled() {
  if (!supported) return [];
  const all = await Notifications.getAllScheduledNotificationsAsync();
  return all
    .map((n) => {
      const trigger = n.trigger as { value?: number; date?: number } | null;
      const when = trigger?.value ?? trigger?.date ?? 0;
      return { title: n.content.title ?? '', body: n.content.body ?? '', when: new Date(when) };
    })
    .sort((a, b) => a.when.getTime() - b.when.getTime());
}
