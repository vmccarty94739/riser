import { describe, expect, it } from '@jest/globals';

import { DEFAULT_SETTINGS } from '@/hooks/use-habits';
import {
  confirmDeletions,
  diff,
  EMPTY_SNAPSHOT,
  habitRow,
  hasChanges,
  mergeRemote,
  snapshotOf,
  type RemoteRows,
  type SyncedState,
} from '@/lib/sync';

import { challenge, habit } from './helpers';

const state = (overrides: Partial<SyncedState> = {}): SyncedState => ({
  seenLevel: 3,
  habits: [],
  challenges: [],
  settings: DEFAULT_SETTINGS,
  ...overrides,
});

const remote = (overrides: Partial<RemoteRows> = {}): RemoteRows => ({
  habits: [],
  checkins: [],
  challenges: [],
  profile: null,
  deletions: { habits: [], challenges: [] },
  ...overrides,
});

describe('sync diff', () => {
  it('pushes everything the first time and nothing once synced', () => {
    const s = state({
      habits: [habit({ id: 'a', log: { '2026-09-24': 1 } })],
      challenges: [challenge({ id: 'c', habitId: 'a' })],
    });
    const first = diff(s, EMPTY_SNAPSHOT);
    expect(first.habits).toHaveLength(1);
    expect(first.checkins).toEqual([{ habit_id: 'a', day: '2026-09-24', count: 1 }]);
    expect(first.challenges).toHaveLength(1);
    expect(first.profile).not.toBeNull();
    expect(hasChanges(diff(s, snapshotOf(s)))).toBe(false);
  });

  it('sends un-checks as a zero count and deletions as tombstones', () => {
    const before = state({
      habits: [habit({ id: 'a', log: { '2026-09-23': 1 } }), habit({ id: 'b' })],
      challenges: [challenge({ id: 'c', habitId: 'b' })],
    });
    const after = state({ habits: [habit({ id: 'a', log: {} })], challenges: [] });
    const changes = diff(after, snapshotOf(before));
    expect(changes.checkins).toEqual([{ habit_id: 'a', day: '2026-09-23', count: 0 }]);
    expect(changes.deletedHabits).toEqual(['b']);
    expect(changes.deletedChallenges).toEqual(['c']);
    expect(changes.habits).toHaveLength(0);
  });

  it('only pushes the profile when settings or the seen level change', () => {
    const s = state();
    const snap = snapshotOf(s);
    expect(diff(state({ settings: { ...DEFAULT_SETTINGS, sound: false } }), snap).profile).toEqual(
      expect.objectContaining({ settings: expect.objectContaining({ sound: false }) })
    );
    expect(diff(state({ seenLevel: 4 }), snap).profile?.seen_level).toBe(4);
  });
});

