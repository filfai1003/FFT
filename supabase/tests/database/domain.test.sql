-- Domain rules in SQL: Epley, records, strength score, nutrition totals, safety limits.
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev');

-- Epley: weight × (1 + reps / 30), reps 1..12 only, 1 rep = the weight itself ---------------------
select is(public.epley_1rm(100, 1), 100::numeric, 'Epley: 1 rep is the weight itself');
select is(round(public.epley_1rm(22, 9), 1), 28.6, 'Epley: 22 kg x 9 = 28.6 (mockup value)');
select is(round(public.epley_1rm(100, 10), 1), 133.3, 'Epley: 100 kg x 10');
select is(public.epley_1rm(100, 13), null::numeric, 'Epley: more than 12 reps is ignored');
select is(public.epley_1rm(0, 5), null::numeric, 'Epley: zero weight is ignored');

-- Strength group mapping ------------------------------------------------------------------------
select is(public.strength_group('biceps'), 'arms', 'biceps -> arms');
select is(public.strength_group('abs'), 'core', 'abs -> core');
select is(public.strength_group('glutes'), 'legs', 'glutes -> legs');
select is(public.strength_group('chest'), 'chest', 'chest stays chest');

select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');

-- Two exercises, two finished sessions -------------------------------------------------------------
-- Bench (chest): day 1 best 100 (2 sets, one of 60x10 = 80), day 2 110  -> +10.0 %, 3 sets
-- Squat (legs):  day 1 100, day 2 130                                   -> +30.0 %, 2 sets
-- Also: an uncompleted 200 kg set and an active session that must be ignored.
insert into public.workout_sessions (id, started_at, status) values
  ('11111111-0000-0000-0000-000000000001', '2026-09-01 10:00+00', 'done'),
  ('11111111-0000-0000-0000-000000000002', '2026-09-20 10:00+00', 'done'),
  ('11111111-0000-0000-0000-000000000003', '2026-10-05 10:00+00', 'active');

insert into public.session_sets (session_id, exercise_id, set_index, weight_kg, reps, completed_at)
select s.session_id, e.id, s.idx, s.kg, s.reps, s.done
from (values
  ('11111111-0000-0000-0000-000000000001'::uuid, 'bench-press', 0, 100, 1, now()),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'bench-press', 1, 60, 10, now()),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'bench-press', 2, 200, 1, null),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'bench-press', 0, 110, 1, now()),
  ('11111111-0000-0000-0000-000000000001'::uuid, 'back-squat', 0, 100, 1, now()),
  ('11111111-0000-0000-0000-000000000002'::uuid, 'back-squat', 0, 130, 1, now()),
  ('11111111-0000-0000-0000-000000000003'::uuid, 'back-squat', 0, 300, 1, now())
) as s(session_id, slug, idx, kg, reps, done)
join public.exercises e on e.slug = s.slug and e.owner_id is null;

select is(
  (select actual_max_kg from public.exercise_records r
   join public.exercises e on e.id = r.exercise_id where e.slug = 'bench-press'),
  110.00::numeric,
  'actual max = heaviest completed weight (uncompleted 200 kg ignored)'
);

select is(
  (select actual_max_kg from public.exercise_records r
   join public.exercises e on e.id = r.exercise_id where e.slug = 'back-squat'),
  130.00::numeric,
  'records ignore sets of the active session (300 kg)'
);

select is(
  (select pct_change from public.strength_by_group(date '2026-08-01', date '2026-10-08')
   where muscle_group = 'chest'),
  10.0::numeric,
  'strength: chest +10 %'
);

select is(
  (select pct_change from public.strength_by_group(date '2026-08-01', date '2026-10-08')
   where muscle_group = 'overall'),
  18.0::numeric,
  'strength: overall is the set-weighted average ((10x3 + 30x2) / 5 = 18)'
);

-- Nutrition totals: food logs + fixed-meal checks (done/adjusted), skipped and deleted excluded ---
insert into public.food_logs (day, meal, name, grams, kcal, protein_g)
values ('2026-10-08', 'lunch', 'Rice', 100, 350, 7);
insert into public.food_logs (day, meal, name, grams, kcal, deleted_at)
values ('2026-10-08', 'lunch', 'Deleted entry', 100, 999, now());

insert into public.fixed_meal_plans (id, name) values ('22222222-0000-0000-0000-000000000001', 'Plan');
insert into public.fixed_meals (id, plan_id, position, name, kcal) values
  ('33333333-0000-0000-0000-000000000001', '22222222-0000-0000-0000-000000000001', 0, 'Breakfast', 500),
  ('33333333-0000-0000-0000-000000000002', '22222222-0000-0000-0000-000000000001', 1, 'Lunch', 750);
insert into public.fixed_meal_checks (day, fixed_meal_id, status, kcal) values
  ('2026-10-08', '33333333-0000-0000-0000-000000000001', 'done', 500),
  ('2026-10-08', '33333333-0000-0000-0000-000000000002', 'skipped', 750);

select is(
  (select kcal from public.daily_nutrition_totals where day = '2026-10-08'),
  850::numeric,
  'daily totals = food logs + done meals (skipped and deleted excluded)'
);

-- Recipe per-serving nutrition ---------------------------------------------------------------------
insert into public.foods (id, owner_id, name, kcal_100g, protein_100g, source)
values ('44444444-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-00000000000a', 'Test food', 100, 10, 'custom');
insert into public.recipes (id, name, servings) values ('55555555-0000-0000-0000-000000000001', 'Test recipe', 2);
insert into public.recipe_items (recipe_id, food_id, grams)
values ('55555555-0000-0000-0000-000000000001', '44444444-0000-0000-0000-000000000001', 400);

select is(
  (select kcal_per_serving from public.recipe_nutrition where recipe_id = '55555555-0000-0000-0000-000000000001'),
  200.0::numeric,
  'recipe: 400 g at 100 kcal/100 g over 2 servings = 200 kcal per serving'
);

-- Safety limits --------------------------------------------------------------------------------------
select throws_ok(
  $$insert into public.nutrition_goals (valid_from, kcal, protein_g, carbs_g, fat_g)
    values ('2026-10-08', 1400, 100, 100, 50)$$,
  '23514', null, 'a target below 1500 kcal is rejected'
);

select throws_ok(
  $$insert into public.nutrition_goals (valid_from, kcal, protein_g, carbs_g, fat_g, maintenance_kcal)
    values ('2026-10-08', 1900, 150, 200, 60, 2600)$$,
  '23514', null, 'a deficit over 25 % (1900 vs 2600) is rejected'
);

select * from finish();
rollback;
