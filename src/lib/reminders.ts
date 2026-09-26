import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { clockOffset } from '@/lib/clock';
import { insightsFor, type Insight } from '@/lib/coach-insights';
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
/** The coach's afternoon insight is only planned this many days out: it's about recent days. */
const COACH_DAYS_AHEAD = 2;
/** iOS keeps at most 64 pending local notifications per app. */
const MAX_PENDING = 60;
const CHANNEL = 'reminders';

const supported = Platform.OS !== 'web';

if (supported) {
  Notifications.setNotificationHandler({
    // Show reminders even while Riser is open: a reminder the user set must always be seen.
    handleNotification: async () => ({
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
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

/** The AI coach's latest daily nudge, delivered as the next morning notification. */
export type CoachNote = { day: string; title: string; body: string };

/**
 * The afternoon coach tips: one insight for today (if its time hasn't passed) and one for
 * tomorrow. Only two days out, because they're about recent days. Prefers the "crushing X, have
 * you considered Y" pairing and skips advice about habits already done today.
 */
export function coachTips(habits: Habit[], challenges: Challenge[], settings: Settings) {
  const tips: { day: string; insight: Insight }[] = [];
  if (!settings.coachPushOn || settings.coachOff || !habits.length) return tips;
  const today = dayKey();
  const value = (i: Insight) => i.score + (i.kind === 'pair' ? 15 : 0);
  for (let offset = 0; offset < COACH_DAYS_AHEAD; offset++) {
    const day = addDays(today, offset);
    if (offset === 0 && at(day, settings.coachPush) <= new Date()) continue;
    const open = habits.filter((h) => offset > 0 || !isDone(h, day));
    const insight = insightsFor(habits, challenges, day, settings.name)
      // Tonight's final state can't be known ahead, and no two days get the same tip.
      .filter((i) => i.kind !== 'perfect-close' && !tips.some((t) => t.insight.id === i.id))
      .filter((i) => !i.about.length || i.about.some((id) => open.some((h) => h.id === id)))
      .sort((a, b) => value(b) - value(a))[0];
    if (insight) tips.push({ day, insight });
  }
  return tips;
}

/** Builds the next week of nudges from the user's actual state. */
export function planReminders(
  habits: Habit[],
  challenges: Challenge[],
  settings: Settings,
  coach: CoachNote | null = null,
  /** The phone's AI versions of the coach tips, keyed `day|insightId` (see `coachTips`). */
  pushText: Record<string, string> = {}
) {
  const now = new Date();
  const today = dayKey();
  const planned: Planned[] = [];
  if (!habits.length) return planned;
  // The coach's nudge replaces the next upcoming morning message, while it's at most a day old.
  let coachNote = coach && coach.day >= addDays(today, -1) ? coach : null;

  const tips = coachTips(habits, challenges, settings);

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

    // Morning: set the intention (or deliver the coach's nudge).
    const morning = at(day, settings.morning);
    if (settings.morningOn && coachNote && morning > now) {
      planned.push({ date: morning, title: `🧑‍🏫 ${coachNote.title}`, body: coachNote.body });
      coachNote = null;
    } else if (settings.morningOn)
      planned.push({
        date: morning,
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

    // Afternoon: one personal insight from the coach ("I noticed you've been crushing…").
    const tip = tips.find((t) => t.day === day);
    if (tip)
      planned.push({
        date: at(day, settings.coachPush),
        title: `🧑‍🏫 ${tip.insight.title}`,
        body: pushText[`${day}|${tip.insight.id}`] ?? tip.insight.push,
      });

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
export function syncReminders(
  habits: Habit[],
  challenges: Challenge[],
  settings: Settings,
  coach: CoachNote | null = null,
  pushText: Record<string, string> = {}
) {
  if (!supported) return Promise.resolve();
  const mine = ++generation;
  const run = queue.then(() => runSync(mine, habits, challenges, settings, coach, pushText));
  queue = run.catch(() => {});
  return run;
}

/** Scheduled nudges get ids from their content, so an unchanged plan needs no native calls. */
const PREFIX = 'riser-';
const TEST_PREFIX = 'riser-test-';

export function reminderId(p: Planned) {
  let h = 0;
  for (const c of `${p.date.getTime()}|${p.title}|${p.body}`) h = (h * 31 + c.charCodeAt(0)) | 0;
  return `${PREFIX}${p.date.getTime().toString(36)}-${(h >>> 0).toString(36)}`;
}

/**
 * Brings the phone's scheduled notifications in line with the plan: cancels only what's no longer
 * wanted and adds only what's missing, soonest first. Nothing is ever cleared up front, so if
 * iOS suspends the app mid-sync the reminders already scheduled stay scheduled.
 */
async function runSync(
  mine: number,
  habits: Habit[],
  challenges: Challenge[],
  settings: Settings,
  coach: CoachNote | null,
  pushText: Record<string, string>
) {
  if (mine !== generation) return;
  // Time travel (developer tools) would schedule on the wrong real dates.
  const off = clockOffset() !== 0 || !settings.reminders || !(await ensurePermission(false));
  const plan = off ? [] : planReminders(habits, challenges, settings, coach, pushText);
  const want = new Map(plan.map((p) => [reminderId(p), p]));
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const n of scheduled) {
    if (mine !== generation) return;
    // Leave a "send me a test nudge" alone; everything else not in the plan goes.
    if (n.identifier.startsWith(TEST_PREFIX) || want.has(n.identifier)) continue;
    await Notifications.cancelScheduledNotificationAsync(n.identifier);
  }
  const have = new Set(scheduled.map((n) => n.identifier));
  for (const [identifier, p] of want) {
    if (mine !== generation) return;
    if (have.has(identifier) || p.date <= new Date()) continue;
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title: p.title, body: p.body, sound: 'default' },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: p.date,
        channelId: CHANNEL,
      },
    });
  }
  if (__DEV__) {
    const next = plan[0];
    console.log(
      `[reminders] ${off ? 'off' : `${want.size} scheduled`}${
        next ? `; next: ${next.title} at ${next.date.toLocaleString()}` : ''
      }`
    );
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
    identifier: `${TEST_PREFIX}${Date.now()}`,
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
