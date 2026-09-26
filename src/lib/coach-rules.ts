import type { Digest, HabitSummary } from '../../supabase/functions/coach/stats';

/**
 * The coach without a model: picks what matters most from the digest's facts and says it with
 * real numbers, plus a tip written for that kind of habit. Free, instant and offline, it's the
 * fallback whenever the on-device model isn't available (older phones, Expo Go) or its answer
 * doesn't pass checks, so every user always gets a coach.
 */

export type Written = {
  title: string;
  body: string;
  tip: string;
  highlights: { emoji: string; text: string }[];
};

const pct = (h: { done: number; tracked: number }) =>
  h.tracked ? Math.round((h.done / h.tracked) * 100) : 0;

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;

const LONG_DAY: Record<string, string> = {
  Sun: 'Sundays',
  Mon: 'Mondays',
  Tue: 'Tuesdays',
  Wed: 'Wednesdays',
  Thu: 'Thursdays',
  Fri: 'Fridays',
  Sat: 'Saturdays',
};

/** Concrete tips by kind of habit, recognised from its name. Quit and build lists are separate
 * ("No drinking" is about alcohol; "Drink water" isn't). */
const QUIT_TIPS: [RegExp, string][] = [
  [
    /smok|cigar|nicotine|vape|vaping/i,
    'When a craving hits, wait 10 minutes and drink some water. Most cravings fade on their own.',
  ],
  [
    /alcohol|drink|beer|wine|booze|sober/i,
    'Have a drink you enjoy that isn’t alcohol ready for the time you’d usually reach for one.',
  ],
  [
    /scroll|phone|social|screen|tiktok|instagram/i,
    'Charge your phone outside the bedroom tonight and keep a book on the nightstand instead.',
  ],
  [
    /junk|sugar|snack|soda|fast food|candy|sweets/i,
    'Put a snack you like that’s better for you within reach before your usual craving time.',
  ],
  [/gambl|bet/i, 'Delete the betting app from your home screen and log out today.'],
  [
    /porn/i,
    'Keep your phone out of the bedroom tonight. The easiest urge to beat is the one you never meet.',
  ],
  [
    /snooz|oversleep|late/i,
    'Put your alarm across the room so you have to stand up to turn it off.',
  ],
];
const BUILD_TIPS: [RegExp, string][] = [
  [
    /water|hydrat|drink/i,
    'Keep a full bottle where you can see it and finish a glass before each meal.',
  ],
  [
    /walk|steps|run|jog/i,
    'Put your shoes by the door and head out right after lunch, before the afternoon fills up.',
  ],
  [
    /read|book|pages/i,
    'Leave the book on your pillow and read before you pick up your phone tonight.',
  ],
  [
    /meditat|breath|mindful/i,
    'Do it right after brushing your teeth, so it rides on a routine you already have.',
  ],
  [
    /sleep|bed|wind down/i,
    'Set a wind-down alarm 30 minutes before bedtime and put screens away when it rings.',
  ],
  [
    /push|squat|workout|exercise|gym|stretch|yoga/i,
    'Do one set as soon as you get up, so the hardest part is done before the day starts.',
  ],
  [
    /journal|gratitude|grateful|write/i,
    'Keep the notebook open by your bed and write just one line before sleep.',
  ],
  [
    /veg|fruit|salad|protein|cook/i,
    'Prep it the night before so it’s the easiest thing to grab tomorrow.',
  ],
];

