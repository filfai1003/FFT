-- Encrypted relay between phones (DECISIONS 65): pairing, mailbox, delivery, exclusion.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('4e1a7000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'relay@test.dev');

select pg_temp.as_user('4e1a7000-0000-0000-0000-000000000001');
select throws_ok(
  $$select public.relay_register('11111111-aaaa-4aaa-8aaa-000000000001', 'Pixel')$$,
  '42501', null, 'not chosen yet: no relay'
);
do $$ begin perform public.set_sync(false); end $$;
do $$ begin
  perform public.relay_register('11111111-aaaa-4aaa-8aaa-000000000001', 'Pixel');
  perform public.relay_register('11111111-aaaa-4aaa-8aaa-000000000002', 'Galaxy');
  perform public.relay_send('[{"to": "11111111-aaaa-4aaa-8aaa-000000000002", "from": "11111111-aaaa-4aaa-8aaa-000000000001", "payload": "sealed"}]'::jsonb);
end $$;
select is(jsonb_array_length(public.relay_list()), 2, 'two paired phones');
select is(
  jsonb_array_length(public.relay_fetch('11111111-aaaa-4aaa-8aaa-000000000002')), 1,
  'the message waits for its phone'
);
select throws_ok(
  $$select public.relay_send('[{"to": "22222222-aaaa-4aaa-8aaa-000000000009", "from": "11111111-aaaa-4aaa-8aaa-000000000001", "payload": "x"}]'::jsonb)$$,
  '42501', null, 'only to a paired phone'
);
do $$ begin
  perform public.relay_ack('11111111-aaaa-4aaa-8aaa-000000000002',
    array(select id from public.relay_messages));
end $$;
select is((select count(*) from public.relay_messages), 0::bigint, 'deleted once received');

do $$ begin perform public.set_sync(true); end $$;
select is((select count(*) from public.relay_devices), 0::bigint, 'the copy on the server ends the relay');

select * from finish();
rollback;
