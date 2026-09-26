import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useCloud } from '@/hooks/use-cloud';
import { useHabits } from '@/hooks/use-habits';
import {
  COACH_ENGINE,
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
 * This period's coach message of one kind, written once per period. On-device (`COACH_ENGINE`
 * 'device') it only needs habits and the coach switched on. With Claude it also needs an account
 * and the user's opt-in, and uploads the latest check-ins first so the server sees them.
 */
export function useCoach(kind: CoachKind, today: string, { enabled = true } = {}) {
  const cloud = useCloud();
  const { habits, challenges, settings, loaded } = useHabits();
  const userId = cloud.user?.id ?? null;
  const stored = useSyncExternalStore(subscribeCoach, () => coachMessage(kind, userId));
  const period = coachPeriod(kind, today);
  const key = `${userId}|${kind}|${period}`;
  const fresh = stored?.period_start === period ? stored : null;
  const [cacheReady, setCacheReady] = useState(false);
  const allowed =
    COACH_ENGINE === 'device' ? !settings.coachOff : cloud.configured && settings.coach && !!userId;
  const active = enabled && loaded && cacheReady && allowed && habits.length > 0;

  const [result, setResult] = useState<{ key: string; state: CoachState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const flush = useRef(cloud.flush);
  const data = useRef({ habits, challenges });
  useEffect(() => {
    flush.current = cloud.flush;
    data.current = { habits, challenges };
  });

  // Saved messages must load first, or today's would be rewritten on every launch.
  useEffect(() => {
    loadCoachCache().then(() => setCacheReady(true));
  }, []);

  useEffect(() => {
    if (!active || fresh) return;
    let cancelled = false;
    (async () => {
      if (COACH_ENGINE === 'claude') await flush.current().catch(() => false);
      const r = await requestCoach(kind, today, userId, data.current);
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
