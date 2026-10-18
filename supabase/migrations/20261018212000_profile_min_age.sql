-- FFT is for people aged 18 and over (DECISIONS 96). The app already stops younger people at the
-- "About you" step; the server now refuses to store a birth date under 18 too, whatever sends it
-- (sync_push, the API, an edit through the REST endpoint). The error says why, with its own code
-- (P0001, message starting with AGE_UNDER_18) so the app can tell it from other refusals.
--
-- Nobody is locked out: a profile already stored is not checked again unless its birth date
-- changes (sync_push sends the whole row; the same date again passes, also through the insert
-- that sync_push tries first). One day of margin for time zones (the date is the user's local one).
-- An end-to-end encrypted copy (vault_rows) cannot be read by the server and is not checked.

create or replace function public.profile_min_age()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date is null or new.birth_date <= (current_date + 1) - interval '18 years' then
    return new;
  end if;
  if tg_op = 'UPDATE' and new.birth_date is not distinct from old.birth_date then
    return new;
  end if;
  -- sync_push writes with insert … on conflict do update: the insert trigger runs first, even for
  -- a row that exists. The same date as the stored one is not a change.
  if tg_op = 'INSERT' and exists (
    select 1 from public.profiles p where p.id = new.id and p.birth_date = new.birth_date
  ) then
    return new;
  end if;
  raise exception 'AGE_UNDER_18: FFT is only for people aged 18 and over'
    using errcode = 'P0001', hint = 'birth_date';
end;
$$;

create trigger profiles_min_age
  before insert or update of birth_date on public.profiles
  for each row execute function public.profile_min_age();
