/** Pure habit/challenge types and math. No React, no storage. */
import { now } from '@/lib/clock';
import { categoriesFor, categoryOf } from '@/lib/icons';

/** `build` = something to do; `quit` = something to stay away from (a check-in means "stayed clean"). */
export type HabitKind = 'build' | 'quit';

export type Habit = {
  id: string;
  name: string;
  emoji: string;
  /** Short personal note shown on the Today tile. */
  note: string;
  kind: HabitKind;
  /** Local `YYYY-MM-DD` the habit was created. */
  createdAt: string;
  /** Check-ins needed per day. 1 = once a day, >1 = a volume habit. Always 1 for quit habits. */
  target: number;
  /** Planned check-in times as `HH:MM`, at most `target` of them. Empty = no set times. */
  reminders: string[];
  /** Check-ins per local day, keyed `YYYY-MM-DD`. Days with 0 are omitted. */
  log: Record<string, number>;
  /** Proof photo per day: file name relative to the app's document directory. */
  proofs: Record<string, string>;
};

export type NewHabit = Pick<Habit, 'name' | 'emoji' | 'note' | 'kind' | 'target' | 'reminders'>;

export const NOTE_MAX = 60;

export type Challenge = {
  id: string;
  habitId: string;
  /** Snapshot so trophies survive the habit being deleted or renamed. */
  habitName: string;
  habitEmoji: string;
  habitKind: HabitKind;
  /** User-created challenges have a custom name and don't continue the ladder. */
  custom: boolean;
  title: string | null;
  length: number;
  /** Local `YYYY-MM-DD` of day 1. */
  startDate: string;
  /** Set once every day was hit (the trophy). */
  completedAt: string | null;
  /** Set when the user dismisses a slipped challenge. */
  dismissed: boolean;
};

export type Settings = {
  reminders: boolean;
  morningOn: boolean;
  /** Morning intention nudge, `HH:MM`. */
  morning: string;
  eveningOn: boolean;
  /** Evening "don't forget" nudge, `HH:MM`. */
  evening: string;
  sound: boolean;
  /** Completion chime id (see `CHIMES` in `lib/xp.ts`). */
  chime: string;
  haptics: boolean;
  /** Light/dark mode, or follow the phone. */
  appearance: 'system' | 'light' | 'dark';
  /** Swatch ids (see `THEME_SWATCHES`) for the two main UI colors. */
  accent: string;
  gold: string;
  /** Collapsed Dashboard category sections, as `kind:categoryKey`. */
  collapsed: string[];
  /** The user agreed to send habit data to the AI coach (off until they opt in). */
  coach: boolean;
  /** The Dashboard already offered the coach once (so the offer doesn't keep coming back). */
  coachAsked: boolean;
  /** The user switched the coach off (it's on by default while it runs on the device). */
  coachOff: boolean;
};

/** The trophy ladder. Each win auto-starts the next rung; the last repeats. */
export const TROPHY_TIERS = [
  { days: 3, name: 'Kickstart', icon: '🥉', color: '#C9824B' },
  { days: 7, name: 'Week Warrior', icon: '🥈', color: '#8E9AAB' },
  { days: 14, name: 'Fortnight Focus', icon: '🥇', color: '#E0A106' },
  { days: 21, name: 'Habit Forged', icon: '🏅', color: '#E0772B' },
  { days: 30, name: 'Monthly Master', icon: '🏆', color: '#E8A90C' },
  { days: 60, name: 'Iron Will', icon: '💎', color: '#2F96DC' },
  { days: 90, name: 'Quarter Crown', icon: '👑', color: '#A457D6' },
  { days: 180, name: 'Unbreakable', icon: '🌟', color: '#E8604F' },
  { days: 365, name: 'Legend', icon: '🐉', color: '#1FA971' },
] as const;

export type TrophyTier = (typeof TROPHY_TIERS)[number];

export const CHALLENGE_LADDER = TROPHY_TIERS.map((t) => t.days);

export function tierFor(length: number): TrophyTier {
  return [...TROPHY_TIERS].reverse().find((t) => t.days <= length) ?? TROPHY_TIERS[0];
}

export function nextChallengeLength(length: number) {
  return CHALLENGE_LADDER.find((l) => l > length) ?? CHALLENGE_LADDER[CHALLENGE_LADDER.length - 1];
}

