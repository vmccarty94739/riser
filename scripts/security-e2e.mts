/**
 * Live check of the server-side protections, against the real Supabase project, as an attacker
 * would call it: throwaway guest accounts using only the public publishable key. Covers row
 * isolation between users, size and row caps, date ranges, the password rule and email
 * confirmation. Every account it creates is deleted at the end.
 *   npm run test:security
 */
import { createClient } from '@supabase/supabase-js';

const client = () =>
  createClient(process.env.EXPO_PUBLIC_SUPABASE_URL!, process.env.EXPO_PUBLIC_SUPABASE_KEY!, {
    auth: { persistSession: false },
  });

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
};
const rejected = (r: { error: { code?: string; message: string } | null }, code: string) =>
  [r.error?.code === code, r.error?.message ?? 'accepted'] as const;

const habit = (id: string, over: object = {}) => ({
  id,
  name: 'Walk',
  emoji: '🚶',
  kind: 'build',
  target: 1,
  created_on: '2026-09-25',
  ...over,
});

// Signed out: the tables are closed to the public key alone.
const anon = client();
for (const table of ['profiles', 'habits', 'checkins', 'challenges', 'deletions', 'coach_messages'])
  check(`signed out can't read ${table}`, ...rejected(await anon.from(table).select('*'), '42501'));

const db = client();
const other = client();
const { error: signInError } = await db.auth.signInAnonymously();
if (signInError) throw signInError;
const { error: otherError } = await other.auth.signInAnonymously();
if (otherError) throw otherError;
const myId = (await db.auth.getUser()).data.user!.id;

try {
  let r = await db.from('habits').insert(habit('ok-1', { note: 'n'.repeat(60) }));
  check('a normal habit is accepted', !r.error, r.error?.message);

  // Another user can't see, change, delete or forge this user's rows.
  const seen = await other.from('habits').select('id');
  check("another user can't read my habits", seen.data?.length === 0, `${seen.data?.length} rows`);
  const changed = await other.from('habits').update({ name: 'x' }).eq('user_id', myId).select();
  check(
    "another user can't edit my habits",
    changed.data?.length === 0,
    `${changed.data?.length} rows`
  );
  const removed = await other.from('habits').delete().eq('user_id', myId).select();
  check(
    "another user can't delete my habits",
    removed.data?.length === 0,
    `${removed.data?.length} rows`
  );
  check(
    "another user can't write rows as me",
    ...rejected(await other.from('habits').insert({ ...habit('forged'), user_id: myId }), '42501')
  );
  check(
    "a user can't write coaching text",
    ...rejected(
      await db.from('coach_messages').insert({
        user_id: myId,
        kind: 'daily',
        period_start: '2026-09-25',
        range_start: '2026-09-25',
        range_end: '2026-09-25',
        title: 't',
        body: 'b',
        model: 'm',
      }),
      '42501'
    )
  );

  // Size caps on free-form columns.
  check(
    'a 100 KB note is rejected',
    ...rejected(
      await db.from('habits').insert(habit('big-note', { note: 'x'.repeat(100_000) })),
      '23514'
    )
  );
  check(
    'a 5,000-character id is rejected',
    ...rejected(await db.from('habits').insert(habit('x'.repeat(5000))), '23514')
  );
  check(
    'a 1,000-emoji icon is rejected',
    ...rejected(
      await db.from('habits').insert(habit('big-emoji', { emoji: '🚶'.repeat(1000) })),
      '23514'
    )
  );
  check(
    '5,000 reminders are rejected',
    ...rejected(
      await db
        .from('habits')
        .insert(habit('many-reminders', { reminders: Array(5000).fill('09:00') })),
      '23514'
    )
  );
  check(
    '200 KB of settings is rejected',
    ...rejected(
      await db.from('profiles').upsert({ settings: { junk: 'x'.repeat(200_000) } }),
      '23514'
    )
  );
  r = await db.from('profiles').upsert({ settings: { theme: 'dark', name: 'Sam' } });
  check('normal settings are accepted', !r.error, r.error?.message);

  // Date ranges and counters.
  r = await db.from('checkins').insert({ habit_id: 'ok-1', day: '2026-09-25', count: 1 });
  check('a normal check-in is accepted', !r.error, r.error?.message);
  check(
    'a check-in in year 0001 is rejected',
    ...rejected(
      await db.from('checkins').insert({ habit_id: 'ok-1', day: '0001-01-01', count: 1 }),
      '23514'
    )
  );
  check(
    'a check-in in year 9999 is rejected',
    ...rejected(
      await db.from('checkins').insert({ habit_id: 'ok-1', day: '9999-12-31', count: 1 }),
      '23514'
    )
  );
  check(
    'a huge seen_level is rejected',
    ...rejected(await db.from('profiles').upsert({ seen_level: 2_147_483_647 }), '23514')
  );

  // Row caps: 300 habits per user. `ok-1` exists, so 299 more reach the cap exactly.
  const bulk = (from: number, to: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => habit(`bulk-${from + i}`));
  r = await db.from('habits').insert(bulk(1, 299));
  check('300 habits are accepted', !r.error, r.error?.message);
  check(
    'habit 301 is rejected',
    ...rejected(await db.from('habits').insert(habit('bulk-300')), '23514')
  );
  r = await db
    .from('habits')
    .upsert(habit('bulk-1', { name: 'Run' }), { onConflict: 'user_id,id' });
  check('editing a habit still works at the cap', !r.error, r.error?.message);

  // Password rule: 8+ characters with letters and digits. Weak passwords are refused before any
  // account exists or any email is sent; example.com is a reserved domain.
  const signup = (password: string) =>
    client().auth.signUp({
      email: `riser-security-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
      password,
    });
  let p = await signup('abcdefgh');
  check(
    'password "abcdefgh" is rejected',
    p.error?.code === 'weak_password',
    p.error?.message ?? 'accepted'
  );
  p = await signup('abc1234');
  check(
    '7-character password is rejected',
    p.error?.code === 'weak_password',
    p.error?.message ?? 'accepted'
  );

  // Email ownership: attaching an email must wait for the emailed code. This sends one real
  // confirmation email, to the app's own support inbox (plus-addressed), never to a stranger.
  const email = `riserapp.support+security-test-${Date.now()}@gmail.com`;
  const attach = await other.auth.updateUser({ email });
  check(
    'an email needs confirming before it is attached',
    !attach.error && attach.data.user?.email !== email,
    attach.error?.message ??
      (attach.data.user?.email === email ? 'attached without confirming' : '')
  );
} finally {
  for (const [who, c] of [
    ['first', db],
    ['second', other],
  ] as const) {
    const { error } = await c.rpc('delete_account');
    check(`throwaway ${who} account deleted`, !error, error?.message);
  }
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
