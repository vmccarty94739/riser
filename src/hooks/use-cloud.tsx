import AsyncStorage from '@react-native-async-storage/async-storage';
import type { SupabaseClient, User } from '@supabase/supabase-js';
import { createContext, use, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';

import { EMPTY_STORE, useHabits, useStoreAccess, type Store } from '@/hooks/use-habits';
import { authMessage, normalizeEmail } from '@/lib/auth';
import { deleteRemoteAccount, pull, push } from '@/lib/cloud';
import { clearVisitCoach } from '@/hooks/use-coach-visit';
import { clearCoachCache } from '@/lib/coach';
import { deleteProof } from '@/lib/proofs';
import { cloudConfigured, supabase } from '@/lib/supabase';
import {
  confirmDeletions,
  diff,
  EMPTY_SNAPSHOT,
  hasChanges,
  mergeRemote,
  snapshotOf,
  type Snapshot,
} from '@/lib/sync';

/**
 * Accounts and background sync. The app never waits on the network: screens read the local
 * store (`use-habits`), and this provider reconciles it with Supabase after changes (debounced),
 * on launch, when the app returns to the foreground, and on a backoff while offline.
 *
 * Everyone gets a Supabase user: an anonymous one is created silently after onboarding, so data
 * is backed up from day one. "Create account" attaches an email + password to that same user.
 * "Sign in" on another phone replaces local data with the account's.
 */

const META_KEY = 'riser.sync.v1';
const DEBOUNCE_MS = 1500;
const RETRY_MS = [5_000, 15_000, 60_000, 300_000];
/** A sync still running after this long is treated as stuck, so it can't block syncing forever. */
const STUCK_MS = 45_000;
/** While the app is open, check for changes made on other devices this often. */
const POLL_MS = 60_000;

type Meta = {
  userId: string;
  /** Latest server `updated_at` seen; pulls ask for rows newer than this. */
  cursor: string | null;
  snapshot: Snapshot;
  /** Set when signing in to an existing account: the next pull replaces local data. */
  replace: boolean;
  /** The data here belongs to an email account (not a guest), remembered even if the session is lost. */
  email?: string | null;
};

const freshMeta = (userId: string, replace = false): Meta => ({
  userId,
  cursor: null,
  snapshot: EMPTY_SNAPSHOT,
  replace,
});

export type CloudUser = { id: string; email: string | null; anonymous: boolean };
export type CloudStatus = 'off' | 'signed-out' | 'syncing' | 'synced' | 'offline' | 'error';
/** `verify`: Supabase emailed a code that must be entered with `confirmEmail`. */
export type CreateResult = 'done' | 'verify-signup' | 'verify-email-change';

type CloudContextValue = {
  /** False when `.env` has no Supabase project; accounts are hidden and data stays local. */
  configured: boolean;
  user: CloudUser | null;
  status: CloudStatus;
  lastSynced: number | null;
  /** Changes on this phone not yet in the cloud. */
  pending: number;
  /** The email account this phone's data belongs to while its session is lost, or null. */
  signedOutEmail: string | null;
  /** Why the last sync failed (shown with a "Try again" button), or null. */
  syncError: string | null;
  /** Syncs now, including a download, instead of waiting for the next retry. */
  syncNow: () => void;
  createAccount: (email: string, password: string) => Promise<CreateResult>;
  confirmEmail: (
    kind: Exclude<CreateResult, 'done'>,
    email: string,
    code: string,
    password: string
  ) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  /** Verifies the emailed code, sets the new password and signs in. */
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  /** Uploads pending changes now. Resolves true when everything is in the cloud. */
  flush: () => Promise<boolean>;
  signOut: () => Promise<void>;
  /** Deletes the account, its cloud data and everything on this device. */
  deleteEverything: () => Promise<void>;
};

const CloudContext = createContext<CloudContextValue | null>(null);

const toCloudUser = (u: User | null | undefined): CloudUser | null =>
  u ? { id: u.id, email: u.email ?? null, anonymous: !!u.is_anonymous } : null;

/** Development only: sync activity in the Expo server log, to see what a phone really sends. */
const log = (...args: unknown[]) => {
  if (__DEV__) console.log('[sync]', ...args);
};

/** Wall-clock time, kept outside the component (sync runs from effects and timers, not render). */
const clockMs = () => Date.now();

/** How many records wait to upload. */
const countChanges = (c: ReturnType<typeof diff>) =>
  c.habits.length +
  c.deletedHabits.length +
  c.checkins.length +
  c.challenges.length +
  c.deletedChallenges.length +
  (c.profile ? 1 : 0);

const sameUser = (a: CloudUser | null, b: CloudUser | null) =>
  a?.id === b?.id && a?.email === b?.email && a?.anonymous === b?.anonymous;

/** Surfaces a Supabase error as a plain sentence. */
function fail(error: unknown): never {
  throw new Error(authMessage(error));
}

export function CloudProvider({ children }: PropsWithChildren) {
  const { loaded, onboarded, habits, challenges, settings, seenLevel, deleted } = useHabits();
  const { getStore, setStore } = useStoreAccess();
  const db = supabase();

  const [user, setUser] = useState<CloudUser | null>(null);
  const [authReady, setAuthReady] = useState(!db);
  const [status, setStatus] = useState<CloudStatus>('syncing');
  const [lastSynced, setLastSynced] = useState<number | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const meta = useRef<Meta | null>(null);
  const [metaReady, setMetaReady] = useState(false);
  /** Mirrors `meta.email` for rendering. */
  const [accountEmail, setAccountEmail] = useState<string | null>(null);
  const userRef = useRef<CloudUser | null>(null);
  /** Bumped on every account switch; a sync that started earlier discards its results. */
  const epoch = useRef(0);
  /** True while signing in, so no sync runs against a half-switched account. */
  const switching = useRef(false);
  const running = useRef(false);
  const runningSince = useRef(0);
  /** Records changed on this phone that the cloud doesn't have yet (shown in Settings). */
  const [pending, setPending] = useState(0);
  /** The sync in progress, so `flush` can wait for it instead of reporting stale results. */
  const inflight = useRef<Promise<boolean> | null>(null);
  const queued = useRef<{ pull: boolean } | null>(null);
  const retry = useRef<{ timer: ReturnType<typeof setTimeout> | null; attempt: number }>({
    timer: null,
    attempt: 0,
  });

  const saveMeta = (next: Meta) => {
    meta.current = next;
    setAccountEmail(next.email ?? null);
    AsyncStorage.setItem(META_KEY, JSON.stringify(next)).catch(() => {});
  };

  // Session: restore the saved one, then follow sign-ins, sign-outs and token refreshes.
  useEffect(() => {
    if (!db) return;
    AsyncStorage.getItem(META_KEY)
      .then((raw) => {
        meta.current = raw ? JSON.parse(raw) : null;
        setAccountEmail(meta.current?.email ?? null);
      })
      .catch(() => {})
      .finally(() => setMetaReady(true));
    // Token refreshes also fire this, so only a real change of user counts (else every hourly
    // refresh would look like a new sign-in and trigger a full sync).
    const record = (next: CloudUser | null) => {
      if (sameUser(userRef.current, next)) return;
      userRef.current = next;
      setUser(next);
    };
    db.auth
      .getSession()
      .then(({ data }) => record(toCloudUser(data.session?.user)))
      .finally(() => setAuthReady(true));
    const { data } = db.auth.onAuthStateChange((_event, session) => {
      // Never call Supabase from inside this callback; just record the user.
      record(toCloudUser(session?.user));
    });
    // Refresh tokens only while the app is on screen, as Supabase recommends for React Native.
    if (AppState.currentState === 'active') db.auth.startAutoRefresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') db.auth.startAutoRefresh();
      else db.auth.stopAutoRefresh();
    });
    return () => {
      data.subscription.unsubscribe();
      sub.remove();
      db.auth.stopAutoRefresh();
    };
  }, [db]);

  const sync = (options: { pull: boolean }): Promise<boolean> => {
    if (running.current && clockMs() - runningSince.current > STUCK_MS) {
      // A request that never came back (the timeout should prevent this) must not block syncing.
      log('previous sync stuck; starting over');
      epoch.current++;
      running.current = false;
    }
    if (running.current) {
      queued.current = { pull: options.pull || !!queued.current?.pull };
      return Promise.resolve(false);
    }
    const run = syncOnce(options).finally(() => {
      if (inflight.current === run) inflight.current = null;
    });
    inflight.current = run;
    return run;
  };

  const syncOnce = async (options: { pull: boolean }): Promise<boolean> => {
    const current = userRef.current;
    if (!db || !current || !loaded || !metaReady || switching.current) return false;
    running.current = true;
    runningSince.current = clockMs();
    const started = epoch.current;
    const stale = () => epoch.current !== started || userRef.current?.id !== current.id;
    if (retry.current.timer) clearTimeout(retry.current.timer);
    setStatus('syncing');
    try {
      let m = meta.current?.userId === current.id ? meta.current : freshMeta(current.id);
      m = { ...m, email: current.anonymous ? null : current.email };
      let state: Store = getStore();

      if (m.replace) {
        // Signing in on this phone: the account's data replaces whatever was here.
        const { rows, cursor } = await pull(db, null);
        if (stale()) return false;
        const merged = mergeRemote(
          { ...EMPTY_STORE, settings: state.settings },
          EMPTY_SNAPSHOT,
          rows,
          'replace'
        );
        state = { ...merged.state, onboarded: !!rows.profile || rows.habits.length > 0 };
        getStore().habits.forEach((h) => Object.values(h.proofs).forEach(deleteProof));
        setStore(state);
        m = { ...m, cursor, snapshot: merged.snapshot, replace: false };
        saveMeta(m);
      } else if (options.pull) {
        const { rows, cursor } = await pull(db, m.cursor);
        if (stale()) return false;
        const base = getStore();
        const merged = mergeRemote(base, m.snapshot, rows);
        if (merged.changed) {
          const snapshot = m.snapshot;
          setStore((s) => (s === base ? merged.state : mergeRemote(s, snapshot, rows).state));
        }
        state = merged.state;
        m = { ...m, cursor, snapshot: merged.snapshot };
        saveMeta(m);
      }

      const changes = diff(state, m.snapshot);
      if (hasChanges(changes)) {
        log('uploading', {
          habits: changes.habits.map((h) => h.name),
          deletedHabits: changes.deletedHabits,
          checkins: changes.checkins.length,
          challenges: changes.challenges.length,
          deletedChallenges: changes.deletedChallenges.length,
          profile: !!changes.profile,
        });
        await push(db, current.id, changes);
        if (stale()) return false;
        saveMeta({ ...m, snapshot: snapshotOf(state) });
        // The cloud confirmed these deletions; stop carrying them.
        if (changes.deletedHabits.length || changes.deletedChallenges.length)
          setStore((s) => ({ ...s, deleted: confirmDeletions(s.deleted, changes) }));
      }
      retry.current.attempt = 0;
      setStatus('synced');
      setSyncError(null);
      setLastSynced(clockMs());
      setPending(countChanges(diff(getStore(), meta.current?.snapshot ?? EMPTY_SNAPSHOT)));
      if (__DEV__) {
        // A fingerprint of everything on the phone, to compare against the database.
        const now = getStore();
        const checkins = now.habits.flatMap((h) =>
          Object.entries(h.log).map(([d, n]) => `${h.id}|${d}=${n}`)
        );
        log('synced', options.pull ? '(with download)' : '', {
          habits: now.habits.map((h) => `${h.id}:${h.name}:${h.kind}:${h.target}`).sort(),
          checkins: checkins.sort(),
          challenges: now.challenges
            .map((c) => `${c.id}:${c.length}:${c.startDate}:${c.completedAt ?? '-'}`)
            .sort(),
          seenLevel: now.seenLevel,
          accent: now.settings.accent,
          waitingDeletions: now.deleted,
        });
      }
      return true;
    } catch (error) {
      if (stale()) return false;
      // Offline or a server problem: keep the changes and try again with backoff.
      const message = authMessage(error);
      log('failed:', message, error);
      setStatus(/offline/i.test(message) ? 'offline' : 'error');
      setSyncError(message);
      const delay = RETRY_MS[Math.min(retry.current.attempt, RETRY_MS.length - 1)];
      retry.current.attempt++;
      retry.current.timer = setTimeout(() => void syncRef.current({ pull: true }), delay);
      return false;
    } finally {
      running.current = false;
      const next = queued.current;
      queued.current = null;
      if (next) void syncRef.current(next);
    }
  };
  // Timers and listeners always call the latest `sync` (it closes over fresh props).
  const syncRef = useRef(sync);
  useEffect(() => {
    syncRef.current = sync;
  });

  // Back up silently from the moment onboarding is done, with no sign-up required. Never for data
  // that belongs to an email account whose session was lost: that user signs back in instead,
  // rather than having their habits copied into a new guest account.
  useEffect(() => {
    if (!db || !authReady || !loaded || !metaReady || !onboarded || user || switching.current)
      return;
    if (meta.current?.email) return;
    let cancelled = false;
    const attempt = () =>
      db.auth.signInAnonymously().then(({ error }) => {
        if (error && !cancelled) setStatus('offline');
      });
    attempt();
    const sub = AppState.addEventListener('change', (s) => s === 'active' && attempt());
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [db, authReady, loaded, metaReady, onboarded, user]);

  // A new session (launch, sign-in, sign-up): pull, then push.
  useEffect(() => {
    if (user && loaded && metaReady) void syncRef.current({ pull: true });
  }, [db, user, loaded, metaReady]);

  // Local edits: count what's waiting, then push shortly after the user stops tapping.
  useEffect(() => {
    if (!user || !loaded || !metaReady) return;
    const m = meta.current;
    if (m?.userId === user.id)
      setPending(
        countChanges(diff({ habits, challenges, settings, seenLevel, deleted }, m.snapshot))
      );
    const timer = setTimeout(() => void syncRef.current({ pull: false }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [user, loaded, metaReady, habits, challenges, settings, seenLevel, deleted]);

  // Back in the foreground, and every minute while open: pick up changes made on other devices.
  // Leaving the app uploads right away, since the phone may suspend it before the debounce fires.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncRef.current({ pull: true });
      else if (state === 'background') void syncRef.current({ pull: false });
    });
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') void syncRef.current({ pull: true });
    }, POLL_MS);
    return () => {
      sub.remove();
      clearInterval(poll);
    };
  }, []);

  const wipeLocal = () => {
    epoch.current++;
    clearCoachCache();
    clearVisitCoach();
    getStore().habits.forEach((h) => Object.values(h.proofs).forEach(deleteProof));
    setStore(EMPTY_STORE);
    meta.current = null;
    setAccountEmail(null);
    AsyncStorage.removeItem(META_KEY).catch(() => {});
  };

  /**
   * Runs a sign-in, then marks the account's data to replace this phone's. Signing back in to the
   * account this phone already holds (after a lost session) keeps local changes and just syncs.
   */
  const adopt = async (signInStep: (db: SupabaseClient) => Promise<User | null>) => {
    if (!db) fail({ message: 'Accounts aren’t set up in this build.' });
    switching.current = true;
    epoch.current++;
    try {
      const signedIn = await signInStep(db);
      if (!signedIn) fail({});
      userRef.current = toCloudUser(signedIn);
      setUser(userRef.current);
      const same = meta.current?.userId === signedIn.id;
      saveMeta(
        same && meta.current ? { ...meta.current, replace: false } : freshMeta(signedIn.id, true)
      );
    } finally {
      switching.current = false;
    }
    await syncRef.current({ pull: true });
  };

  const value: CloudContextValue = {
    configured: cloudConfigured,
    user,
    status: !db ? 'off' : !user ? 'signed-out' : status,
    lastSynced,
    signedOutEmail: user ? null : accountEmail,
    pending,
    syncError,
    syncNow: () => {
      retry.current.attempt = 0;
      void syncRef.current({ pull: true });
    },

    createAccount: async (rawEmail, password) => {
      if (!db) fail({ message: 'Accounts aren’t set up in this build.' });
      const email = normalizeEmail(rawEmail);
      if (!userRef.current) {
        // No session yet (during onboarding): a brand-new account.
        const { data, error } = await db.auth.signUp({ email, password });
        if (error) fail(error);
        // Supabase hides "already registered" behind a user with no identities.
        if (data.user && data.user.identities?.length === 0) fail({ code: 'user_already_exists' });
        return data.session ? 'done' : 'verify-signup';
      }
      // Anonymous user: attach the email (and then the password) to the same user and data.
      const { data, error } = await db.auth.updateUser({ email });
      if (error) fail(error);
      if (data.user.email !== email) return 'verify-email-change';
      const { error: pwError } = await db.auth.updateUser({ password });
      if (pwError) fail(pwError);
      return 'done';
    },

    confirmEmail: async (kind, rawEmail, code, password) => {
      if (!db) fail({});
      const email = normalizeEmail(rawEmail);
      const type = kind === 'verify-signup' ? 'signup' : 'email_change';
      const { error } = await db.auth.verifyOtp({ email, token: code.trim(), type });
      if (error) fail(error);
      if (kind === 'verify-email-change') {
        const { error: pwError } = await db.auth.updateUser({ password });
        if (pwError) fail(pwError);
      }
    },

    signIn: (rawEmail, password) =>
      adopt(async (client) => {
        const { data, error } = await client.auth.signInWithPassword({
          email: normalizeEmail(rawEmail),
          password,
        });
        if (error) fail(error);
        return data.user;
      }),

    sendPasswordReset: async (rawEmail) => {
      if (!db) fail({});
      const { error } = await db.auth.resetPasswordForEmail(normalizeEmail(rawEmail));
      if (error) fail(error);
    },

    resetPassword: (rawEmail, code, password) =>
      adopt(async (client) => {
        const { data, error } = await client.auth.verifyOtp({
          email: normalizeEmail(rawEmail),
          token: code.trim(),
          type: 'recovery',
        });
        if (error) fail(error);
        const { error: pwError } = await client.auth.updateUser({ password });
        if (pwError) fail(pwError);
        return data.user;
      }),

    flush: async () => {
      // Let a sync that's already running finish, then upload anything newer.
      while (inflight.current) await inflight.current;
      await syncRef.current({ pull: false });
      const m = meta.current;
      return (
        !!m &&
        m.userId === userRef.current?.id &&
        !m.replace &&
        !hasChanges(diff(getStore(), m.snapshot))
      );
    },

    signOut: async () => {
      wipeLocal();
      // Local scope clears this phone's session even when offline.
      await db?.auth.signOut({ scope: 'local' }).catch(() => {});
    },

    deleteEverything: async () => {
      if (db && userRef.current) {
        try {
          await deleteRemoteAccount(db);
        } catch (error) {
          fail(error);
        }
        await db.auth.signOut({ scope: 'local' }).catch(() => {});
      }
      wipeLocal();
    },
  };

  return <CloudContext value={value}>{children}</CloudContext>;
}

export function useCloud() {
  const ctx = use(CloudContext);
  if (!ctx) throw new Error('useCloud must be used inside <CloudProvider>');
  return ctx;
}
