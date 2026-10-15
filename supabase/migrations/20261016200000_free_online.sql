-- Supporter is gone (DECISIONS 47): every account keeps its data online (synced, web app) and gets
-- the API and MCP. Premium only adds the AI coach included in the app. The account-less mode still
-- keeps everything on the phone (it has no account on the server).

-- Supporters become free accounts: they keep exactly what they had.
delete from public.user_plans where plan = 'supporter';
alter table public.user_plans drop constraint user_plans_plan_check;
alter table public.user_plans add constraint user_plans_plan_check check (plan = 'premium');

-- "Can keep data online" (the row level security rules use this name): any account now.
create or replace function public.is_premium()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null;
$$;

create or replace function public.create_api_token(p_name text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  token text;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if (select count(*) from public.api_tokens t where t.user_id = uid and t.deleted_at is null) >= 10 then
    raise exception 'at most 10 tokens' using errcode = '54000';
  end if;
  -- Two random UUIDs: 244 random bits.
  token := 'fft_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into public.api_tokens (user_id, name, prefix, token_hash)
  values (uid, trim(p_name), left(token, 10), encode(sha256(convert_to(token, 'UTF8')), 'hex'));
  return token;
end;
$$;

-- Server only: the user a live token belongs to (any plan), null otherwise.
create or replace function public.api_token_user(p_hash text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  t public.api_tokens;
begin
  select * into t from public.api_tokens
  where token_hash = p_hash and deleted_at is null
    and (expires_at is null or expires_at > now());
  if t.id is null then
    return null;
  end if;
  if t.last_used_at is null or t.last_used_at < now() - interval '1 minute' then
    update public.api_tokens set last_used_at = now() where id = t.id;
  end if;
  return t.user_id;
end;
$$;
revoke all on function public.api_token_user(text) from public;
revoke execute on function public.api_token_user(text) from anon, authenticated;
