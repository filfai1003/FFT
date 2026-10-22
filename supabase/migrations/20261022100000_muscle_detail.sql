-- 17 muscles and three levels of involvement per exercise (DECISIONS 125).
--
-- Before: eight coarse muscles (chest, back, shoulders, biceps, triceps, legs, glutes, abs), one
-- primary and any secondary. Now:
--   primary_muscle     one of the 17 muscles: 1 set per set done; it also gives the exercise its
--                      strength group (public.strength_group)
--   secondary_muscles  muscles that help: half a set each (same column, same meaning as before)
--   indirect_muscles   new: muscles that steady or assist a little: a quarter set each
-- A muscle appears at one level only. Catalogue rows get their exact levels from seed.sql (run
-- after the migrations, at every server start); the user's own exercises are mapped below.

alter table public.exercises drop constraint if exists exercises_primary_muscle_check;
alter table public.exercises drop constraint if exists exercises_secondary_valid;
alter table public.exercises add column if not exists indirect_muscles text[] not null default '{}';

-- The 17 muscles, in display order (src/domain/muscles.ts `muscles`).
create or replace function public.muscle_names()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['chest', 'lats', 'upper_back', 'lower_back', 'front_delts', 'side_delts',
               'rear_delts', 'biceps', 'triceps', 'forearms', 'quads', 'hamstrings', 'glutes',
               'adductors', 'calves', 'abs', 'obliques'];
$$;

-- Strength-score and filter groups (Chest, Back, Shoulders, Arms, Legs, Core) from a muscle. Old
-- names are still understood (rows of an old app version, old exports). Same as `strengthGroup`
-- in src/domain/muscles.ts.
create or replace function public.strength_group(muscle text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when muscle = 'chest' then 'chest'
    when muscle in ('lats', 'upper_back', 'lower_back', 'back') then 'back'
    when muscle in ('front_delts', 'side_delts', 'rear_delts', 'shoulders') then 'shoulders'
    when muscle in ('biceps', 'triceps', 'forearms') then 'arms'
    when muscle in ('quads', 'hamstrings', 'glutes', 'adductors', 'calves', 'legs') then 'legs'
    when muscle in ('abs', 'obliques') then 'core'
  end;
$$;

-- Keeps the muscles of a row in today's vocabulary, whoever writes it (the app, the sync from an
-- app not updated yet, the coach creating an exercise, an import). Same rules as
-- `normalizeMuscles` in src/domain/muscles.ts:
--   primary   back -> lats (+ upper_back secondary), shoulders -> front_delts, legs -> quads
--   secondary back -> upper_back (+ lats indirect), shoulders -> front_delts, legs -> quads
--   indirect  back -> upper_back + lats, shoulders -> front_delts, legs -> quads
-- then each muscle keeps its highest level only, unknown helper names are dropped (an unknown
-- primary is refused by the check constraint).
create or replace function public.normalize_exercise_muscles()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  known constant text[] := public.muscle_names();
  sec text[] := '{}';
  ind text[] := '{}';
  m text;
begin
  case new.primary_muscle
    when 'back' then
      new.primary_muscle := 'lats';
      sec := array_append(sec, 'upper_back');
    when 'shoulders' then new.primary_muscle := 'front_delts';
    when 'legs' then new.primary_muscle := 'quads';
    else null;
  end case;

  foreach m in array coalesce(new.secondary_muscles, '{}') loop
    case m
      when 'back' then
        sec := array_append(sec, 'upper_back');
        ind := array_append(ind, 'lats');
      when 'shoulders' then sec := array_append(sec, 'front_delts');
      when 'legs' then sec := array_append(sec, 'quads');
      else sec := array_append(sec, m);
    end case;
  end loop;
  foreach m in array coalesce(new.indirect_muscles, '{}') loop
    case m
      when 'back' then ind := ind || array['upper_back', 'lats'];
      when 'shoulders' then ind := array_append(ind, 'front_delts');
      when 'legs' then ind := array_append(ind, 'quads');
      else ind := array_append(ind, m);
    end case;
  end loop;

  -- First occurrence order kept, duplicates and lower levels of the same muscle dropped.
  new.secondary_muscles := coalesce(array(
    select x from (
      select x, min(i) as i from unnest(sec) with ordinality as u(x, i)
      where x = any (known) and x is distinct from new.primary_muscle
      group by x
    ) s order by i
  ), '{}');
  new.indirect_muscles := coalesce(array(
    select x from (
      select x, min(i) as i from unnest(ind) with ordinality as u(x, i)
      where x = any (known) and x is distinct from new.primary_muscle
        and not (x = any (new.secondary_muscles))
      group by x
    ) s order by i
  ), '{}');
  return new;
end;
$$;

drop trigger if exists exercises_normalize_muscles on public.exercises;
create trigger exercises_normalize_muscles
  before insert or update on public.exercises
  for each row execute function public.normalize_exercise_muscles();

-- Existing rows in the new vocabulary (the trigger maps them). updated_at moves on by one
-- millisecond only: the devices take the mapped row (it is newer than theirs), while any change
-- the user made after it still wins (last change wins, DECISIONS 40). Catalogue rows are mapped
-- too, then seed.sql sets their exact levels.
update public.exercises
   set updated_at = updated_at + interval '1 millisecond'
 where primary_muscle in ('back', 'shoulders', 'legs')
    or secondary_muscles && array['back', 'shoulders', 'legs'];

alter table public.exercises
  add constraint exercises_primary_muscle_check
    check (primary_muscle = any (public.muscle_names())),
  add constraint exercises_secondary_valid
    check (secondary_muscles <@ public.muscle_names()),
  add constraint exercises_indirect_valid
    check (indirect_muscles <@ public.muscle_names()),
  add constraint exercises_muscle_levels_distinct
    check (
      not (primary_muscle = any (secondary_muscles))
      and not (primary_muscle = any (indirect_muscles))
      and not (secondary_muscles && indirect_muscles)
    );

comment on column public.exercises.primary_muscle is
  'One of public.muscle_names(): 1 set per set done; gives the strength group (DECISIONS 125).';
comment on column public.exercises.secondary_muscles is
  'Muscles that help: half a set each (DECISIONS 125).';
comment on column public.exercises.indirect_muscles is
  'Muscles that steady or assist a little: a quarter set each (DECISIONS 125).';
