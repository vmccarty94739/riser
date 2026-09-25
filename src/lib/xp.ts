/**
 * XP and account levels. XP is derived from the data (never stored), so undoing a check-in
 * or backfilling a day always keeps it honest.
 *
 * XP is shared across habits so having more habits never levels you faster. Doing all of them
 * does. Someone with 5 habits and someone with 15 who both finish everything earn the same:
 *   · each day pays DAILY_XP split evenly across that day's habits (+ PERFECT_DAY_XP if all done)
 *   · each trophy pays its tier XP divided by the number of habits you had when you won it
 * Levels unlock theme colors and premium chimes (`LEVEL_UNLOCKS`).
 */
import { THEME_SWATCHES } from '@/constants/theme';
import {
  activeOn,
  addDays,
  dayKey,
  isDone,
  tierFor,
  type Challenge,
  type Habit,
} from '@/lib/habits';

/** XP for a day where every habit is done, split evenly across the day's habits. */
export const DAILY_XP = 60;
export const PERFECT_DAY_XP = 20;

/** XP for finishing each ladder tier (before sharing across habits), by its length in days. */
const TIER_XP: Record<number, number> = {
  3: 30,
  7: 80,
  14: 160,
  21: 250,
  30: 400,
  60: 800,
  90: 1300,
  180: 2600,
  365: 5000,
};

/** How many habits share the XP on a given day (at least 1). */
export function habitCountOn(habits: Habit[], day: string) {
  return Math.max(1, activeOn(habits, day).length);
}

/** XP for one check-in when you have `count` habits. */
export function checkinXp(count: number) {
  return Math.round(DAILY_XP / Math.max(1, count));
}

/** XP a ladder tier pays when you have `count` habits. */
export function tierXp(days: number, count: number) {
  return Math.max(1, Math.round((TIER_XP[days] ?? days * 8) / Math.max(1, count)));
}

/** XP a challenge pays when you have `count` habits. Custom challenges pay 8 XP per day before sharing. */
export function challengeXp(challenge: Pick<Challenge, 'length' | 'custom'>, count: number) {
  const base = challenge.custom
    ? challenge.length * 8
    : (TIER_XP[tierFor(challenge.length).days] ?? challenge.length * 8);
  return Math.max(1, Math.round(base / Math.max(1, count)));
}

/** XP a won challenge paid, shared across the habits that existed the day it was won. */
export function wonXp(challenge: Challenge, habits: Habit[]) {
  return challengeXp(challenge, habitCountOn(habits, challenge.completedAt ?? dayKey()));
}

export type XpBreakdown = {
  checkins: number;
  perfectDays: number;
  trophies: number;
  bonus: number;
  total: number;
};

export function xpBreakdown(habits: Habit[], challenges: Challenge[], bonus = 0): XpBreakdown {
  let checkins = 0;
  let perfectCount = 0;
  if (habits.length) {
    const start = habits.reduce((min, h) => (h.createdAt < min ? h.createdAt : min), dayKey());
    for (let day = start; day <= dayKey(); day = addDays(day, 1)) {
      const active = activeOn(habits, day);
      if (!active.length) continue;
      const done = active.filter((h) => isDone(h, day)).length;
      checkins += (DAILY_XP * done) / active.length;
      if (done === active.length) perfectCount++;
    }
  }
  checkins = Math.round(checkins);
  const perfectDays = perfectCount * PERFECT_DAY_XP;
  const trophies = challenges
    .filter((c) => c.completedAt)
    .reduce((sum, c) => sum + wonXp(c, habits), 0);
  return {
    checkins,
    perfectDays,
    trophies,
    bonus,
    total: checkins + perfectDays + trophies + bonus,
  };
}

/** XP needed to go from `level` to `level + 1`: 80, 100, 120, … */
export function xpForNext(level: number) {
  return 80 + 20 * (level - 1);
}

export type LevelInfo = {
  level: number;
  into: number;
  needed: number;
  progress: number;
  total: number;
};

export function levelFor(total: number): LevelInfo {
  let level = 1;
  let remaining = total;
  while (remaining >= xpForNext(level)) {
    remaining -= xpForNext(level);
    level++;
  }
  const needed = xpForNext(level);
  return { level, into: remaining, needed, progress: remaining / needed, total };
}

const RANKS: [number, string][] = [
  [1, 'Rookie'],
  [5, 'Starter'],
  [10, 'Regular'],
  [16, 'Committed'],
  [25, 'Dedicated'],
  [34, 'Relentless'],
  [42, 'Master'],
  [52, 'Legend'],
];

export function rankFor(level: number) {
  return [...RANKS].reverse().find(([min]) => level >= min)![1];
}

export type Chime = { id: string; name: string; level: number };

/** Completion chimes. The last two unlock with levels (≈ day 24 and day 123 for a steady user). */
export const CHIMES: Chime[] = [
  { id: 'kalimba', name: 'Kalimba', level: 0 },
  { id: 'marimba', name: 'Marimba', level: 0 },
  { id: 'bell', name: 'Soft Bell', level: 0 },
  { id: 'bubble', name: 'Bubble Pop', level: 0 },
  { id: 'harp', name: 'Harp Glide', level: 10 },
  { id: 'crystal', name: 'Crystal', level: 25 },
];

export type Unlock =
  | { level: number; type: 'color'; id: string; name: string }
  | { level: number; type: 'chime'; id: string; name: string };

/** Everything levels unlock, in order. */
export const LEVEL_UNLOCKS: Unlock[] = [
  ...THEME_SWATCHES.filter((s) => s.unlockedBy > 0).map((s): Unlock => ({
    level: s.unlockedBy,
    type: 'color',
    id: s.id,
    name: s.name,
  })),
  ...CHIMES.filter((c) => c.level > 0).map((c): Unlock => ({
    level: c.level,
    type: 'chime',
    id: c.id,
    name: c.name,
  })),
].sort((a, b) => a.level - b.level);

export function unlocksAt(level: number) {
  return LEVEL_UNLOCKS.filter((u) => u.level === level);
}

/** Unlocks gained going from `from` (exclusive) to `to` (inclusive). */
export function unlocksBetween(from: number, to: number) {
  return LEVEL_UNLOCKS.filter((u) => u.level > from && u.level <= to);
}

export function nextUnlock(level: number) {
  return LEVEL_UNLOCKS.find((u) => u.level > level) ?? null;
}
