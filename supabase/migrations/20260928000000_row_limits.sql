-- Row caps per user and sane date ranges. Column sizes are capped already (…_size_limits.sql), but
-- one guest could still insert unlimited rows, or a check-in for every day from 0001 to 9999, and
-- fill the database (the free plan turns read-only at 500 MB, which stops sync for everyone).
-- Every limit sits far above what a real account reaches.

alter table public.checkins
  add constraint checkins_day_range check (day between date '2000-01-01' and date '2100-12-31');

alter table public.habits
  add constraint habits_created_on_range
    check (created_on between date '2000-01-01' and date '2100-12-31');

alter table public.challenges
  add constraint challenges_start_date_range
    check (start_date between date '2000-01-01' and date '2100-12-31'),
  add constraint challenges_completed_at_range
    check (completed_at is null or completed_at between date '2000-01-01' and date '2100-12-31');

alter table public.profiles
  add constraint profiles_seen_level_range check (seen_level is null or seen_level between 0 and 10000);

-- Runs once per insert statement and fails it when any user it touched is now over the cap
-- (the first trigger argument). Upserts that only update existing rows add nothing, so an account
-- at its cap can still edit. Each table's own branch keeps the SQL static.
create or replace function public.enforce_row_cap()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  cap constant bigint := tg_argv[0]::bigint;
  over_cap boolean;
begin
  case tg_table_name
    when 'habits' then
      select exists (select 1 from (select distinct user_id from new_rows) n
        where (select count(*) from public.habits t where t.user_id = n.user_id) > cap)
      into over_cap;
    when 'challenges' then
      select exists (select 1 from (select distinct user_id from new_rows) n
        where (select count(*) from public.challenges t where t.user_id = n.user_id) > cap)
      into over_cap;
    when 'checkins' then
      select exists (select 1 from (select distinct user_id from new_rows) n
        where (select count(*) from public.checkins t where t.user_id = n.user_id) > cap)
      into over_cap;
    when 'deletions' then
      select exists (select 1 from (select distinct user_id from new_rows) n
        where (select count(*) from public.deletions t where t.user_id = n.user_id) > cap)
      into over_cap;
  end case;
  if over_cap then
    raise exception 'Row limit reached for %', tg_table_name using errcode = '23514';
  end if;
  return null;
end;
$$;

revoke execute on function public.enforce_row_cap() from public, anon, authenticated;

create trigger habits_row_cap after insert on public.habits
  referencing new table as new_rows
  for each statement execute function public.enforce_row_cap('300');
create trigger challenges_row_cap after insert on public.challenges
  referencing new table as new_rows
  for each statement execute function public.enforce_row_cap('3000');
create trigger checkins_row_cap after insert on public.checkins
  referencing new table as new_rows
  for each statement execute function public.enforce_row_cap('100000');
create trigger deletions_row_cap after insert on public.deletions
  referencing new table as new_rows
  for each statement execute function public.enforce_row_cap('20000');