describe('sync merge', () => {
  it('applies rows from another device and keeps local proof photos', () => {
    const local = habit({ id: 'a', name: 'Read', proofs: { '2026-09-20': 'p.jpg' } });
    const s = state({ habits: [local] });
    const snap = snapshotOf(s);
    const result = mergeRemote(
      s,
      snap,
      remote({
        habits: [{ ...habitRow(local), name: 'Read 20 pages' }, habitRow(habit({ id: 'n' }))],
        checkins: [{ habit_id: 'a', day: '2026-09-24', count: 1 }],
      })
    );
    expect(result.changed).toBe(true);
    const a = result.state.habits.find((h) => h.id === 'a')!;
    expect(a.name).toBe('Read 20 pages');
    expect(a.proofs).toEqual({ '2026-09-20': 'p.jpg' });
    expect(a.log).toEqual({ '2026-09-24': 1 });
    expect(result.state.habits.map((h) => h.id)).toEqual(['a', 'n']);
    // What was just pulled isn't pushed back.
    expect(hasChanges(diff(result.state, result.snapshot))).toBe(false);
  });

  it('keeps pending local edits over incoming rows', () => {
    const synced = habit({ id: 'a', log: { '2026-09-24': 1 } });
    const snap = snapshotOf(state({ habits: [synced] }));
    const edited = state({ habits: [{ ...synced, name: 'Mine', log: {} }] });
    const result = mergeRemote(
      edited,
      snap,
      remote({
        habits: [{ ...habitRow(synced), name: 'Theirs' }],
        checkins: [{ habit_id: 'a', day: '2026-09-24', count: 1 }],
      })
    );
    expect(result.state).toBe(edited);
    expect(diff(result.state, result.snapshot).habits[0].name).toBe('Mine');
  });

  it('removes records deleted elsewhere', () => {
    const s = state({
      habits: [habit({ id: 'a', log: { '2026-09-24': 1 } })],
      challenges: [challenge({ id: 'c', habitId: 'a' })],
    });
    const result = mergeRemote(
      s,
      snapshotOf(s),
      remote({ deletions: { habits: ['a'], challenges: ['c'] } })
    );
    expect(result.state.habits).toHaveLength(0);
    expect(result.state.challenges).toHaveLength(0);
    expect(Object.keys(result.snapshot.checkins)).toHaveLength(0);
    expect(hasChanges(diff(result.state, result.snapshot))).toBe(false);
  });

  it('keeps a record edited here after it was deleted elsewhere, so it is saved again', () => {
    const s = state({ habits: [habit({ id: 'a', name: 'Walk' })] });
    const snap = snapshotOf(s);
    const edited = state({ habits: [{ ...s.habits[0], name: 'Walk 30 min' }] });
    const result = mergeRemote(
      edited,
      snap,
      remote({ deletions: { habits: ['a'], challenges: [] } })
    );
    expect(result.state.habits.map((h) => h.name)).toEqual(['Walk 30 min']);
    expect(diff(result.state, result.snapshot).habits).toHaveLength(1);
  });

  it('returns the same state when nothing is new, so syncing never re-renders in a loop', () => {
    const s = state({ habits: [habit({ id: 'a', log: { '2026-09-24': 1 } })] });
    const snap = snapshotOf(s);
    const echo = remote({
      habits: [habitRow(s.habits[0])],
      checkins: [{ habit_id: 'a', day: '2026-09-24', count: 1 }],
      profile: { seen_level: 3, settings: DEFAULT_SETTINGS },
    });
    const result = mergeRemote(s, snap, echo);
    expect(result.changed).toBe(false);
    expect(result.state).toBe(s);
  });

  it('replace mode takes the account’s data over this phone’s', () => {
    const result = mergeRemote(
      state(),
      EMPTY_SNAPSHOT,
      remote({
        habits: [habitRow(habit({ id: 'acct', name: 'From account' }))],
        profile: { seen_level: 9, settings: { ...DEFAULT_SETTINGS, accent: 'teal' } },
      }),
      'replace'
    );
    expect(result.state.habits.map((h) => h.name)).toEqual(['From account']);
    expect(result.state.seenLevel).toBe(9);
    expect(result.state.settings.accent).toBe('teal');
  });

  it('never brings back a habit deleted here, even if the snapshot was lost', () => {
    const kept = habit({ id: 'keep' });
    const gone = habit({ id: 'gone', name: 'Pay gorn' });
    // The phone deleted "gone", but its record of what the cloud holds is empty (lost/stale).
    const phone = state({ habits: [kept], deleted: { habits: ['gone'], challenges: [] } });
    const result = mergeRemote(
      phone,
      EMPTY_SNAPSHOT,
      remote({ habits: [habitRow(kept), habitRow(gone)] })
    );
    expect(result.state.habits.map((h) => h.id)).toEqual(['keep']);
    // …and the deletion is still sent.
    expect(diff(result.state, result.snapshot).deletedHabits).toEqual(['gone']);
  });

  it('sends a deletion recorded here even when the snapshot never knew the record', () => {
    const phone = state({ deleted: { habits: ['h9'], challenges: ['c9'] } });
    const changes = diff(phone, EMPTY_SNAPSHOT);
    expect(changes.deletedHabits).toEqual(['h9']);
    expect(changes.deletedChallenges).toEqual(['c9']);
  });

  it('only forgets deletions the cloud confirmed, keeping ones made meanwhile', () => {
    const sent = diff(state({ deleted: { habits: ['a'], challenges: [] } }), EMPTY_SNAPSHOT);
    expect(confirmDeletions({ habits: ['a', 'b'], challenges: ['x'] }, sent)).toEqual({
      habits: ['b'],
      challenges: ['x'],
    });
  });

  it('replace mode (signing in to another account) ignores this phone’s deletions', () => {
    const acct = habit({ id: 'gone', name: 'From account' });
    const result = mergeRemote(
      state({ deleted: { habits: ['gone'], challenges: [] } }),
      EMPTY_SNAPSHOT,
      remote({ habits: [habitRow(acct)] }),
      'replace'
    );
    expect(result.state.habits.map((h) => h.id)).toEqual(['gone']);
  });
});
