import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  use,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type PropsWithChildren,
  type SetStateAction,
} from 'react';

import { clockOffset, setClockOffset } from '@/lib/clock';
import {
  addDays,
  dayKey,
  type Challenge,
  type Habit,
  type NewHabit,
  type Settings,
} from '@/lib/habits';
import { deleteProof } from '@/lib/proofs';

export * from '@/lib/habits';

const STORAGE_KEY = 'riser.store.v3';
const V2_KEY = 'riser.store.v2';
const V1_KEY = 'riser.habits.v1';

export type Store = {
  onboarded: boolean;
  /** Highest level already celebrated, so each level-up plays once. Null until first measured. */
  seenLevel: number | null;
  /** Developer-only XP added on top of the derived total. */
  bonusXp: number;
  habits: Habit[];
  challenges: Challenge[];
  settings: Settings;
};

export const DEFAULT_SETTINGS: Settings = {
  reminders: false,
  morningOn: true,
  morning: '08:30',
  eveningOn: true,
  evening: '20:00',
  sound: true,
  chime: 'kalimba',
  haptics: true,
  appearance: 'system',
  accent: 'blue',
  gold: 'orange',
  collapsed: [],
};

export const EMPTY_STORE: Store = {
  onboarded: false,
  seenLevel: null,
  bonusXp: 0,
  habits: [],
  challenges: [],
  settings: DEFAULT_SETTINGS,
};

type HabitsContextValue = Store & {
  loaded: boolean;
  /** Simulated days ahead of the real date (developer tools only). */
  devOffset: number;
  addHabit: (habit: NewHabit) => Habit;
  updateHabit: (id: string, patch: Partial<NewHabit>) => void;
  removeHabit: (id: string) => void;
  /** Sets the check-in count for a habit on a day (clamped to 0…target). */
  setCount: (id: string, day: string, count: number) => void;
  setProof: (id: string, day: string, file: string | null) => void;
  startChallenge: (
    habitId: string,
    length: number,
    options?: { startDate?: string; title?: string | null }
  ) => void;
  markChallengeWon: (id: string) => void;
  dismissChallenge: (id: string) => void;
  updateSettings: (patch: Partial<Settings>) => void;
  toggleCollapsed: (key: string) => void;
  setOnboarded: (onboarded: boolean) => void;
  setSeenLevel: (level: number) => void;
  dev: {
    setOffset: (days: number) => void;
    /** Rewrites a challenge so `daysDone` days are complete and the next one is today. */
    setChallengeProgress: (challengeId: string, daysDone: number) => void;
    loadDemo: () => void;
    /** Replaces everything with a lived-in demo account (for screenshots and QA). */
    seedDemo: () => void;
    /** Adds a completed challenge of this length (unlocks that tier's trophy and color). */
    grantTrophy: (length: number) => void;
    /** Adds (or with a negative number, removes) bonus XP to test levels. */
    addXp: (amount: number) => void;
  };
};

const HabitsContext = createContext<HabitsContextValue | null>(null);

/** Raw store access for cloud sync (`use-cloud.tsx`), which merges pulled rows into it. */
type StoreAccess = {
  /** The last committed store. */
  getStore: () => Store;
  setStore: Dispatch<SetStateAction<Store>>;
};
const StoreAccessContext = createContext<StoreAccess | null>(null);

const newId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

type LegacyHabit = {
  id: string;
  name: string;
  emoji: string;
  createdAt: string;
  completions?: string[];
  target?: number;
  reminder?: string | null;
  log?: Record<string, number>;
};

function upgradeHabit(h: LegacyHabit): Habit {
  return {
    id: h.id,
    name: h.name,
    emoji: h.emoji,
    note: '',
    kind: 'build',
    createdAt: h.createdAt,
    target: h.target ?? 1,
    reminders: h.reminder ? [h.reminder] : [],
    log: h.log ?? Object.fromEntries((h.completions ?? []).map((d) => [d, 1])),
    proofs: {},
  };
}

