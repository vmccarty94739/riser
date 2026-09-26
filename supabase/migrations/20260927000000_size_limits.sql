-- Size limits on every free-form column. The app already caps these in its forms, but anyone can
-- mint a guest account and call the API directly, so without limits a script could fill the
-- database with huge rows. Each limit sits well above what the app itself ever writes.

alter table public.habits
  add constraint habits_id_length check (char_length(id) between 1 and 100),
  add constraint habits_emoji_length check (char_length(emoji) between 1 and 32),
  add constraint habits_note_length check (char_length(note) <= 500),
  add constraint habits_reminders_count check (cardinality(reminders) <= 50);

alter table public.checkins
  add constraint checkins_habit_id_length check (char_length(habit_id) between 1 and 100);

alter table public.challenges
  add constraint challenges_id_length check (char_length(id) between 1 and 100),
  add constraint challenges_habit_id_length check (char_length(habit_id) between 1 and 100),
  add constraint challenges_habit_name_length check (char_length(habit_name) between 1 and 200),
  add constraint challenges_habit_emoji_length check (char_length(habit_emoji) between 1 and 32),
  add constraint challenges_title_length check (title is null or char_length(title) <= 200);

alter table public.deletions
  add constraint deletions_record_id_length check (char_length(record_id) between 1 and 100);

alter table public.profiles
  add constraint profiles_settings_size check (pg_column_size(settings) <= 16384);
