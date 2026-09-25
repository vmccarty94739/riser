import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  Changes,
  ChallengeRow,
  CheckinRow,
  HabitRow,
  ProfileRow,
  RemoteRows,
} from '@/lib/sync';

/** Network half of sync: push local changes, pull rows changed since a cursor. */

const PAGE = 1000;
const CHUNK = 500;
/** Pulls re-read this much before the cursor, so rows committed out of order are never skipped. */
const OVERLAP_MS = 60_000;

function chunks<T>(list: T[]) {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += CHUNK) out.push(list.slice(i, i + CHUNK));
  return out;
}

function check<T>(result: { data: T; error: unknown }) {
  if (result.error) throw result.error;
  return result.data;
}

type Kind = 'habit' | 'challenge';
const TABLE = { habit: 'habits', challenge: 'challenges' } as const;

/**
 * Deletes rows for good. The tombstone is written first, so other devices always learn about a
 * deletion even if the delete itself is interrupted (a retry finishes it).
 */
async function remove(db: SupabaseClient, userId: string, kind: Kind, ids: string[]) {
  for (const batch of chunks(ids)) {
    const tombstones = batch.map((record_id) => ({ user_id: userId, kind, record_id }));
    check(
      await db
        .from('deletions')
        .upsert(tombstones, { onConflict: 'user_id,kind,record_id', ignoreDuplicates: false })
    );
    check(await db.from(TABLE[kind]).delete().eq('user_id', userId).in('id', batch));
  }
}

/** A record saved again after a deletion (e.g. edited on a phone that was offline) is live again. */
async function clearTombstones(db: SupabaseClient, userId: string, kind: Kind, ids: string[]) {
  for (const batch of chunks(ids))
    check(
      await db
        .from('deletions')
        .delete()
        .eq('user_id', userId)
        .eq('kind', kind)
        .in('record_id', batch)
    );
}

/** Sends `changes` for `userId`. Habits go first so check-ins never reference a missing habit. */
export async function push(db: SupabaseClient, userId: string, changes: Changes) {
  const own = <T extends object>(rows: T[]) => rows.map((r) => ({ ...r, user_id: userId }));

  for (const rows of chunks(own(changes.habits)))
    check(await db.from('habits').upsert(rows, { onConflict: 'user_id,id' }));
  await clearTombstones(
    db,
    userId,
    'habit',
    changes.habits.map((h) => h.id)
  );
  await remove(db, userId, 'habit', changes.deletedHabits);
  for (const rows of chunks(own(changes.checkins)))
    check(await db.from('checkins').upsert(rows, { onConflict: 'user_id,habit_id,day' }));
  for (const rows of chunks(own(changes.challenges)))
    check(await db.from('challenges').upsert(rows, { onConflict: 'user_id,id' }));
  await clearTombstones(
    db,
    userId,
    'challenge',
    changes.challenges.map((c) => c.id)
  );
  await remove(db, userId, 'challenge', changes.deletedChallenges);
  if (changes.profile)
    check(
      await db
        .from('profiles')
        .upsert({ ...changes.profile, user_id: userId }, { onConflict: 'user_id' })
    );
}

/** Each table's primary key (minus `user_id`, which RLS fixes), so paging order is stable. */
const KEYS = {
  habits: ['id'],
  challenges: ['id'],
  checkins: ['habit_id', 'day'],
  profiles: ['user_id'],
  deletions: ['kind', 'record_id'],
} as const;

async function pullTable<T>(db: SupabaseClient, table: keyof typeof KEYS, since: string | null) {
  const rows: (T & { updated_at: string })[] = [];
  for (let from = 0; ; from += PAGE) {
    let query = db.from(table).select('*');
    if (since) query = query.gt('updated_at', since);
    query = query.order('updated_at');
    for (const key of KEYS[table]) query = query.order(key);
    const page = check(await query.range(from, from + PAGE - 1)) as (T & {
      updated_at: string;
    })[];
    rows.push(...page);
    if (page.length < PAGE) return rows;
  }
}

/** Everything changed since `cursor` (all rows when null), plus the cursor for next time. */
export async function pull(
  db: SupabaseClient,
  cursor: string | null
): Promise<{ rows: RemoteRows; cursor: string | null }> {
  const since = cursor ? new Date(Date.parse(cursor) - OVERLAP_MS).toISOString() : null;
  // RLS already limits every query to the signed-in user's rows.
  const [habits, challenges, checkins, profiles, deletions] = await Promise.all([
    pullTable<HabitRow>(db, 'habits', since),
    pullTable<ChallengeRow>(db, 'challenges', since),
    pullTable<CheckinRow>(db, 'checkins', since),
    pullTable<ProfileRow & { user_id: string }>(db, 'profiles', since),
    pullTable<{ kind: Kind; record_id: string }>(db, 'deletions', since),
  ]);
  const stamps = [...habits, ...challenges, ...checkins, ...profiles, ...deletions].map(
    (r) => r.updated_at
  );
  const deleted = (kind: Kind) => deletions.filter((d) => d.kind === kind).map((d) => d.record_id);
  const latest = stamps.reduce<string | null>(
    (max, t) => (!max || Date.parse(t) > Date.parse(max) ? t : max),
    cursor
  );
  return {
    rows: {
      habits,
      challenges,
      checkins,
      profile: profiles[0] ?? null,
      deletions: { habits: deleted('habit'), challenges: deleted('challenge') },
    },
    cursor: latest,
  };
}

/** Deletes the signed-in user and, through cascades, all of their rows. */
export async function deleteRemoteAccount(db: SupabaseClient) {
  check(await db.rpc('delete_account'));
}
