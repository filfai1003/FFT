-- "Check sync" (Privacy & data): how many live rows of each synced table the caller has online,
-- to compare with the phone. Same owner rules as sync_pull; runs as the caller (row level security).

create or replace function public.sync_counts()
returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  uid uuid := (select auth.uid());
  t text;
  owner_filter text;
  n bigint;
  result jsonb := '{}'::jsonb;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  foreach t in array public.sync_tables() loop
    owner_filter := case t
      when 'profiles' then 'x.id = $1'
      when 'exercises' then 'x.owner_id = $1'
      when 'foods' then 'x.owner_id = $1'
      when 'food_servings' then 'x.food_id in (select f.id from public.foods f where f.owner_id = $1)'
      else 'x.user_id = $1'
    end;
    execute format('select count(*) from public.%I x where x.deleted_at is null and %s', t, owner_filter)
      into n
      using uid;
    result := result || jsonb_build_object(t, n);
  end loop;
  return result;
end;
$$;

revoke all on function public.sync_counts() from public;
grant execute on function public.sync_counts() to authenticated;
revoke execute on function public.sync_counts() from anon;
