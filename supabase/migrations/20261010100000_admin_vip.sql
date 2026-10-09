-- Admin panel support.
--
-- vip_users: accounts the admin made VIP (premium on, whatever the plan). A user can read their own
-- row so the app can show it; nobody can write it through the API: only the admin panel does, with the
-- database owner role (which bypasses row level security).
-- admin_audit: what the admin did in sudo mode (no policy at all: the API can neither read nor write it).

create table public.vip_users (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.vip_users enable row level security;

create policy vip_users_select_own on public.vip_users
  for select to authenticated
  using (user_id = (select auth.uid()) and deleted_at is null);

create trigger vip_users_set_updated_at
  before update on public.vip_users
  for each row execute function public.set_updated_at();

create table public.admin_audit (
  id         uuid primary key default gen_random_uuid(),
  action     text not null,
  detail     jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.admin_audit enable row level security;

create trigger admin_audit_set_updated_at
  before update on public.admin_audit
  for each row execute function public.set_updated_at();
