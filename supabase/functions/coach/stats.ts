/**
 * Turns a user's raw rows into the facts the coach talks about: per-habit completion, streaks,
 * day-by-day grids and trends. Pure (no Deno or network APIs) so it can be unit-tested with Node.
 * Days are the app's local `YYYY-MM-DD` strings; all arithmetic is done in UTC to avoid DST drift.
 */

export type Kind = 'daily' | 'weekly' | 'monthly';

export type HabitRow = {
  id: string;
  name: string;
  emoji: string;
  kind: 'build' | 'quit';
  target: number;
  created_on: string;
};
export type CheckinRow = { habit_id: string; day: string; count: number };
export type ChallengeRow = {
  habit_id: string;
  habit_name: string;
  custom: boolean;
  title: string | null;
  length: number;
  start_date: string;
  completed_at: string | null;
  dismissed: boolean;
};

const DAY_MS = 86_400_000;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** Custom-drawn app icons, as text. */
const ICON_TEXT: Record<string, string> = { 'custom:vape': '💨' };

export const isDay = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
const ms = (day: string) => Date.parse(`${day}T00:00:00Z`);
export const addDays = (day: string, n: number) =>
  new Date(ms(day) + n * DAY_MS).toISOString().slice(0, 10);
const weekday = (day: string) => WEEKDAYS[new Date(ms(day)).getUTCDay()];
const pretty = (day: string) => {
  const d = new Date(ms(day));
  return `${WEEKDAYS[d.getUTCDay()]} ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};
const pct = (done: number, of: number) => (of ? `${Math.round((done / of) * 100)}%` : 'n/a');
const icon = (emoji: string) => ICON_TEXT[emoji] ?? emoji;

/** The period a message belongs to: the day, the week's Monday, or the 1st of the month. */
export function periodStart(kind: Kind, today: string) {
  if (kind === 'daily') return today;
  if (kind === 'monthly') return `${today.slice(0, 8)}01`;
  const dow = new Date(ms(today)).getUTCDay(); // 0 = Sunday
  return addDays(today, -((dow + 6) % 7));
}

/**
 * The days a message is about. Reflections cover complete days only (ending yesterday) so a
 * half-finished today doesn't read as a slump; the daily nudge also looks at today.
 */
export function coverage(kind: Kind, today: string) {
  if (kind === 'daily') return { start: addDays(today, -13), end: today };
  const days = kind === 'weekly' ? 7 : 30;
  return { start: addDays(today, -days), end: addDays(today, -1) };
}

const daysFrom = (start: string, end: string) => {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
};

type HabitFacts = {
  habit: HabitRow;
  counts: Map<string, number>;
  isDone: (day: string) => boolean;
  tracked: (day: string) => boolean;
};

function factsFor(habit: HabitRow, checkins: CheckinRow[]): HabitFacts {
  const counts = new Map<string, number>();
  for (const c of checkins) if (c.habit_id === habit.id && c.count > 0) counts.set(c.day, c.count);
  return {
    habit,
    counts,
    isDone: (day) => (counts.get(day) ?? 0) >= habit.target,
    tracked: (day) => day >= habit.created_on,
  };
}

/** Consecutive done days ending today (if done) or yesterday. */
function currentStreak(f: HabitFacts, today: string) {
  let day = f.isDone(today) ? today : addDays(today, -1);
  let n = 0;
  while (f.tracked(day) && f.isDone(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

function bestStreak(f: HabitFacts, start: string, end: string) {
  let best = 0;
  let run = 0;
  for (const day of daysFrom(start, end)) {
    run = f.tracked(day) && f.isDone(day) ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

function rate(f: HabitFacts, days: string[]) {
  const tracked = days.filter(f.tracked);
  const done = tracked.filter(f.isDone).length;
  return { done, tracked: tracked.length, text: `${done}/${tracked.length} (${pct(done, tracked.length)})` };
}

/** ✓ done · ◐ partly done · ✗ missed · – not tracked yet. */
function symbol(f: HabitFacts, day: string) {
  if (!f.tracked(day)) return '–';
  if (f.isDone(day)) return '✓';
  return (f.counts.get(day) ?? 0) > 0 ? '◐' : '✗';
}

function grid(f: HabitFacts, days: string[]) {
  return days.map((d) => `${weekday(d)} ${symbol(f, d)}`).join('  ');
}

/** Weekdays this habit was missed most often, when there's a clear pattern. */
function weakDays(f: HabitFacts, days: string[]) {
  const misses = new Map<string, number>();
  const seen = new Map<string, number>();
  for (const d of days.filter(f.tracked)) {
    const w = weekday(d);
    seen.set(w, (seen.get(w) ?? 0) + 1);
    if (!f.isDone(d)) misses.set(w, (misses.get(w) ?? 0) + 1);
  }
  return [...misses.entries()]
    .filter(([w, n]) => n >= 2 && n / (seen.get(w) ?? 1) >= 0.75)
    .map(([w]) => w);
}

/** Days where every tracked habit was done (good ones done, bad ones logged clean). */
function perfectDays(all: HabitFacts[], days: string[]) {
  return days.filter((d) => {
    const active = all.filter((f) => f.tracked(d));
    return active.length > 0 && active.every((f) => f.isDone(d));
  });
}

function perfectStreak(all: HabitFacts[], today: string) {
  let day = perfectDays(all, [today]).length ? today : addDays(today, -1);
  let n = 0;
  while (perfectDays(all, [day]).length) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

/**
 * A plain-text digest of the user's data for one message: the only facts the coach may use.
 * `history` checkins should reach back far enough for streaks (the caller fetches ~120 days).
 */
export function buildDigest(input: {
  kind: Kind;
  today: string;
  habits: HabitRow[];
  checkins: CheckinRow[];
  challenges: ChallengeRow[];
}) {
  const { kind, today, habits, checkins, challenges } = input;
  const range = coverage(kind, today);
  const days = daysFrom(range.start, range.end);
  const span = days.length;
  const previous = daysFrom(addDays(range.start, -span), addDays(range.start, -1));
  const historyStart = addDays(today, -120);
  const facts = habits.map((h) => factsFor(h, checkins));

  const lines: string[] = [];
  lines.push(`Today is ${pretty(today)}, ${today.slice(0, 4)}.`);
  lines.push(
    kind === 'daily'
      ? `Window: the last 14 days (${pretty(range.start)} – today). Today is still in progress.`
      : `Period: the last ${span} full days (${pretty(range.start)} – ${pretty(range.end)}). The ${span} days before that are given for comparison.`
  );
  lines.push('Key: ✓ done · ◐ partly done (multi-check-in habit) · ✗ missed · – not tracked yet.');
  lines.push('');

  for (const f of facts) {
    const h = f.habit;
    const kindText =
      h.kind === 'quit'
        ? 'BAD habit the user is quitting (✓ = a clean day, avoided it)'
        : h.target > 1
          ? `good habit, goal ${h.target} times a day`
          : 'good habit, once a day';
    lines.push(`${icon(h.emoji)} ${h.name} — ${kindText}; tracked since ${pretty(h.created_on)}.`);

    if (kind === 'monthly') {
      // Four weekly buckets read better than a 30-cell grid.
      const buckets: string[] = [];
      for (let i = 0; i < span; i += 7) {
        const week = days.slice(i, i + 7);
        buckets.push(`${pretty(week[0])}–: ${rate(f, week).text}`);
      }
      lines.push(`  By week: ${buckets.join(' | ')}`);
    } else {
      lines.push(`  ${grid(f, days)}`);
    }

    const now = rate(f, days);
    const before = rate(f, previous);
    lines.push(
      `  Done ${now.text} of tracked days${
        kind === 'daily' ? '' : `; previous ${span} days: ${before.tracked ? before.text : 'not tracked yet'}`
      }.`
    );
    lines.push(
      `  Current streak: ${currentStreak(f, today)} day(s). Best streak (last 120 days): ${bestStreak(f, historyStart, today)}.`
    );
    if (kind === 'daily') {
      const count = f.counts.get(today) ?? 0;
      lines.push(
        `  Today so far: ${
          f.isDone(today) ? 'done' : h.target > 1 ? `${count}/${h.target}` : 'not yet'
        }.`
      );
    }
    const weak = weakDays(f, kind === 'daily' ? days.slice(0, -1) : days);
    if (weak.length) lines.push(`  Usually missed on: ${weak.join(', ')}.`);
    lines.push('');
  }

  const perfect = perfectDays(facts, kind === 'daily' ? days.slice(0, -1) : days).length;
  lines.push(
    `Perfect days (every habit done) in this window: ${perfect}. Current perfect-day streak: ${perfectStreak(facts, today)}.`
  );

  const running = challenges.filter((c) => !c.completed_at && !c.dismissed && c.start_date <= today);
  for (const c of running) {
    const dayN = Math.floor((ms(today) - ms(c.start_date)) / DAY_MS) + 1;
    if (dayN > c.length) continue;
    lines.push(
      `Active challenge: ${c.custom && c.title ? `"${c.title}" — ` : ''}${c.habit_name}, day ${dayN} of ${c.length}.`
    );
  }
  const won = challenges.filter(
    (c) => c.completed_at && c.completed_at >= range.start && c.completed_at <= range.end
  );
  for (const c of won)
    lines.push(`Trophy earned in this window: ${c.length}-day challenge for ${c.habit_name}.`);

  return { text: lines.join('\n'), range };
}
