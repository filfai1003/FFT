-- Plans (DECISIONS 42).
--   free      everything on the phone
--   supporter + data synced online (and, later, API and MCP access)
--   premium   + the AI coach inside the app without an API key, paid from a monthly AI credit
-- Plans are set by the admin panel for now (payments later). VIP accounts become premium.
--
-- AI credit: premium gets 10 € of AI use a month (half the price of the plan); what is not used
-- carries over, up to 15 € in all (150 %). Amounts are in micro-euros (1 € = 1 000 000).

create table public.user_plans (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  plan       text not null check (plan in ('supporter', 'premium')),
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.user_plans enable row level security;
create policy user_plans_select_own on public.user_plans
  for select to authenticated using (user_id = (select auth.uid()) and deleted_at is null);
create trigger user_plans_set_updated_at
  before update on public.user_plans
  for each row execute function public.set_updated_at();

insert into public.user_plans (user_id, plan, note)
select v.user_id, 'premium', coalesce(v.note, 'was VIP')
  from public.vip_users v
 where v.deleted_at is null
on conflict (user_id) do nothing;

-- The plan of an account ('free' when it has none).
create or replace function public.plan_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.plan from public.user_plans p where p.user_id = p_user and p.deleted_at is null),
    (select 'premium' from public.vip_users v where v.user_id = p_user and v.deleted_at is null),
    'free');
$$;
revoke all on function public.plan_of(uuid) from public;

create or replace function public.my_plan()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_of((select auth.uid()));
$$;
revoke all on function public.my_plan() from public;
grant execute on function public.my_plan() to authenticated;

-- "Can keep data online": supporter and premium (the row level security rules use this name).
create or replace function public.is_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.plan_of((select auth.uid())) in ('supporter', 'premium');
$$;

-- --- AI credit ------------------------------------------------------------------------------------
create table public.ai_credit (
  user_id        uuid primary key references auth.users (id) on delete cascade,
  balance_micros bigint not null default 0,
  -- The next monthly top-up is due on this day.
  next_grant     date not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  deleted_at     timestamptz
);
alter table public.ai_credit enable row level security;
create policy ai_credit_select_own on public.ai_credit
  for select to authenticated using (user_id = (select auth.uid()));
create trigger ai_credit_set_updated_at
  before update on public.ai_credit
  for each row execute function public.set_updated_at();

create table public.ai_usage (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade,
  model             text not null,
  prompt_tokens     integer not null default 0,
  completion_tokens integer not null default 0,
  cost_micros       bigint not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index ai_usage_user_idx on public.ai_usage (user_id, created_at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_select_own on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()));

create or replace function public.ai_monthly_micros() returns bigint
language sql immutable as $$ select 10000000::bigint $$;
create or replace function public.ai_cap_micros() returns bigint
language sql immutable as $$ select 15000000::bigint $$;

-- Tops the credit up for every month that started since the last top-up (premium only), never
-- above the cap. Returns the balance. Only the server calls it (service role).
create or replace function public.ai_refresh_credit(p_user uuid)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.ai_credit;
begin
  if public.plan_of(p_user) <> 'premium' then
    select * into c from public.ai_credit where user_id = p_user;
    return coalesce(c.balance_micros, 0);
  end if;
  insert into public.ai_credit (user_id, balance_micros, next_grant)
  values (p_user, public.ai_monthly_micros(), (current_date + interval '1 month')::date)
  on conflict (user_id) do nothing;
  select * into c from public.ai_credit where user_id = p_user for update;
  while c.next_grant <= current_date loop
    c.balance_micros := least(c.balance_micros + public.ai_monthly_micros(), public.ai_cap_micros());
    c.next_grant := (c.next_grant + interval '1 month')::date;
  end loop;
  update public.ai_credit
     set balance_micros = c.balance_micros, next_grant = c.next_grant
   where user_id = p_user;
  return c.balance_micros;
end;
$$;
revoke all on function public.ai_refresh_credit(uuid) from public;

-- What the app shows: plan, credit left, monthly amount, cap and the next top-up.
create or replace function public.my_ai_credit()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  balance bigint;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  balance := public.ai_refresh_credit(uid);
  return jsonb_build_object(
    'plan', public.plan_of(uid),
    'balance_micros', balance,
    'monthly_micros', public.ai_monthly_micros(),
    'cap_micros', public.ai_cap_micros(),
    'next_grant', (select next_grant from public.ai_credit where user_id = uid));
end;
$$;
revoke all on function public.my_ai_credit() from public;
grant execute on function public.my_ai_credit() to authenticated;

-- One AI request paid from the credit (server only).
create or replace function public.ai_charge(
  p_user uuid, p_model text, p_prompt integer, p_completion integer, p_cost_micros bigint)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  balance bigint;
begin
  insert into public.ai_usage (user_id, model, prompt_tokens, completion_tokens, cost_micros)
  values (p_user, p_model, coalesce(p_prompt, 0), coalesce(p_completion, 0), greatest(p_cost_micros, 0));
  update public.ai_credit
     set balance_micros = balance_micros - greatest(p_cost_micros, 0)
   where user_id = p_user
  returning balance_micros into balance;
  return coalesce(balance, 0);
end;
$$;
revoke all on function public.ai_charge(uuid, text, integer, integer, bigint) from public;

-- Supabase grants EXECUTE on new functions to anon and authenticated by default ("revoke from
-- public" does not remove that): the server-only ones are closed explicitly.
revoke execute on function public.plan_of(uuid) from anon, authenticated;
revoke execute on function public.ai_refresh_credit(uuid) from anon, authenticated;
revoke execute on function public.ai_charge(uuid, text, integer, integer, bigint) from anon, authenticated;
revoke execute on function public.my_plan() from anon;
revoke execute on function public.my_ai_credit() from anon;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.plan_of(uuid) to service_role;
    grant execute on function public.ai_refresh_credit(uuid) to service_role;
    grant execute on function public.ai_charge(uuid, text, integer, integer, bigint) to service_role;
  end if;
end
$$;
