/**
 * End-to-end sync test against the real Supabase project (see README). Two simulated phones share
 * a throwaway anonymous user and run the app's actual sync code (`src/lib/sync.ts` + `cloud.ts`)
 * through a full lifecycle, then the user is deleted. Run: `npm run test:e2e`.
 */
import { createClient } from '@supabase/supabase-js';

import { deleteRemoteAccount, pull, push } from '../src/lib/cloud.ts';
import { diff, EMPTY_SNAPSHOT, hasChanges, mergeRemote, snapshotOf } from '../src/lib/sync.ts';

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const KEY = process.env.EXPO_PUBLIC_SUPABASE_KEY!;
if (!URL || !KEY) throw new Error('Missing EXPO_PUBLIC_SUPABASE_URL / _KEY (see .env.example)');

let failures = 0;
const ok = (pass: boolean, label: string) => {
  if (!pass) failures++;
  console.log(`${pass ? '✅' : '❌'} ${label}`);
};
const connect = () => createClient(URL, KEY, { auth: { persistSession: false } });
const SETTINGS = {
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
} as any;
const day = (i: number) => new Date(Date.UTC(2022, 0, 1) + i * 864e5).toISOString().slice(0, 10);
const habit = (id: string, name: string, extra: any = {}) => ({
  id,
  name,
  emoji: '🚶',
  note: '',
  kind: 'build',
  createdAt: '2022-01-01',
  target: 1,
  reminders: [],
  log: {},
  proofs: {},
  ...extra,
});

/** Local state + snapshot + cursor, syncing like `use-cloud.tsx` does (pull, then push). */
class Phone {
  db: any;
  uid: string;
  state: any;
  snap = EMPTY_SNAPSHOT;
  cursor: string | null = null;
  constructor(db: any, uid: string, state: any) {
    this.db = db;
    this.uid = uid;
    this.state = state;
  }
  async sync(mode: 'merge' | 'replace' = 'merge') {
    const fresh = mode === 'replace';
    const r = await pull(this.db, fresh ? null : this.cursor);
    const base = fresh
      ? { seenLevel: null, settings: SETTINGS, habits: [], challenges: [] }
      : this.state;
    const m = mergeRemote(base, fresh ? EMPTY_SNAPSHOT : this.snap, r.rows, mode);
    this.state = m.state;
    this.snap = m.snapshot;
    this.cursor = r.cursor;
    const changes = diff(this.state, this.snap);
    if (hasChanges(changes)) {
      await push(this.db, this.uid, changes);
      this.snap = snapshotOf(this.state);
    }
  }
  find(id: string) {
    return this.state.habits.find((h: any) => h.id === id);
  }
  edit(id: string, fn: (h: any) => any) {
    this.state = {
      ...this.state,
      habits: this.state.habits.map((h: any) => (h.id === id ? fn(h) : h)),
    };
  }
}

const db = connect();
const { data, error } = await db.auth.signInAnonymously();
if (error) throw error;
const uid = data.user!.id;

