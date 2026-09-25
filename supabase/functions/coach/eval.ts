/**
 * Daily-nudge eval: which is the cheapest model setup whose tips are specific to a habit and
 * whose facts are right? Runs the production prompt (`generate.ts`) on realistic personas across
 * setups, checks each output automatically, prints everything for a human read, and reports cost.
 *
 * Needs ANTHROPIC_API_KEY (e.g. in the gitignored .env.local). Costs well under $0.50 per run.
 *   cd supabase/functions/coach
 *   deno run --allow-net --allow-env --allow-read --env-file=../../../.env.local eval.ts
 * Not deployed: nothing in the function imports this file.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';

import { generate, type Setup } from './generate.ts';
import { addDays, buildDigest, type CheckinRow, type HabitRow } from './stats.ts';

const SETUPS: { name: string; setup: Setup; price: [number, number] }[] = [
  { name: 'Haiku 4.5, no thinking', setup: { model: 'claude-haiku-4-5', thinking: { type: 'off' } }, price: [1, 5] },
  { name: 'Haiku 4.5, thinking 2k', setup: { model: 'claude-haiku-4-5', thinking: { type: 'budget', tokens: 2048 } }, price: [1, 5] },
  { name: 'Sonnet 5, low effort', setup: { model: 'claude-sonnet-5', thinking: { type: 'effort', level: 'low' } }, price: [2, 10] },
];

const TODAY = new Date().toISOString().slice(0, 10);
const day = (n: number) => addDays(TODAY, -n);
const h = (id: string, name: string, emoji: string, over: Partial<HabitRow> = {}): HabitRow => ({
  id,
  name,
  emoji,
  kind: 'build',
  target: 1,
  created_on: day(40),
  ...over,
});
/** Check-ins for habit `id` on days-ago `n` where `pick(n)` gives the count (0 = none). */
const log = (id: string, from: number, pick: (n: number, weekday: number) => number) => {
  const rows: CheckinRow[] = [];
  for (let n = from; n >= 0; n--) {
    const d = day(n);
    const count = pick(n, new Date(`${d}T00:00:00Z`).getUTCDay());
    if (count > 0) rows.push({ habit_id: id, day: d, count });
  }
  return rows;
};

const PERSONAS = [
  {
    name: 'Great sleep streak, water lagging',
    habits: [h('s', 'In bed by 11', '😴'), h('w', 'Drink 8 glasses of water', '💧', { target: 8 })],
    checkins: [...log('s', 30, (n) => (n === 0 ? 0 : 1)), ...log('w', 30, (n) => (n === 0 ? 2 : 3 + (n % 3)))],
  },
  {
    name: 'Walks slip on Tuesdays and Wednesdays',
    habits: [h('k', 'Go for a walk', '🚶'), h('r', 'Read 10 pages', '📚')],
    checkins: [...log('k', 30, (n, wd) => (n === 0 || wd === 2 || wd === 3 ? 0 : 1)), ...log('r', 30, (n) => (n % 5 === 0 ? 0 : 1))],
  },
  {
    name: 'Brand-new user',
    habits: [h('m', 'Meditate 5 minutes', '🧘', { created_on: day(1) }), h('j', 'Journal', '✍️', { created_on: day(0) })],
    checkins: [{ habit_id: 'm', day: day(1), count: 1 }],
  },
  {
    name: 'Quitting smoking, slipped yesterday',
    habits: [
      h('c', 'No smoking', '🚬', { kind: 'quit' }),
      h('d', 'No doomscrolling', '📱', { kind: 'quit' }),
    ],
    checkins: [...log('c', 12, (n) => (n === 1 || n === 0 ? 0 : 1)), ...log('d', 30, (n, wd) => (wd === 0 || wd === 6 ? 0 : 1))],
  },
  {
    name: 'Push-ups goal keeps stalling',
    habits: [h('p', 'Do 20 push-ups', '💪', { target: 3 }), h('t', 'Stretch', '🤸')],
    checkins: [...log('p', 30, (n) => (n === 0 ? 1 : n % 4 === 0 ? 3 : 1 + (n % 2))), ...log('t', 30, (n) => (n === 0 ? 0 : 1))],
  },
];

const GENERIC = /set a reminder|stay consistent|keep it up|you('ve| have) got this|stay focused|keep going/i;

function checks(out: { title: string; body: string; tip: string }, habits: HabitRow[], digest: string) {
  const text = `${out.title} ${out.body} ${out.tip}`;
  const words = (name: string) =>
    name.toLowerCase().split(/\s+/).filter((w) => w.length >= 4 && !/^(glasses|minutes|pages)$/.test(w));
  const namesHabit = habits.some(
    (hb) =>
      out.tip.toLowerCase().includes(hb.name.toLowerCase()) ||
      words(hb.name).some((w) => out.tip.toLowerCase().includes(w))
  );
  const digestNumbers = new Set(digest.match(/\d+/g) ?? []);
  const inventedNumbers = (text.match(/\d+/g) ?? []).filter((n) => !digestNumbers.has(n));
  return {
    'tip names a habit': namesHabit,
    'tip not generic': !GENERIC.test(out.tip),
    'numbers are real': inventedNumbers.length === 0,
    'fits lengths': !text.includes('…'),
    invented: inventedNumbers,
  };
}

const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
const totals = new Map<string, { passed: number; checks: number; cost: number; runs: number }>();

for (const persona of PERSONAS) {
  const digest = buildDigest({ kind: 'daily', today: TODAY, habits: persona.habits, checkins: persona.checkins, challenges: [] }).text;
  console.log(`\n=== ${persona.name} ===`);
  for (const s of SETUPS) {
    const result = await generate(client, 'daily', digest, s.setup);
    const t = totals.get(s.name) ?? { passed: 0, checks: 0, cost: 0, runs: 0 };
    if (!result) {
      console.log(`\n[${s.name}] ✗ no output (refusal or unparseable)`);
      totals.set(s.name, { ...t, checks: t.checks + 4, runs: t.runs + 1 });
      continue;
    }
    const { written, usage } = result;
    const cost = (usage.input_tokens * s.price[0] + usage.output_tokens * s.price[1]) / 1e6;
    const c = checks(written, persona.habits, digest);
    const verdicts = Object.entries(c).filter(([k]) => k !== 'invented') as [string, boolean][];
    const passed = verdicts.filter(([, v]) => v).length;
    totals.set(s.name, { passed: t.passed + passed, checks: t.checks + verdicts.length, cost: t.cost + cost, runs: t.runs + 1 });
    console.log(`\n[${s.name}]  $${cost.toFixed(4)}  ${verdicts.map(([k, v]) => `${v ? '✓' : '✗'} ${k}`).join(' · ')}${c.invented.length ? `  (invented: ${c.invented.join(', ')})` : ''}`);
    console.log(`  ${written.title}\n  ${written.body}\n  💡 ${written.tip}`);
  }
}

console.log('\n=== Summary ===');
for (const s of SETUPS) {
  const t = totals.get(s.name)!;
  console.log(
    `${s.name.padEnd(24)} checks passed ${t.passed}/${t.checks}   avg $${(t.cost / t.runs).toFixed(4)}/nudge   ≈ $${((t.cost / t.runs) * 30).toFixed(2)}/user/month`
  );
}
