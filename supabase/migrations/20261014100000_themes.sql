-- Light theme by default, and a separate theme for the workout in progress.
alter table public.user_settings alter column theme set default 'light';
update public.user_settings set theme = 'light' where theme = 'dark';
alter table public.user_settings
  add column if not exists workout_theme text not null default 'light'
  check (workout_theme in ('dark', 'light', 'system'));
