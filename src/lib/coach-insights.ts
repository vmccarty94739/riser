import { quoteHabits, specificTip, tipFor } from '@/lib/coach-rules';
import { addDays, parseDay, tierFor, type Challenge, type Habit } from '@/lib/habits';

/**
 * The coach's insights: patterns found in the user's own check-ins (a strong habit next to a
 * slipping one, a weekday that keeps going wrong, a habit that lifts the others, a trophy or
 * record within reach…), each said with real numbers and a concrete tip for that habit.
 *
 * Every candidate gets a score for how worth saying it is right now. `pickInsight` takes the best
 * one the user hasn't seen recently, so each visit to the app brings a different piece of
 * coaching. Pure: no React, storage or clock (the caller passes `today`).
 */

export type InsightKind =
  | 'pair'
  | 'weekday'
  | 'trophy'
  | 'record'
  | 'goal'
  | 'stretch'
  | 'keystone'
  | 'trend-up'
  | 'trend-down'
  | 'comeback'
  | 'new'
  | 'perfect-close'
  | 'best-day'
  | 'milestone'
  | 'celebrate';

export type Insight = {
  /** Stable identity (kind + habits), so the same observation isn't repeated visit after visit. */
  id: string;
  kind: InsightKind;
  score: number;
  /** Habit ids the advice is about (a notification skips it once they're all done today). */
  about: string[];
  title: string;
  body: string;
  tip: string;
  /** The same insight as one friendly line, for a notification ("I noticed…"). */
  push: string;
  /** Facts the phone's AI may reword; any number it writes must come from here. */
  facts: string;
};

const LONG_DAY = [
  'Sundays',
  'Mondays',
  'Tuesdays',
  'Wednesdays',
  'Thursdays',
  'Fridays',
  'Saturdays',
];
const SHORT_DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MILESTONES = [25, 50, 100, 250, 500, 1000, 2000];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);
/** A stable pick from a few phrasings, so wording varies between habits and days. */
function variant<T>(list: T[], key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) | 0;
  return list[Math.abs(h) % list.length];
}

type Rate = { done: number; of: number };
const pct = (r: Rate) => (r.of ? Math.round((r.done / r.of) * 100) : 0);
const ratio = (r: Rate) => (r.of ? r.done / r.of : 0);

type Stats = {
  habit: Habit;
  name: string;
  quit: boolean;
  unit: string;
  tracked: (day: string) => boolean;
  done: (day: string) => boolean;
  count: (day: string) => number;
  /** The last 14 complete days (today is still in progress). */
  recent: Rate;
  week: Rate;
  prevWeek: Rate;
  streak: number;
  best: number;
  /** Misses and tracked days per weekday over the last 28 complete days. */
  missed: number[];
  seen: number[];
  total: number;
  /** Complete days logged before yesterday (for milestones). */
  totalBefore: number;
};

function statsFor(habit: Habit, today: string): Stats {
  const count = (day: string) => habit.log[day] ?? 0;
  const tracked = (day: string) => day >= habit.createdAt && day <= today;
  const done = (day: string) => count(day) >= habit.target;
  const rate = (from: number, to: number): Rate => {
    let d = 0;
    let of = 0;
    for (let i = from; i <= to; i++) {
      const day = addDays(today, -i);
      if (!tracked(day)) continue;
      of++;
      if (done(day)) d++;
    }
    return { done: d, of };
  };

  let streak = 0;
  for (let day = done(today) ? today : addDays(today, -1); tracked(day) && done(day);) {
    streak++;
    day = addDays(day, -1);
  }
  let best = 0;
  let run = 0;
  for (let i = 120; i >= 0; i--) {
    const day = addDays(today, -i);
    run = tracked(day) && done(day) ? run + 1 : 0;
    best = Math.max(best, run);
  }

  const missed = [0, 0, 0, 0, 0, 0, 0];
  const seen = [0, 0, 0, 0, 0, 0, 0];
  for (let i = 1; i <= 28; i++) {
    const day = addDays(today, -i);
    if (!tracked(day)) continue;
    const w = parseDay(day).getDay();
    seen[w]++;
    if (!done(day)) missed[w]++;
  }

  const days = Object.keys(habit.log).filter((d) => d <= today && done(d));
  const yesterday = addDays(today, -1);
  return {
    habit,
    name: habit.name,
    quit: habit.kind === 'quit',
    unit: habit.kind === 'quit' ? 'clean days' : 'days',
    tracked,
    done,
    count,
    recent: rate(1, 14),
    week: rate(1, 7),
    prevWeek: rate(8, 14),
    streak,
    best,
    missed,
    seen,
    total: days.length,
    totalBefore: days.filter((d) => d < yesterday).length,
  };
}

