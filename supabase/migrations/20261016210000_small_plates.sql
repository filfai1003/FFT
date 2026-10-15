-- "I have small plates" (Units): the next weight suggestion moves by 1.25 kg / 2.5 lb on barbells
-- and machines instead of 2.5 kg / 5 lb (DECISIONS 48).
alter table public.user_settings
  add column if not exists small_plates boolean not null default false;
