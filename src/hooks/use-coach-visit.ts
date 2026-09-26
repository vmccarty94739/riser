import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { dayKey, useHabits } from '@/hooks/use-habits';
import { coachDigest } from '@/lib/coach';
import { deviceModelReady, rewordOnDevice, rewordPushOnDevice } from '@/lib/coach-device';
import { insightsFor, pickInsight, type Insight } from '@/lib/coach-insights';
import { quoteHabits } from '@/lib/coach-rules';
import { coachTips } from '@/lib/reminders';

/**
 * Fresh coaching on every visit: each time the user comes back to the app (after at least
 * `VISIT_GAP_MS` away, or on a new day) the coach picks the most useful insight they haven't seen
 * lately. The phone's AI rewords it when available. Shown on the Dashboard (dismissible) and in
 * the Coach's Report.
 */

const KEY = 'riser.coach.visit.v1';
const VISIT_GAP_MS = 10 * 60_000;
/** How many recent insights to avoid repeating. */
const MEMORY = 8;

export type VisitCoach = {
  day: string;
  id: string;
  kind: Insight['kind'];
  title: string;
  body: string;
  tip: string;
  source: 'device' | 'rules';
  /** The phone's AI is still rewording it. */
  writing: boolean;
  dismissed: boolean;
};

type Stored = {
  current: VisitCoach | null;
  recent: string[];
  visits: number;
  /** When the app last went to the background (ms). */
  leftAt: number;
};

let state: Stored = { current: null, recent: [], visits: 0, leftAt: 0 };
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: Stored) {
  state = next;
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
  listeners.forEach((fn) => fn());
}

function load() {
  loaded ??= AsyncStorage.getItem(KEY)
    .then((raw) => {
      if (raw) state = { ...state, ...JSON.parse(raw) };
      // A reword cut short by the app closing never finishes; show the plain version.
      if (state.current?.writing)
        state = { ...state, current: { ...state.current, writing: false } };
    })
    .catch(() => {});
  return loaded;
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};

/** This visit's coaching (null until written, or with the coach off). */
export function useVisitCoach() {
  const { settings } = useHabits();
  const current = useSyncExternalStore(subscribe, () => state.current);
  return {
    coach: settings.coachOff ? null : current,
    dismiss: () =>
      state.current && publish({ ...state, current: { ...state.current, dismissed: true } }),
  };
}

/** Clears the visit coach (sign-out / delete). */
export function clearVisitCoach() {
  publish({ current: null, recent: [], visits: 0, leftAt: 0 });
}

/** Mounted once (root layout): writes new coaching whenever a new visit starts. */
export function useCoachVisits() {
  const { habits, challenges, settings, loaded: storeLoaded } = useHabits();
  const [ready, setReady] = useState(false);
  const [visit, setVisit] = useState(0);
  const data = useRef({ habits, challenges, name: settings.name });
  useEffect(() => {
    data.current = { habits, challenges, name: settings.name };
  });

  useEffect(() => {
    load().then(() => setReady(true));
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'background') publish({ ...state, leftAt: Date.now() });
      if (s === 'active') setVisit((n) => n + 1);
    });
    return () => sub.remove();
  }, []);

  const active = ready && storeLoaded && !settings.coachOff && habits.length > 0;

  useEffect(() => {
    if (!active) return;
    const today = dayKey();
    const away = state.leftAt ? Date.now() - state.leftAt : 0;
    const stale = !state.current || state.current.day !== today || away >= VISIT_GAP_MS;
    if (!stale) return;
    const { habits: hs, challenges: cs, name } = data.current;
    const insight = pickInsight(insightsFor(hs, cs, today, name), state.recent, state.visits);
    if (!insight) return;

    const base: VisitCoach = {
      day: today,
      id: insight.id,
      kind: insight.kind,
      title: insight.title,
      body: insight.body,
      tip: insight.tip,
      source: 'rules',
      writing: true,
      dismissed: false,
    };
    publish({
      current: base,
      recent: [insight.id, ...state.recent.filter((id) => id !== insight.id)].slice(0, MEMORY),
      visits: state.visits + 1,
      // Counted as one visit until the app is left again.
      leftAt: 0,
    });

    // Not cancelled on re-render: the id check drops it if a newer visit has started.
    rewordOnDevice(insight, name, coachDigest(today, { habits: hs, challenges: cs })).then((ai) => {
      if (!state.current || state.current.id !== insight.id) return;
      const names = hs.map((h) => h.name);
      publish({
        ...state,
        current: ai
          ? {
              ...state.current,
              ...quoteHabits({ ...ai, highlights: [] }, names),
              source: 'device',
              writing: false,
            }
          : { ...state.current, writing: false },
      });
    });
  }, [active, visit]);
}

/** AI-written afternoon notifications, by `day|insightId|name` (null = tried, keep the rules text). */
const pushCache = new Map<string, string | null>();

/**
 * The phone's AI versions of the upcoming afternoon coach tips (see `coachTips`), keyed
 * `day|insightId` for `planReminders`. Each tip is written once, in the background; without the
 * phone's model this stays empty and the rules text is sent.
 */
export function useCoachPushText() {
  const { habits, challenges, settings, loaded } = useHabits();
  const [texts, setTexts] = useState<Record<string, string>>({});
  const tips = loaded ? coachTips(habits, challenges, settings) : [];
  const key = tips.map((t) => `${t.day}|${t.insight.id}|${settings.name}`).join(',');
  const data = useRef({ tips, habits, challenges, name: settings.name });
  useEffect(() => {
    data.current = { tips, habits, challenges, name: settings.name };
  });

  useEffect(() => {
    if (!key || !deviceModelReady()) return;
    let live = true;
    (async () => {
      const { tips: todo, habits: hs, challenges: cs, name } = data.current;
      const next: Record<string, string> = {};
      for (const t of todo) {
        const id = `${t.day}|${t.insight.id}|${name}`;
        if (!pushCache.has(id)) {
          const digest = coachDigest(t.day, { habits: hs, challenges: cs });
          pushCache.set(id, await rewordPushOnDevice(t.insight, name, digest));
        }
        const text = pushCache.get(id);
        if (text) {
          next[`${t.day}|${t.insight.id}`] = quoteHabits(
            { title: text, body: '', tip: null, highlights: [] },
            hs.map((h) => h.name)
          ).title;
        }
      }
      if (live) setTexts(next);
    })();
    return () => {
      live = false;
    };
  }, [key]);

  return texts;
}
