-- The OpenRouter providers the included AI coach may use (DECISIONS 88), set from the admin panel
-- like the model: comma-separated provider slugs (the `ai` function reads it on each request; when
-- absent it uses AI_PROVIDERS, then its built-in list). Still no user can read or write app_settings.
alter table public.app_settings drop constraint if exists app_settings_key_check;
alter table public.app_settings add constraint app_settings_key_check
  check (key in ('ai_model', 'backup_last', 'ai_providers'));
