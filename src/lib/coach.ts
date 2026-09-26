import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';

import {
  addDays as addDigestDays,
  buildDigest,
  periodStart,
  type ChallengeRow,
  type CheckinRow,
  type HabitRow,
} from '../../supabase/functions/coach/stats';
import { writeOnDevice } from '@/lib/coach-device';
import { dailyByRules, quoteHabits, reflectionByRules } from '@/lib/coach-rules';
import { parseDay, type Challenge, type Habit } from '@/lib/habits';
import { supabase } from '@/lib/supabase';

/**
 * AI coach client: a daily nudge and weekly/monthly reflections from the user's habit data.
 *
 * `COACH_ENGINE` picks who writes them:
 * - `device` (now, free): the phone's own model (Apple Intelligence / Gemini Nano) when available,
 *   otherwise the rule-based coach. Everything stays on the phone; no account or network needed.
 * - `claude` (later, paid): the `coach` Supabase Edge Function asks Claude (see
 *   supabase/functions/coach). Needs the ANTHROPIC_API_KEY secret, and the user's opt-in
 *   (`settings.coach`) because habit data leaves the phone. Before switching, restore the Anthropic
 *   paragraphs in store/PRIVACY_POLICY.md and store/STORE_LISTING.md (git history).
 *
 * The latest message of each kind is kept on the phone, so it shows instantly; a message is
 * written once per period (day / Monday-week / month).
 */
export const COACH_ENGINE: 'device' | 'claude' = 'device';

export type CoachKind = 'daily' | 'weekly' | 'monthly';

export type CoachMessage = {
  kind: CoachKind;
  period_start: string;
  range_start: string;
  range_end: string;
  title: string;
  /** Daily: the nudge. Weekly/monthly: the summary. */
  body: string;
  /** Daily: a tip for today. Weekly/monthly: the focus for next period. */
  tip: string | null;
  highlights: { emoji: string; text: string }[];
  created_at: string;
  /** Who wrote it: the phone's model, the rule-based coach, or Claude. */
  source?: 'device' | 'rules' | 'claude';
};

/** `off`: the Claude coach isn't set up on the server (no key) — hide it rather than error. */
export type CoachResult =
  { ok: true; message: CoachMessage | null } | { ok: false; reason: 'off' | 'busy' | 'failed' };

/** The app data the on-device coach reads. */
export type CoachData = { habits: Habit[]; challenges: Challenge[] };

const KEY = 'riser.coach.v2';
/** Owner of on-device messages (they come from this phone's data, not an account). */
const LOCAL = 'local';

/** Mirrors the edge function's `periodStart`: the day, the week's Monday, or the month's 1st. */
export function coachPeriod(kind: CoachKind, today: string) {
  return periodStart(kind, today);
}

// The latest message of each kind, persisted and shared with subscribers.
type Cache = { userId: string | null; messages: Partial<Record<CoachKind, CoachMessage>> };
let cache: Cache = { userId: null, messages: {} };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Cache) {
  cache = next;
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  listeners.forEach((fn) => fn());
}

function save(owner: string, message: CoachMessage) {
  const base = cache.userId === owner ? cache.messages : {};
  publish({ userId: owner, messages: { ...base, [message.kind]: message } });
}

export function loadCoachCache() {
  loading ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw) cache = JSON.parse(raw);
      listeners.forEach((fn) => fn());
    })
    .catch(() => {});
  return loading;
}

export function subscribeCoach(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** The stored message of a kind for this user (or this phone, for the on-device coach). */
export function coachMessage(kind: CoachKind, userId: string | null | undefined) {
  const owner = COACH_ENGINE === 'device' ? LOCAL : userId;
  return owner && cache.userId === owner ? (cache.messages[kind] ?? null) : null;
}

export function clearCoachCache() {
  publish({ userId: null, messages: {} });
}

const inflight = new Map<string, Promise<CoachResult>>();

/** This period's message: written on first ask, then served from storage. */
export function requestCoach(
  kind: CoachKind,
  today: string,
  userId: string | null,
  data: CoachData
) {
  const owner = COACH_ENGINE === 'device' ? LOCAL : userId;
  if (!owner) return Promise.resolve<CoachResult>({ ok: false, reason: 'off' });
  const key = `${owner}|${kind}|${coachPeriod(kind, today)}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = (
    COACH_ENGINE === 'device'
      ? writeLocally(kind, today, data)
      : askClaude(kind, today, owner, data.habits)
  ).finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

/** The app's habits in the shape the digest reads (the same one the database uses). */
function toRows(today: string, { habits, challenges }: CoachData) {
  const from = addDigestDays(today, -130);
  const habitRows: HabitRow[] = habits.map((h) => ({
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    kind: h.kind,
    target: h.target,
    created_on: h.createdAt,
  }));
  const checkins: CheckinRow[] = habits.flatMap((h) =>
    Object.entries(h.log)
      .filter(([day, count]) => count > 0 && day >= from && day <= today)
      .map(([day, count]) => ({ habit_id: h.id, day, count }))
  );
  const challengeRows: ChallengeRow[] = challenges.map((c) => ({
    habit_id: c.habitId,
    habit_name: c.habitName,
    custom: c.custom,
    title: c.title,
    length: c.length,
    start_date: c.startDate,
    completed_at: c.completedAt,
    dismissed: c.dismissed,
  }));
  return { habits: habitRows, checkins, challenges: challengeRows };
}

/** The last two weeks as the plain-text digest the AI coach reads (today still in progress). */
export function coachDigest(today: string, data: CoachData) {
  return buildDigest({ kind: 'daily', today, ...toRows(today, data) }).text;
}

async function writeLocally(kind: CoachKind, today: string, data: CoachData): Promise<CoachResult> {
  if (!data.habits.length) return { ok: true, message: null };
  const digest = buildDigest({ kind, today, ...toRows(today, data) });
  const device = await writeOnDevice(kind, digest);
  const written =
    device ??
    (kind === 'daily'
      ? dailyByRules(digest, parseDay(today).getDay())
      : reflectionByRules(digest, kind === 'weekly' ? 'week' : 'month'));
  const message: CoachMessage = quoteHabits(
    {
      kind,
      period_start: coachPeriod(kind, today),
      range_start: digest.range.start,
      range_end: digest.range.end,
      ...written,
      created_at: new Date().toISOString(),
      source: device ? 'device' : 'rules',
    },
    data.habits.map((h) => h.name)
  );
  save(LOCAL, message);
  return { ok: true, message };
}

async function askClaude(
  kind: CoachKind,
  today: string,
  userId: string,
  habits: Habit[]
): Promise<CoachResult> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'off' };
  const { data, error } = await db.functions.invoke<{ message: CoachMessage | null }>('coach', {
    body: { kind, today },
  });
  if (error) {
    const status = error instanceof FunctionsHttpError ? error.context.status : 0;
    return {
      ok: false,
      reason: status === 503 || status === 403 ? 'off' : status === 429 ? 'busy' : 'failed',
    };
  }
  const message = data?.message
    ? quoteHabits(
        { ...data.message, source: 'claude' as const },
        habits.map((h) => h.name)
      )
    : null;
  if (message) save(userId, message);
  return { ok: true, message };
}
