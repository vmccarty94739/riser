import type { Challenge, Habit, Settings } from '@/lib/habits';

/**
 * Offline-first sync, pure half. The app always reads and writes its local store (instant UI);
 * the cloud copy is reconciled in the background:
 *
 * - `Snapshot` records what the cloud is known to hold, per record. Anything in the local store
 *   that differs from it is a pending change, so edits made offline survive restarts and are
 *   pushed whenever a connection comes back. No per-action bookkeeping is needed.
 * - Pulled rows are applied unless the same record has a pending local change (local wins and
 *   is pushed next), which keeps merges predictable across devices.
 *
 * The network half lives in `src/lib/cloud.ts`; the React wiring in `src/hooks/use-cloud.tsx`.
 */

/** The parts of the app store that sync. Proof photos, dev XP and onboarding stay on the device. */
export type SyncedState = {
  seenLevel: number | null;
  habits: Habit[];
  challenges: Challenge[];
  settings: Settings;
};

export type HabitRow = {
  id: string;
  name: string;
  emoji: string;
  note: string;
  kind: Habit['kind'];
  target: number;
  reminders: string[];
  created_on: string;
};

export type CheckinRow = { habit_id: string; day: string; count: number };

export type ChallengeRow = {
  id: string;
  habit_id: string;
  habit_name: string;
  habit_emoji: string;
  habit_kind: Habit['kind'];
  custom: boolean;
  title: string | null;
  length: number;
  start_date: string;
  completed_at: string | null;
  dismissed: boolean;
};

export type ProfileRow = { seen_level: number | null; settings: Partial<Settings> };

export type RemoteRows = {
  habits: HabitRow[];
  checkins: CheckinRow[];
  challenges: ChallengeRow[];
  profile: ProfileRow | null;
  /** Ids deleted on another device (from the `deletions` tombstone table). */
  deletions: { habits: string[]; challenges: string[] };
};

export type Snapshot = {
  /** Record id → serialized row. */
  habits: Record<string, string>;
  /** `habitId|day` → count. */
  checkins: Record<string, number>;
  challenges: Record<string, string>;
  profile: string | null;
};

export type Changes = {
  habits: HabitRow[];
  deletedHabits: string[];
  checkins: CheckinRow[];
  challenges: ChallengeRow[];
  deletedChallenges: string[];
  profile: ProfileRow | null;
};

export const EMPTY_SNAPSHOT: Snapshot = { habits: {}, checkins: {}, challenges: {}, profile: null };

// Rows are built with a fixed key order so serialized forms compare reliably.
export const habitRow = (h: Habit): HabitRow => ({
  id: h.id,
  name: h.name,
  emoji: h.emoji,
  note: h.note,
  kind: h.kind,
  target: h.target,
  reminders: h.reminders,
  created_on: h.createdAt,
});

export const challengeRow = (c: Challenge): ChallengeRow => ({
  id: c.id,
  habit_id: c.habitId,
  habit_name: c.habitName,
  habit_emoji: c.habitEmoji,
  habit_kind: c.habitKind,
  custom: c.custom,
  title: c.title,
  length: c.length,
  start_date: c.startDate,
  completed_at: c.completedAt,
  dismissed: c.dismissed,
});

export const profileRow = (s: SyncedState): ProfileRow => ({
  seen_level: s.seenLevel,
  settings: s.settings,
});

const checkinKey = (habitId: string, day: string) => `${habitId}|${day}`;

// Re-derive from the fields we own so server-only columns (user_id, updated_at…) never count.
const habitJson = (r: HabitRow) =>
  JSON.stringify(
    habitRow({
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      note: r.note,
      kind: r.kind,
      target: r.target,
      reminders: r.reminders ?? [],
      createdAt: r.created_on,
      log: {},
      proofs: {},
    })
  );
const challengeJson = (r: ChallengeRow) => JSON.stringify(challengeRow(fromChallengeRow(r)));
const profileJson = (r: ProfileRow) =>
  JSON.stringify({ seen_level: r.seen_level ?? null, settings: sortKeys(r.settings ?? {}) });

const sortKeys = (o: object) =>
  Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

function fromChallengeRow(r: ChallengeRow): Challenge {
  return {
    id: r.id,
    habitId: r.habit_id,
    habitName: r.habit_name,
    habitEmoji: r.habit_emoji,
    habitKind: r.habit_kind,
    custom: r.custom,
    title: r.title,
    length: r.length,
    startDate: r.start_date,
    completedAt: r.completed_at,
    dismissed: r.dismissed,
  };
}

/** What the cloud holds once `state` is fully pushed. */
export function snapshotOf(state: SyncedState): Snapshot {
  const checkins: Record<string, number> = {};
  for (const h of state.habits)
    for (const [day, count] of Object.entries(h.log)) checkins[checkinKey(h.id, day)] = count;
  return {
    habits: Object.fromEntries(state.habits.map((h) => [h.id, habitJson(habitRow(h))])),
    checkins,
    challenges: Object.fromEntries(
      state.challenges.map((c) => [c.id, challengeJson(challengeRow(c))])
    ),
    profile: profileJson(profileRow(state)),
  };
}

