import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useCloud } from '@/hooks/use-cloud';
import { useHabits } from '@/hooks/use-habits';
import {
  coachMessage,
  coachPeriod,
  loadCoachCache,
  requestCoach,
  subscribeCoach,
  type CoachKind,
} from '@/lib/coach';

export type CoachState =
  /** Needs an account, sync, habits or the user's opt-in first. */
  | 'inactive'
  | 'loading'
  | 'ready'
  /** Not set up on the server; hide the coach. */
  | 'off'
  | 'busy'
  | 'failed';

/**
 * This period's coach message of one kind. Requests it (once per period) when the user has opted
 * in, is signed in and has habits, after uploading their latest check-ins so the coach sees them.
 */
export function useCoach(kind: CoachKind, today: string, { enabled = true } = {}) {
  const cloud = useCloud();
  const { habits, settings, loaded } = useHabits();
  const userId = cloud.user?.id ?? null;
  const stored = useSyncExternalStore(subscribeCoach, () => coachMessage(kind, userId));
  const period = coachPeriod(kind, today);
  const key = `${userId}|${kind}|${period}`;
  const fresh = stored?.period_start === period ? stored : null;
  const active =
    enabled && loaded && cloud.configured && settings.coach && !!userId && habits.length > 0;

  const [result, setResult] = useState<{ key: string; state: CoachState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const flush = useRef(cloud.flush);
  useEffect(() => {
    flush.current = cloud.flush;
  });

  useEffect(() => {
    loadCoachCache();
  }, []);

  useEffect(() => {
    if (!active || fresh || !userId) return;
    let cancelled = false;
    (async () => {
      await flush.current().catch(() => false);
      const r = await requestCoach(kind, today, userId);
      if (cancelled) return;
      if (!r.ok) setResult({ key, state: r.reason });
      else if (!r.message) setResult({ key, state: 'inactive' });
    })();
    return () => {
      cancelled = true;
    };
  }, [active, fresh, userId, kind, today, key, attempt]);

  const state: CoachState = !active
    ? 'inactive'
    : fresh
      ? 'ready'
      : result?.key === key
        ? result.state
        : 'loading';

  return {
    state,
    message: fresh,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}
