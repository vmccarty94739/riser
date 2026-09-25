-- Deleting a habit or challenge now removes its row (and a habit's check-ins, via the foreign key)
-- instead of flagging it with `deleted_at`. Other devices still need to hear about deletions, so
-- each one leaves a small tombstone in `deletions`, which pulls read like any other table.

create table public.deletions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('habit', 'challenge')),
  record_id text not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, kind, record_id)
);

create index deletions_user_updated on public.deletions (user_id, updated_at);

create trigger deletions_touch before insert or update on public.deletions
  for each row execute function public.touch_updated_at();

alter table public.deletions enable row level security;
create policy "Own deletions" on public.deletions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.deletions from anon;
grant select, insert, update, delete on public.deletions to authenticated;

-- Convert rows already flagged as deleted into tombstones, then remove them.
insert into public.deletions (user_id, kind, record_id)
  select user_id, 'habit', id from public.habits where deleted_at is not null
  on conflict do nothing;
insert into public.deletions (user_id, kind, record_id)
  select user_id, 'challenge', id from public.challenges where deleted_at is not null
  on conflict do nothing;
delete from public.habits where deleted_at is not null;
delete from public.challenges where deleted_at is not null;

alter table public.habits drop column deleted_at;
alter table public.challenges drop column deleted_at;
