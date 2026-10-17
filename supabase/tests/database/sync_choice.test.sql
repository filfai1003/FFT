-- Keep a copy on the server is optional (DECISIONS 62): set_sync, my_sync and the rules that follow.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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

-- A new account: it has not chosen yet.
insert into auth.users (id, instance_id, aud, role, email) values
  ('eeeeeeee-0000-0000-0000-00000000000e', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'e@test.dev');

select pg_temp.as_user('eeeeeeee-0000-0000-0000-00000000000e');

select is(public.my_sync(), null::boolean, 'a new account has not chosen yet');
select throws_ok(
  $$insert into public.water_logs (day, ml) values ('2026-10-17', 250)$$,
  '42501', null, 'not chosen: nothing of its data can be stored on the server'
);
select throws_ok(
  $$insert into public.account_sync (user_id, enabled) values ('eeeeeeee-0000-0000-0000-00000000000e', true)$$,
  '42501', null, 'the choice is changed only through set_sync'
);

do $$ begin perform public.set_sync(true); end $$;
select is(public.my_sync(), true, 'on');
insert into public.water_logs (day, ml) values ('2026-10-17', 250);
insert into public.body_metrics (day, weight_kg) values ('2026-10-17', 70);
update public.profiles set name = 'Eve';
select is((select count(*) from public.water_logs), 1::bigint, 'on: the data is stored');

do $$ begin perform public.set_sync(false); end $$;
select is(public.my_sync(), false, 'off');
select is((select count(*) from public.water_logs), 0::bigint, 'off: the water log is deleted');
select is((select count(*) from public.body_metrics), 0::bigint, 'off: the body data is deleted');
select is(
  (select name from public.profiles), null::text, 'off: the empty profile of the account stays'
);
select throws_ok(
  $$insert into public.water_logs (day, ml) values ('2026-10-17', 300)$$,
  '42501', null, 'off: nothing more can be stored'
);
select throws_ok(
  $$select public.create_api_token('Claude')$$,
  '55000', null, 'off: no personal token'
);

select pg_temp.as_admin();
set local role anon;
select throws_ok($$select public.set_sync(true)$$, '42501', null, 'anonymous users cannot call it');

select * from finish();
rollback;
