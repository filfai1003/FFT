-- The nightly backup service (backup/, DECISIONS 60) writes a short summary of its last run here;
-- the admin panel shows it. Still no user can read or write app_settings.
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('ai_model', 'backup_last'));
