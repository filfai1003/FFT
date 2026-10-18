-- Only the name is required to set up a profile (DECISIONS 103): sex, birth date, height and
-- weight are optional (the columns were already nullable). The legal minimum age (18, DECISIONS
-- 96) no longer relies on the birth date: the user confirms "I am 18 or older" and the time of
-- that confirmation is kept in profiles.adult_confirmed_at (synced like the rest of the row).
--
-- The server check now says:
-- * a birth date given must still be 18 years ago or more (as before);
-- * a finished profile (onboarding_completed_at set) without a birth date needs the
--   confirmation; refused with SQLSTATE P0001 and a message starting AGE_NOT_CONFIRMED.
-- Nobody is locked out: a row that already stood that way on the server is not checked again
-- unless it changes into it (profiles finished before this change all had an adult birth date;
-- sync_push sends the whole row, and the insert it tries first sees the stored row). Profiles
-- that are not finished (just signed up) pass as before. An end-to-end encrypted copy
-- (vault_rows) cannot be read by the server and is not checked (the app check still applies).

alter table public.profiles add column adult_confirmed_at timestamptz;

create or replace function public.profile_min_age()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stored public.profiles;
begin
  if tg_op = 'UPDATE' then
    stored := old;
  else
    -- sync_push writes with insert … on conflict do update: the insert trigger runs first, even
    -- for a row that exists. Compare with the stored row then.
    select * into stored from public.profiles p where p.id = new.id;
  end if;

  if new.birth_date is not null
     and new.birth_date > (current_date + 1) - interval '18 years'
     and new.birth_date is distinct from stored.birth_date then
    raise exception 'AGE_UNDER_18: FFT is only for people aged 18 and over'
      using errcode = 'P0001', hint = 'birth_date';
  end if;

  if new.onboarding_completed_at is not null
     and new.birth_date is null
     and new.adult_confirmed_at is null
     and not (
       stored.id is not null
       and stored.onboarding_completed_at is not null
       and stored.birth_date is null
       and stored.adult_confirmed_at is null
     ) then
    raise exception 'AGE_NOT_CONFIRMED: confirm you are 18 or older, or give a birth date'
      using errcode = 'P0001', hint = 'adult_confirmed_at';
  end if;

  return new;
end;
$$;

drop trigger profiles_min_age on public.profiles;
create trigger profiles_min_age
  before insert or update of birth_date, adult_confirmed_at, onboarding_completed_at
  on public.profiles
  for each row execute function public.profile_min_age();
