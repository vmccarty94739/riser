/**
 * Live check of the server-side limits, against the real Supabase project, as an attacker would
 * call it: a throwaway guest account using only the public publishable key. Deleted at the end.
 *   npm run test:security
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_KEY!,
  {
    auth: { persistSession: false },
  }
);

let failed = 0;
const check = (name: string, ok: boolean, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` (${detail})` : ''}`);
};

const { error: signInError } = await db.auth.signInAnonymously();
if (signInError) throw signInError;

try {
  const habit = (id: string, over: object = {}) => ({
    id,
    name: 'Walk',
    emoji: '🚶',
    kind: 'build',
    target: 1,
    created_on: '2026-09-25',
    ...over,
  });

  let r = await db.from('habits').insert(habit('ok-1', { note: 'n'.repeat(60) }));
  check('a normal habit is accepted', !r.error, r.error?.message);

  r = await db.from('habits').insert(habit('big-note', { note: 'x'.repeat(100_000) }));
  check('a 100 KB note is rejected', r.error?.code === '23514', r.error?.message ?? 'accepted');

  r = await db.from('habits').insert(habit('x'.repeat(5000)));
  check(
    'a 5,000-character id is rejected',
    r.error?.code === '23514',
    r.error?.message ?? 'accepted'
  );

  r = await db.from('habits').insert(habit('big-emoji', { emoji: '🚶'.repeat(1000) }));
  check(
    'a 1,000-emoji icon is rejected',
    r.error?.code === '23514',
    r.error?.message ?? 'accepted'
  );

  r = await db
    .from('habits')
    .insert(habit('many-reminders', { reminders: Array(5000).fill('09:00') }));
  check('5,000 reminders are rejected', r.error?.code === '23514', r.error?.message ?? 'accepted');

  r = await db.from('profiles').upsert({ settings: { junk: 'x'.repeat(200_000) } });
  check(
    '200 KB of settings is rejected',
    r.error?.code === '23514',
    r.error?.message ?? 'accepted'
  );

  r = await db.from('profiles').upsert({ settings: { theme: 'dark', name: 'Sam' } });
  check('normal settings are accepted', !r.error, r.error?.message);

  // Password rule: 8+ characters with letters and digits. Signing up sends no email because
  // "Confirm email" is off; example.com is a reserved domain. Any account created is deleted.
  const signup = async (password: string) => {
    const client = createClient(
      process.env.EXPO_PUBLIC_SUPABASE_URL!,
      process.env.EXPO_PUBLIC_SUPABASE_KEY!,
      {
        auth: { persistSession: false },
      }
    );
    const email = `riser-security-test-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    const result = await client.auth.signUp({ email, password });
    if (result.data.session) {
      const { error } = await client.rpc('delete_account');
      if (error) console.log(`  ! could not delete ${email}: ${error.message}`);
    }
    return result;
  };
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
  p = await signup('walk2026daily');
  check('a valid password is accepted', !p.error && !!p.data.session, p.error?.message);
} finally {
  const { error } = await db.rpc('delete_account');
  check('throwaway account deleted', !error, error?.message);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