export function dayKey(date: Date = now()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDay(key: string) {
  return new Date(`${key}T00:00:00`);
}

export function addDays(key: string, days: number) {
  const date = parseDay(key);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

export function daysBetween(from: string, to: string) {
  return Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000);
}

/** The last `count` days, oldest first, ending today. */
export function lastDays(count: number) {
  return Array.from({ length: count }, (_, i) => parseDay(addDays(dayKey(), -(count - 1 - i))));
}

export function countOn(habit: Habit, day: string) {
  return habit.log[day] ?? 0;
}

export function isDone(habit: Habit, day: string) {
  return countOn(habit, day) >= habit.target;
}

/** 0–1 progress toward the day's target. */
export function progressOn(habit: Habit, day: string) {
  return Math.min(1, countOn(habit, day) / habit.target);
}

/** Consecutive completed days ending today, or yesterday if today isn't done yet. */
export function currentStreak(habit: Habit) {
  let cursor = dayKey();
  if (!isDone(habit, cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (isDone(habit, cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function bestStreak(habit: Habit) {
  const days = Object.keys(habit.log)
    .filter((d) => isDone(habit, d))
    .sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of days) {
    run = prev && addDays(prev, 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    prev = key;
  }
  return best;
}

/** Consecutive perfect days (every habit done, every bad habit avoided) ending today or yesterday. */
export function perfectStreak(habits: Habit[]) {
  let day = dayKey();
  if (dayScore(habits, day) !== 1) day = addDays(day, -1);
  let streak = 0;
  while (dayScore(habits, day) === 1) {
    streak++;
    day = addDays(day, -1);
  }
  return streak;
}

/** Longest run of perfect days ever. */
export function longestPerfectStreak(habits: Habit[]) {
  if (!habits.length) return 0;
  const start = habits.reduce((min, h) => (h.createdAt < min ? h.createdAt : min), dayKey());
  let best = 0;
  let run = 0;
  for (let day = start; day <= dayKey(); day = addDays(day, 1)) {
    run = dayScore(habits, day) === 1 ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** Habits that existed on `day`. */
export function activeOn(habits: Habit[], day: string) {
  return habits.filter((h) => h.createdAt <= day);
}

/** Share (0–1) of the day's habits completed, or null if no habits existed yet. */
export function dayScore(habits: Habit[], day: string) {
  const active = activeOn(habits, day);
  if (!active.length) return null;
  return active.filter((h) => isDone(h, day)).length / active.length;
}

/** Days done vs. days the habit existed, over the last `days` days. */
export function daysDone(habit: Habit, days: number) {
  const keys = lastDays(days)
    .map((d) => dayKey(d))
    .filter((d) => d >= habit.createdAt);
  return { done: keys.filter((d) => isDone(habit, d)).length, possible: keys.length };
}

export function completionRate(habit: Habit, days: number) {
  const { done, possible } = daysDone(habit, days);
  return possible ? done / possible : 0;
}

export type ChallengeDay = { day: string; state: 'done' | 'missed' | 'today' | 'upcoming' };
export type ChallengeStatus = 'active' | 'won' | 'lost';

export function challengeDays(challenge: Challenge, habit: Habit | undefined): ChallengeDay[] {
  const today = dayKey();
  return Array.from({ length: challenge.length }, (_, i) => {
    const day = addDays(challenge.startDate, i);
    const done = habit ? isDone(habit, day) : false;
    const state = done ? 'done' : day < today ? 'missed' : day === today ? 'today' : 'upcoming';
    return { day, state };
  });
}

export function challengeStatus(challenge: Challenge, habit: Habit | undefined): ChallengeStatus {
  if (challenge.completedAt) return 'won';
  const days = challengeDays(challenge, habit);
  if (days.every((d) => d.state === 'done')) return 'won';
  if (!habit || days.some((d) => d.state === 'missed')) return 'lost';
  return 'active';
}

/** The challenge to show for a habit: the newest one that isn't dismissed or already won. */
export function currentChallenge(challenges: Challenge[], habitId: string) {
  return challenges.findLast((c) => c.habitId === habitId && !c.completedAt && !c.dismissed);
}

const MOTIVATION: ((tier: { name: string; icon: string }, left: number) => string)[] = [
  (t) => `Every check-in is a step closer to ${t.icon} ${t.name}.`,
  (t) => `The ${t.name} trophy doesn’t earn itself. Show up today.`,
  (t, left) => `${left} more day${left === 1 ? '' : 's'} and ${t.icon} ${t.name} is yours.`,
  (t) => `Future you is already polishing ${t.icon} ${t.name}.`,
  (t) => `Small wins today. ${t.icon} ${t.name} at the finish line.`,
  (t) => `Don’t break the chain. ${t.icon} ${t.name} is waiting at the end.`,
  (t, left) => `${left} to go. Champions are built on days like this. ${t.icon}`,
];

/** The display name and icon of a challenge's trophy (custom challenges use their own name). */
export function trophyOf(challenge: Challenge) {
  const tier = tierFor(challenge.length);
  return { ...tier, name: challenge.custom && challenge.title ? challenge.title : tier.name };
}

/** A short line that changes daily and always points at the trophy. */
export function motivation(challenge: Challenge, left: number) {
  const seed = daysBetween('2026-01-01', dayKey()) + challenge.length;
  return MOTIVATION[((seed % MOTIVATION.length) + MOTIVATION.length) % MOTIVATION.length](
    trophyOf(challenge),
    left
  );
}

/** Minutes after midnight for an `HH:MM` string. */
export function minutesOf(time: string) {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function formatTime(time: string) {
  const date = new Date();
  date.setHours(Math.floor(minutesOf(time) / 60), minutesOf(time) % 60, 0, 0);
  return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export function describeTarget(habit: Pick<Habit, 'target' | 'kind'>) {
  if (habit.kind === 'quit') return 'Stay clean daily';
  return habit.target === 1 ? 'Once a day' : `${habit.target}× a day`;
}

export const fmtDay = (day: string, opts: Intl.DateTimeFormatOptions) =>
  parseDay(day).toLocaleDateString(undefined, opts);

// ---------- Chart helpers ----------

export type Bucket = { key: string; tick: string; detail: string; days: string[] };

/** Time buckets for the Progress chart: days (7), weeks (30) or calendar months (90). */
export function chartBuckets(range: 7 | 30 | 90): Bucket[] {
  const days = lastDays(range).map((d) => dayKey(d));
  if (range === 7) {
    return days.map((d) => ({
      key: d,
      tick: fmtDay(d, { weekday: 'short' }),
      detail: fmtDay(d, { weekday: 'long', month: 'short', day: 'numeric' }),
      days: [d],
    }));
  }
  const groups = new Map<string, string[]>();
  for (const d of days) {
    const date = parseDay(d);
    // Weeks start on Monday; months are calendar months.
    const key =
      range === 30
        ? addDays(d, -((date.getDay() + 6) % 7))
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  const entries = [...groups.entries()];
  // A few leftover days of an earlier month would read as a glitch; fold them into the next month.
  if (range === 90 && entries.length > 1 && entries[0][1].length < 7) {
    entries[1] = [entries[1][0], [...entries[0][1], ...entries[1][1]]];
    entries.shift();
  }
  return entries.map(([key, ds]) => {
    const first = ds[0];
    const last = ds[ds.length - 1];
    const span = `${fmtDay(first, { month: 'short', day: 'numeric' })} – ${fmtDay(last, { month: 'short', day: 'numeric' })}`;
    return range === 30
      ? {
          key,
          tick: fmtDay(first, { month: 'short', day: 'numeric' }),
          detail: `Week of ${span}`,
          days: ds,
        }
      : {
          key,
          tick: fmtDay(last, { month: 'short' }),
          detail: `${fmtDay(last, { month: 'long' })} (${span})`,
          days: ds,
        };
  });
}

export type CategoryGroup = {
  key: string;
  label: string;
  icon: string;
  habits: Habit[];
  slot: number;
};

/**
 * Habits grouped by category for one kind. The chart color slot follows the category's fixed
 * position in the catalog, so a category keeps its color whatever else is on screen.
 */
export function categoryGroups(habits: Habit[], kind: HabitKind): CategoryGroup[] {
  return categoriesFor(kind)
    .map((c, slot) => ({
      ...c,
      slot,
      habits: habits.filter((h) => h.kind === kind && categoryOf(kind, h.emoji).key === c.key),
    }))
    .filter((g) => g.habits.length > 0);
}

/** Met vs. possible habit-days for some habits across some days (only days each habit existed). */
export function tally(habits: Habit[], days: string[]) {
  let met = 0;
  let possible = 0;
  for (const h of habits) {
    for (const d of days) {
      if (d < h.createdAt) continue;
      possible++;
      if (isDone(h, d)) met++;
    }
  }
  return { met, possible };
}