/** Fills fields added after a store was first saved and drops retired ones. */
function normalize({ account: _retired, ...s }: Store & { account?: unknown }): Store {
  return {
    ...s,
    seenLevel: s.seenLevel ?? null,
    bonusXp: s.bonusXp ?? 0,
    settings: { ...DEFAULT_SETTINGS, ...s.settings },
    challenges: s.challenges.map((c) => ({
      ...c,
      habitKind: c.habitKind ?? s.habits.find((h) => h.id === c.habitId)?.kind ?? 'build',
      custom: c.custom ?? false,
      title: c.title ?? null,
    })),
  };
}

async function loadStore(): Promise<Store> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (raw) return { ...EMPTY_STORE, ...JSON.parse(raw) };
  // v2 had a single `reminder` and no kind/note/proofs.
  const v2 = await AsyncStorage.getItem(V2_KEY);
  if (v2) {
    const s = JSON.parse(v2);
    return { ...EMPTY_STORE, ...s, habits: s.habits.map(upgradeHabit) };
  }
  // v1 stored `completions: string[]` and nothing else.
  const v1 = await AsyncStorage.getItem(V1_KEY);
  return v1 ? { ...EMPTY_STORE, habits: JSON.parse(v1).map(upgradeHabit) } : EMPTY_STORE;
}

/** 60 days of believable history, including a quit habit and two habits sharing an icon. */
function demoHabits(): Habit[] {
  const today = dayKey();
  const start = addDays(today, -59);
  const make = (name: string, emoji: string, rate: number, extra: Partial<Habit> = {}): Habit => {
    const habit: Habit = {
      id: newId() + name.length,
      name,
      emoji,
      note: '',
      kind: 'build',
      createdAt: start,
      target: 1,
      reminders: [],
      log: {},
      proofs: {},
      ...extra,
    };
    for (let i = 1; i < 60; i++) {
      const day = addDays(start, i - 1);
      // Ramp up over time so the charts show a trend.
      if (Math.random() < rate * (0.6 + (0.4 * i) / 60)) habit.log[day] = habit.target;
      else if (habit.target > 1 && Math.random() < 0.6)
        habit.log[day] = Math.ceil(habit.target / 2);
    }
    return habit;
  };
  return [
    make('Drink a glass of water', '💧', 0.8, {
      target: 4,
      reminders: ['09:00', '12:00', '15:00', '18:00'],
    }),
    make('Read 10 pages', '📚', 0.7, { note: 'Currently: Atomic Habits' }),
    make('Read to the kids', '📚', 0.6),
    make('Go for a walk', '🚶', 0.65),
    make('Meditate 5 minutes', '🧘', 0.5),
    make('No nicotine', '🚬', 0.85, { kind: 'quit', note: 'For my lungs and my wallet' }),
    make('No doomscrolling', '📱', 0.55, { kind: 'quit' }),
  ];
}

/**
 * A lived-in account for screenshots and QA: two months of history, a perfect-day streak,
 * earned trophies, running challenges and today half done. Deterministic for the last 10 days.
 */
function demoStore(): Store {
  const today = dayKey();
  const habits = demoHabits();
  const [water, read, readKids, walk, meditate, nicotine, scroll] = habits;
  // Last 6 days all done (a perfect streak); today partly done.
  for (let i = 1; i <= 6; i++) habits.forEach((h) => (h.log[addDays(today, -i)] = h.target));
  water.log[today] = 2;
  read.log[today] = 1;
  walk.log[today] = 1;
  scroll.log[today] = 1;
  delete readKids.log[today];
  delete meditate.log[today];
  delete nicotine.log[today];
  for (let i = 7; i <= 23; i++) water.log[addDays(today, -i)] = water.target;
  for (let i = 7; i <= 10; i++) nicotine.log[addDays(today, -i)] = 1;
  const won = (h: Habit, length: number, endAgo: number): Challenge => ({
    id: newId() + length + h.name.length,
    habitId: h.id,
    habitName: h.name,
    habitEmoji: h.emoji,
    habitKind: h.kind,
    custom: false,
    title: null,
    length,
    startDate: addDays(today, -endAgo - length + 1),
    completedAt: addDays(today, -endAgo),
    dismissed: false,
  });
  const running = (h: Habit, length: number, startAgo: number): Challenge => ({
    ...won(h, length, 0),
    id: newId() + 'r' + length + h.name.length,
    startDate: addDays(today, -startAgo),
    completedAt: null,
  });
  return {
    ...EMPTY_STORE,
    onboarded: true,
    habits,
    challenges: [
      won(water, 3, 20),
      won(water, 7, 13),
      won(read, 3, 1),
      won(nicotine, 3, 8),
      running(water, 14, 6),
      running(read, 7, 0),
      running(nicotine, 7, 6),
    ],
  };
}

