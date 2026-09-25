/**
 * Riser AI coach (Supabase Edge Function).
 *
 * POST { kind: 'daily' | 'weekly' | 'monthly', today: 'YYYY-MM-DD' } with the user's session
 * token. Reads that user's habits, check-ins and challenges (through RLS, as the user), turns them
 * into a digest, asks Claude for a nudge or reflection, stores it in `coach_messages` and returns
 * it. A message is generated once per user, kind and period; later calls return the stored one.
 *
 * Secrets: ANTHROPIC_API_KEY (set in Supabase → Edge Functions → Secrets). SUPABASE_URL,
 * SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 */
import Anthropic from 'npm:@anthropic-ai/sdk@0.128.0';
import { zodOutputFormat } from 'npm:@anthropic-ai/sdk@0.128.0/helpers/zod';
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.0';

import { DailySchema, instructions, ReflectionSchema, SYSTEM } from './prompt.ts';
import {
  addDays,
  buildDigest,
  isDay,
  periodStart,
  type ChallengeRow,
  type CheckinRow,
  type HabitRow,
  type Kind,
} from './stats.ts';

/** Short daily nudges on the fast, low-cost model; reflections on Sonnet for better analysis. */
const DAILY_MODEL = 'claude-haiku-4-5';
const REFLECTION_MODEL = 'claude-sonnet-5';
/** Safety valve on spend: new messages across all users per 24 hours. */
const GLOBAL_DAILY_CAP = 3000;
const PAGE = 1000;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });

const clip = (text: string, max: number) =>
  text.length <= max ? text.trim() : `${text.slice(0, max - 1).trimEnd()}…`;

async function allRows<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>) {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) return rows;
  }
}

async function readUserData(db: SupabaseClient, today: string) {
  const [habits, checkins, challenges] = await Promise.all([
    allRows<HabitRow>((a, b) =>
      db.from('habits').select('id,name,emoji,kind,target,created_on').order('id').range(a, b)
    ),
    // Enough history for 120-day streaks plus the comparison period.
    allRows<CheckinRow>((a, b) =>
      db
        .from('checkins')
        .select('habit_id,day,count')
        .gt('count', 0)
        .gte('day', addDays(today, -130))
        .lte('day', today)
        .order('habit_id')
        .order('day')
        .range(a, b)
    ),
    allRows<ChallengeRow>((a, b) =>
      db
        .from('challenges')
        .select('habit_id,habit_name,custom,title,length,start_date,completed_at,dismissed')
        .order('id')
        .range(a, b)
    ),
  ]);
  return { habits, checkins, challenges };
}

async function generate(kind: Kind, digest: string) {
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const content = `${instructions(kind)}\n\n<digest>\n${digest}\n</digest>`;
  const base = {
    max_tokens: 16000,
    system: SYSTEM,
    messages: [{ role: 'user' as const, content }],
  };

  if (kind === 'daily') {
    // Haiku 4.5 has no adaptive thinking or effort setting; a short nudge doesn't need thinking.
    const response = await client.messages.parse({
      ...base,
      model: DAILY_MODEL,
      output_config: { format: zodOutputFormat(DailySchema) },
    });
    const out = response.stop_reason === 'refusal' ? null : response.parsed_output;
    if (!out) return null;
    return {
      title: clip(out.title, 60),
      body: clip(out.message, 300),
      tip: clip(out.tip, 180),
      highlights: [],
    };
  }

  const response = await client.messages.parse({
    ...base,
    model: REFLECTION_MODEL,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'medium', format: zodOutputFormat(ReflectionSchema) },
  });
  const out = response.stop_reason === 'refusal' ? null : response.parsed_output;
  if (!out) return null;
  return {
    title: clip(out.title, 70),
    body: clip(out.summary, 480),
    tip: clip(out.focus, 200),
    highlights: out.highlights
      .slice(0, 4)
      .map((h) => ({ emoji: clip(h.emoji, 8), text: clip(h.text, 140) })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  const url = Deno.env.get('SUPABASE_URL')!;
  const authHeader = req.headers.get('Authorization') ?? '';
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
  } = await asUser.auth.getUser(authHeader.replace(/^Bearer\s+/i, ''));
  if (!user) return json(401, { error: 'not_signed_in' });
  if (!Deno.env.get('ANTHROPIC_API_KEY')) return json(503, { error: 'coach_not_configured' });

  let input: { kind?: unknown; today?: unknown };
  try {
    input = await req.json();
  } catch {
    return json(400, { error: 'bad_request' });
  }
  const kind = input.kind as Kind;
  const today = input.today;
  if (!['daily', 'weekly', 'monthly'].includes(kind) || !isDay(today))
    return json(400, { error: 'bad_request' });
  // The phone sends its local date; it can be a day either side of UTC, but no further (a
  // made-up date would otherwise buy an extra generation).
  const drift = Math.abs(Date.parse(`${today}T12:00:00Z`) - Date.now());
  if (drift > 2 * 86_400_000) return json(400, { error: 'bad_date' });

  const period = periodStart(kind, today);
  const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  try {
    const saved = await admin
      .from('coach_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('kind', kind)
      .eq('period_start', period)
      .maybeSingle();
    if (saved.error) throw saved.error;
    if (saved.data) return json(200, { message: saved.data });

    const recent = await admin
      .from('coach_messages')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', new Date(Date.now() - 86_400_000).toISOString());
    if ((recent.count ?? 0) >= GLOBAL_DAILY_CAP) return json(429, { error: 'coach_busy' });

    const data = await readUserData(asUser, today);
    if (!data.habits.length) return json(200, { message: null });

    const digest = buildDigest({ kind, today, ...data });
    const written = await generate(kind, digest.text);
    if (!written) return json(502, { error: 'coach_unavailable' });

    const row = {
      user_id: user.id,
      kind,
      period_start: period,
      range_start: digest.range.start,
      range_end: digest.range.end,
      model: kind === 'daily' ? DAILY_MODEL : REFLECTION_MODEL,
      ...written,
    };
    // Two simultaneous requests may both generate; the first insert wins and both return it.
    const insert = await admin
      .from('coach_messages')
      .upsert(row, { onConflict: 'user_id,kind,period_start', ignoreDuplicates: true });
    if (insert.error) throw insert.error;
    const stored = await admin
      .from('coach_messages')
      .select('*')
      .eq('user_id', user.id)
      .eq('kind', kind)
      .eq('period_start', period)
      .single();
    if (stored.error) throw stored.error;
    return json(200, { message: stored.data });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return json(429, { error: 'coach_busy' });
    if (error instanceof Anthropic.APIError) {
      console.error('Claude API error', error.status, error.message);
      return json(502, { error: 'coach_unavailable' });
    }
    console.error('coach failed', error);
    return json(500, { error: 'coach_failed' });
  }
});
