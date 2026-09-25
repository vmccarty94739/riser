import AsyncStorage from '@react-native-async-storage/async-storage';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { addDays, parseDay } from '@/lib/habits';
import { supabase } from '@/lib/supabase';

/**
 * AI coach client. The `coach` Supabase Edge Function (supabase/functions/coach) reads the user's
 * synced habits, asks Claude for a daily nudge or a weekly/monthly reflection, and stores it; this
 * module requests those messages and keeps the latest of each on the phone, so they show instantly
 * and offline. A message is generated once per period, so re-asking is free.
 */

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
};

/** `off`: the coach isn't set up on the server (no Claude key) — hide it rather than error. */
export type CoachResult =
  { ok: true; message: CoachMessage | null } | { ok: false; reason: 'off' | 'busy' | 'failed' };

const KEY = 'riser.coach.v1';

/** Mirrors the edge function's `periodStart`: the day, the week's Monday, or the month's 1st. */
export function coachPeriod(kind: CoachKind, today: string) {
  if (kind === 'daily') return today;
  if (kind === 'monthly') return `${today.slice(0, 8)}01`;
  const dow = parseDay(today).getDay(); // 0 = Sunday
  return addDays(today, -((dow + 6) % 7));
}

// The latest message of each kind for the signed-in user, persisted and shared with subscribers.
type Cache = { userId: string | null; messages: Partial<Record<CoachKind, CoachMessage>> };
let cache: Cache = { userId: null, messages: {} };
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Cache) {
  cache = next;
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  listeners.forEach((fn) => fn());
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

/** The stored message of a kind, only if it belongs to this user. */
export function coachMessage(kind: CoachKind, userId: string | null | undefined) {
  return userId && cache.userId === userId ? (cache.messages[kind] ?? null) : null;
}

export function clearCoachCache() {
  publish({ userId: null, messages: {} });
}

const inflight = new Map<string, Promise<CoachResult>>();

/** Asks the coach for this period's message (generated on first ask, then served from storage). */
export function requestCoach(kind: CoachKind, today: string, userId: string) {
  const key = `${userId}|${kind}|${coachPeriod(kind, today)}`;
  const running = inflight.get(key);
  if (running) return running;
  const run = ask(kind, today, userId).finally(() => inflight.delete(key));
  inflight.set(key, run);
  return run;
}

async function ask(kind: CoachKind, today: string, userId: string): Promise<CoachResult> {
  const db = supabase();
  if (!db) return { ok: false, reason: 'off' };
  const { data, error } = await db.functions.invoke<{ message: CoachMessage | null }>('coach', {
    body: { kind, today },
  });
  if (error) {
    const status = error instanceof FunctionsHttpError ? error.context.status : 0;
    return { ok: false, reason: status === 503 ? 'off' : status === 429 ? 'busy' : 'failed' };
  }
  const message = data?.message ?? null;
  if (message) {
    const base = cache.userId === userId ? cache.messages : {};
    publish({ userId, messages: { ...base, [kind]: message } });
  }
  return { ok: true, message };
}