export function tipFor(h: Pick<HabitSummary, 'name' | 'kind'>, weekday?: string) {
  const match = (h.kind === 'quit' ? QUIT_TIPS : BUILD_TIPS).find(([pattern]) =>
    pattern.test(h.name)
  );
  const tip = match
    ? match[1]
    : h.kind === 'quit'
      ? `Notice when ${h.name} tends to happen and plan one thing to do instead at that moment.`
      : `Tie ${h.name} to something you already do every day, like right after your morning coffee.`;
  return weekday ? `${LONG_DAY[weekday] ?? weekday} are when ${h.name} usually slips. ${tip}` : tip;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Puts every habit name the coach mentions in quotes (“Drink water”), so it stands out from the
 * sentence around it. Matches the name as written (case-sensitive, whole words) and leaves names
 * that are already quoted alone; straight quotes become curly ones.
 */
export function quoteHabits<
  T extends { title: string; body: string; tip: string | null; highlights: Written['highlights'] },
>(message: T, names: string[]): T {
  const list = [...new Set(names.map((n) => n.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length
  );
  if (!list.length) return message;
  const alt = list.map(escape).join('|');
  const straight = new RegExp(`["'‘](${alt})["'’]`, 'g');
  const bare = new RegExp(`(^|[^\\w“"'‘])(${alt})(?=$|[^\\w”"])`, 'g');
  const quote = (text: string) => text.replace(straight, '“$1”').replace(bare, '$1“$2”');
  return {
    ...message,
    title: quote(message.title),
    body: quote(message.body),
    tip: message.tip && quote(message.tip),
    highlights: message.highlights.map((h) => ({ ...h, text: quote(h.text) })),
  };
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Today's nudge: the one thing that matters most right now. */
export function dailyByRules(digest: Digest, todayWeekday: number): Written {
  const today = WEEKDAYS[todayWeekday];
  const open = digest.habits.filter((h) => !h.doneToday);
  const established = digest.habits.filter((h) => h.tracked >= 4);
  const slipsToday = (h: HabitSummary) => (h.weak.includes(today) ? today : undefined);

  // New here: nothing to read trends from yet.
  if (!established.length) {
    const first = open[0] ?? digest.habits[0];
    return {
      title: 'Fresh start 🌱',
      body: `You’re a few days in, which is when habits are easiest to drop. Aim for every habit today, even the small version.`,
      tip: tipFor(first),
      highlights: [],
    };
  }

  // A streak worth protecting that's still open today.
  const streak = open.filter((h) => h.streak >= 3).sort((a, b) => b.streak - a.streak)[0];
  if (streak)
    return {
      title: `Protect your ${streak.streak}-day ${streak.kind === 'quit' ? 'clean run' : 'streak'}`,
      body: `${streak.name} is on a ${streak.streak}-day run${
        streak.best > streak.streak ? ` (your best is ${streak.best})` : ', your best yet'
      }. Today is still open, so don’t let it end here.`,
      tip: tipFor(streak, slipsToday(streak)),
      highlights: [],
    };

  // A multi-check-in goal that keeps falling short: suggest a smaller goal.
  const stalled = established.find((h) => h.target > 1 && pct(h) < 40);
  if (stalled) {
    const smaller = Math.max(1, Math.ceil(stalled.target * 0.6));
    return {
      title: `Make ${stalled.name} easier to win`,
      body: `You’ve hit the full goal on ${stalled.done} of the last ${days(stalled.tracked)} (${pct(stalled)}%). Hitting a smaller goal every day beats missing a big one.`,
      tip: `Try a goal of ${smaller} instead of ${stalled.target} for a week, then build back up.`,
      highlights: [],
    };
  }

  // A bad habit that slipped after a good run.
  const relapse = established.find((h) => h.kind === 'quit' && h.streak === 0 && h.best >= 3);
  if (relapse)
    return {
      title: `Back on track with ${relapse.name}`,
      body: `You had a ${relapse.best}-day clean run and you’re at ${pct(relapse)}% clean over the last ${days(relapse.tracked)}. One slip doesn’t undo that. Today is a clean slate.`,
      tip: tipFor(relapse, slipsToday(relapse)),
      highlights: [],
    };

  // The habit that's slipping most.
  const weakest = [...established].sort((a, b) => pct(a) - pct(b))[0];
  if (weakest && pct(weakest) < 60)
    return {
      title: `${weakest.name} needs some love`,
      body: `${weakest.name} is at ${pct(weakest)}% over the last ${days(weakest.tracked)}${
        weakest.weak.length ? ` and usually slips on ${weakest.weak.join(' and ')}` : ''
      }. Getting it done today turns it around.`,
      tip: tipFor(weakest, slipsToday(weakest)),
      highlights: [],
    };

  // Everything's going well.
  const top = [...established].sort((a, b) => pct(b) - pct(a))[0];
  return {
    title:
      digest.perfectStreak >= 2
        ? `${days(digest.perfectStreak)} of perfect days`
        : 'You’re on a roll',
    body: `${top.name} leads at ${pct(top)}% over the last ${days(top.tracked)}${
      digest.perfectDays ? `, and you’ve had ${days(digest.perfectDays)} with every habit done` : ''
    }. Keep the rhythm going today.`,
    tip: tipFor(open[0] ?? top),
    highlights: [],
  };
}

/** Weekly / monthly reflection from the facts. */
export function reflectionByRules(digest: Digest, period: 'week' | 'month'): Written {
  const tracked = digest.habits.filter((h) => h.tracked > 0);
  if (!tracked.length)
    return {
      title: `Your first ${period}`,
      body: 'There isn’t a full period of check-ins yet. Log your habits for a few days and your report will fill in.',
      tip: 'Check in every day this week to set your baseline.',
      highlights: [],
    };

  const byRate = [...tracked].sort((a, b) => pct(b) - pct(a));
  const best = byRate[0];
  const worst = byRate[byRate.length - 1];
  const change = (h: HabitSummary) => {
    if (!h.previous) return '';
    const diff = pct(h) - pct(h.previous);
    return diff === 0
      ? ', same as before'
      : `, ${diff > 0 ? 'up' : 'down'} ${Math.abs(diff)} points`;
  };

  const sentences = [`You were most consistent with ${best.name} (${pct(best)}%${change(best)}).`];
  if (worst !== best && pct(worst) < pct(best))
    sentences.push(
      `${worst.name} slipped to ${pct(worst)}%${worst.weak.length ? `, mostly on ${worst.weak.join(' and ')}` : ''}.`
    );
  sentences.push(
    digest.perfectDays
      ? `You had ${days(digest.perfectDays)} with every habit done.`
      : 'You didn’t have a day with every habit done yet. That’s the next milestone.'
  );

  const highlights = byRate.slice(0, 3).map((h) => ({
    emoji: h.emoji,
    text: `${h.name}: ${h.done} of ${days(h.tracked)} (${pct(h)}%)${change(h)}`,
  }));
  const trophy = digest.trophies[0];
  if (trophy)
    highlights.push({
      emoji: '🏆',
      text: `Earned the ${trophy.length}-day trophy for ${trophy.name}`,
    });

  return {
    title: `${best.name} led the ${period} at ${pct(best)}%`,
    body: sentences.join(' '),
    tip: worst !== best ? tipFor(worst, worst.weak[0]) : tipFor(best),
    highlights: highlights.slice(0, 4),
  };
}
