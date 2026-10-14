-- Generic foods (apple, rice, chicken breast…) from the CIQUAL table: shared rows like the Open Food
-- Facts products (owner_id null), with their own source so the app can credit "Ciqual (ANSES)".
-- The rows themselves are in seed.sql (applied by the server at every start).
alter table public.foods drop constraint foods_source_check;
alter table public.foods
  add constraint foods_source_check check (source in ('off', 'ciqual', 'custom'));

alter table public.foods drop constraint foods_source_matches_owner;
alter table public.foods
  add constraint foods_source_matches_owner check (
    (owner_id is null and source in ('off', 'ciqual')) or (owner_id is not null and source = 'custom')
  );
