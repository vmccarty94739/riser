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

import { dayKey, type Challenge, type Habit, type NewHabit, type Settings } from '@/lib/habits';
import { deleteProof } from '@/lib/proofs';
import { NO_DELETIONS, type Deleted } from '@/lib/sync';

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
  /** Deletions the cloud hasn't confirmed yet (see `SyncedState.deleted` in `lib/sync.ts`). */
  deleted: Deleted;
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
  coach: false,
  coachAsked: false,
  coachOff: false,
  name: '',
  coachPushOn: true,
  coachPush: '15:00',
};

export const EMPTY_STORE: Store = {
  onboarded: false,
  seenLevel: null,
  bonusXp: 0,
  habits: [],
  challenges: [],
  settings: DEFAULT_SETTINGS,
  deleted: NO_DELETIONS,
};

type HabitsContextValue = Store & {
  loaded: boolean;
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
    deleted: s.deleted ?? NO_DELETIONS,
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

export function HabitsProvider({ children }: PropsWithChildren) {
  const [store, setStore] = useState<Store>(EMPTY_STORE);
  const [loaded, setLoaded] = useState(false);

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
      update((s) => {
        // Keep won challenges as trophies; drop the rest.
        const dropped = s.challenges.filter((c) => c.habitId === id && !c.completedAt);
        return {
          ...s,
          habits: s.habits.filter((h) => h.id !== id),
          challenges: s.challenges.filter((c) => !dropped.includes(c)),
          // Recorded with the removal itself, so the deletion reaches the cloud no matter what.
          deleted: {
            habits: [...(s.deleted?.habits ?? []), id],
            challenges: [...(s.deleted?.challenges ?? []), ...dropped.map((c) => c.id)],
          },
        };
      });
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
