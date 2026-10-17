-- The copy on the server by category (DECISIONS 63): set_sync_categories and the rules that follow.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('cafecafe-0000-0000-0000-00000000000c', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'cat@test.dev');

select pg_temp.as_user('cafecafe-0000-0000-0000-00000000000c');
do $$ begin perform public.set_sync(true); end $$;
select is(
  (public.my_sync_state() -> 'categories'),
  '["body", "diet", "training", "photos"]'::jsonb,
  'every category is kept by default'
);
insert into public.water_logs (day, ml) values ('2026-10-17', 250);
insert into public.body_metrics (day, weight_kg) values ('2026-10-17', 70);

select is(
  public.set_sync_categories(array['training', 'body']),
  array['body', 'training'],
  'the categories kept, in order'
);
select is((select count(*) from public.water_logs), 0::bigint, 'the diet is deleted from the server');
select is((select count(*) from public.body_metrics), 1::bigint, 'the body data stays');
select is(
  (select count(*) from public.sync_tombstones where table_name = 'water_logs'),
  0::bigint,
  'no tombstones: other devices keep their copy'
);
select throws_ok(
  $$insert into public.water_logs (day, ml) values ('2026-10-17', 300)$$,
  '42501', null, 'a category that is off cannot be stored'
);
select throws_ok(
  $$select public.set_sync_categories(array['secrets'])$$,
  '22023', null, 'only known categories'
);
do $$ begin perform public.set_sync_categories(array['body', 'diet', 'training', 'photos']); end $$;
insert into public.water_logs (day, ml) values ('2026-10-17', 300);
select is((select count(*) from public.water_logs), 1::bigint, 'on again: it can be stored');

select * from finish();
rollback;