export function HabitsProvider({ children }: PropsWithChildren) {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [loaded, setLoaded] = useState(false);
  const [devOffset, setDevOffset] = useState(clockOffset());

  useEffect(() => {
    loadStore()
      .then((s) => setStore(normalize(s)))
      .catch(async () => {
        // Never silently overwrite data we couldn't read: keep a copy before starting fresh.
        const raw = await AsyncStorage.getItem(STORAGE_KEY).catch(() => null);
        if (raw)
          await AsyncStorage.setItem(`${STORAGE_KEY}.unreadable-${Date.now()}`, raw).catch(
            () => {}
          );
        setStore(EMPTY_STORE);
      })
      .finally(() => setLoaded(true));
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(store)).catch(() => {});
  }, [store, loaded]);

  const committed = useRef(store);
  useEffect(() => {
    committed.current = store;
  }, [store]);
  const [access] = useState<StoreAccess>(() => ({ getStore: () => committed.current, setStore }));

  const update = (fn: (s: Store) => Store) => setStore(fn);
  const mapHabit = (id: string, fn: (h: Habit) => Habit) =>
    update((s) => ({ ...s, habits: s.habits.map((h) => (h.id === id ? fn(h) : h)) }));

  const startChallenge: HabitsContextValue['startChallenge'] = (habitId, length, options = {}) =>
    update((s) => {
      const habit = s.habits.find((h) => h.id === habitId);
      if (!habit) return s;
      const title = options.title?.trim() || null;
      const challenge: Challenge = {
        id: newId(),
        habitId,
        habitName: habit.name,
        habitEmoji: habit.emoji,
        habitKind: habit.kind,
        custom: !!title,
        title,
        length,
        startDate: options.startDate ?? dayKey(),
        completedAt: null,
        dismissed: false,
      };
      // Starting a new challenge replaces any unfinished one for this habit.
      const others = s.challenges.map((c) =>
        c.habitId === habitId && !c.completedAt ? { ...c, dismissed: true } : c
      );
      return { ...s, challenges: [...others, challenge] };
    });

  const value: HabitsContextValue = {
    ...store,
    loaded,
    devOffset,
    addHabit: (input) => {
      const habit: Habit = {
        ...input,
        target: input.kind === 'quit' ? 1 : input.target,
        id: newId(),
        createdAt: dayKey(),
        log: {},
        proofs: {},
      };
      update((s) => ({ ...s, habits: [...s.habits, habit] }));
      return habit;
    },
    updateHabit: (id, patch) =>
      update((s) => {
        const habit = s.habits.find((h) => h.id === id);
        if (!habit) return s;
        const next = { ...habit, ...patch };
        if (next.kind === 'quit') next.target = 1;
        next.reminders = next.reminders.slice(0, next.target);
        return {
          ...s,
          habits: s.habits.map((h) => (h.id === id ? next : h)),
          // Keep challenge snapshots (shown on cards and trophies) in step with renames and icon changes.
          challenges: s.challenges.map((c) =>
            c.habitId === id
              ? { ...c, habitName: next.name, habitEmoji: next.emoji, habitKind: next.kind }
              : c
          ),
        };
      }),
    removeHabit: (id) => {
      Object.values(store.habits.find((h) => h.id === id)?.proofs ?? {}).forEach(deleteProof);
      update((s) => ({
        ...s,
        habits: s.habits.filter((h) => h.id !== id),
        // Keep won challenges as trophies; drop the rest.
        challenges: s.challenges.filter((c) => c.habitId !== id || c.completedAt),
      }));
    },
    setCount: (id, day, count) =>
      mapHabit(id, (h) => {
        const log = { ...h.log };
        const next = Math.max(0, Math.min(h.target, count));
        if (next === 0) delete log[day];
        else log[day] = next;
        return { ...h, log };
      }),
    setProof: (id, day, file) => {
      const previous = store.habits.find((h) => h.id === id)?.proofs[day];
      if (previous && previous !== file) deleteProof(previous);
      mapHabit(id, (h) => {
        const proofs = { ...h.proofs };
        if (file) proofs[day] = file;
        else delete proofs[day];
        return { ...h, proofs };
      });
    },
    startChallenge,
    markChallengeWon: (id) =>
      update((s) => ({
        ...s,
        challenges: s.challenges.map((c) => (c.id === id ? { ...c, completedAt: dayKey() } : c)),
      })),
    dismissChallenge: (id) =>
      update((s) => ({
        ...s,
        challenges: s.challenges.map((c) => (c.id === id ? { ...c, dismissed: true } : c)),
      })),
    updateSettings: (patch) => update((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    toggleCollapsed: (key) =>
      update((s) => {
        const collapsed = s.settings.collapsed.includes(key)
          ? s.settings.collapsed.filter((k) => k !== key)
          : [...s.settings.collapsed, key];
        return { ...s, settings: { ...s.settings, collapsed } };
      }),
    setOnboarded: (onboarded) => update((s) => ({ ...s, onboarded })),
    setSeenLevel: (seenLevel) => update((s) => ({ ...s, seenLevel })),
    dev: {
      setOffset: (days) => {
        setClockOffset(days);
        setDevOffset(days);
      },
      setChallengeProgress: (challengeId, daysDone) =>
        update((s) => {
          const challenge = s.challenges.find((c) => c.id === challengeId);
          if (!challenge) return s;
          const today = dayKey();
          const startDate = addDays(today, -daysDone);
          return {
            ...s,
            challenges: s.challenges.map((c) => (c.id === challengeId ? { ...c, startDate } : c)),
            habits: s.habits.map((h) => {
              if (h.id !== challenge.habitId) return h;
              const log = { ...h.log };
              for (let i = 0; i < challenge.length; i++) {
                const day = addDays(startDate, i);
                if (i < daysDone) log[day] = h.target;
                else delete log[day];
              }
              return { ...h, createdAt: h.createdAt < startDate ? h.createdAt : startDate, log };
            }),
          };
        }),
      loadDemo: () => update((s) => ({ ...s, habits: [...s.habits, ...demoHabits()] })),
      seedDemo: () => setStore(demoStore()),
      addXp: (amount) => update((s) => ({ ...s, bonusXp: Math.max(0, s.bonusXp + amount) })),
      grantTrophy: (length) =>
        update((s) => {
          const habit = s.habits[0];
          if (!habit) return s;
          const today = dayKey();
          const challenge: Challenge = {
            id: newId(),
            habitId: habit.id,
            habitName: habit.name,
            habitEmoji: habit.emoji,
            habitKind: habit.kind,
            custom: false,
            title: null,
            length,
            startDate: addDays(today, -length),
            completedAt: today,
            dismissed: false,
          };
          return { ...s, challenges: [...s.challenges, challenge] };
        }),
    },
  };

  return (
    <StoreAccessContext value={access}>
      <HabitsContext value={value}>{children}</HabitsContext>
    </StoreAccessContext>
  );
}

export function useStoreAccess() {
  const ctx = use(StoreAccessContext);
  if (!ctx) throw new Error('useStoreAccess must be used inside <HabitsProvider>');
  return ctx;
}

export function useHabits() {
  const ctx = use(HabitsContext);
  if (!ctx) throw new Error('useHabits must be used inside <HabitsProvider>');
  return ctx;
}

/** The user's color choices, or null outside the provider. Used by `useTheme`. */
export function useThemeChoice() {
  const ctx = use(HabitsContext);
  return ctx ? { accent: ctx.settings.accent, gold: ctx.settings.gold } : null;
}
