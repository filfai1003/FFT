-- RLS: every table is protected and users are isolated from each other.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

-- Impersonation helpers (rolled back with the transaction).
create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

create function pg_temp.as_admin() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- Two users; the on_auth_user_created trigger creates their profile and settings.
insert into auth.users (id, instance_id, aud, role, email) values
  ('aaaaaaaa-0000-0000-0000-00000000000a', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.dev'),
  ('bbbbbbbb-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.dev');

-- 1. Structure ------------------------------------------------------------------------------
select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity),
  0::bigint,
  'every table in public has row level security enabled'
);

select is(
  (select count(*) from public.profiles), 2::bigint, 'sign-up created a profile per user'
);
select is(
  (select count(*) from public.user_settings), 2::bigint, 'sign-up created settings per user'
);

-- 2. Isolation ------------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');

insert into public.food_logs (day, meal, name, grams, kcal)
values ('2026-10-08', 'lunch', 'Chicken breast', 150, 165);
insert into public.body_metrics (day, weight_kg) values ('2026-10-08', 78.4);
insert into public.exercises (name, primary_muscle, equipment, owner_id)
values ('My cable move', 'back', 'cables', 'aaaaaaaa-0000-0000-0000-00000000000a');

select is((select count(*) from public.food_logs), 1::bigint, 'A sees their own food log');

select pg_temp.as_user('bbbbbbbb-0000-0000-0000-00000000000b');

select is((select count(*) from public.food_logs), 0::bigint, 'B does not see A food log');
select is((select count(*) from public.body_metrics), 0::bigint, 'B does not see A body metrics');
select is(
  (select count(*) from public.profiles), 1::bigint, 'B sees only their own profile'
);
select is(
  (select count(*) from public.exercises where name = 'My cable move'),
  0::bigint,
  'B does not see A custom exercise'
);

select throws_ok(
  $$insert into public.food_logs (user_id, day, meal, name, grams, kcal)
    values ('aaaaaaaa-0000-0000-0000-00000000000a', '2026-10-08', 'dinner', 'Injected', 100, 100)$$,
  '42501',
  null,
  'B cannot write a row owned by A'
);

select is(
  (with u as (
     update public.body_metrics set weight_kg = 1 returning 1
   ) select count(*) from u),
  0::bigint,
  'B cannot update A rows'
);

-- 3. Catalogue ------------------------------------------------------------------------------
select ok(
  (select count(*) from public.exercises where owner_id is null) >= 60,
  'catalogue has at least 60 exercises, readable by every user'
);

select throws_ok(
  $$insert into public.exercises (name, primary_muscle, equipment, owner_id)
    values ('Fake catalogue entry', 'chest', 'barbell', null)$$,
  '42501',
  null,
  'users cannot write catalogue rows (owner_id null)'
);

select throws_ok(
  $$insert into public.foods (name, kcal_100g, source, owner_id)
    values ('Fake global food', 100, 'off', null)$$,
  '42501',
  null,
  'users cannot write global foods'
);

-- 4. Consents are an audit trail: no delete ---------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-0000-0000-00000000000a');
insert into public.consents (type, policy_version) values ('health_data', '2026-10');

select is(
  (with d as (delete from public.consents returning 1) select count(*) from d),
  0::bigint,
  'consents cannot be deleted by the user'
);

select pg_temp.as_admin();
select is(
  (select count(*) from storage.buckets where id in ('progress-photos', 'user-exercise-images', 'exercise-images')),
  3::bigint,
  'storage buckets exist'
);

select * from finish();
rollback;
