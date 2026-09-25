-- Riser: cloud copy of each user's habits. The app keeps its own local copy and syncs changes
-- in both directions (see src/lib/sync.ts), so every table carries `updated_at` for "what
-- changed since" pulls, and habits/challenges are soft-deleted so deletions reach other devices.
-- Row Level Security limits every row to the signed-in user (anonymous users included).

-- Keeps `updated_at` server-assigned so pulls never miss a change because of a phone's clock.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- One row per user: settings and the highest level already celebrated.
create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  seen_level integer,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.habits (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  name text not null check (char_length(name) between 1 and 200),
  emoji text not null,
  note text not null default '',
  kind text not null check (kind in ('build', 'quit')),
  target integer not null check (target between 1 and 50),
  reminders text[] not null default '{}',
  created_on date not null,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

-- One row per habit per day. A count of 0 means "un-checked" (kept so the change syncs).
create table public.checkins (
  user_id uuid not null default auth.uid(),
  habit_id text not null,
  day date not null,
  count integer not null check (count between 0 and 50),
  updated_at timestamptz not null default now(),
  primary key (user_id, habit_id, day),
  foreign key (user_id, habit_id) references public.habits (user_id, id) on delete cascade
);

-- Challenges keep a snapshot of their habit so won trophies outlive a deleted habit.
create table public.challenges (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  habit_id text not null,
  habit_name text not null,
  habit_emoji text not null,
  habit_kind text not null check (habit_kind in ('build', 'quit')),
  custom boolean not null default false,
  title text,
  length integer not null check (length between 1 and 3650),
  start_date date not null,
  completed_at date,
  dismissed boolean not null default false,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, id)
);

create index habits_user_updated on public.habits (user_id, updated_at);
create index checkins_user_updated on public.checkins (user_id, updated_at);
create index challenges_user_updated on public.challenges (user_id, updated_at);

create trigger profiles_touch before insert or update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger habits_touch before insert or update on public.habits
  for each row execute function public.touch_updated_at();
create trigger checkins_touch before insert or update on public.checkins
  for each row execute function public.touch_updated_at();
create trigger challenges_touch before insert or update on public.challenges
  for each row execute function public.touch_updated_at();

-- Row Level Security: each user reads and writes only their own rows.
alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.checkins enable row level security;
alter table public.challenges enable row level security;

create policy "Own profile" on public.profiles for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own habits" on public.habits for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own check-ins" on public.checkins for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "Own challenges" on public.challenges for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.profiles, public.habits, public.checkins, public.challenges from anon;
grant select, insert, update, delete
  on public.profiles, public.habits, public.checkins, public.challenges to authenticated;

-- In-app account deletion (required by the App Store): removes the caller's auth user, and the
-- foreign keys cascade to every row they own.
create or replace function public.delete_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke execute on function public.delete_account() from public, anon;
grant execute on function public.delete_account() to authenticated;