/** "crushing “No smoking”" reads fine, "crushing “Smoking”" doesn't. */
const namedAsGoal = (s: Stats) =>
  !s.quit || /^(no|quit|stop|don|avoid|less|cut|zero|limit)\b/i.test(s.name);
const winning = (s: Stats) =>
  namedAsGoal(s) ? `crushing ${s.name}` : `staying clean from ${s.name}`;

const established = (s: Stats) => s.recent.of >= 5;
const strong = (s: Stats) => established(s) && (ratio(s.recent) >= 0.8 || s.streak >= 5);
const weak = (s: Stats) => s.recent.of >= 4 && ratio(s.recent) <= 0.6;

/**
 * Everything worth saying about the user's habits on `today`, best first. `name` personalises the
 * notification line.
 */
export function insightsFor(
  habits: Habit[],
  challenges: Challenge[],
  today: string,
  name = ''
): Insight[] {
  if (!habits.length) return [];
  const all = habits.map((h) => statsFor(h, today));
  const weekday = parseDay(today).getDay();
  // "Vaden, you're…" with a name, "You're…" without.
  const address = (line: string) =>
    name ? `${name}, ${line}` : line.charAt(0).toUpperCase() + line.slice(1);
  const out: Insight[] = [];
  const add = (i: Omit<Insight, 'facts'> & { facts?: string[] }) =>
    out.push({ ...i, facts: (i.facts ?? []).join('\n') });

  // Crushing one habit, another slipping: use the strong one to pull the weak one along. One
  // pairing per slipping habit (its strongest partner), so visits don't repeat the same advice.
  for (const w of all.filter(weak)) {
    const s = all
      .filter((x) => x !== w && strong(x))
      // A good habit makes the better partner: "do it right after X" only works with those.
      .sort(
        (a, b) =>
          Number(a.quit) - Number(b.quit) ||
          ratio(b.recent) - ratio(a.recent) ||
          b.streak - a.streak
      )[0];
    if (!s) continue;
    const stack = !s.quit && !w.quit;
    const own = specificTip(w.habit);
    const cue = `Do ${w.name} right after ${s.name}, so the habit you never miss becomes its cue.`;
    const tip = stack ? (own ? `${cue} ${own}` : cue) : tipFor(w.habit);
    const quick = stack ? cue : tipFor(w.habit);
    const run = s.streak >= 3 ? `, including a ${s.streak}-day streak` : '';
    add({
      id: `pair:${s.habit.id}:${w.habit.id}`,
      kind: 'pair',
      about: [w.habit.id],
      score: 70 + (ratio(s.recent) - ratio(w.recent)) * 25,
      title: namedAsGoal(s)
        ? variant(
            [`You’re crushing ${s.name}`, `${s.name} is on fire 🔥`, `${s.name} is locked in`],
            s.habit.id + w.habit.id
          )
        : `You’re staying clean from ${s.name}`,
      body: `${s.name} is at ${s.recent.done} of the last ${s.recent.of} ${s.unit}${run}. ${w.name} is at ${w.recent.done} of ${w.recent.of}. You clearly know how to stick with something, so let’s give ${w.name} the same energy.`,
      tip,
      push: `${name ? `Hey ${name}, ` : ''}I noticed you’ve been ${winning(s)} lately (${s.recent.done} of ${s.recent.of} ${s.unit}), but have you considered giving ${w.name} the same energy? Here’s a quick and easy way: ${lowerFirst(quick)}`,
      facts: [
        `${s.name}: ${s.recent.done} of ${s.recent.of} ${s.unit} (${pct(s.recent)}%), streak ${s.streak}`,
        `${w.name}: ${w.recent.done} of ${w.recent.of} ${w.unit} (${pct(w.recent)}%)`,
      ],
    });
  }

  for (const s of all) {
    const tip = tipFor(s.habit);

    // A weekday that keeps going wrong, and today is that day.
    const m = s.missed[weekday];
    const n = s.seen[weekday];
    if (n >= 3 && m >= 2 && m / n >= 0.6) {
      add({
        id: `weekday:${s.habit.id}:${weekday}`,
        kind: 'weekday',
        about: [s.habit.id],
        score: 76,
        title: `${LONG_DAY[weekday]} are tricky for ${s.name}`,
        body: `You’ve missed ${s.name} on ${m} of the last ${n} ${LONG_DAY[weekday]}, and today is one of them. Knowing that is half the battle: decide now when you’ll do it.`,
        tip,
        push: `${name ? `Heads up ${name}: ` : 'Heads up: '}${LONG_DAY[weekday]} are when ${s.name} usually slips (missed ${m} of the last ${n}). Quick fix: ${lowerFirst(tip)}`,
        facts: [`${s.name}: missed ${m} of the last ${n} ${LONG_DAY[weekday]}`],
      });
    }

    // Close to its best streak.
    if (s.streak >= 3 && s.best - s.streak <= 2) {
      const gap = s.best - s.streak;
      add({
        id: `record:${s.habit.id}:${s.best}`,
        kind: 'record',
        about: [s.habit.id],
        score: gap === 0 ? 64 : 72,
        title:
          gap === 0
            ? `${s.streak} days: your best run yet`
            : `${plural(gap + 1, 'day')} from a new record`,
        body:
          gap === 0
            ? `${s.name} is on its longest streak so far at ${s.streak} days. Every day now is a personal best.`
            : `${s.name} is at ${s.streak} days in a row. Your record is ${s.best}, so ${plural(gap + 1, 'more day')} sets a new one.`,
        tip,
        push:
          gap === 0
            ? address(
                `${s.name} is on its best run ever: ${s.streak} days. Keep it going today. ${tip}`
              )
            : address(
                `${s.name} is ${plural(gap + 1, 'day')} from beating your record of ${s.best}. Today counts. ${tip}`
              ),
        facts: [`${s.name}: current streak ${s.streak}, best ${s.best}`],
      });
    }

    // A multi-check-in goal that stalls partway: suggest a smaller one.
    if (s.habit.target > 1 && s.week.of >= 4) {
      let sum = 0;
      let partial = 0;
      for (let i = 1; i <= 7; i++) {
        const day = addDays(today, -i);
        if (!s.tracked(day)) continue;
        const c = s.count(day);
        sum += Math.min(c, s.habit.target);
        if (c > 0 && c < s.habit.target) partial++;
      }
      const avg = Math.round(sum / s.week.of);
      if (partial >= 2 && avg < s.habit.target) {
        const goal = Math.max(1, avg + 1);
        add({
          id: `goal:${s.habit.id}`,
          kind: 'goal',
          about: [s.habit.id],
          score: 66,
          title: `Make ${s.name} easier to win`,
          body: `You usually get ${avg} of ${s.habit.target} on ${s.name}, and ${plural(partial, 'day')} this week stopped partway. That’s real effort that never counts as a win.`,
          tip: `Try a goal of ${goal} for a week. Hitting it every day builds more momentum than missing ${s.habit.target}, and you can raise it again after.`,
          push: address(
            `you’re putting in the work on ${s.name} (about ${avg} of ${s.habit.target} a day). Have you considered a goal of ${goal} for a week? Full wins build momentum faster.`
          ),
          facts: [
            `${s.name}: goal ${s.habit.target}, usual ${avg}, partly done ${partial} days this week`,
          ],
        });
      }
    }

    // Always met, for two weeks: time to stretch it.
    if (!s.quit && s.recent.of >= 14 && s.recent.done === s.recent.of) {
      add({
        id: `stretch:${s.habit.id}`,
        kind: 'stretch',
        about: [s.habit.id],
        score: 48,
        title: `${s.name} looks easy now`,
        body: `${s.recent.done} of ${s.recent.of} days without a miss. That’s the sign a habit has stuck.`,
        tip:
          s.habit.target > 1
            ? `Ready for more? Try raising the goal from ${s.habit.target} to ${s.habit.target + 1}.`
            : `Ready for more? Make it a little harder, or add a new habit alongside it while you’re strong.`,
        push: address(
          `${s.recent.done} of ${s.recent.of} days on ${s.name} without a miss. Have you considered leveling it up? A small stretch keeps it interesting.`
        ),
        facts: [`${s.name}: ${s.recent.done} of ${s.recent.of} days`],
      });
    }

    // Big week-over-week change.
    if (s.week.of >= 5 && s.prevWeek.of >= 5) {
      const diff = pct(s.week) - pct(s.prevWeek);
      if (diff >= 30)
        add({
          id: `trend-up:${s.habit.id}`,
          kind: 'trend-up',
          about: [s.habit.id],
          score: 58,
          title: `${s.name} is climbing`,
          body: `${s.week.done} of ${s.week.of} ${s.unit} this past week, up from ${s.prevWeek.done} of ${s.prevWeek.of} the week before. Whatever you changed, it’s working.`,
          tip: `Notice what made this week different and keep doing exactly that. ${tip}`,
          push: address(
            `${s.name} jumped from ${s.prevWeek.done} to ${s.week.done} ${s.unit} this week. Whatever you changed, keep it up!`
          ),
          facts: [
            `${s.name}: ${s.week.done} of ${s.week.of} this week, ${s.prevWeek.done} of ${s.prevWeek.of} the week before`,
          ],
        });
      if (diff <= -30)
        add({
          id: `trend-down:${s.habit.id}`,
          kind: 'trend-down',
          about: [s.habit.id],
          score: 69,
          title: `${s.name} has dipped this week`,
          body: `${s.week.done} of ${s.week.of} ${s.unit} this past week, down from ${s.prevWeek.done} of ${s.prevWeek.of}. A dip is normal. Catching it early is what keeps it from sticking.`,
          tip,
          push: `${name ? `Hey ${name}, ` : ''}${s.name} slipped to ${s.week.done} of ${s.week.of} this week (from ${s.prevWeek.done}). One small win today turns it around: ${lowerFirst(tip)}`,
          facts: [
            `${s.name}: ${s.week.done} of ${s.week.of} this week, ${s.prevWeek.done} of ${s.prevWeek.of} the week before`,
          ],
        });
    }

    // Quit habit: a slip after a good run.
    if (s.quit && s.best >= 3 && s.streak === 0 && s.recent.of >= 4) {
      add({
        id: `comeback:${s.habit.id}`,
        kind: 'comeback',
        about: [s.habit.id],
        score: 67,
        title: `Back on track with ${s.name}`,
        body: `You’ve had a ${s.best}-day clean run before, and you’re at ${s.recent.done} of ${s.recent.of} clean days lately. One slip doesn’t erase that. Today is a clean slate.`,
        tip,
        push: address(
          `one slip doesn’t undo your ${s.best}-day clean run on ${s.name}. Today’s a fresh start: ${lowerFirst(tip)}`
        ),
        facts: [
          `${s.name}: best clean run ${s.best}, ${s.recent.done} of ${s.recent.of} clean days`,
        ],
      });
    }

    // Brand new habit.
    const age = Math.round(
      (parseDay(today).getTime() - parseDay(s.habit.createdAt).getTime()) / 86_400_000
    );
    if (age <= 3) {
      add({
        id: `new:${s.habit.id}`,
        kind: 'new',
        about: [s.habit.id],
        score: 52,
        title: `Getting ${s.name} off the ground`,
        body: `${s.name} is new, and the first week decides whether a habit sticks. Make it so easy you can’t say no.`,
        tip,
        push: address(
          `the first days of ${s.name} matter most. Quick and easy way to lock it in: ${lowerFirst(tip)}`
        ),
        facts: [],
      });
    }

    // A round number of check-ins reached in the last day or two.
    const hit = MILESTONES.find((m) => s.totalBefore < m && s.total >= m);
    if (hit)
      add({
        id: `milestone:${s.habit.id}:${hit}`,
        kind: 'milestone',
        about: [s.habit.id],
        score: 62,
        title: `${hit} ${s.unit} of ${s.name} 🎉`,
        body: `You just passed ${hit} ${s.unit} logged for ${s.name}. That’s not luck, that’s who you are now.`,
        tip,
        push: address(
          `you just passed ${hit} ${s.unit} of ${s.name}! That’s a habit, not a streak of luck. 🎉`
        ),
        facts: [`${s.name}: ${s.total} ${s.unit} logged`],
      });
  }

  // One habit that lifts another: on days A is done, B gets done far more often.
  const builds = all.filter((s) => !s.quit);
  for (const a of builds) {
    for (const b of builds) {
      if (a === b) continue;
      let withA = 0;
      let withADone = 0;
      let without = 0;
      let withoutDone = 0;
      for (let i = 1; i <= 28; i++) {
        const day = addDays(today, -i);
        if (!a.tracked(day) || !b.tracked(day)) continue;
        if (a.done(day)) {
          withA++;
          if (b.done(day)) withADone++;
        } else {
          without++;
          if (b.done(day)) withoutDone++;
        }
      }
      if (withA < 4 || without < 3) continue;
      const pw = Math.round((withADone / withA) * 100);
      const po = Math.round((withoutDone / without) * 100);
      if (pw - po < 35) continue;
      add({
        id: `keystone:${a.habit.id}:${b.habit.id}`,
        kind: 'keystone',
        about: [a.habit.id, b.habit.id],
        score: 60 + (pw - po) / 5,
        title: `${a.name} sets up your day`,
        body: `On days you do ${a.name}, you also get ${b.name} done ${pw}% of the time. When you skip it, that drops to ${po}%. ${a.name} looks like a keystone habit.`,
        tip: `Protect ${a.name} first thing, and let ${b.name} ride on it.`,
        push: address(
          `something I noticed: when you do ${a.name}, ${b.name} gets done ${pw}% of the time vs ${po}% when you don’t. Get ${a.name} in early today and the rest follows.`
        ),
        facts: [`${b.name} done on ${pw}% of days with ${a.name}, ${po}% without`],
      });
    }
  }

  // A challenge close to its trophy.
  for (const c of challenges) {
    if (c.completedAt || c.dismissed) continue;
    const s = all.find((x) => x.habit.id === c.habitId);
    if (!s) continue;
    const day =
      Math.round((parseDay(today).getTime() - parseDay(c.startDate).getTime()) / 86_400_000) + 1;
    if (day < 1 || day > c.length) continue;
    // Still alive: no missed day between the start and yesterday.
    let alive = true;
    for (let d = c.startDate; d < today; d = addDays(d, 1)) if (!s.done(d)) alive = false;
    if (!alive) continue;
    const left = c.length - day + (s.done(today) ? 0 : 1);
    if (left < 1 || left > 3) continue;
    const tier = tierFor(c.length);
    add({
      id: `trophy:${c.id}:${left}`,
      kind: 'trophy',
      about: [s.habit.id],
      score: 80 - left,
      title: `${plural(left, 'day')} from ${tier.name} ${tier.icon}`,
      body:
        left === 1
          ? `Day ${day} of ${c.length} on ${s.name}. Finish today and the trophy is yours.`
          : `Day ${day} of ${c.length} on ${s.name}. ${plural(left, 'more day')} and ${tier.name} is yours.`,
      tip: tipFor(s.habit),
      push: address(
        `you’re ${plural(left, 'day')} from the ${tier.name} trophy ${tier.icon} for ${s.name}. Don’t let it slip now!`
      ),
      facts: [`${s.name}: challenge day ${day} of ${c.length}, ${left} left`],
    });
  }

  // Everything done today except one.
  const active = all.filter((s) => s.tracked(today));
  const open = active.filter((s) => !s.done(today));
  if (active.length >= 3 && open.length === 1) {
    const s = open[0];
    add({
      id: `perfect-close:${today}:${s.habit.id}`,
      kind: 'perfect-close',
      about: [s.habit.id],
      score: 85,
      title: 'One away from a perfect day ✨',
      body: `Everything else is done today. Just ${s.name} stands between you and a perfect day.`,
      tip: tipFor(s.habit),
      push: address(`just ${s.name} left for a perfect day ✨`),
      facts: [],
    });
  }

  // The user's strongest and weakest weekday overall.
  const byDay = [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const seen = all.reduce((n, s) => n + s.seen[w], 0);
    const missed = all.reduce((n, s) => n + s.missed[w], 0);
    return { w, seen, rate: seen ? Math.round(((seen - missed) / seen) * 100) : 0 };
  });
  const measured = byDay.filter((d) => d.seen >= 6);
  if (measured.length >= 5) {
    const best = [...measured].sort((a, b) => b.rate - a.rate)[0];
    const worst = [...measured].sort((a, b) => a.rate - b.rate)[0];
    if (best.rate - worst.rate >= 30)
      add({
        id: `best-day:${best.w}:${worst.w}`,
        kind: 'best-day',
        about: [],
        score: 45,
        title: `${LONG_DAY[best.w]} are your power days`,
        body: `You finish ${best.rate}% of your habits on ${LONG_DAY[best.w]}, but only ${worst.rate}% on ${LONG_DAY[worst.w]}.`,
        tip: `Plan ${SHORT_DAY[worst.w]} the night before: pick the time for each habit so the day can’t get away from you.`,
        push: address(
          `you hit ${best.rate}% of your habits on ${LONG_DAY[best.w]} but ${worst.rate}% on ${LONG_DAY[worst.w]}. Have you tried planning ${LONG_DAY[worst.w].slice(0, -1)} the night before?`
        ),
        facts: [`${LONG_DAY[best.w]}: ${best.rate}%, ${LONG_DAY[worst.w]}: ${worst.rate}%`],
      });
  }

  // Always something to say: celebrate the steadiest habit.
  const top = [...all].filter(established).sort((a, b) => ratio(b.recent) - ratio(a.recent))[0];
  const first = top ?? all[0];
  add({
    id: `celebrate:${first.habit.id}`,
    kind: 'celebrate',
    about: [first.habit.id],
    score: 10,
    title: top
      ? namedAsGoal(first)
        ? `${first.name} is your anchor`
        : `Staying strong against ${first.name}`
      : 'Every day counts',
    body: top
      ? `${first.name} is at ${first.recent.done} of the last ${first.recent.of} ${first.unit}. Steady beats perfect.`
      : 'You’re just getting started. The first few days are when habits are easiest to drop, so aim for every one today.',
    tip: tipFor(first.habit),
    push: `${name ? `Hey ${name}! ` : ''}${tipFor(first.habit)}`,
    facts: top ? [`${first.name}: ${first.recent.done} of ${first.recent.of} ${first.unit}`] : [],
  });

  const names = habits.map((h) => h.name);
  return out
    .map((i) => {
      const q = quoteHabits({ title: i.title, body: i.body, tip: i.tip, highlights: [] }, names);
      const push = quoteHabits({ title: i.push, body: '', tip: null, highlights: [] }, names).title;
      return { ...i, title: q.title, body: q.body, tip: q.tip, push };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * The best insight not in `recent` (ids shown lately, newest first). `seed` nudges the order a
 * little so near-equal insights take turns. When everything was shown lately, the one shown
 * longest ago comes back.
 */
export function pickInsight(insights: Insight[], recent: string[], seed = 0): Insight | null {
  if (!insights.length) return null;
  const jitter = (id: string) => {
    let h = seed;
    for (const c of id) h = (h * 33 + c.charCodeAt(0)) | 0;
    return Math.abs(h) % 12;
  };
  // Don't talk about the same habit two visits in a row when there's anything else to say.
  const last = (recent[0] ?? '').split(':');
  const value = (i: Insight) =>
    i.score + jitter(i.id) - (i.about.some((id) => last.includes(id)) ? 25 : 0);
  const fresh = insights.filter((i) => !recent.includes(i.id));
  if (fresh.length) return [...fresh].sort((a, b) => value(b) - value(a))[0];
  return [...insights].sort((a, b) => recent.indexOf(b.id) - recent.indexOf(a.id))[0];
}
