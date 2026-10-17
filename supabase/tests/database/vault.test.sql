-- End-to-end encryption of the copy on the server (DECISIONS 64): keys, sealed rows, the switch.
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.as_user(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;

insert into auth.users (id, instance_id, aud, role, email) values
  ('5ea1ed00-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'vault@test.dev');

select pg_temp.as_user('5ea1ed00-0000-0000-0000-000000000001');
do $$ begin perform public.set_sync(true); end $$;
insert into public.water_logs (day, ml) values ('2026-10-17', 250);

select throws_ok(
  $$select public.vault_push('[{"tbl": "water_logs", "row_id": "w", "updated_at": "2026-10-17T10:00:00Z", "ciphertext": "x"}]'::jsonb)$$,
  '42501', null, 'no sealed item before a key is set up'
);
do $$ begin perform public.save_vault_keys('{"kdf": {"alg": "scrypt", "N": 16384, "r": 8, "p": 1}, "salt": "s", "wrapped_by_passphrase": "p", "wrapped_by_recovery": "r", "key_check": "c"}'::jsonb); end $$;
select is(public.my_vault_keys() ->> 'salt', 's', 'the wrapped key is kept for its owner');
do $$ begin perform public.vault_push('[{"tbl": "water_logs", "row_id": "w", "updated_at": "2026-10-17T10:00:00Z", "ciphertext": "new"}]'::jsonb); end $$;
do $$ begin perform public.vault_push('[{"tbl": "water_logs", "row_id": "w", "updated_at": "2026-10-17T09:00:00Z", "ciphertext": "old"}]'::jsonb); end $$;
select is((select ciphertext from public.vault_rows where row_id = 'w'), 'new', 'the newest change wins');

do $$ begin perform public.set_vault(true); end $$;
select is((select count(*) from public.water_logs), 0::bigint, 'on: the readable copy is deleted');
select throws_ok(
  $$insert into public.water_logs (day, ml) values ('2026-10-17', 300)$$,
  '42501', null, 'on: readable writes are refused'
);
select throws_ok(
  $$update public.vault_keys set key_check = 'other'$$,
  '55000', null, 'on: the key cannot be replaced'
);
select throws_ok($$select public.clear_vault()$$, '55000', null, 'on: the sealed copy stays');

do $$ begin perform public.set_vault(false); perform public.clear_vault(); end $$;
select is((select count(*) from public.vault_rows), 0::bigint, 'off: the sealed copy goes');
select is(public.my_vault_keys(), null::jsonb, 'off: the key goes');

select * from finish();
rollback;