try {
  // Phone A: 1,500 days of history (several pages), a Break habit, a custom challenge, settings.
  const history: Record<string, number> = {};
  for (let i = 0; i < 1500; i++) history[day(i)] = 1 + (i % 3);
  const A = new Phone(db, uid, {
    seenLevel: 3,
    settings: { ...SETTINGS, accent: 'teal' },
    habits: [
      habit('water', 'Water', { target: 3, log: history }),
      habit('smoke', 'No smoking', { kind: 'quit', log: { [day(0)]: 1 } }),
    ],
    challenges: [
      {
        id: 'ch1',
        habitId: 'water',
        habitName: 'Water',
        habitEmoji: '💧',
        habitKind: 'build',
        custom: true,
        title: 'Hydration Hero',
        length: 7,
        startDate: day(0),
        completedAt: null,
        dismissed: false,
      },
    ],
  });
  await A.sync();
  const saved = await db.from('checkins').select('*', { count: 'exact', head: true });
  ok(saved.count === 1501, `Upload: all 1,501 check-ins saved (${saved.count})`);

  // Phone B signs in fresh.
  const B = new Phone(db, uid, null);
  await B.sync('replace');
  ok(Object.keys(B.find('water').log).length === 1500, 'New phone: all 1,500 days download');
  ok(B.find('water').log[day(4)] === 2, 'New phone: multi-check-in counts are exact');
  ok(B.find('smoke').kind === 'quit', 'New phone: Break habits stay Break habits');
  ok(
    B.state.challenges[0]?.title === 'Hydration Hero' &&
      B.state.settings.accent === 'teal' &&
      B.state.seenLevel === 3,
    'New phone: custom challenge, settings and level arrive'
  );
  ok(!hasChanges(diff(B.state, B.snap)), 'New phone: nothing is re-uploaded');

  // Edits on A reach B.
  A.edit('water', (h) => {
    const log = { ...h.log };
    delete log[day(10)];
    return { ...h, name: 'Drink water', log };
  });
  A.state = {
    ...A.state,
    settings: { ...A.state.settings, sound: false },
    habits: [...A.state.habits, habit('walk', 'Walk')],
    challenges: [{ ...A.state.challenges[0], completedAt: day(6) }],
  };
  await A.sync();
  await B.sync();
  ok(
    B.find('water').name === 'Drink water' && !B.find('water').log[day(10)],
    'Rename and un-check arrive'
  );
  ok(
    B.state.challenges[0].completedAt === day(6) && B.state.settings.sound === false,
    'Trophy and setting arrive'
  );
  ok(!!B.find('walk'), 'New habit arrives');

  // Offline conflict on the same habit: both phones converge.
  A.edit('walk', (h) => ({ ...h, name: 'Walk (A)' }));
  B.edit('walk', (h) => ({ ...h, name: 'Walk (B)' }));
  await A.sync();
  await B.sync();
  await A.sync();
  ok(
    A.find('walk').name === B.find('walk').name,
    `Conflict: both phones agree ("${A.find('walk').name}")`
  );

  // Deleting removes the row and its check-ins; the other phone follows; won trophies stay.
  B.state = { ...B.state, habits: B.state.habits.filter((h: any) => h.id !== 'water') };
  await B.sync();
  const row = await db.from('habits').select('id').eq('id', 'water');
  const rows = await db
    .from('checkins')
    .select('*', { count: 'exact', head: true })
    .eq('habit_id', 'water');
  ok(
    row.data!.length === 0 && rows.count === 0,
    'Delete: habit and its check-ins leave the tables'
  );
  await A.sync();
  ok(
    !A.find('water') && A.state.challenges.length === 1,
    'Delete: other phone follows, trophy kept'
  );

  // Un-check, then re-check.
  A.edit('smoke', (h) => ({ ...h, log: {} }));
  await A.sync();
  await B.sync();
  ok(!B.find('smoke').log[day(0)], 'Un-check arrives');
  A.edit('smoke', (h) => ({ ...h, log: { [day(0)]: 1 } }));
  await A.sync();
  await B.sync();
  ok(B.find('smoke').log[day(0)] === 1, 'Re-check arrives');

  await A.sync();
  await B.sync();
  ok(
    JSON.stringify(snapshotOf(A.state)) === JSON.stringify(snapshotOf(B.state)),
    'Both phones hold identical data'
  );

  // Privacy.
  const stranger = connect();
  await stranger.auth.signInAnonymously();
  const peek = await stranger.from('habits').select('id');
  ok(peek.data?.length === 0, 'Another user sees none of it');
  await deleteRemoteAccount(stranger);
} finally {
  await deleteRemoteAccount(db);
  const after = await db.from('habits').select('id');
  ok(!!after.error || after.data?.length === 0, 'Test user deleted');
}

console.log(failures ? `\n${failures} FAILED` : '\nALL PASSED');
process.exit(failures ? 1 : 0);
