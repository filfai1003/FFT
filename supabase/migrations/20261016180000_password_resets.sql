-- Forgot password, without an email service: the sign-in screen sends a request, the admin panel
-- shows it (Password resets), the admin sets a temporary password and emails it by hand; the user
-- signs in and changes it in the app (Profile -> Password).
--
-- Anyone can ask (no account is needed to forget a password), so the request says nothing back:
-- the same answer whether the email has an account or not, and a limit per email and in total.

create table public.password_reset_requests (
  id         uuid primary key default gen_random_uuid(),
  email      text not null,
  note       text,
  -- When the admin sent a temporary password, or dismissed the request.
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index password_reset_requests_open_idx on public.password_reset_requests (created_at)
  where handled_at is null;
alter table public.password_reset_requests enable row level security;
revoke all on public.password_reset_requests from anon, authenticated;

create or replace function public.request_password_reset(p_email text, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e text := lower(trim(coalesce(p_email, '')));
begin
  if e !~ '^[^\s@]+@[^\s@]+\.[^\s@]{2,}$' or length(e) > 200 then
    raise exception 'not an email address' using errcode = '22023';
  end if;
  -- Quietly ignored past the limits: three a day per email, a hundred an hour in all.
  if (select count(*) from public.password_reset_requests
      where email = e and created_at > now() - interval '1 day') >= 3
     or (select count(*) from public.password_reset_requests
         where created_at > now() - interval '1 hour') >= 100 then
    return;
  end if;
  insert into public.password_reset_requests (email, note)
  values (e, nullif(left(trim(coalesce(p_note, '')), 300), ''));
end;
$$;

revoke all on function public.request_password_reset(text, text) from public;
grant execute on function public.request_password_reset(text, text) to anon, authenticated;
