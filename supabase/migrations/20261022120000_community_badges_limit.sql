-- New badge catalogue (DECISIONS 126): 93 badges, of which 91 can be sent to the community (the
-- Supporter and Premium badges never are). The member row and community_submit accepted at most
-- 64 badge ids; both now accept 128. Ids keep the same format check ([a-z0-9_], 1–40), so ids of
-- the old catalogue still pass; the app sends only current ids, so a member's list is replaced
-- by the new one on its next submission, and a showcase badge no longer in it is dropped at read
-- time as before (community_look).

alter table public.community_members drop constraint community_members_badges_check;
alter table public.community_members
  add constraint community_members_badges_check check (cardinality(badges) <= 128);

/**
 * The app's numbers for the current week and month, with the level and badges (unchanged from
 * 20261018300000_community.sql but for the badge limit: at most 128 badge ids, DECISIONS 126).
 */
create or replace function public.community_submit(p_level integer, p_badges text[], p_scores jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  uid uuid := public.community_caller();
  me public.community_members;
  s record;
  elapsed integer;
  old public.community_scores;
  days_since numeric;
begin
  select * into me from public.community_members m where m.user_id = uid for update;
  if me.submitted_at is not null and me.submitted_at > now() - interval '1 minute' then
    raise exception 'scores sent less than a minute ago' using errcode = '54000';
  end if;
  if p_level is null or p_level < 1 or p_level > 200
     or (me.submitted_at is not null and p_level > me.level + 10) then
    raise exception 'impossible level' using errcode = '22023';
  end if;
  if cardinality(coalesce(p_badges, '{}')) > 128
     or exists (select 1 from unnest(coalesce(p_badges, '{}')) b where b !~ '^[a-z0-9_]{1,40}$') then
    raise exception 'impossible badges' using errcode = '22023';
  end if;
  if jsonb_typeof(coalesce(p_scores, '[]')) <> 'array' or jsonb_array_length(coalesce(p_scores, '[]')) > 80 then
    raise exception 'at most 80 scores at a time' using errcode = '22023';
  end if;

  for s in
    select * from jsonb_to_recordset(coalesce(p_scores, '[]'))
      as x(period text, period_start date, metric text, subject text, value numeric)
  loop
    if s.period not in ('week', 'month') or s.value is null
       or s.period_start not in (
         public.community_period_start(s.period, current_date - 1),
         public.community_period_start(s.period, current_date),
         public.community_period_start(s.period, current_date + 1)) then
      raise exception 'not the current period' using errcode = '22023';
    end if;
    elapsed := greatest(1, least(current_date + 1, (
      case when s.period = 'week' then s.period_start + 7 else (s.period_start + interval '1 month')::date end
    ) - 1) - s.period_start + 1);
    if s.metric = 'workouts' then
      if s.value <> trunc(s.value) or s.value < 0 or s.value > 2 * elapsed then
        raise exception 'impossible number of workouts' using errcode = '22023';
      end if;
    elsif s.metric in ('diet', 'training') then
      if s.value < 0 or s.value > 100 then
        raise exception 'impossible percentage' using errcode = '22023';
      end if;
    elsif s.metric = 'strength' then
      if s.value < -50 or s.value > 50 then
        raise exception 'impossible strength change' using errcode = '22023';
      end if;
      select * into old from public.community_scores c
      where c.user_id = uid and c.period = s.period and c.period_start = s.period_start
        and c.metric = 'strength' and c.subject = coalesce(s.subject, '');
      if found then
        days_since := extract(epoch from (now() - old.computed_at)) / 86400;
        if abs(s.value - old.value) > greatest(15, 15 * days_since) then
          raise exception 'strength changed too fast' using errcode = '22023';
        end if;
      end if;
    else
      raise exception 'unknown metric' using errcode = '22023';
    end if;

    insert into public.community_scores as c
      (user_id, period, period_start, metric, subject, value, prev_value, value_day, computed_at)
    values (uid, s.period, s.period_start, s.metric, coalesce(s.subject, ''), round(s.value, 1),
            null, current_date, now())
    on conflict (user_id, period, period_start, metric, subject) do update
      set prev_value = case when c.value_day < current_date then c.value else c.prev_value end,
          value = excluded.value,
          value_day = current_date,
          computed_at = now(),
          updated_at = now();
  end loop;

  update public.community_members
  set level = p_level, badges = coalesce(p_badges, '{}'), submitted_at = now(), updated_at = now()
  where user_id = uid;

  delete from public.community_scores c where c.user_id = uid and c.period_start < current_date - 70;
  delete from public.friendships f where f.status = 'pending' and f.created_at < now() - interval '30 days';
end;
$$;
revoke all on function public.community_submit(integer, text[], jsonb) from public;
grant execute on function public.community_submit(integer, text[], jsonb) to authenticated;
revoke execute on function public.community_submit(integer, text[], jsonb) from anon;