/** Local changes the cloud hasn't seen yet. */
export function diff(state: SyncedState, snap: Snapshot): Changes {
  const habits = state.habits.map(habitRow).filter((r) => snap.habits[r.id] !== habitJson(r));
  const live = new Set(state.habits.map((h) => h.id));
  const deletedHabits = Object.keys(snap.habits).filter((id) => !live.has(id));

  const checkins: CheckinRow[] = [];
  for (const h of state.habits)
    for (const [day, count] of Object.entries(h.log))
      if (snap.checkins[checkinKey(h.id, day)] !== count)
        checkins.push({ habit_id: h.id, day, count });
  // Un-checked days: known to the cloud, gone locally. A deleted habit's tombstone covers its days.
  for (const [key, count] of Object.entries(snap.checkins)) {
    const [habitId, day] = key.split('|');
    const habit = state.habits.find((h) => h.id === habitId);
    if (habit && count > 0 && !habit.log[day]) checkins.push({ habit_id: habitId, day, count: 0 });
  }

  const challenges = state.challenges
    .map(challengeRow)
    .filter((r) => snap.challenges[r.id] !== challengeJson(r));
  const liveChallenges = new Set(state.challenges.map((c) => c.id));
  const deletedChallenges = Object.keys(snap.challenges).filter((id) => !liveChallenges.has(id));

  const profile = profileRow(state);
  return {
    habits,
    deletedHabits,
    checkins,
    challenges,
    deletedChallenges,
    profile: snap.profile === profileJson(profile) ? null : profile,
  };
}

export const hasChanges = (c: Changes) =>
  c.habits.length > 0 ||
  c.deletedHabits.length > 0 ||
  c.checkins.length > 0 ||
  c.challenges.length > 0 ||
  c.deletedChallenges.length > 0 ||
  c.profile !== null;

/**
 * Applies pulled rows to the local state. In `merge` mode a record with a pending local change is
 * skipped (it'll be pushed instead); `replace` mode (signing in on a new phone) takes the cloud's
 * copy of everything. Returns the same `state` object when nothing changed.
 */
export function mergeRemote<S extends SyncedState>(
  state: S,
  snap: Snapshot,
  remote: RemoteRows,
  mode: 'merge' | 'replace' = 'merge'
): { state: S; snapshot: Snapshot; changed: boolean } {
  const force = mode === 'replace';
  let habits = [...state.habits];
  let challenges = [...state.challenges];
  const snapshot: Snapshot = {
    habits: { ...snap.habits },
    checkins: { ...snap.checkins },
    challenges: { ...snap.challenges },
    profile: snap.profile,
  };
  let changed = false;

  for (const r of remote.habits) {
    const json = habitJson(r);
    const index = habits.findIndex((h) => h.id === r.id);
    const local = habits[index];
    const pending = local ? habitJson(habitRow(local)) !== snap.habits[r.id] : r.id in snap.habits;
    if (pending && !force) continue;
    snapshot.habits[r.id] = json;
    if (local && habitJson(habitRow(local)) === json) continue;
    const next: Habit = {
      log: local?.log ?? {},
      proofs: local?.proofs ?? {},
      id: r.id,
      name: r.name,
      emoji: r.emoji,
      note: r.note,
      kind: r.kind,
      target: r.target,
      reminders: r.reminders ?? [],
      createdAt: r.created_on,
    };
    habits = local ? habits.map((h) => (h.id === r.id ? next : h)) : [...habits, next];
    changed = true;
  }

  for (const r of remote.checkins) {
    const key = checkinKey(r.habit_id, r.day);
    const habit = habits.find((h) => h.id === r.habit_id);
    if (!habit) continue;
    const localCount = habit.log[r.day] ?? 0;
    if (localCount !== (snap.checkins[key] ?? 0) && !force) continue;
    if (r.count > 0) snapshot.checkins[key] = r.count;
    else delete snapshot.checkins[key];
    if (localCount === r.count) continue;
    const log = { ...habit.log };
    if (r.count > 0) log[r.day] = r.count;
    else delete log[r.day];
    habits = habits.map((h) => (h.id === r.habit_id ? { ...h, log } : h));
    changed = true;
  }

  for (const r of remote.challenges) {
    const json = challengeJson(r);
    const index = challenges.findIndex((c) => c.id === r.id);
    const local = challenges[index];
    const pending = local
      ? challengeJson(challengeRow(local)) !== snap.challenges[r.id]
      : r.id in snap.challenges;
    if (pending && !force) continue;
    snapshot.challenges[r.id] = json;
    if (local && challengeJson(challengeRow(local)) === json) continue;
    const next = fromChallengeRow(r);
    challenges = local ? challenges.map((c) => (c.id === r.id ? next : c)) : [...challenges, next];
    changed = true;
  }

  // Deletions from other devices, unless this phone has since edited the same record.
  for (const id of remote.deletions.habits) {
    const local = habits.find((h) => h.id === id);
    if (local && habitJson(habitRow(local)) !== snap.habits[id] && !force) continue;
    delete snapshot.habits[id];
    for (const key of Object.keys(snapshot.checkins))
      if (key.startsWith(`${id}|`)) delete snapshot.checkins[key];
    if (local) {
      habits = habits.filter((h) => h.id !== id);
      changed = true;
    }
  }
  for (const id of remote.deletions.challenges) {
    const local = challenges.find((c) => c.id === id);
    if (local && challengeJson(challengeRow(local)) !== snap.challenges[id] && !force) continue;
    delete snapshot.challenges[id];
    if (local) {
      challenges = challenges.filter((c) => c.id !== id);
      changed = true;
    }
  }

  let next: S = changed ? { ...state, habits, challenges } : state;

  if (remote.profile) {
    const json = profileJson(remote.profile);
    const pending = profileJson(profileRow(state)) !== snap.profile;
    if (!pending || force) {
      snapshot.profile = json;
      if (profileJson(profileRow(next)) !== json) {
        next = {
          ...next,
          seenLevel: remote.profile.seen_level ?? null,
          settings: { ...next.settings, ...remote.profile.settings },
        };
        changed = true;
      }
    }
  }

  return { state: next, snapshot, changed };
}
