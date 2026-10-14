-- Server settings changed from the admin panel without a redeploy (sudo mode, audited).
-- Today: `ai_model`, the OpenRouter model of the AI coach included with Premium (the `ai`
-- function reads it on each request; when absent it uses AI_MODEL, then its built-in default).
-- No user can read or write it: the server reads it with the service role.

create table public.app_settings (
  key        text primary key check (key in ('ai_model')),
  value      text not null check (length(trim(value)) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create trigger app_settings_updated_at before update on public.app_settings
  for each row execute function public.set_updated_at();

alter table public.app_settings enable row level security;
revoke all on public.app_settings from anon, authenticated;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant select on public.app_settings to service_role;
  end if;
end
$$;
