-- AI coaching (see supabase/functions/coach). The `coach` edge function reads a user's habits,
-- check-ins and streaks, asks Claude for a daily nudge or a weekly/monthly reflection, and stores
-- the result here. One row per user, kind and period, so each message is generated (and paid for)
-- once and every later request for that period is served from this table.

create table public.coach_messages (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('daily', 'weekly', 'monthly')),
  -- The day (daily), Monday (weekly) or first of the month (monthly) the message belongs to.
  period_start date not null,
  -- The days the message is about.
  range_start date not null,
  range_end date not null,
  title text not null,
  -- Daily: the nudge. Weekly/monthly: the summary paragraph.
  body text not null,
  -- Daily: one practical tip. Weekly/monthly: one focus for the next period.
  tip text,
  -- Weekly/monthly: [{ "emoji": "…", "text": "…" }].
  highlights jsonb not null default '[]'::jsonb,
  model text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, kind, period_start)
);

create index coach_messages_created on public.coach_messages (created_at);

-- Users may read their own messages. Only the edge function (service role) writes them, so a
-- client can't plant or edit coaching text.
alter table public.coach_messages enable row level security;
create policy "Read own coach messages" on public.coach_messages for select to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.coach_messages from anon, authenticated;
grant select on public.coach_messages to authenticated;
