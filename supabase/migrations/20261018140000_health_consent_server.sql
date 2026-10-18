-- The health data consent, known to the server too (DECISIONS 81). When the user withdraws it, the
-- app pauses (ConsentGate) and so does its sync, so the synced `consents` row would never tell the
-- server. The app now also tells the server directly (set_health_consent), and the API, MCP and
-- the AI app sign-in refuse to use the data while it is withdrawn.
-- No row = never withdrawn (every account that exists agreed at sign-up): nothing changes for them.

create table public.account_consent (
  user_id             uuid primary key references auth.users (id) on delete cascade,
  -- Set while the health data consent is withdrawn; null once it is given again.
  health_withdrawn_at timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);
alter table public.account_consent enable row level security;
-- The owner can read it; changes only through set_health_consent.
create policy account_consent_select_own on public.account_consent
  for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.account_consent from anon;
revoke insert, update, delete on public.account_consent from authenticated;

/** The caller's health data consent: given (true) or withdrawn (false). */
create or replace function public.set_health_consent(p_granted boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  insert into public.account_consent (user_id, health_withdrawn_at)
  values (uid, case when p_granted then null else now() end)
  on conflict (user_id) do update
    set health_withdrawn_at = case when p_granted then null
                                   else coalesce(public.account_consent.health_withdrawn_at, now()) end,
        updated_at = now();
end;
$$;
revoke all on function public.set_health_consent(boolean) from public;
grant execute on function public.set_health_consent(boolean) to authenticated;
revoke execute on function public.set_health_consent(boolean) from anon;

/** Server only (api service): may the server use this account's health data now? */
create or replace function public.health_consent_of(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1 from public.account_consent c
    where c.user_id = p_user and c.health_withdrawn_at is not null
  );
$$;
revoke all on function public.health_consent_of(uuid) from public;
revoke execute on function public.health_consent_of(uuid) from anon, authenticated;
